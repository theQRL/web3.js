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

import { BaseWeb3Error, ERR_INVALID_RESPONSE, InvalidResponseError } from '@theqrl/web3-errors';
import { Numbers } from '@theqrl/web3-types';
import { isUInt, ValidInputTypes } from '@theqrl/web3-validator';

/** Longest excerpt of a malformed reply that is quoted in the error message. */
const MAX_REPLY_EXCERPT_LENGTH = 128;

const describeReply = (reply: unknown): string => {
	// eslint-disable-next-line no-null/no-null
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
