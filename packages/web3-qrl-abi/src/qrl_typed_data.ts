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

import { QRLTypedData } from '@theqrl/web3-types';
import { isNullish, keccak256 } from '@theqrl/web3-utils';

import ethersAbiCoder from './ethers_abi_coder.js';

const TYPE_REGEX = /^\w+/;
const ARRAY_REGEX = /^(.*)\[([0-9]*?)]$/;

/**
 * Get the dependencies of a struct type, visiting each type once to handle recursive schemas.
 */
const getDependencies = (
	typedData: QRLTypedData,
	type: string,
	dependencies: Set<string> = new Set(),
): Set<string> => {
	const match = type.match(TYPE_REGEX)!;
	const actualType = match[0];
	if (dependencies.has(actualType)) {
		return dependencies;
	}

	if (!typedData.types[actualType]) {
		return dependencies;
	}

	dependencies.add(actualType);
	for (const field of typedData.types[actualType]) {
		getDependencies(typedData, field.type, dependencies);
	}
	return dependencies;
};

/**
 * Encode a type to a string. All dependant types are alphabetically sorted.
 *
 * @param {TypedData} typedData
 * @param {string} type
 * @param {Options} [options]
 * @return {string}
 */
const encodeType = (typedData: QRLTypedData, type: string): string => {
	const [primary, ...dependencies] = getDependencies(typedData, type);
	const types = [primary, ...dependencies.sort()];

	return types
		.map(
			dependency =>
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				`${dependency}(${typedData.types[dependency].map(
					_type => `${_type.type} ${_type.name}`,
				)})`,
		)
		.join('');
};

/**
 * Get a type string as hash.
 */
const getTypeHash = (typedData: QRLTypedData, type: string) =>
	keccak256(encodeType(typedData, type));

/**
 * Get encoded data as a hash. The data should be a key -> value object with all the required values. All dependant
 * types are automatically encoded.
 */
const getStructHash = (
	typedData: QRLTypedData,
	type: string,
	data: Record<string, unknown>,
	// eslint-disable-next-line  no-use-before-define
): string => keccak256(encodeData(typedData, type, data));

/**
 * Get the QRL typed-data message to sign. If `hash` is enabled, the message will be hashed with Keccak256.
 */
export const getMessage = (typedData: QRLTypedData, hash?: boolean): string => {
	const TYPED_DATA_PREFIX = '1901';
	const message = `0x${TYPED_DATA_PREFIX}${getStructHash(
		typedData,
		'QRLTypedDataDomain',
		typedData.domain as Record<string, unknown>,
	).substring(2)}${getStructHash(typedData, typedData.primaryType, typedData.message).substring(
		2,
	)}`;

	if (hash) {
		return keccak256(message);
	}

	return message;
};

/**
 * Encodes a single value to an ABI serialisable string, number or Buffer. Returns the data as tuple, which consists of
 * an array of ABI compatible types, and an array of corresponding values.
 */
const encodeValue = (
	typedData: QRLTypedData,
	type: string,
	data: unknown,
): [string, string | Uint8Array | number] => {
	const match = type.match(ARRAY_REGEX);

	// Checks for array types
	if (match) {
		const arrayType = match[1];
		const length = Number(match[2]) || undefined;

		if (!Array.isArray(data)) {
			throw new Error('Cannot encode data: value is not of array type');
		}

		if (length && data.length !== length) {
			throw new Error(
				`Cannot encode data: expected length of ${length}, but got ${data.length}`,
			);
		}

		const encodedData = data.map(item => encodeValue(typedData, arrayType, item));
		const types = encodedData.map(item => item[0]);
		const values = encodedData.map(item => item[1]);

		return ['bytes32', keccak256(ethersAbiCoder.encode(types, values))];
	}

	if (typedData.types[type]) {
		return ['bytes32', getStructHash(typedData, type, data as Record<string, unknown>)];
	}

	// Strings and arbitrary byte arrays are hashed to bytes32
	if (type === 'string') {
		return ['bytes32', keccak256(new TextEncoder().encode(data as string))];
	}

	if (type === 'bytes') {
		return ['bytes32', keccak256(data as string)];
	}

	return [type, data as string];
};

/**
 * Encode the data to an ABI encoded Buffer. The data should be a key -> value object with all the required values. All
 * dependant types are automatically encoded.
 */
const encodeData = (
	typedData: QRLTypedData,
	type: string,
	data: Record<string, unknown>,
): string => {
	const [types, values] = typedData.types[type].reduce<[string[], unknown[]]>(
		([_types, _values], field) => {
			if (isNullish(data[field.name]) || isNullish(data[field.name])) {
				throw new Error(`Cannot encode data: missing data for '${field.name}'`);
			}

			const value = data[field.name];
			const [_type, encodedValue] = encodeValue(typedData, field.type, value);

			return [
				[..._types, _type],
				[..._values, encodedValue],
			];
		},
		[['bytes32'], [getTypeHash(typedData, type)]],
	);

	return ethersAbiCoder.encode(types, values);
};
