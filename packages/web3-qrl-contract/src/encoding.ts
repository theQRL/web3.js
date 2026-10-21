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

import { format, isNullish, keccak256, rightPad } from '@theqrl/web3-utils';
import { isAddressString } from '@theqrl/web3-validator';

import {
	AbiConstructorFragment,
	AbiEventFragment,
	AbiFunctionFragment,
	Bytes,
	LogsInput,
	Filter,
	HexString,
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
	jsonInterfaceMethodToString,
} from '@theqrl/web3-qrl-abi';

import { blockSchema, logSchema } from '@theqrl/web3-qrl';

import { Web3ContractError } from '@theqrl/web3-errors';

import { ContractOptions, ContractAbiWithSignature, EventLog } from './types.js';

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

const encodeIndexedStringTopic = (value: unknown): Topic => {
	encodeParameter('string', value);
	return rightPad(keccak256(new TextEncoder().encode(value as string)), 128) as Topic;
};

const encodeIndexedBytesTopic = (value: unknown): Topic => {
	const normalizedValue = typeof value === 'string' ? formatOddHexstrings(value) : value;
	encodeParameter('bytes', normalizedValue);
	return rightPad(keccak256(normalizedValue as string), 128) as Topic;
};

const encodeIndexedFunctionTopic = (value: unknown): Topic => {
	encodeParameter('function', value);
	// Indexed functions hash the compact 64-byte address and 4-byte selector.
	return rightPad(keccak256(value as Bytes), 128) as Topic;
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
		if (event && !event.anonymous && event.name !== 'ALLEVENTS') {
			opts.topics.push(
				rightPad(
					event.signature ?? encodeEventSignature(jsonInterfaceMethodToString(event)),
					128,
				),
			);
		}

		// add event topics (indexed arguments)
		if (event.name !== 'ALLEVENTS' && event.inputs) {
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

				// TODO: https://github.com/ethereum/web3.js/issues/344
				// TODO: deal properly with components
				if (Array.isArray(value)) {
					if (input.type === 'string') {
						opts.topics.push(value.map(encodeIndexedStringTopic));
					} else if (input.type === 'bytes') {
						opts.topics.push(value.map(encodeIndexedBytesTopic));
					} else if (input.type === 'function') {
						opts.topics.push(value.map(encodeIndexedFunctionTopic));
					} else {
						opts.topics.push(value.map(topic => encodeParameter(input.type, topic)));
					}
				} else if (input.type === 'string') {
					opts.topics.push(encodeIndexedStringTopic(value));
				} else if (input.type === 'bytes') {
					opts.topics.push(encodeIndexedBytesTopic(value));
				} else if (input.type === 'function') {
					opts.topics.push(encodeIndexedFunctionTopic(value));
				} else {
					opts.topics.push(encodeParameter(input.type, value));
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

export const decodeEventABI = (
	event: AbiEventFragment & { signature: string },
	data: LogsInput,
	jsonInterface: ContractAbiWithSignature,
	returnFormat: DataFormat = DEFAULT_RETURN_FORMAT,
): EventLog => {
	let modifiedEvent = { ...event };

	const result = format(logSchema, data, returnFormat);

	// if allEvents get the right event
	if (modifiedEvent.name === 'ALLEVENTS') {
		const matchedEvent = jsonInterface.find(j => rightPad(j.signature, 128) === data.topics[0]);
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

		if (indexedInputs > 0 && data?.topics && data?.topics.length !== indexedInputs + 1) {
			// checks if event is anonymous
			modifiedEvent = {
				...modifiedEvent,
				anonymous: true,
				inputs: [],
			};
		}
	}

	const argTopics = modifiedEvent.anonymous ? data.topics : (data.topics ?? []).slice(1);
	return {
		...result,
		returnValues: decodeLog([...(modifiedEvent.inputs ?? [])], data.data, argTopics),
		event: modifiedEvent.name,
		signature:
			modifiedEvent.anonymous || !data.topics || data.topics.length === 0 || !data.topics[0]
				? undefined
				: data.topics[0].slice(0, 66),

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
