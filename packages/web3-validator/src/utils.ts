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

import { InvalidBytesError, InvalidNumberError } from '@theqrl/web3-errors';
import { VALID_QRL_BASE_TYPES } from './constants.js';
import {
	FullValidationSchema,
	JsonSchema,
	ShortValidationSchema,
	ValidationSchemaInput,
	ValidInputTypes,
} from './types.js';
import { isAbiParameterSchema } from './validation/abi.js';
import { isHexStrict } from './validation/string.js';
import { Web3ValidatorError } from './errors.js';
import { isAddressString } from './validation/address.js';

// Format names that are not ABI types. A name must appear here as well as in `formats.ts`,
// otherwise `convertEthType` rejects it as an unknown data type before the format ever runs.
const extraTypes = [
	'hex',
	'number',
	'blockNumber',
	'blockNumberOrTag',
	'filter',
	'bloom',
	'qrlTypedData',
];

// An ABI type name: a lowercase word, an optional decimal size and any number of `[n]` / `[]`
// dimensions. Nothing else is tolerated: `uint8x` used to parse as `uint8`, `bytes 3 2` as
// `bytes3` and `uint[ 2]` as a plain `uint`, so a typo silently changed what was validated
// (I-11). The size is only meaningful for `int`, `uint` and `bytes`.
const ABI_TYPE_PATTERN = /^([a-z]+)(\d*)((?:\[\d*\])*)$/;

/**
 * Splits an ABI type into its base type, its size and its array dimensions.
 *
 * `baseType` is `undefined` for anything that is not a well-formed ABI type (unknown base
 * type, a size on a type that has none, whitespace, stray characters, a non-string).
 * Dynamic dimensions (`[]`) are reported as `-1`; a size that is out of range for the base
 * type (`uint7`, `bytes65`) is returned as is and rejected by the schema conversion.
 */
export const parseBaseType = <T = (typeof VALID_QRL_BASE_TYPES)[number]>(
	type: string,
): {
	baseType?: T;
	baseTypeSize: number | undefined;
	arraySizes: number[];
	isArray: boolean;
} => {
	const match = typeof type === 'string' ? ABI_TYPE_PATTERN.exec(type) : undefined;

	if (!match) {
		return { baseType: undefined, isArray: false, baseTypeSize: undefined, arraySizes: [] };
	}

	const [, name, size, dimensions] = match;
	const arraySizes = [...dimensions.matchAll(/\[(\d*)\]/g)].map(([, digits]) =>
		digits === '' ? -1 : parseInt(digits, 10),
	);
	const isArray = arraySizes.length > 0;

	if (size === '' && VALID_QRL_BASE_TYPES.includes(name)) {
		return { baseType: name as unknown as T, isArray, baseTypeSize: undefined, arraySizes };
	}

	if (size !== '' && (name === 'int' || name === 'uint' || name === 'bytes')) {
		return {
			baseType: name as unknown as T,
			isArray,
			baseTypeSize: parseInt(size, 10),
			arraySizes,
		};
	}

	return { baseType: undefined, isArray: false, baseTypeSize: undefined, arraySizes };
};

const assertSupportedSize = (
	type: string,
	baseType: string | undefined,
	baseTypeSize: number | undefined,
): void => {
	if (baseTypeSize === undefined || Number.isNaN(baseTypeSize)) return;
	if (
		(baseType === 'int' || baseType === 'uint') &&
		(baseTypeSize <= 0 || baseTypeSize > 512 || baseTypeSize % 8 !== 0)
	) {
		throw new Web3ValidatorError([
			{
				keyword: 'eth',
				message: `Eth data type "${type}" is not valid: unsupported ${baseType} size`,
				params: { eth: type },
				instancePath: '',
				schemaPath: '',
			},
		]);
	}
	if (baseType === 'bytes' && (baseTypeSize <= 0 || baseTypeSize > 64)) {
		throw new Web3ValidatorError([
			{
				keyword: 'eth',
				message: `Eth data type "${type}" is not valid: unsupported bytes size`,
				params: { eth: type },
				instancePath: '',
				schemaPath: '',
			},
		]);
	}
};

