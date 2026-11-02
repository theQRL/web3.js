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

import { NibbleWidthError } from '@theqrl/web3-errors';
import {
	fromTwosComplement,
	leftPad,
	padLeft,
	padRight,
	rightPad,
	toTwosComplement,
} from '../../src/string_manipulation';

import { Numbers } from '@theqrl/web3-types';
import {
	padLeftData,
	padInvalidData,
	padRightData,
	toTwosComplementData,
	toTwosComplementInvalidData,
	fromTwosComplementData,
	fromTwosComplementInvalidData,
} from '../fixtures/string_manipulation';

describe('string manipulation tests', () => {
	describe('padLeft', () => {
		describe('valid cases', () => {
			it.each(padLeftData)('%s', (input, output) => {
				expect(padLeft(input[0], input[1], input[2])).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			it.each(padInvalidData)('%s', (input, output) => {
				expect(() => padLeft(input[0], input[1], input[2])).toThrow(output);
			});
		});
	});

	describe('padRight', () => {
		describe('valid cases', () => {
			it.each(padRightData)('%s', (input, output) => {
				expect(padRight(input[0], input[1], input[2])).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			it.each(padInvalidData)('%s', (input, output) => {
				expect(() => padRight(input[0], input[1], input[2])).toThrow(output);
			});
		});
	});

	describe('leftPad', () => {
		describe('valid cases', () => {
			it.each(padLeftData)('%s', (input, output) => {
				expect(leftPad(input[0], input[1], input[2])).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			it.each(padInvalidData)('%s', (input, output) => {
				expect(() => leftPad(input[0], input[1], input[2])).toThrow(output);
			});
		});
	});

	describe('rightPad', () => {
		describe('valid cases', () => {
			it.each(padRightData)('%s', (input, output) => {
				expect(rightPad(input[0], input[1], input[2])).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			it.each(padInvalidData)('%s', (input, output) => {
				expect(() => rightPad(input[0], input[1], input[2])).toThrow(output);
			});
		});
	});

	describe('toTwosComplement', () => {
		describe('valid cases', () => {
			it.each(toTwosComplementData)('%s', (input, output) => {
				expect(toTwosComplement(input[0], input[1])).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			it.each(toTwosComplementInvalidData)('%s', (input, output) => {
				expect(() => toTwosComplement(input[0], input[1])).toThrow(output);
			});
		});
	});

	describe('fromTwosComplement', () => {
		describe('valid cases', () => {
			it.each(fromTwosComplementData)('%s', (input, output) => {
				expect(fromTwosComplement(input[0], input[1])).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(fromTwosComplementInvalidData)('%s', (input, output) => {
				expect(() => fromTwosComplement(input[0], input[1])).toThrow(output);
			});
		});
	});

	describe("two's complement with integer arithmetic (L-18)", () => {
		const hex = (value: bigint, nibbles: number) => `0x${value.toString(16).padStart(nibbles, '0')}`;
		const int256Min = BigInt(1) << BigInt(255);
		const twoPow256 = BigInt(1) << BigInt(256);

		it.each([
			[hex(int256Min, 64), 64, int256Min - twoPow256],
			[hex(int256Min + BigInt(1), 64), 64, int256Min + BigInt(1) - twoPow256],
			[hex(int256Min + (BigInt(1) << BigInt(201)), 64), 64, int256Min + (BigInt(1) << BigInt(201)) - twoPow256],
			[hex(int256Min + (BigInt(1) << BigInt(202)), 64), 64, int256Min + (BigInt(1) << BigInt(202)) - twoPow256],
			[hex(int256Min - BigInt(1), 64), 64, int256Min - BigInt(1)],
			['0x80', 2, -128],
			['0x81', 2, -127],
			['0x7f', 2, 127],
			['0x8000000000000000', 16, -(BigInt(1) << BigInt(63))],
			['0x8000000000000001', 16, -(BigInt(1) << BigInt(63)) + BigInt(1)],
			['0x80000000000003ff', 16, -(BigInt(1) << BigInt(63)) + BigInt(0x3ff)],
			[`0x8${'0'.repeat(127)}`, 128, -(BigInt(1) << BigInt(511))],
			[`0x${'f'.repeat(128)}`, 128, -1],
			[BigInt(1) << BigInt(511), 128, -(BigInt(1) << BigInt(511))],
		] as [Numbers, number, number | bigint][])('fromTwosComplement(%s, %i)', (value, width, expected) => {
			expect(fromTwosComplement(value, width)).toEqual(expected);
		});

		it.each([
			[-129, 2],
			[2 ** 40, 8],
			[256, 2],
			[-(BigInt(1) << BigInt(255)) - BigInt(1), 64],
			[1, 0],
			[1, 1.5],
		] as [Numbers, number][])('toTwosComplement(%s, %s) throws NibbleWidthError', (value, width) => {
			expect(() => toTwosComplement(value, width)).toThrow(NibbleWidthError);
		});

		it('encodes the width boundaries', () => {
			expect(toTwosComplement(-128, 2)).toBe('0x80');
			expect(toTwosComplement(255, 2)).toBe('0xff');
			expect(toTwosComplement(-1, 8)).toBe('0xffffffff');
			expect(toTwosComplement(BigInt(1) << BigInt(511), 128)).toBe(`0x8${'0'.repeat(127)}`);
			expect(toTwosComplement(-(BigInt(1) << BigInt(255)), 64)).toBe(`0x8${'0'.repeat(63)}`);
		});

		it('round-trips every 8-bit value', () => {
			for (let value = -128; value < 128; value += 1) {
				expect(fromTwosComplement(toTwosComplement(value, 2), 2)).toBe(value);
			}
		});

		it('rejects a width that is not a positive integer for fromTwosComplement', () => {
			expect(() => fromTwosComplement('0x1', 0)).toThrow(NibbleWidthError);
			expect(() => fromTwosComplement('0x1', -2)).toThrow(NibbleWidthError);
		});
	});

	describe('padRight on hex words (L-29)', () => {
		it('pads a 64-byte word with the top bit set without an int512 range check', () => {
			const word = `0x${'ff'.repeat(64)}`;
			expect(padRight(word, 128)).toBe(word);
			expect(padRight(word, 130)).toBe(`${word}00`);
			expect(rightPad(`0x80${'00'.repeat(63)}`, 128)).toBe(`0x80${'00'.repeat(63)}`);
		});

		it('keeps padding negative and short hex strings as before', () => {
			expect(padRight('-0x1', 4)).toBe('-0x1000');
			expect(padRight('0x00', 5, 'f')).toBe('0x00fff');
		});
	});
});
