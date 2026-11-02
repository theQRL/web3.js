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

import { AbiError } from '@theqrl/web3-errors';
import { HexString, AbiParameter, DecodedParams } from '@theqrl/web3-types';
import { isNullish } from '@theqrl/web3-utils';
import { decodeParameter, decodeParametersWith } from './parameters_api.js';

const ARRAY_TYPE = /\[[0-9]*\]$/;
const HEX_DATA = /^0x[0-9a-f]*$/i;

// A named result key must not alias the result's own counter or anything on
// `Object.prototype` (`__proto__` would re-parent the object, `toString` would shadow the
// method); such a parameter stays reachable through its position only (L-34).
const isReservedName = (name: string): boolean =>
	name === '__length__' || /^(0|[1-9][0-9]*)$/.test(name) || name in Object.prototype;

const isIndexedHash = (inputType: string) =>
	inputType === 'string' ||
	inputType === 'bytes' ||
	inputType === 'function' ||
	inputType === 'tuple' ||
	ARRAY_TYPE.test(inputType);

/**
 * Decodes ABI-encoded log data and indexed topic data.
 * @param inputs - A {@link AbiParameter} input array. See the [Hyperion documentation](https://docs.soliditylang.org/en/develop/types.html) for a list of types.
 * @param data - The ABI byte code in the `data` field of a log. It must be a hex string; an absent or empty
 * value is accepted only when the event has no non-indexed input.
 * @param topics - An array with the index parameter topics of the log, without the topic[0] if its a non-anonymous event, otherwise with topic[0].
 * When the event has indexed inputs the array must hold exactly one topic per indexed input, optionally preceded by topic[0].
 * @returns - The result object containing the decoded parameters. A parameter whose name is `__length__` or
 * a member of `Object.prototype` (such as `__proto__` or `constructor`) is only exposed by position.
 * @throws AbiError - when `inputs` is not an array, `data` is not a hex string or is empty while the event
 * has non-indexed inputs, or the log carries fewer or more topics than the event's indexed inputs.
 *
 * @example
 * ```ts
 * let res = web3.qrl.abi.decodeLog(
 *    [
 *      {
 *        type: "string",
 *        name: "myString",
 *      },
 *      {
 *        type: "uint256",
 *        name: "myNumber",
 *        indexed: true,
 *      },
 *      {
 *        type: "uint8",
 *        name: "mySmallNumber",
 *        indexed: true,
 *      },
 *    ],
 *    "0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000748656c6c6f2521000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
 *    [
 *      "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f310",
 *      "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010",
 *    ]
 *  );
 * > {
 *  '0': 'Hello%!',
 *  '1': 62224n,
 *  '2': 16n,
 *  __length__: 3,
 *  myString: 'Hello%!',
 *  myNumber: 62224n,
 *  mySmallNumber: 16n
 * }
 * ```
 */
export const decodeLog = <ReturnType extends DecodedParams>(
	inputs: Array<AbiParameter>,
	data: HexString,
	topics: string | string[],
) => {
	// The ABI is untrusted input (L-34).
	if (!Array.isArray(inputs)) {
		throw new AbiError('decodeLog: inputs must be an array of ABI parameters');
	}

	// `topics` comes from the node: it may be absent on a malformed log.
	let clonedTopics: string[];
	if (Array.isArray(topics)) {
		clonedTopics = topics;
	} else if (typeof topics === 'string') {
		clonedTopics = [topics];
	} else {
		clonedTopics = [];
	}

	const indexedInputs: Record<number, AbiParameter> = {};
	const nonIndexedInputs: Record<number, AbiParameter> = {};

	for (const [i, input] of inputs.entries()) {
		if (input.indexed) {
			indexedInputs[i] = input;
		} else {
			nonIndexedInputs[i] = input;
		}
	}

	// `data` comes from the node. A missing or empty value only means "nothing to decode" when
	// the event has no non-indexed input; otherwise a value is silently lost (L-34).
	const nonIndexed = Object.values(nonIndexedInputs);
	let dataHex = '0x';
	if (!isNullish(data) && data !== '') {
		if (typeof data !== 'string' || !HEX_DATA.test(data)) {
			throw new AbiError('decodeLog: log data must be a hex string');
		}
		dataHex = data;
	}
	if (nonIndexed.length > 0 && dataHex.length <= 2) {
		throw new AbiError(
			`decodeLog: log data is empty but the event has ${nonIndexed.length} non-indexed input(s)`,
		);
	}
	const decodedNonIndexedInputs: DecodedParams =
		nonIndexed.length > 0 ? decodeParametersWith(nonIndexed, dataHex, true) : { __length__: 0 };

	// If topics are more than indexed inputs, that means first topic is the event signature
	const indexedCount = Object.keys(indexedInputs).length;
	const offset = clonedTopics.length - indexedCount;
	// With surplus topics the values would be read from the wrong topics. (With no indexed
	// input nothing is read from the topics, so their number does not matter.)
	if (indexedCount > 0 && offset > 1) {
		throw new AbiError(
			`decodeLog: log has ${clonedTopics.length} topics but the event has ${indexedCount} indexed input(s)`,
		);
	}

	const decodedIndexedInputs = Object.values(indexedInputs).map((input, index) => {
		const topic = clonedTopics[index + offset];
		if (typeof topic !== 'string') {
			throw new AbiError(
				`Log has fewer topics than the event has indexed inputs (missing topic for "${
					input.name ?? input.type
				}")`,
			);
		}
		return isIndexedHash(input.type) ? topic.slice(0, 66) : decodeParameter(input.type, topic);
	});

	const returnValues: DecodedParams = { __length__: 0 };

	let indexedCounter = 0;
	let nonIndexedCounter = 0;

	for (const [i, res] of inputs.entries()) {
		returnValues[i] = res.type === 'string' ? '' : undefined;

		if (indexedInputs[i]) {
			returnValues[i] = decodedIndexedInputs[indexedCounter];
			indexedCounter += 1;
		}

		if (nonIndexedInputs[i]) {
			returnValues[i] = decodedNonIndexedInputs[String(nonIndexedCounter)];
			nonIndexedCounter += 1;
		}

		if (typeof res.name === 'string' && res.name !== '' && !isReservedName(res.name)) {
			returnValues[res.name] = returnValues[i];
		}

		returnValues.__length__ += 1;
	}

	return returnValues as ReturnType;
};