const convertEthType = (
	type: string,
	parentSchema: JsonSchema = {},
): { format?: string; required?: boolean } => {
	const typePropertyPresent = Object.keys(parentSchema).includes('type');

	if (typePropertyPresent) {
		throw new Web3ValidatorError([
			{
				keyword: 'eth',
				message: 'Either "eth" or "type" can be presented in schema',
				params: { eth: type },
				instancePath: '',
				schemaPath: '',
			},
		]);
	}

	const { baseType, baseTypeSize } = parseBaseType(type);
	assertSupportedSize(type, baseType as string | undefined, baseTypeSize);

	if (!baseType && !extraTypes.includes(type)) {
		throw new Web3ValidatorError([
			{
				keyword: 'eth',
				message: `Eth data type "${type}" is not valid`,
				params: { eth: type },
				instancePath: '',
				schemaPath: '',
			},
		]);
	}

	if (baseType) {
		if (baseType === 'tuple') {
			throw new Error('"tuple" type is not implemented directly.');
		}
		return { format: `${baseType}${baseTypeSize ?? ''}`, required: true };
	}
	if (type) {
		return { format: type, required: true };
	}

	return {};
};

export const abiSchemaToJsonSchema = (
	abis: ShortValidationSchema | FullValidationSchema,
	level = '/0',
) => {
	const schema: JsonSchema = {
		type: 'array',
		items: [],
		maxItems: abis.length,
		minItems: abis.length,
	};

	for (const [index, abi] of abis.entries()) {
		let abiType!: string;
		let abiName!: string;
		let abiComponents: ShortValidationSchema | FullValidationSchema | undefined = [];

		// If it's a complete Abi Parameter
		// e.g. {name: 'a', type: 'uint'}
		if (isAbiParameterSchema(abi)) {
			abiType = abi.type;
			abiName = abi.name || `${level}/${index}`;
			abiComponents = abi.components as FullValidationSchema;
			// If its short form string value e.g. ['uint']
		} else if (typeof abi === 'string') {
			abiType = abi;
			abiName = `${level}/${index}`;

			// If it's provided in short form of tuple e.g. [['uint', 'string']]
		} else if (Array.isArray(abi)) {
			// If its custom tuple e.g. ['tuple[2]', ['uint', 'string']]
			if (
				abi[0] &&
				typeof abi[0] === 'string' &&
				abi[0].startsWith('tuple') &&
				!Array.isArray(abi[0]) &&
				abi[1] &&
				Array.isArray(abi[1])
			) {
				abiType = abi[0];
				abiName = `${level}/${index}`;
				abiComponents = abi[1] as ReadonlyArray<ShortValidationSchema>;
			} else {
				abiType = 'tuple';
				abiName = `${level}/${index}`;
				abiComponents = abi;
			}
		}

		// A schema entry that is neither an ABI parameter, a type name nor a tuple (`null`, a
		// number, ...) must surface as a validation error, not as a `TypeError` from the parser.
		if (typeof abiType !== 'string') {
			throw new Web3ValidatorError([
				{
					keyword: 'eth',
					message: `Invalid abi schema entry at "${level}/${index}"`,
					params: { eth: abiType },
					instancePath: '',
					schemaPath: '',
				},
			]);
		}

		const { baseType, baseTypeSize, isArray, arraySizes } = parseBaseType(abiType);

		// Schema for the element type, i.e. the ABI type with every array
		// dimension stripped off (`uint` for `uint[2][3]`, the tuple for `tuple[3][5]`).
		let elementSchema: JsonSchema;

		if (baseType === 'tuple') {
			elementSchema = abiSchemaToJsonSchema(abiComponents, abiName);

			// For a bare tuple the `$id` belongs on the tuple itself. For an array of
			// tuples it belongs on the outermost array, and is set after wrapping below.
			if (!isArray) {
				elementSchema.$id = abiName;
			}
		} else if (isArray) {
			// The element keeps its declared size: `bytes32[]` elements are `bytes32`, not any
			// `bytes`, and `uint8[]` elements are `uint8`, not `uint256`.
			elementSchema = convertEthType(
				baseTypeSize === undefined ? String(baseType) : `${String(baseType)}${baseTypeSize}`,
			);
		} else {
			elementSchema = { $id: abiName, ...convertEthType(abiType) };
		}

		if (!isArray) {
			(schema.items as JsonSchema[]).push(elementSchema);
			continue;
		}

		// `arraySizes` is in declaration order, left to right. Solidity reverses the
		// usual notation: `T[k][n]` is an array of `n` elements of type `T[k]`, so the
		// *rightmost* size is the outermost dimension and `arraySizes[0]` is the
		// innermost one. Wrap the element schema from the inside out so each declared
		// size lands on the nesting level it actually constrains.
		let arraySchema: JsonSchema = elementSchema;
		for (const arraySize of arraySizes) {
			arraySchema = { type: 'array', items: arraySchema };

			// A dynamic dimension (`T[]`, parsed as -1) carries no size constraint.
			if (arraySize >= 0) {
				arraySchema.minItems = arraySize;
				arraySchema.maxItems = arraySize;
			}
		}

		arraySchema.$id = abiName;
		(schema.items as JsonSchema[]).push(arraySchema);
	}

	return schema;
};

