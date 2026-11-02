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

import { Numbers } from '@theqrl/web3-types';
import { NibbleWidthError } from '@theqrl/web3-errors';
import {
	isHexStrict,
	isInt,
	isUInt,
	validator,
	utils as validatorUtils,
} from '@theqrl/web3-validator';
import { numberToHex, toBigInt, toNumber } from './converters.js';

const NIBBLE_BITS = BigInt(4);

/**
 * The integer value of a two's complement operand. Any 512-bit word is accepted, signed or
 * unsigned: a `uint512`-range value is a valid word at the QRL native width (L-18). Anything
 * else fails `int512` validation.
 */
const toWordValue = (value: Numbers): bigint => {
	if (!isInt(value, { bitSize: 512 }) && !isUInt(value, { bitSize: 512 })) {
		validator.validate(['int512'], [value]);
	}

	return toBigInt(value);
};

const toBitWidth = (value: Numbers, nibbleWidth: number): bigint => {
	if (!Number.isInteger(nibbleWidth) || nibbleWidth <= 0) {
		throw new NibbleWidthError(`value: ${String(value)}, nibbleWidth: ${String(nibbleWidth)}`);
	}

	return BigInt(nibbleWidth) * NIBBLE_BITS;
};

/**
 * Adds a padding on the left of a string, if value is a integer or bigInt will be converted to a hex string.
 * @param value - The value to be padded.
 * @param characterAmount - The amount of characters the string should have.
 * @param sign - The sign to be added (default is 0).
 * @returns The padded string.
 *
 * @example
 * ```ts
 *
 * console.log(web3.utils.padLeft('0x123', 10));
 * >0x0000000123
 * ```
 */
export const padLeft = (value: Numbers, characterAmount: number, sign = '0'): string => {
	// To avoid duplicate code and circular dependency we will
	// use `padLeft` implementation from `web3-validator`

	if (typeof value === 'string') {
		if (!isHexStrict(value)) {
			return value.padStart(characterAmount, sign);
		}
		return validatorUtils.padLeft(value, characterAmount, sign);
	}

	validator.validate(['int512'], [value]);

	return validatorUtils.padLeft(value, characterAmount, sign);
};

/**
 * Adds a padding on the right of a string, if value is a integer or bigInt will be converted to a hex string.
 * @param value - The value to be padded.
 * @param characterAmount - The amount of characters the string should have.
 * @param sign - The sign to be added (default is 0).
 * @returns The padded string.
 *
 * @example
 * ```ts
 * console.log(web3.utils.padRight('0x123', 10));
 * > 0x1230000000
 *
 * console.log(web3.utils.padRight('0x123', 10, '1'));
 * > 0x1231111111
 * ```
 */
export const padRight = (value: Numbers, characterAmount: number, sign = '0'): string => {
	if (typeof value === 'string') {
		if (!isHexStrict(value)) {
			return value.padEnd(characterAmount, sign);
		}

		// A hex string is padded as hex digits, exactly like `padLeft`. It is not range-checked
		// as an `int512`: that rejected every 64-byte word with the top bit set (L-29).
		const [prefix, hexValue] = value.startsWith('-')
			? ['-0x', value.slice(3)]
			: ['0x', value.slice(2)];

		return `${prefix}${hexValue.padEnd(characterAmount, sign)}`;
	}

	validator.validate(['int512'], [value]);

	const hexString = numberToHex(value);

	const prefixLength = hexString.startsWith('-') ? 3 : 2;
	return hexString.padEnd(characterAmount + prefixLength, sign);
};

/**
 * Adds a padding on the right of a string, if value is a integer or bigInt will be converted to a hex string. @alias `padRight`
 */
export const rightPad = padRight;

/**
 * Adds a padding on the left of a string, if value is a integer or bigInt will be converted to a hex string. @alias `padLeft`
 */
export const leftPad = padLeft;

/**
 * Converts a negative number into the two’s complement and return a hexstring of 64 nibbles.
 *
 * A non-negative value is returned as is (padded), so an already encoded word passes through;
 * it must fit in `nibbleWidth` nibbles. A negative value must be at least `-2^(bits - 1)`.
 * Either violation throws a {@link NibbleWidthError}; the previous code wrapped `-129` into
 * `0x7f` at 8 bits and let `2^40` overflow 32 bits without an error (L-18).
 *
 * @param value - The value to be converted.
 * @param nibbleWidth - The nibble width of the hex string (default is 64).
 *
 * @returns The hex string of the two’s complement.
 *
 * @example
 * ```ts
 * console.log(web3.utils.toTwosComplement(13, 32));
 * > 0x0000000000000000000000000000000d
 *
 * console.log(web3.utils.toTwosComplement('-0x1', 32));
 * > 0xffffffffffffffffffffffffffffffff
 *
 * console.log(web3.utils.toTwosComplement(BigInt('9007199254740992'), 32));
 * > 0x00000000000000000020000000000000
 * ```
 */
export const toTwosComplement = (value: Numbers, nibbleWidth = 64): string => {
	const val = toWordValue(value);
	const modulus = BigInt(1) << toBitWidth(value, nibbleWidth);

	if (val >= 0) {
		if (val >= modulus) {
			throw new NibbleWidthError(`value: ${String(value)}, nibbleWidth: ${nibbleWidth}`);
		}
		return padLeft(numberToHex(val), nibbleWidth);
	}

	if (-val > modulus >> BigInt(1)) {
		throw new NibbleWidthError(`value: ${String(value)}, nibbleWidth: ${nibbleWidth}`);
	}

	return padLeft(numberToHex(val + modulus), nibbleWidth);
};

/**
 * Converts the twos complement into a decimal number or big int.
 *
 * The word is decoded with integer arithmetic: a value with the top bit of the width set is
 * negative. The sign used to be derived from a floating point logarithm, which decoded
 * `0x80`, `INT256_MIN` and a band of values above `2^(bits - 1)` as positive (L-18). Any
 * 512-bit word is accepted, so the function works at the QRL native width of 128 nibbles.
 *
 * @param value - The value to be converted.
 * @param nibbleWidth - The nibble width of the hex string (default is 64).
 * @returns The decimal number or big int.
 *
 * @example
 * ```ts
 * console.log(web3.utils.fromTwosComplement(''0x0000000000000000000000000000000d', 32'));
 * > 13
 *
 * console.log(web3.utils.fromTwosComplement('0x00000000000000000020000000000000', 32));
 * > 9007199254740992n
 * ```
 */
export const fromTwosComplement = (value: Numbers, nibbleWidth = 64): number | bigint => {
	const val = toWordValue(value);
	const modulus = BigInt(1) << toBitWidth(value, nibbleWidth);

	// A negative input is already a signed value.
	if (val < 0) return toNumber(val);

	if (val >= modulus) {
		throw new NibbleWidthError(`value: ${String(value)}, nibbleWidth: ${nibbleWidth}`);
	}

	return toNumber(val >= modulus >> BigInt(1) ? val - modulus : val);
};
