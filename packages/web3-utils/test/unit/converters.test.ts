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

import { InvalidAddressError, InvalidNumberError } from '@theqrl/web3-errors';
import { Numbers } from '@theqrl/web3-types';
import { Web3ValidatorError } from '@theqrl/web3-validator';
import {
	QRLUnits,
	asciiToHex,
	bytesToHex,
	fromAscii,
	fromDecimal,
	fromUtf8,
	fromPlanck,
	hexToAscii,
	hexToBytes,
	hexToNumber,
	hexToNumberString,
	hexToString,
	hexToUtf8,
	numberToHex,
	stringToHex,
	toAscii,
	toDecimal,
	toHex,
	toNumber,
	toUtf8,
	toPlanck,
	utf8ToHex,
	toChecksumAddress,
	bytesToUint8Array,
	toBigInt,
	addressToBytes,
	addressToHex,
	hexToAddress,
} from '../../src/converters';

import {
	asciiToHexValidData,
	bytesToHexInvalidData,
	bytesToHexValidData,
	fromPlanckInvalidData,
	fromPlanckValidData,
	hexToAsciiValidData,
	hexToBytesInvalidData,
	hexToBytesValidData,
	hexToNumberInvalidData,
	hexToNumberValidData,
	hexToUtf8InvalidData,
	hexToUtf8ValidData,
	toUtf8ValidData,
	numberToHexInvalidData,
	numberToHexValidData,
	toHexValidData,
	toHexInvalidData,
	toPlanckInvalidData,
	toPlanckValidData,
	utf8ToHexInvalidData,
	utf8ToHexValidData,
	toCheckSumValidData,
	bytesToUint8ArrayInvalidData,
	bytesToUint8ArrayValidData,
	toBigIntValidData,
	toBigIntInvalidData,
	toCheckSumInvalidData,
	numberToHexstrictValidData,
	addressToBytesValidData,
	addressToHexValidData,
	hexToAddressValidData,
	hexToAddressInvalidData,
	invalidAddressData,
} from '../fixtures/converters';