export const qrlAbiToJsonSchema = (abis: ValidationSchemaInput) => abiSchemaToJsonSchema(abis);

export const fetchArrayElement = (data: Array<unknown>, level: number): unknown => {
	if (level === 1) {
		return data;
	}

	return fetchArrayElement(data[0] as Array<unknown>, level - 1);
};

export const transformJsonDataToAbiFormat = (
	abis: FullValidationSchema,
	data: ReadonlyArray<unknown> | Record<string, unknown>,
	transformedData?: Array<unknown>,
): Array<unknown> => {
	const newData: Array<unknown> = [];

	for (const [index, abi] of abis.entries()) {
		let abiType!: string;
		let abiName!: string;
		let abiComponents: ShortValidationSchema | FullValidationSchema | undefined = [];

		// If it's a complete Abi Parameter
		// e.g. {name: 'a', type: 'uint'}
		if (isAbiParameterSchema(abi)) {
			abiType = abi.type;
			abiName = abi.name;
			abiComponents = abi.components as FullValidationSchema;
			// If its short form string value e.g. ['uint']
		} else if (typeof abi === 'string') {
			abiType = abi;

			// If it's provided in short form of tuple e.g. [['uint', 'string']]
		} else if (Array.isArray(abi)) {
			// If its custom tuple e.g. ['tuple[2]', ['uint', 'string']]
			if (abi[1] && Array.isArray(abi[1])) {
				abiType = abi[0] as string;
				abiComponents = abi[1] as ReadonlyArray<ShortValidationSchema>;
			} else {
				abiType = 'tuple';
				abiComponents = abi;
			}
		}

		const { baseType, isArray, arraySizes } = parseBaseType(abiType);
		const dataItem = Array.isArray(data)
			? (data as Array<unknown>)[index]
			: (data as Record<string, unknown>)[abiName];

		if (baseType === 'tuple' && !isArray) {
			newData.push(
				transformJsonDataToAbiFormat(
					abiComponents as FullValidationSchema,
					dataItem as Array<unknown>,
					transformedData,
				),
			);
		} else if (baseType === 'tuple' && isArray) {
			const tupleData = [];
			for (const tupleItem of dataItem as Array<unknown>) {
				// Nested array
				if (arraySizes.length > 1) {
					const nestedItems = fetchArrayElement(
						tupleItem as Array<unknown>,
						arraySizes.length - 1,
					);
					const nestedData = [];

					for (const nestedItem of nestedItems as Array<unknown>) {
						nestedData.push(
							transformJsonDataToAbiFormat(
								abiComponents as FullValidationSchema,
								nestedItem as Array<unknown>,
								transformedData,
							),
						);
					}
					tupleData.push(nestedData);
				} else {
					tupleData.push(
						transformJsonDataToAbiFormat(
							abiComponents as FullValidationSchema,
							tupleItem as Array<unknown>,
							transformedData,
						),
					);
				}
			}
			newData.push(tupleData);
		} else {
			newData.push(dataItem);
		}
	}

	// Have to reassign before pushing to transformedData
	transformedData = transformedData ?? [];
	transformedData.push(...newData);

	return transformedData;
};

/**
 * Code points to int
 */

export const codePointToInt = (codePoint: number): number => {
	if (codePoint >= 48 && codePoint <= 57) {
		/* ['0'..'9'] -> [0..9] */
		return codePoint - 48;
	}

	if (codePoint >= 65 && codePoint <= 70) {
		/* ['A'..'F'] -> [10..15] */
		return codePoint - 55;
	}

	if (codePoint >= 97 && codePoint <= 102) {
		/* ['a'..'f'] -> [10..15] */
		return codePoint - 87;
	}

	throw new Error(`Invalid code point: ${codePoint}`);
};

/**
 * Converts a `0x`-prefixed hex quantity to its number representation (a `number` when it is a
 * safe integer, a `bigint` otherwise).
 *
 * @throws InvalidNumberError for anything that is not strict hex, and for the bare prefix
 * `0x` / `-0x`, which is valid hex *bytes* but, like go-ethereum's "hex number has no digits",
 * not a quantity (L-26).
 */
