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

import {
	bytesToHex,
	format,
	hexToBytes,
	isNullish,
	keccak256,
	rightPad,
} from '@theqrl/web3-utils';
import { isAddressString } from '@theqrl/web3-validator';

import {
	AbiConstructorFragment,
	AbiEventFragment,
	AbiFunctionFragment,
	AbiParameter,
	Bytes,
	LogsInput,
	Filter,
	HexString,
	JsonRpcResponse,
	Topic,
	FMT_NUMBER,
	FMT_BYTES,
	DataFormat,
	DEFAULT_RETURN_FORMAT,
} from '@theqrl/web3-types';

import {
	decodeLog,
	decodeParameters,
	encodeEventSignature,
	encodeFunctionSignature,
	encodeParameter,
	encodeParameters,
	formatOddHexstrings,
	isAbiConstructorFragment,
	isAbiEventFragment,
	jsonInterfaceMethodToString,
} from '@theqrl/web3-qrl-abi';

import { blockSchema, logSchema } from '@theqrl/web3-qrl';

import { AbiError, ResponseError, Web3ContractError } from '@theqrl/web3-errors';

import { ALL_EVENTS, TOPIC_HEX_LENGTH } from './constants.js';
import { ContractOptions, ContractAbiWithSignature, EventLog } from './types.js';

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

/** The QRVM ABI word is 64 bytes: 128 hex characters. */
const WORD_HEX_LENGTH = 128;
const ARRAY_SUFFIX = /\[(\d*)\]$/;

/** A 32-byte keccak digest is stored in the HIGH half of the 64-byte topic. */
const hashToTopic = (hash: string): HexString => rightPad(hash, TOPIC_HEX_LENGTH);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' &&
	!isNullish(value) &&
	!Array.isArray(value) &&
	!(value instanceof Uint8Array);

const encodeIndexedStringTopic = (value: unknown): HexString => {
	encodeParameter('string', value);
	return hashToTopic(keccak256(new TextEncoder().encode(value as string)));
};

const normalizeBytesValue = (value: unknown): Uint8Array => {
	const normalizedValue = typeof value === 'string' ? formatOddHexstrings(value) : value;
	encodeParameter('bytes', normalizedValue);
	if (normalizedValue instanceof Uint8Array) {
		return normalizedValue;
	}
	const hex = normalizedValue as string;
	return hex.length <= 2 ? new Uint8Array(0) : hexToBytes(hex);
};

const encodeIndexedBytesTopic = (value: unknown): HexString =>
	hashToTopic(keccak256(normalizeBytesValue(value)));

const encodeIndexedFunctionTopic = (value: unknown): HexString => {
	encodeParameter('function', value);
	// Indexed functions hash the compact 64-byte address and 4-byte selector.
	return hashToTopic(keccak256(value as Bytes));
};

/**
 * The in-place encoding Hyperion hashes for an indexed array or struct, as hex without the
 * `0x` prefix (`libhyperion/codegen/ExpressionCompiler.cpp`, `packedEncode` with
 * `dynamicInplace`): no offsets and no length words, every array element and struct member
 * padded to the 64-byte word, nested arrays and structs flattened in place, and `string` /
 * `bytes` members laid out as their raw bytes right-padded to a word multiple (L-71).
 */
const encodeInPlace = (input: AbiParameter, value: unknown, path: string): string => {
	const arrayMatch = ARRAY_SUFFIX.exec(input.type);
	if (arrayMatch) {
		if (!Array.isArray(value)) {
			throw new AbiError(
				`Parameter encoding error: expected an array for ${path} (${input.type})`,
			);
		}
		if (arrayMatch[1] !== '' && value.length !== Number(arrayMatch[1])) {
			throw new AbiError(
				`Parameter encoding error: ${path} (${input.type}) expects ${arrayMatch[1]} element(s), got ${value.length}`,
			);
		}
		const elementInput: AbiParameter = {
			...input,
			type: input.type.slice(0, -arrayMatch[0].length),
		};
		return value
			.map((element, index) => encodeInPlace(elementInput, element, `${path}[${index}]`))
			.join('');
	}

	if (input.type === 'tuple') {
		const components = input.components ?? [];
		if (typeof value !== 'object' || isNullish(value) || value instanceof Uint8Array) {
			throw new AbiError(
				`Parameter encoding error: expected an array or an object for ${path} (tuple)`,
			);
		}
		if (Array.isArray(value) && value.length !== components.length) {
			throw new AbiError(
				`Parameter encoding error: ${path} (tuple) expects ${components.length} member(s), got ${value.length}`,
			);
		}
		return components
			.map((component, index) =>
				encodeInPlace(
					component,
					Array.isArray(value)
						? value[index]
						: (value as Record<string, unknown>)[component.name],
					`${path}.${component.name || String(index)}`,
				),
			)
			.join('');
	}

	if (input.type === 'string' || input.type === 'bytes') {
		let bytes: Uint8Array;
		if (input.type === 'string') {
			encodeParameter('string', value);
			bytes = new TextEncoder().encode(value as string);
		} else {
			bytes = normalizeBytesValue(value);
		}
		const hex = bytesToHex(bytes).slice(2);
		return hex.padEnd(Math.ceil(hex.length / WORD_HEX_LENGTH) * WORD_HEX_LENGTH, '0');
	}

	// A value type is one padded word, which is exactly its ABI encoding.
	return encodeParameter(input.type, value).slice(2);
};

