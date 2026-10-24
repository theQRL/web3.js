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
import { QRLTypedData, QRLTypedDataTypeDetails } from '@theqrl/web3-types';
import { isNullish, keccak256 } from '@theqrl/web3-utils';

import ethersAbiCoder from './ethers_abi_coder.js';

const TYPE_REGEX = /^\w+/;
const ARRAY_REGEX = /^(.*)\[([0-9]*?)]$/;
// `bytes` values are byte strings: an even-length 0x-prefixed hex string (or raw bytes).
const BYTES_HEX = /^0x([0-9a-f]{2})*$/i;

const hasOwn = (object: object, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(object, key);

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && !isNullish(value) && !Array.isArray(value);

// go-qrl's typed-data signer accepts primitive/struct values and one-dimensional
// dynamic arrays. ABI parameter declarations and fixed array lengths are not types here.
const isPrimitiveType = (type: string): boolean => {
	if (/^(address|bool|string|bytes|int|uint)$/.test(type)) return true;
	const bytes = /^bytes([1-9][0-9]*)$/.exec(type);
	if (bytes) return Number(bytes[1]) <= 64;
	const integer = /^(?:uint|int)([1-9][0-9]*)$/.exec(type);
	return !!integer && Number(integer[1]) <= 512 && Number(integer[1]) % 8 === 0;
};

/**
 * The field list of a struct type, or `undefined` when `type` is not a struct of this typed data.
 * Only own, array-valued entries of `types` are structs: a name such as `constructor` must not
 * resolve to an `Object.prototype` member (I-10).
 */
const getStructFields = (
	typedData: QRLTypedData,
	type: string,
): QRLTypedDataTypeDetails[] | undefined => {
	const fields: unknown = hasOwn(typedData.types, type) ? typedData.types[type] : undefined;
	if (!Array.isArray(fields)) {
		return undefined;
	}
	for (const field of fields as unknown[]) {
		if (!isObject(field) || typeof field.name !== 'string' || typeof field.type !== 'string') {
			throw new AbiError(
				`Cannot encode data: invalid field definition in type '${type}' (expected {name, type})`,
			);
		}
	}
	return fields as QRLTypedDataTypeDetails[];
};

/**
 * Get the dependencies of a struct type, visiting each type once to handle recursive schemas.
 */
const getDependencies = (
	typedData: QRLTypedData,
	type: string,
	dependencies: Set<string> = new Set(),
): Set<string> => {
	const match = TYPE_REGEX.exec(type);
	if (!match) {
		throw new AbiError(`Cannot encode data: invalid type '${type}'`);
	}
	const actualType = match[0];
	if (dependencies.has(actualType)) {
		return dependencies;
	}

	const fields = getStructFields(typedData, actualType);
	if (!fields) {
		return dependencies;
	}

	dependencies.add(actualType);
	for (const field of fields) {
		getDependencies(typedData, field.type, dependencies);
	}
	return dependencies;
};

/**
 * Encode a type to a string. All dependant types are alphabetically sorted.
 *
 * @param typedData - The typed data holding the type definitions.
 * @param type - The struct type to encode.
 * @returns The encoded type string.
 */
const encodeType = (typedData: QRLTypedData, type: string): string => {
	const [primary, ...dependencies] = getDependencies(typedData, type);
	// `type` itself must be a struct: a name that only partially matches a struct (for
	// example one containing a space) must not be hashed as `undefined()` (I-10).
	if (primary === undefined) {
		throw new AbiError(`Cannot encode data: unknown type '${type}'`);
	}
	const types = [primary, ...dependencies.sort()];

	return types
		.map(
			dependency =>
				`${dependency}(${(getStructFields(typedData, dependency) ?? [])
					.map(_type => `${_type.type} ${_type.name}`)
					.join(',')})`,
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
 * Checks the shape of a typed-data payload before anything is hashed (I-10): direct callers are
 * not covered by the RPC-side validation, and a missing `primaryType` or
 * `types.QRLTypedDataDomain` used to surface as a raw `TypeError`.
 */
const validateTypedData = (typedData: QRLTypedData): void => {
	if (!isObject(typedData)) {
		throw new AbiError('Invalid typed data: expected an object');
	}
	const { types, primaryType, domain, message } = typedData;
	if (!isObject(types)) {
		throw new AbiError('Invalid typed data: "types" must be an object');
	}
	if (!Array.isArray(types.QRLTypedDataDomain)) {
		throw new AbiError('Invalid typed data: "types.QRLTypedDataDomain" is missing');
	}
	if (typeof primaryType !== 'string' || !getStructFields(typedData, primaryType)) {
		throw new AbiError('Invalid typed data: "primaryType" must name a type in "types"');
	}
	if (!isObject(domain)) {
		throw new AbiError('Invalid typed data: "domain" must be an object');
	}
	if (!isObject(message)) {
		throw new AbiError('Invalid typed data: "message" must be an object');
	}
	for (const type of Object.keys(types)) {
		const fields = getStructFields(typedData, type);
		if (!/^[A-Za-z]\w*$/.test(type) || !fields) {
			throw new AbiError(`Invalid typed data: invalid struct type '${type}'`);
		}
		const names = new Set<string>();
		for (const field of fields) {
			const match = /^([A-Za-z]\w*)(?:\[\])?$/.exec(field.type);
			if (!field.name || names.has(field.name) || !match || field.type === type) {
				throw new AbiError(
					`Invalid typed data: invalid field '${field.name}' in '${type}'`,
				);
			}
			names.add(field.name);
			if (!isPrimitiveType(match[1]) && !getStructFields(typedData, match[1])) {
				throw new AbiError(`Invalid typed data: unknown type '${field.type}'`);
			}
		}
	}
};

/**
 * Get the QRL typed-data message to sign. If `hash` is enabled, the message will be hashed with Keccak256.
 *
 * @throws AbiError - when the payload is malformed (missing `primaryType`, `types.QRLTypedDataDomain`,
 * `domain` or `message`, a field without data, or a value that is not an encoding of its declared type:
 * a non-string for `string`, a non-hex value for `bytes`, a value other than `true`/`false`
 * for `bool`, an out-of-range integer, ...). Nothing is hashed on a best-effort basis.
 */
export const getMessage = (typedData: QRLTypedData, hash?: boolean): string => {
	validateTypedData(typedData);
	if (
		Object.values(typedData.domain).length === 0 ||
		Object.values(typedData.domain).every(value => value === '' || isNullish(value))
	) {
		throw new AbiError('Invalid typed data: domain is undefined');
	}

	let message: string;
	try {
		const TYPED_DATA_PREFIX = '1901';
		message = `0x${TYPED_DATA_PREFIX}${getStructHash(
			typedData,
			'QRLTypedDataDomain',
			typedData.domain as Record<string, unknown>,
		).substring(2)}${getStructHash(
			typedData,
			typedData.primaryType,
			typedData.message,
		).substring(2)}`;
	} catch (err) {
		if (err instanceof AbiError) {
			throw err;
		}
		// Errors raised by the ABI coder (e.g. an invalid `bool`, `address` or integer value)
		// are reported as typed errors like every other encoding failure.
		throw new AbiError(`Typed data encoding error: ${(err as Error).message}`, err as Error);
	}

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
	const match = ARRAY_REGEX.exec(type);

	// Checks for array types
	if (match) {
		const arrayType = match[1];
		const length = Number(match[2]) || undefined;

		if (!Array.isArray(data)) {
			throw new AbiError('Cannot encode data: value is not of array type');
		}

		if (length && data.length !== length) {
			throw new AbiError(
				`Cannot encode data: expected length of ${length}, but got ${data.length}`,
			);
		}

		const encodedData = data.map(item => encodeValue(typedData, arrayType, item));
		const types = encodedData.map(item => item[0]);
		const values = encodedData.map(item => item[1]);

		return ['bytes32', keccak256(ethersAbiCoder.encode(types, values))];
	}

	if (getStructFields(typedData, type)) {
		return ['bytes32', getStructHash(typedData, type, data as Record<string, unknown>)];
	}

	// Strings and arbitrary byte arrays are hashed to bytes32. The value must be an encoding of
	// the declared type: hashing a number as its decimal text, or a non-hex string as UTF-8
	// bytes, would sign something the caller never meant (I-10).
	if (type === 'string') {
		if (typeof data !== 'string') {
			throw new AbiError(`Cannot encode data: expected a string for type 'string'`);
		}
		return ['bytes32', keccak256(new TextEncoder().encode(data))];
	}

	if (type === 'bytes') {
		if (data instanceof Uint8Array) {
			return ['bytes32', keccak256(data)];
		}
		if (typeof data !== 'string' || !BYTES_HEX.test(data)) {
			throw new AbiError(`Cannot encode data: expected a hex string for type 'bytes'`);
		}
		return ['bytes32', keccak256(data)];
	}

	if (type === 'bool' && typeof data !== 'boolean') {
		throw new AbiError("Cannot encode data: expected a boolean for type 'bool'");
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
	const fields = getStructFields(typedData, type);
	if (!fields) {
		throw new AbiError(`Cannot encode data: unknown type '${type}'`);
	}
	if (!isObject(data)) {
		throw new AbiError(`Cannot encode data: expected an object for type '${type}'`);
	}
	const fieldNames = new Set(fields.map(field => field.name));
	if (Object.keys(data).some(key => !fieldNames.has(key))) {
		throw new AbiError(`Cannot encode data: extra data provided in '${type}'`);
	}

	const [types, values] = fields.reduce<[string[], unknown[]]>(
		([_types, _values], field) => {
			// Only own data counts: a field named `constructor` must not pick up
			// `Object.prototype.constructor` (I-10).
			if (!hasOwn(data, field.name) || isNullish(data[field.name])) {
				throw new AbiError(`Cannot encode data: missing data for '${field.name}'`);
			}

			const value = data[field.name];
			if (type === 'QRLTypedDataDomain' && value === '') {
				throw new AbiError(`Cannot encode data: empty domain field '${field.name}'`);
			}
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
