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

import { ValidInputTypes } from '../types.js';
import { parseBaseType, hexToNumber } from '../utils.js';
import { isHexStrict } from './string.js';

/**
 * Checks if a given value is a valid big int
 */
export const isBigInt = (value: ValidInputTypes): boolean => typeof value === 'bigint';

// A decimal integer in its only accepted spelling: an optional `-` and digits. `BigInt()`
// itself also takes `''` (as 0), surrounding whitespace, `+1`, `0b11`, `0o7` and `0x1`, which
// let `' 1 '` or `'0b11'` validate as numbers (L-28).
const DECIMAL_INTEGER = /^-?\d+$/;

// A decimal number with an optional fraction: `1`, `1.5`, `1.`, `.5`, `-0.5`. No exponent,
// no sign other than `-`, no whitespace, at most one dot.
// The fraction requires its dot (`\d+(\.\d*)?`): `\d+\.?\d*` backtracked quadratically on a
// long run of digits followed by a non-digit.
const DECIMAL_NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * The integer a number-like input stands for, or `undefined` when the input is not an integer
 * written in a strict spelling. A JavaScript `number` must be a safe integer: above 2^53 it no
 * longer identifies one integer, so neither `isInt` nor `isUInt` accepts it (I-11).
 */
const toIntegerBigInt = (value: ValidInputTypes): bigint | undefined => {
	if (typeof value === 'bigint') {
		return value;
	}

	if (typeof value === 'number') {
		return Number.isSafeInteger(value) ? BigInt(value) : undefined;
	}

	if (typeof value !== 'string') {
		return undefined;
	}

	if (isHexStrict(value)) {
		try {
			return BigInt(hexToNumber(value));
		} catch {
			// `0x` and `-0x` carry no digits.
			return undefined;
		}
	}

	return DECIMAL_INTEGER.test(value) ? BigInt(value) : undefined;
};

export const isUInt = (
	value: ValidInputTypes,
	options: { abiType: string; bitSize?: never } | { bitSize: number; abiType?: never } = {
		abiType: 'uint',
	},
) => {
	let size!: number;

	if (options?.abiType) {
		const { baseTypeSize, baseType } = parseBaseType(options.abiType);

		if (baseType !== 'uint') {
			return false;
		}

		if (baseTypeSize) {
			size = baseTypeSize;
		}
	} else if (options.bitSize) {
		size = options.bitSize;
	}

	const maxSize = BigInt(2) ** BigInt(size ?? 256) - BigInt(1);
	const valueToCheck = toIntegerBigInt(value);

	return valueToCheck !== undefined && valueToCheck >= 0 && valueToCheck <= maxSize;
};

export const isInt = (
	value: ValidInputTypes,
	options: { abiType: string; bitSize?: never } | { bitSize: number; abiType?: never } = {
		abiType: 'int',
	},
) => {
	let size!: number;

	if (options?.abiType) {
		const { baseTypeSize, baseType } = parseBaseType(options.abiType);

		if (baseType !== 'int') {
			return false;
		}

		if (baseTypeSize) {
			size = baseTypeSize;
		}
	} else if (options.bitSize) {
		size = options.bitSize;
	}

	const maxSize = BigInt(2) ** BigInt((size ?? 256) - 1) - BigInt(1);
	const minSize = BigInt(-1) * BigInt(2) ** BigInt((size ?? 256) - 1);
	const valueToCheck = toIntegerBigInt(value);

	return valueToCheck !== undefined && valueToCheck >= minSize && valueToCheck <= maxSize;
};

/**
 * Checks whether a value is a number: a finite JavaScript `number`, a `bigint` or hex string
 * within 512 bits, or a decimal string with an optional fraction (`'1.5'`, `'-0.5'`).
 *
 * `NaN`, `Infinity`, `''`, `'.'`, `' 1 '`, `'+1'`, `'0b11'` and `'1e3'` are not numbers (L-28).
 */
export const isNumber = (value: ValidInputTypes) => {
	if (typeof value === 'number') {
		return Number.isFinite(value);
	}

	if (typeof value === 'bigint' || (typeof value === 'string' && isHexStrict(value))) {
		return isInt(value, { bitSize: 512 }) || isUInt(value, { bitSize: 512 });
	}

	return typeof value === 'string' && DECIMAL_NUMBER.test(value);
};