/**
 * Whether the topic the QRVM stores for an indexed input of this type is a keccak256 digest
 * rather than the value itself: `string`, `bytes`, `function`, arrays and tuples.
 */
export const isIndexedHashType = (type: string): boolean =>
	type === 'string' ||
	type === 'bytes' ||
	type === 'function' ||
	type === 'tuple' ||
	ARRAY_SUFFIX.test(type);

/**
 * Encodes one filter value of an indexed event input into the 64-byte topic the QRVM stores
 * for it, following the Hyperion compiler:
 *
 * - value types (`uintN`, `intN`, `address`, `bool`, `bytesN`) are their ABI word;
 * - `string` and `bytes` are `keccak256` of the raw bytes, `function` is `keccak256` of the
 *   68-byte address plus selector, arrays and tuples are `keccak256` of their in-place
 *   encoding (64-byte-word packed elements, no offsets, no length words); the 32-byte digest
 *   sits in the high half of the topic (L-71).
 *
 * @param input - The event input (its `type`, and `components` for tuples).
 * @param value - The value to encode.
 * @returns The topic.
 * @throws AbiError - when the value cannot be encoded as the input's type.
 */
export const encodeIndexedTopic = (input: AbiParameter, value: unknown): HexString => {
	if (input.type === 'string') {
		return encodeIndexedStringTopic(value);
	}
	if (input.type === 'bytes') {
		return encodeIndexedBytesTopic(value);
	}
	if (input.type === 'function') {
		return encodeIndexedFunctionTopic(value);
	}
	if (input.type === 'tuple' || ARRAY_SUFFIX.test(input.type)) {
		const packed = encodeInPlace(input, value, input.name || input.type);
		return hashToTopic(
			keccak256(packed === '' ? new Uint8Array(0) : hexToBytes(`0x${packed}`)),
		);
	}
	return encodeParameter(input.type, value);
};

/**
 * A filter value given as an array is a list of alternatives (`OR`), except when the input
 * is itself an array type (the array is the value) or a tuple given in positional form.
 * Alternatives for a tuple input must be given in object form.
 */
const isOrList = (input: AbiParameter, value: unknown): value is unknown[] => {
	if (!Array.isArray(value)) {
		return false;
	}
	if (ARRAY_SUFFIX.test(input.type)) {
		return false;
	}
	if (input.type === 'tuple') {
		return value.every(isPlainObject);
	}
	return true;
};

export const encodeEventABI = (
	{ address }: ContractOptions,
	event: AbiEventFragment & { signature: string },
	options?: Filter,
) => {
	const topics = options?.topics;
	const filter = options?.filter ?? {};
	const opts: Writeable<Filter> = {};

	if (!isNullish(options?.fromBlock)) {
		opts.fromBlock = format(blockSchema.properties.number, options?.fromBlock, {
			number: FMT_NUMBER.HEX,
			bytes: FMT_BYTES.HEX,
		});
	}
	if (!isNullish(options?.toBlock)) {
		opts.toBlock = format(blockSchema.properties.number, options?.toBlock, {
			number: FMT_NUMBER.HEX,
			bytes: FMT_BYTES.HEX,
		});
	}

	if (topics && Array.isArray(topics)) {
		opts.topics = [...topics] as Topic[];
	} else {
		opts.topics = [];
		// add event signature
		if (event && !event.anonymous && event.name !== ALL_EVENTS) {
			opts.topics.push(
				rightPad(
					event.signature ?? encodeEventSignature(jsonInterfaceMethodToString(event)),
					TOPIC_HEX_LENGTH,
				),
			);
		}

		// add event topics (indexed arguments)
		if (event.name !== ALL_EVENTS && event.inputs) {
			for (const input of event.inputs) {
				if (!input.indexed) {
					continue;
				}

				const value = filter[input.name];
				if (isNullish(value)) {
					// eslint-disable-next-line no-null/no-null
					opts.topics.push(null);
					continue;
				}

				if (isOrList(input, value)) {
					opts.topics.push(
						value.map(alternative => encodeIndexedTopic(input, alternative)),
					);
				} else {
					opts.topics.push(encodeIndexedTopic(input, value));
				}
			}
		}
	}

	if (!opts.topics.length) delete opts.topics;

	if (address) {
		if (!isAddressString(address)) {
			throw new Web3ContractError(
				`Invalid filter address: ${address}; expected a Q-prefixed QRL address`,
			);
		}
		opts.address = `Q${address.slice(1).toLowerCase()}`;
	}

	return opts;
};

/** A log entry the node returned that does not have the shape of a log (L-26). */
const malformedLog = (log: unknown, reason: string): ResponseError =>
	new ResponseError(log as JsonRpcResponse, `Malformed log in the node reply: ${reason}`);