export const hexToNumber = (value: string): bigint | number => {
	if (!isHexStrict(value)) {
		throw new InvalidNumberError(value);
	}

	const [negative, hexValue] = value.startsWith('-') ? [true, value.slice(1)] : [false, value];

	if (hexValue.length <= 2) {
		throw new InvalidNumberError(value);
	}

	const num = BigInt(hexValue);

	if (num > Number.MAX_SAFE_INTEGER) {
		return negative ? -num : num;
	}

	const asNumber = Number(num);

	// `-1 * 0` is `-0`, which is not what a caller comparing against `0` expects.
	return negative && asNumber !== 0 ? -asNumber : asNumber;
};

/**
 * Converts value to it's hex representation
 */
export const addressToHex = (value: string): string => {
	if (!isAddressString(value)) {
		throw new Error('Invalid address string');
	}
	return value.toLowerCase().replace(/^q/i, '0x');
};

/**
 * Converts an integer (`number`, `bigint`, decimal string or hex string) to its canonical hex
 * representation: lowercase, no leading zero digits, at least one digit (`0x0`), a leading `-`
 * for negative values.
 *
 * @throws InvalidNumberError for non-integer or non-finite numbers, for `0x` / `-0x` (no
 * digits) and for strings that are neither strict hex nor a plain decimal integer (`''`,
 * `' 1 '`, `'+1'`, `'0b11'`, `'1e3'` are all rejected, L-28).
 */
export const numberToHex = (value: ValidInputTypes): string => {
	if (typeof value === 'number' && !Number.isInteger(value)) {
		throw new InvalidNumberError(value);
	}

	if ((typeof value === 'number' || typeof value === 'bigint') && value < 0) {
		return `-0x${value.toString(16).slice(1)}`;
	}

	if ((typeof value === 'number' || typeof value === 'bigint') && value >= 0) {
		return `0x${value.toString(16)}`;
	}

	if (typeof value === 'string' && isHexStrict(value)) {
		const [negative, hex] = value.startsWith('-') ? [true, value.slice(1)] : [false, value];
		const digits = hex.slice(2);

		if (digits.length === 0) {
			throw new InvalidNumberError(value);
		}

		// Strip leading zeros but keep the last digit: `0x0` must stay `0x0`, not become the
		// invalid quantity `0x` (L-27).
		return `${negative ? '-' : ''}0x${digits.replace(/^0+(?=.)/, '').toLowerCase()}`;
	}

	if (typeof value === 'string' && /^-?\d+$/.test(value)) {
		return numberToHex(BigInt(value));
	}

	throw new InvalidNumberError(value);
};

/**
 * Adds a padding on the left of a string, if value is a integer or bigInt will be converted to a hex string.
 */
export const padLeft = (value: ValidInputTypes, characterAmount: number, sign = '0'): string => {
	if (typeof value === 'string' && !isHexStrict(value)) {
		return value.padStart(characterAmount, sign);
	}

	const hex = typeof value === 'string' && isHexStrict(value) ? value : numberToHex(value);

	const [prefix, hexValue] = hex.startsWith('-') ? ['-0x', hex.slice(3)] : ['0x', hex.slice(2)];

	return `${prefix}${hexValue.padStart(characterAmount, sign)}`;
};

export function uint8ArrayToHexString(uint8Array: Uint8Array): string {
	let hexString = '0x';
	for (const e of uint8Array) {
		const hex = e.toString(16);
		hexString += hex.length === 1 ? `0${hex}` : hex;
	}
	return hexString;
}

export function hexToUint8Array(hex: string): Uint8Array {
	let value;
	if (hex.toLowerCase().startsWith('0x')) {
		value = hex.slice(2);
	} else {
		value = hex;
	}
	if (value.length % 2 !== 0) {
		throw new InvalidBytesError(`hex string has odd length: ${hex}`);
	}
	if (!/^[0-9a-f]*$/i.test(value)) {
		throw new InvalidBytesError(`Invalid hex string: ${hex}`);
	}
	const bytes = new Uint8Array(Math.ceil(value.length / 2));
	for (let i = 0; i < bytes.length; i += 1) {
		const byte = parseInt(value.substring(i * 2, i * 2 + 2), 16);
		bytes[i] = byte;
	}
	return bytes;
}
