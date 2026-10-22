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

import { InvalidNumberError, InvalidBytesError } from '@theqrl/web3-errors';
import { ValidInputTypes } from '../../src/types';
import {
	qrlAbiToJsonSchema,
	transformJsonDataToAbiFormat,
	codePointToInt,
	hexToNumber,
	numberToHex,
	padLeft,
	hexToUint8Array,
	uint8ArrayToHexString,
	addressToHex,
	parseBaseType,
} from '../../src/utils';
import { abiToJsonSchemaCases } from '../fixtures/abi_to_json_schema';
import {
	validCodePoints,
	invalidCodePoints,
	validHexStrictDataWithNumber,
	invalidHexData,
	invalidHexStrictStringData,
	validHexStrictData,
	validStringNumbersWithHex,
	invalidStringNumbers,
	padLeftData,
	validHexStrictDataWithUint8Array,
	validAddressDataWithHex,
	invalidAddressData,
} from '../fixtures/validation';

describe('utils', () => {
	describe('uint8Array', () => {
		it.each(validHexStrictDataWithUint8Array)('uint8Array to hex', (res, input) => {
			expect(uint8ArrayToHexString(input)).toEqual(res.toLowerCase());
		});
		describe('hex to uint8Array', () => {
			it.each(validHexStrictDataWithUint8Array)('valid hex string data', (input, res) => {
				expect(hexToUint8Array(input)).toEqual(res);
			});

			it.each(invalidHexStrictStringData)('invalidHexData', (input: string) => {
				expect(() => {
					hexToUint8Array(input);
				}).toThrow(new InvalidBytesError(`hex string has odd length: ${input}`));
			});

			it.each(['0xzz', '0xgg11'])('throws on non-hex characters: %s', (input: string) => {
				expect(() => {
					hexToUint8Array(input);
				}).toThrow(new InvalidBytesError(`Invalid hex string: ${input}`));
			});
		});
	});
	describe('ethAbiToJsonSchema', () => {
		describe('full schema', () => {
			it.each(abiToJsonSchemaCases)('$title', ({ abi, json }) => {
				expect(qrlAbiToJsonSchema(abi.fullSchema)).toEqual(json.fullSchema);
			});
		});

		describe('short schema', () => {
			it.each(abiToJsonSchemaCases)('$title', ({ abi, json }) => {
				expect(qrlAbiToJsonSchema(abi.shortSchema)).toEqual(json.shortSchema);
			});
		});
	});

	describe('transformJsonDataToAbiFormat', () => {
		describe('full schema', () => {
			it.each(abiToJsonSchemaCases)('$title', ({ abi, json }) => {
				expect(transformJsonDataToAbiFormat(abi.fullSchema, json.data)).toEqual(abi.data);
			});
		});
	});

	describe('codePointToInt', () => {
		it.each(validCodePoints)('valid code points', (input, res) => {
			expect(codePointToInt(input)).toEqual(res);
		});

		it.each(invalidCodePoints)('valid code points', (input: number) => {
			expect(() => {
				codePointToInt(input);
			}).toThrow(new Error(`Invalid code point: ${input}`));
		});
	});

	describe('hexToNumber', () => {
		it.each(validHexStrictDataWithNumber)('valid hex string data', (input, res) => {
			expect(hexToNumber(input)).toEqual(res);
		});

		it.each(invalidHexData)('invalidHexData', (input: string) => {
			expect(() => {
				hexToNumber(input);
			}).toThrow(InvalidNumberError);
		});

		it.each(['0x', '-0x', '0X'])(
			'rejects the digitless quantity %s with a typed error (L-26)',
			(input: string) => {
				expect(() => hexToNumber(input)).toThrow(InvalidNumberError);
			},
		);

		it('does not return negative zero for -0x0 (L-26)', () => {
			expect(Object.is(hexToNumber('-0x0'), 0)).toBe(true);
		});
	});
	describe('numberToHex', () => {
		it.each(validHexStrictDataWithNumber.map((tuple): [number | bigint, string] => [tuple[1], tuple[0]]))(
			'valid numbers and bigints',
			(input, res) => {
				expect(numberToHex(input)).toEqual(res.toLowerCase());
			},
		);

		it.each(
			(validHexStrictData as string[]).filter(input => !['0x', '0X'].includes(input)),
		)('valid hex strings', input => {
			expect(numberToHex(input)).toEqual(input.toLowerCase());
		});

		it.each(['0x', '0X', '-0x', '', ' 1 ', '+1', '0b11', '1e3', '1.5'])(
			'rejects %j, which is not an integer (L-27, L-28)',
			input => {
				expect(() => numberToHex(input)).toThrow(InvalidNumberError);
			},
		);

		it.each([NaN, Infinity, -Infinity, 1.5])(
			'rejects the non-integer number %s instead of printing it (L-26)',
			input => {
				expect(() => numberToHex(input)).toThrow(InvalidNumberError);
			},
		);

		it.each([
			['0x0', '0x0'],
			['0x00', '0x0'],
			['-0x0', '-0x0'],
			['0x0001', '0x1'],
			['0X0A', '0xa'],
		])('keeps one zero digit when stripping leading zeros: %s -> %s (L-27)', (input, res) => {
			expect(numberToHex(input)).toBe(res);
		});

		it.each(validStringNumbersWithHex)('valid string numbers', (input, res) => {
			expect(numberToHex(input)).toEqual(res.toLowerCase());
		});

		it.each(invalidStringNumbers)('invalid string number', (input: ValidInputTypes) => {
			expect(() => {
				numberToHex(input);
			}).toThrow(new InvalidNumberError(input));
		});
	});
	describe('addressToHex', () => {
		it.each(validAddressDataWithHex)('valid address string data', (input, res) => {
			expect(addressToHex(input)).toEqual(res);
		});

		it.each(invalidAddressData)('invalidAddressData', (input: string) => {
			expect(() => {
				addressToHex(input);
			}).toThrow(new Error('Invalid address string'));
		});
	});

	describe('parseBaseType', () => {
		it.each([
			['uint256', 'uint', 256, false, []],
			['uint', 'uint', undefined, false, []],
			['bytes32', 'bytes', 32, false, []],
			['tuple[2][]', 'tuple', undefined, true, [2, -1]],
			['address[]', 'address', undefined, true, [-1]],
			['string', 'string', undefined, false, []],
		])('parses %s', (type, baseType, baseTypeSize, isArray, arraySizes) => {
			expect(parseBaseType(type)).toEqual({ baseType, baseTypeSize, isArray, arraySizes });
		});

		it.each(['uint8x', 'bytes 3 2', 'uint[ 2]', 'int-8', 'string8', 'uintt', 'bytesabc', ' uint8', 'Uint8'])(
			'rejects the malformed type %j instead of guessing a size (I-11)',
			type => {
				expect(parseBaseType(type).baseType).toBeUndefined();
			},
		);

		it('rejects a non-string type without throwing (L-26)', () => {
			expect(parseBaseType(5 as unknown as string).baseType).toBeUndefined();
			expect(parseBaseType(undefined as unknown as string).baseType).toBeUndefined();
		});
	});

	describe('padLeft', () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		it.each(padLeftData.data)('valid numbers and bigints', (input, res) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			expect(padLeft(input, padLeftData.padDigits)).toBe(res);
		});
	});
});
