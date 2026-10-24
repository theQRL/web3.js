/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/

/* eslint-disable no-null/no-null -- validate JSON-RPC null fields */
import { BaseWeb3Error, ERR_INVALID_RESPONSE, InvalidResponseError } from '@theqrl/web3-errors';
import { Bytes, HexString, Numbers } from '@theqrl/web3-types';
import {
	isBytes,
	isNullish,
	isUInt,
	isAddressString,
	ValidInputTypes,
} from '@theqrl/web3-validator';
import { isHash32 } from './hex_guards.js';

/** Longest excerpt of a malformed reply that is quoted in the error message. */
const MAX_REPLY_EXCERPT_LENGTH = 128;

const describeReply = (reply: unknown): string => {
	const rendered = reply === null ? 'null' : BaseWeb3Error.convertToString(reply);
	return rendered.length > MAX_REPLY_EXCERPT_LENGTH
		? `${rendered.slice(0, MAX_REPLY_EXCERPT_LENGTH)}... [truncated]`
		: rendered;
};

/**
 * The error for a node reply whose shape the JSON-RPC method can never legitimately produce: a
 * `qrl_accounts` result that is not an array, a `qrl_chainId` that is not a quantity, a
 * `qrl_getLogs` result that is a string. The request manager checks the JSON-RPC envelope only,
 * so such a result used to reach the formatters and surface as a raw `TypeError` or
 * `SyntaxError`, or to be handed back to the caller unchanged (L-26).
 *
 * @param method - The JSON-RPC method the reply answers.
 * @param expected - What a well-formed result looks like.
 * @param reply - The result as received; an excerpt is quoted in the message.
 */
export const invalidResponseError = (
	method: string,
	expected: string,
	reply: unknown,
): InvalidResponseError => {
	const message = `Invalid JSON-RPC response: ${method} returned ${describeReply(
		reply,
	)}, expected ${expected}`;
	const error = new InvalidResponseError({
		jsonrpc: '2.0',
		id: 0,
		error: { code: ERR_INVALID_RESPONSE, message },
	});
	// The response object above is synthetic (the node sent a result, not an error member), so
	// the base class's `Returned error:` prefix would attribute the message to the node.
	error.message = message;
	return error;
};

/**
 * Returns `reply` when it is an unsigned 256-bit quantity (a `0x` hex string, a decimal string,
 * a safe integer or a bigint) and throws the {@link invalidResponseError} otherwise.
 */
export const expectQuantityReply = (method: string, reply: unknown): Numbers => {
	if (!isUInt(reply as ValidInputTypes, { bitSize: 256 })) {
		throw invalidResponseError(method, 'a hex quantity', reply);
	}
	return reply as Numbers;
};

/**
 * Returns `reply` when it is hex encoded bytes (a `0x`-prefixed, even-length hex string; `'0x'`
 * stands for no bytes) or a byte array, and throws the {@link invalidResponseError} otherwise.
 * `format({ format: 'bytes' }, x)` hands an unparseable `x` back unchanged, so `getCode()` used
 * to resolve with `'abc'` (P4-L-13).
 */
export const expectBytesReply = (method: string, reply: unknown): Bytes => {
	if ((typeof reply !== 'string' && !(reply instanceof Uint8Array)) || !isBytes(reply)) {
		throw invalidResponseError(method, 'hex encoded bytes', reply);
	}
	return reply;
};

/**
 * Returns the transaction hash a send method continues with. The node's reply must be a 32-byte
 * hash and, when the hash is known locally (it is `keccak256` of the raw transaction), equal to
 * it ignoring letter case: go-qrl always answers `keccak256(canonical encoding)`, so any other
 * value means the node is not reporting the transaction that was sent. The LOCAL hash is
 * returned, so the receipt is awaited for the transaction that was actually broadcast (P4-L-9).
 *
 * @param method - `qrl_sendRawTransaction`, or `qrl_sendTransaction` (no local hash: the node signs).
 * @param reply - The node's result.
 * @param localHash - The locally computed hash, when the raw transaction is known.
 */
export const expectTransactionHashReply = (
	method: string,
	reply: unknown,
	localHash?: HexString,
): HexString => {
	if (!isHash32(reply)) {
		throw invalidResponseError(method, 'a 32-byte transaction hash', reply);
	}
	if (isNullish(localHash)) {
		return reply;
	}
	if (reply.toLowerCase() !== localHash.toLowerCase()) {
		throw invalidResponseError(
			method,
			`the hash of the transaction that was sent (${localHash})`,
			reply,
		);
	}
	return localHash;
};

/** Formatting does not validate RPC results. Check known fields before conversion. */
export interface RpcResultSchema {
	type?: string;
	format?: string;
	properties?: Record<string, RpcResultSchema>;
	items?: RpcResultSchema;
	oneOf?: RpcResultSchema[];
	nullable?: boolean;
	nullableWhen?: string;
}
export const assertRpcResult = (
	method: string,
	value: unknown,
	schema: RpcResultSchema,
	path = 'result',
): void => {
	const fail = () => {
		throw invalidResponseError(
			method,
			`a valid ${path} (${schema.format ?? schema.type ?? 'schema'})`,
			value,
		);
	};
	if (value === null && schema.nullable) return;
	if (schema.oneOf) {
		for (const option of schema.oneOf) {
			try {
				assertRpcResult(method, value, option, path);
				return;
			} catch {
				/* Try the next permitted shape. */
			}
		}
		fail();
	}
	if (schema.type === 'null') {
		if (value !== null) fail();
		return;
	}
	if (schema.type === 'object') {
		if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
		for (const [key, child] of Object.entries(schema.properties ?? {})) {
			const field = (value as Record<string, unknown>)[key];
			if (field === undefined) continue;
			if (
				field === null &&
				child.nullableWhen &&
				(value as Record<string, unknown>)[child.nullableWhen] === null
			)
				continue;
			assertRpcResult(method, field, child, `${path}.${key}`);
		}
	} else if (schema.type === 'array') {
		if (!Array.isArray(value)) fail();
		for (const item of value as unknown[])
			assertRpcResult(method, item, schema.items ?? {}, `${path}[]`);
	} else if (schema.type === 'number') {
		if (typeof value !== 'number' || !Number.isFinite(value)) fail();
	} else if (schema.type === 'string' && typeof value !== 'string') fail();
	if (schema.format === 'uint') expectQuantityReply(method, value);
	else if (schema.format === 'uint512' && !isUInt(value as ValidInputTypes, { bitSize: 512 }))
		fail();
	else if (schema.format?.startsWith('bytes')) {
		expectBytesReply(method, value);
		const width = Number(schema.format.slice(5));
		if (
			width &&
			(typeof value === 'string' ? (value.length - 2) / 2 : (value as Uint8Array).length) !==
				width
		)
			fail();
	} else if (
		schema.format === 'address' &&
		(typeof value !== 'string' || !isAddressString(value))
	)
		fail();
	else if (schema.format === 'bool' && typeof value !== 'boolean') fail();
	else if (schema.format === 'string' && typeof value !== 'string') fail();
};