describe('converters', () => {
	describe('bytesToHex', () => {
		describe('valid cases', () => {
			it.each(bytesToHexValidData)('%s', (input, output) => {
				expect(bytesToHex(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(bytesToHexInvalidData)('%s', (input, output) => {
				expect(() => bytesToHex(input)).toThrow(output);
			});
		});
	});

	describe('hexToBytes', () => {
		describe('valid cases', () => {
			it.each(hexToBytesValidData)('%s', (input, output) => {
				expect(hexToBytes(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(hexToBytesInvalidData)('%s', (input, output) => {
				expect(() => hexToBytes(input)).toThrow(output);
			});
		});
	});

	describe('addressToHex', () => {
		describe('valid cases', () => {
			it.each(addressToHexValidData)('%s', (input, output) => {
				expect(addressToHex(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(invalidAddressData)('%s', (input, output) => {
				expect(() => addressToHex(input)).toThrow(output);
			});
		});
	});

	describe('hexToAddress', () => {
		describe('valid cases', () => {
			it.each(hexToAddressValidData)('%s', (input, output) => {
				expect(hexToAddress(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(hexToAddressInvalidData)('%s', (input, output) => {
				expect(() => hexToAddress(input)).toThrow(output);
			});
		});
	});

	describe('addressToBytes', () => {
		describe('valid cases', () => {
			it.each(addressToBytesValidData)('%s', (input, output) => {
				expect(addressToBytes(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(invalidAddressData)('%s', (input, output) => {
				expect(() => addressToBytes(input)).toThrow(output);
			});
		});
	});

	describe('numberToHex', () => {
		describe('valid cases', () => {
			it.each(numberToHexValidData)('%s', (input, output) => {
				expect(numberToHex(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(numberToHexInvalidData)('%s', (input, output) => {
				expect(() => numberToHex(input)).toThrow(output);
			});
		});

		describe('valid hexstrict cases', () => {
			it.each(numberToHexstrictValidData)('%s', (input, output) => {
				expect(numberToHex(input, true)).toEqual(output);
			});
		});
	});

	describe('fromDecimal', () => {
		describe('valid cases', () => {
			it.each(numberToHexValidData)('%s', (input, output) => {
				expect(fromDecimal(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(numberToHexInvalidData)('%s', (input, output) => {
				expect(() => fromDecimal(input)).toThrow(output);
			});
		});
	});

	describe('hexToNumber', () => {
		describe('valid cases', () => {
			it.each(hexToNumberValidData)('%s', (input, output) => {
				expect(hexToNumber(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(hexToNumberInvalidData)('%s', (input, output) => {
				expect(() => hexToNumber(input)).toThrow(output);
			});
		});
	});

	describe('toDecimal', () => {
		describe('valid cases', () => {
			it.each(hexToNumberValidData)('%s', (input, output) => {
				expect(toDecimal(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(hexToNumberInvalidData)('%s', (input, output) => {
				expect(() => toDecimal(input)).toThrow(output);
			});
		});
	});

	describe('hexToNumberString', () => {
		it.each(hexToNumberValidData)('%s', (input, output) => {
			expect(hexToNumberString(input)).toEqual(output.toString());
		});
	});

	describe('utf8ToHex', () => {
		describe('valid cases', () => {
			it.each(utf8ToHexValidData)('%s', (input, output) => {
				expect(utf8ToHex(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(utf8ToHexInvalidData)('%s', (input, output) => {
				expect(() => utf8ToHex(input)).toThrow(output);
			});
		});
	});

	describe('fromUtf8', () => {
		describe('valid cases', () => {
			it.each(utf8ToHexValidData)('%s', (input, output) => {
				expect(fromUtf8(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(utf8ToHexInvalidData)('%s', (input, output) => {
				expect(() => fromUtf8(input)).toThrow(output);
			});
		});
	});

	describe('stringToHex', () => {
		describe('valid cases', () => {
			it.each(utf8ToHexValidData)('%s', (input, output) => {
				expect(stringToHex(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(utf8ToHexInvalidData)('%s', (input, output) => {
				expect(() => stringToHex(input)).toThrow(output);
			});
		});
	});

	describe('hexToUtf8', () => {
		describe('valid cases', () => {
			it.each(hexToUtf8ValidData)('%s', (input, output) => {
				expect(hexToUtf8(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(hexToUtf8InvalidData)('%s', (input, output) => {
				expect(() => hexToUtf8(input)).toThrow(output);
			});
		});
	});

	describe('toUtf8', () => {
		describe('valid cases', () => {
			it.each(toUtf8ValidData)('%s', (input, output) => {
				expect(toUtf8(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(hexToUtf8InvalidData)('%s', (input, output) => {
				expect(() => toUtf8(input)).toThrow(output);
			});
		});
	});

	describe('hexToString', () => {
		describe('valid cases', () => {
			it.each(hexToUtf8ValidData)('%s', (input, output) => {
				expect(hexToString(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(hexToUtf8InvalidData)('%s', (input, output) => {
				expect(() => hexToString(input)).toThrow(output);
			});
		});
	});

	describe('asciiToHex', () => {
		describe('valid cases', () => {
			it.each(asciiToHexValidData)('%s', (input, output) => {
				expect(asciiToHex(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(utf8ToHexInvalidData)('%s', (input, output) => {
				expect(() => asciiToHex(input)).toThrow(output);
			});
		});
	});

	describe('fromAscii', () => {
		describe('valid cases', () => {
			it.each(asciiToHexValidData)('%s', (input, output) => {
				expect(fromAscii(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(utf8ToHexInvalidData)('%s', (input, output) => {
				expect(() => fromAscii(input)).toThrow(output);
			});
		});
	});

	describe('hexToAscii', () => {
		describe('valid cases', () => {
			it.each(hexToAsciiValidData)('%s', (input, output) => {
				expect(hexToAscii(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(hexToUtf8InvalidData)('%s', (input, output) => {
				expect(() => hexToAscii(input)).toThrow(output);
			});
		});
	});

	describe('toAscii', () => {
		describe('valid cases', () => {
			it.each(hexToAsciiValidData)('%s', (input, output) => {
				expect(toAscii(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(hexToUtf8InvalidData)('%s', (input, output) => {
				expect(() => toAscii(input)).toThrow(output);
			});
		});
	});

	describe('toHex', () => {
		describe('return value', () => {
			it.each(toHexValidData)('%s', (input, output) => {
				expect(toHex(input)).toEqual(output[0]);
			});
		});

		describe('return type', () => {
			it.each(toHexValidData)('%s', (input, output) => {
				expect(toHex(input, true)).toEqual(output[1]);
			});
		});

		describe('invalid cases', () => {
			it.each(toHexInvalidData)('%s', (input, output) => {
				expect(() => toHex(input)).toThrow(output);
			});
		});
	});

	describe('toNumber', () => {
		it.each([...hexToNumberValidData, [123, 123], ['123', 123]])('%s', (input, output) => {
			expect(toNumber(input)).toEqual(output);
		});
	});

	describe('fromPlanck', () => {
		describe('valid cases', () => {
			it.each(fromPlanckValidData)('%s', (input, output) => {
				expect(fromPlanck(input[0], input[1])).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(fromPlanckInvalidData)('%s', (input, output) => {
				expect(() => fromPlanck(input[0], input[1])).toThrow(output);
			});
		});
	});

	describe('toPlanck', () => {
		describe('valid cases', () => {
			it.each(toPlanckValidData)('%s', (input, output) => {
				expect(toPlanck(output, input[1])).toEqual(input[0].toString());
			});
		});

		describe('invalid cases', () => {
			it.each(toPlanckInvalidData)('%s', (input, output) => {
				expect(() => toPlanck(input[0], input[1])).toThrow(output);
			});
		});
	});
	describe('toChecksumAddress', () => {
		describe('valid cases', () => {
			it.each(toCheckSumValidData)('%s', (input, output) => {
				expect(toChecksumAddress(input)).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			it.each(toCheckSumInvalidData)('%s', (input, output) => {
				expect(() => toChecksumAddress(input)).toThrow(output);
			});
		});
	});
	describe('bytesToUint8Array', () => {
		describe('bytesToUint8Array', () => {
			describe('valid cases', () => {
				it.each(bytesToUint8ArrayValidData)('%s', (input, output) => {
					expect(bytesToUint8Array(input)).toEqual(output);
				});
			});

			describe('invalid cases', () => {
				it.each(bytesToUint8ArrayInvalidData)('%s', (input, output) => {
					expect(() => bytesToUint8Array(input)).toThrow(output);
				});
			});
		});
	});
	describe('toBigInt', () => {
		describe('valid cases', () => {
			it.each(toBigIntValidData)('%s', (input, output) => {
				expect(toBigInt(input)).toEqual(output);
			});
		});

		describe('invalid cases', () => {
			it.each(toBigIntInvalidData)('%s', (input, output) => {
				expect(() => toBigInt(input)).toThrow(output);
			});
		});
	});

	describe('toPlanck precision (H-2)', () => {
		const units: [QRLUnits, number][] = [
			['planck', 0],
			['kplanck', 3],
			['shor', 9],
			['quanta', 18],
			['tquanta', 30],
		];

		it.each(units)('accepts exactly as many decimals as %s has (%i)', (unit, zeros) => {
			const amount = zeros === 0 ? '1' : `1.${'0'.repeat(zeros - 1)}1`;
			const expected = (BigInt(10) ** BigInt(zeros) + BigInt(zeros === 0 ? 0 : 1)).toString();
			expect(toPlanck(amount, unit)).toBe(expected);
		});

		it.each(units)('rejects one decimal more than %s has (%i) instead of inflating', (unit, zeros) => {
			expect(() => toPlanck(`0.${'0'.repeat(zeros)}1`, unit)).toThrow(InvalidNumberError);
			expect(() => toPlanck(`1.${'0'.repeat(zeros)}1`, unit)).toThrow(InvalidNumberError);
		});

		it.each(units)('ignores trailing zeros beyond the precision of %s (%i)', (unit, zeros) => {
			expect(toPlanck(`1.${'0'.repeat(zeros + 3)}`, unit)).toBe((BigInt(10) ** BigInt(zeros)).toString());
		});

		it.each([
			['1.0000000000000000001', 'quanta'],
			['0.0000000000000000001', 'quanta'],
			['1.5', 'planck'],
			['1.0000000001', 'shor'],
			['0.123456789012345678901234', 'quanta'],
		] as [string, QRLUnits][])('rejects the audit case %s %s', (amount, unit) => {
			expect(() => toPlanck(amount, unit)).toThrow(InvalidNumberError);
		});

		it('converts string, number and bigint inputs exactly', () => {
			expect(toPlanck('1.25', 'shor')).toBe('1250000000');
			expect(toPlanck('.5', 'quanta')).toBe('500000000000000000');
			expect(toPlanck('1.', 'quanta')).toBe('1000000000000000000');
			expect(toPlanck('-0.5', 'quanta')).toBe('-500000000000000000');
			expect(toPlanck('-1', 'quanta')).toBe('-1000000000000000000');
			expect(toPlanck('0x10', 'quanta')).toBe('16000000000000000000');
			expect(toPlanck(1.5, 'shor')).toBe('1500000000');
			expect(toPlanck(0.1, 'quanta')).toBe('100000000000000000');
			expect(toPlanck(2 ** 60, 'planck')).toBe('1152921504606846976');
			expect(toPlanck(BigInt(2), 'quanta')).toBe('2000000000000000000');
		});

		it.each([
			[1.5, 'planck'],
			[1.0000000001, 'planck'],
			[1.0000000001, 'shor'],
			[0.1234567891, 'shor'],
		] as [number, QRLUnits][])(
			'rejects the JavaScript number %s when it carries more decimals than %s has',
			(amount, unit) => {
				expect(() => toPlanck(amount, unit)).toThrow(InvalidNumberError);
			},
		);

		it.each([NaN, Infinity, -Infinity, 1e-7])(
			'rejects the number %s with InvalidNumberError (L-26)',
			amount => {
				expect(() => toPlanck(amount, 'quanta')).toThrow(InvalidNumberError);
			},
		);

		it.each(['', '.', '+1', ' 1 ', '0b11', '1e3', '1.5.5', 'Q1'])(
			'rejects the lenient spelling %j with a typed validation error (L-28)',
			amount => {
				expect(() => toPlanck(amount, 'quanta')).toThrow(Web3ValidatorError);
			},
		);
	});

	describe('fromPlanck (L-19)', () => {
		it.each([
			[-1, 'quanta', '-0.000000000000000001'],
			[BigInt('-1500000000000000000'), 'quanta', '-1.5'],
			[2 ** 60, 'planck', '1152921504606846976'],
			[1e21, 'quanta', '1000'],
			['0xff', 'planck', '255'],
			['-0x1', 'planck', '-1'],
		] as [Numbers, QRLUnits, string][])('converts %s %s exactly', (amount, unit, expected) => {
			expect(fromPlanck(amount, unit)).toBe(expected);
		});

		it.each([1.5, '', '1e21', ' 1 ', NaN, Infinity, '1.5', true, []])(
			'rejects the non-integer amount %j with InvalidNumberError',
			amount => {
				expect(() => fromPlanck(amount as never, 'quanta')).toThrow(InvalidNumberError);
			},
		);
	});

	describe('typed number parsing (L-26, L-28)', () => {
		// Using "null" value intentionally for validation
		// eslint-disable-next-line no-null/no-null
		it.each(['', ' ', ' 1 ', '+1', '0b101', '0x', '-0x', '1e3', '1.5', 'abc', true, [], [7], {}, undefined, null, NaN, Infinity])(
			'toNumber rejects %j with InvalidNumberError',
			value => {
				expect(() => toNumber(value as never)).toThrow(InvalidNumberError);
			},
		);

		it('toNumber does not return negative zero', () => {
			expect(Object.is(toNumber('-0x0'), 0)).toBe(true);
		});

		it.each([
			['-0x1', BigInt(-1)],
			['0X10', BigInt(16)],
			['-0X10', BigInt(-16)],
			['007', BigInt(7)],
			['-7', BigInt(-7)],
			[2 ** 60, BigInt(2) ** BigInt(60)],
		])('toBigInt parses %s', (value, expected) => {
			expect(toBigInt(value)).toBe(expected);
		});

		// Using "null" value intentionally for validation
		// eslint-disable-next-line no-null/no-null
		it.each(['abc', 'ff', '0x', '-0x', '', ' 1 ', '+1', '0b11', '1e3', '1.5', 1.5, NaN, Infinity, true, [], {}, undefined, null])(
			'toBigInt rejects %j with InvalidNumberError instead of a raw error',
			value => {
				expect(() => toBigInt(value)).toThrow(InvalidNumberError);
			},
		);

		it.each([
			['0x', InvalidNumberError],
			['0X', InvalidNumberError],
			// `-0x` is not even strict hex, so the `hex` validation rejects it first.
			['-0x', Web3ValidatorError],
		])('hexToNumber rejects the digitless quantity %s with a typed error', (value, error) => {
			expect(() => hexToNumber(value)).toThrow(error);
			expect(() => hexToNumberString(value)).toThrow(error);
		});
	});

	describe('numberToHex keeps one zero digit (L-27)', () => {
		it.each([
			['0x0', '0x0'],
			['0x00', '0x0'],
			['-0x0', '-0x0'],
			['0x0001', '0x1'],
		])('%s -> %s', (value, expected) => {
			expect(numberToHex(value)).toBe(expected);
		});

		it('pads 0x0 to a full byte in strict mode', () => {
			expect(numberToHex('0x0', true)).toBe('0x00');
		});

		it.each(['', ' 1 ', '+1', '0b11', '0x'])('rejects the lenient spelling %j (L-28)', value => {
			expect(() => numberToHex(value)).toThrow(Web3ValidatorError);
		});
	});

	describe('toHex (L-30)', () => {
		it('encodes a byte array as bytes, not as JSON text', () => {
			expect(toHex(new Uint8Array([1, 2]))).toBe('0x0102');
			expect(toHex(new Uint8Array([1, 2]), true)).toBe('bytes');
			expect(toHex(new Uint8Array([]))).toBe('0x');
		});

		it('keeps the zero digit of -0x0 (L-27)', () => {
			expect(toHex('-0x0')).toBe('-0x0');
		});
	});

	describe('hexToAddress (L-32)', () => {
		it('rejects negative hex instead of returning an unparseable address', () => {
			expect(() => hexToAddress('-0x1')).toThrow(InvalidAddressError);
		});
	});
});