export const decodeEventABI = (
	event: AbiEventFragment & { signature: string },
	data: LogsInput,
	jsonInterface: ContractAbiWithSignature,
	returnFormat: DataFormat = DEFAULT_RETURN_FORMAT,
): EventLog => {
	// The log is node supplied: anything but an object cannot be decoded.
	if (typeof data !== 'object' || isNullish(data) || Array.isArray(data)) {
		throw malformedLog(data, 'expected a log object');
	}
	// `topics` may be missing on a malformed log (treated as no topics) but must otherwise be
	// an array.
	if (!isNullish(data.topics) && !Array.isArray(data.topics)) {
		throw malformedLog(data, '"topics" is not an array');
	}

	let modifiedEvent = { ...event };

	const result = format(logSchema, data, returnFormat);
	const topics: string[] = Array.isArray(data.topics) ? data.topics : [];
	const topic0 = typeof topics[0] === 'string' ? topics[0].toLowerCase() : undefined;

	// if allEvents get the right event: only event fragments qualify. A function selector is
	// 4 bytes and, right-padded, a perfectly valid topic, so a same-named function used to be
	// picked as the event (L-60).
	if (modifiedEvent.name === ALL_EVENTS) {
		const matchedEvent =
			topic0 === undefined
				? undefined
				: jsonInterface.find(
						j =>
							isAbiEventFragment(j) &&
							rightPad(j.signature, TOPIC_HEX_LENGTH).toLowerCase() === topic0,
				  );
		if (matchedEvent) {
			modifiedEvent = matchedEvent as AbiEventFragment & { signature: string };
		} else {
			modifiedEvent = { anonymous: true } as unknown as AbiEventFragment & {
				signature: string;
			};
		}
	}

	// create empty inputs if none are present (e.g. anonymous events on allEvents)
	modifiedEvent.inputs = modifiedEvent.inputs ?? event.inputs ?? [];

	// Handle case where an event signature shadows the current ABI with non-identical
	// arg indexing. If # of topics doesn't match, event is anon.
	if (!modifiedEvent.anonymous) {
		let indexedInputs = 0;
		(modifiedEvent.inputs ?? []).forEach(input => {
			if (input.indexed) {
				indexedInputs += 1;
			}
		});

		if (indexedInputs > 0 && topics.length !== indexedInputs + 1) {
			// checks if event is anonymous
			modifiedEvent = {
				...modifiedEvent,
				anonymous: true,
				inputs: [],
			};
		}
	}

	const argTopics = modifiedEvent.anonymous ? topics : topics.slice(1);
	return {
		...result,
		returnValues: decodeLog([...(modifiedEvent.inputs ?? [])], data.data, argTopics),
		event: modifiedEvent.name,
		signature:
			modifiedEvent.anonymous || topics.length === 0 || typeof topics[0] !== 'string'
				? undefined
				: topics[0].slice(0, 66),

		raw: {
			data: data.data,
			topics: data.topics,
		},
	};
};

export const encodeMethodABI = (
	abi: AbiFunctionFragment | AbiConstructorFragment,
	args: unknown[],
	deployData?: HexString,
) => {
	const inputLength = Array.isArray(abi.inputs) ? abi.inputs.length : 0;
	if (inputLength !== args.length) {
		throw new Web3ContractError(
			`The number of arguments is not matching the methods required number. You need to pass ${inputLength} arguments.`,
		);
	}

	const params = encodeParameters(Array.isArray(abi.inputs) ? abi.inputs : [], args).replace(
		'0x',
		'',
	);

	if (isAbiConstructorFragment(abi)) {
		if (!deployData)
			throw new Web3ContractError(
				'The contract has no contract data option set. This is necessary to append the constructor parameters.',
			);

		if (!deployData.startsWith('0x')) {
			return `0x${deployData}${params}`;
		}

		return `${deployData}${params}`;
	}

	return `${encodeFunctionSignature(abi)}${params}`;
};

/**
 * Decodes the return data of a call against the function's `outputs`: a single output is
 * returned as is, several as an object with named and positional members.
 *
 * For compatibility `null` is returned when the function has no `outputs` member (whatever the
 * data) and when there is no data at all. Empty data (`0x`) for a function that does declare
 * outputs is an `AbiError`, the usual sign of a wrong address or missing code. The shape of the
 * node's reply itself (a `0x` hex string) is checked by the contract before the data gets here
 * (P4-L-30).
 */
export const decodeMethodReturn = (abi: AbiFunctionFragment, returnValues?: HexString) => {
	// If it was constructor then we need to return contract address
	if (abi.type === 'constructor') {
		return returnValues;
	}

	if (!returnValues) {
		// Using "null" value intentionally to match legacy behavior
		// eslint-disable-next-line no-null/no-null
		return null;
	}

	const value = returnValues.length >= 2 ? returnValues.slice(2) : returnValues;
	if (!abi.outputs) {
		// eslint-disable-next-line no-null/no-null
		return null;
	}
	const result = decodeParameters([...abi.outputs], value);

	if (result.__length__ === 1) {
		return result[0];
	}

	return result;
};
