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
import { AbiInput } from '@theqrl/web3-types';
import {
	decodeParameter,
	decodeParameters,
	encodeParameters,
	encodeParameter,
} from '../../../src/api/parameters_api';
import {
	inValidDecodeParametersData,
	inValidEncodeParametersData,
	validDecodeParametersData,
	validEncodeParametersData,
	validEncodeDecodeParametersData,
	validEncodeDoesNotMutateData,
} from '../../fixtures/data';

describe('parameters_api', () => {
	describe('encodeParameters', () => {
		it.each(['0x', '0xabc', '0xabcd', `0x${'ab'.repeat(33)}`])(
			'rejects bytes32 values that are not exactly 32 bytes: %s',
			value => {
				expect(() => encodeParameter('bytes32', value)).toThrow('Parameter encoding error');
			},
		);

		it.each(['bytes4[]', 'bytes4[1]'])('validates fixed-byte lengths inside %s', type => {
			expect(() => encodeParameter(type, ['0xabcd'])).toThrow('Parameter encoding error');
		});

		it('validates fixed-byte lengths in tuples', () => {
			expect(() =>
				encodeParameter(
					{ type: 'tuple', components: [{ name: 'value', type: 'bytes4' }] },
					{ value: '0xabcd' },
				),
			).toThrow('Parameter encoding error');
		});

		it('accepts exact-width byte arrays and preserves their content', () => {
			const value = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
			expect(encodeParameter('bytes4', value)).toBe(`0xdeadbeef${'00'.repeat(60)}`);
			expect(value).toEqual(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]));
			expect(() => encodeParameter('bytes4', value.slice(0, 3))).toThrow(
				'Parameter encoding error',
			);
		});

		describe('valid data', () => {
			it.each(validEncodeParametersData)(
				'%#: should pass for valid values: %j',
				({ input: [abi, params], output }) => {
					const expected = encodeParameters(abi, params);
					expect(JSON.parse(JSON.stringify(expected))).toEqual(output);
				},
			);
		});

		describe('invalid data', () => {
			it.each(inValidEncodeParametersData)(
				'%#: should not pass for invalid values: %j',
				({ input: [abi, params], output }) => {
					expect(() => encodeParameters(abi, params)).toThrow(output);
				},
			);
		});

		describe('bool parameters (H-3)', () => {
			const word = (bit: number) => `0x${'0'.repeat(127)}${bit}`;

			// Exactly the forms web3-validator's `bool` format accepts, mapped by value.
			it.each([
				['0', false],
				['0x0', false],
				[0, false],
				[BigInt(0), false],
				[false, false],
				['1', true],
				['0x1', true],
				[1, true],
				[BigInt(1), true],
				[true, true],
			])('encodes %p by value as %p', (value, expected) => {
				const encoded = encodeParameter('bool', value);
				expect(encoded).toBe(word(expected ? 1 : 0));
				expect(decodeParameter('bool', encoded)).toBe(expected);
				expect(encodeParameters(['bool'], [value])).toBe(encoded);
			});

			it.each(['false', 'true', 'False', 2, '2', '0x00', '0X0', '', 'yes', {}, [], undefined, NaN])(
				'rejects %p with an AbiError instead of encoding it as true',
				value => {
					expect(() => encodeParameter('bool', value)).toThrow(AbiError);
					expect(() => encodeParameter('bool', value)).toThrow('invalid boolean value');
					expect(() => encodeParameters(['bool'], [value])).toThrow(AbiError);
				},
			);

			it('applies the same rule inside arrays and tuples', () => {
				const offset = `${'0'.repeat(126)}40`;
				const count = `${'0'.repeat(127)}2`;
				expect(encodeParameters(['bool[]'], [['0', '0x1']])).toBe(
					`0x${offset}${count}${'0'.repeat(128)}${'0'.repeat(127)}1`,
				);
				expect(encodeParameters(['bool[2]'], [['0x0', true]])).toBe(
					`0x${'0'.repeat(128)}${'0'.repeat(127)}1`,
				);
				expect(
					encodeParameter(
						{ type: 'tuple', components: [{ name: 'flag', type: 'bool' }] },
						{ flag: '0' },
					),
				).toBe(word(0));
				expect(() => encodeParameters(['bool[]'], [['false']])).toThrow(
					'invalid boolean value',
				);
				expect(() =>
					encodeParameter(
						{ type: 'tuple', components: [{ name: 'flag', type: 'bool' }] },
						{ flag: 'false' },
					),
				).toThrow('invalid boolean value');
			});
		});

		it('includes the coder reason in the AbiError message and keeps the cause (I-10)', () => {
			let caught: AbiError | undefined;
			try {
				encodeParameter('uint8', 256);
			} catch (error) {
				caught = error as AbiError;
			}
			expect(caught).toBeInstanceOf(AbiError);
			expect(caught?.message).toMatch(/^Parameter encoding error: value out-of-bounds/);
			expect(caught?.innerError).toBeInstanceOf(Error);
		});
	});

	describe('encodeParametersDoesNotMutate', () => {
		describe('valid data', () => {
			it.each(validEncodeDoesNotMutateData)(
				'%#: should pass for valid values: %j',
				({ input: [abi, params], output, expectedInput }) => {
					const expected = encodeParameters(abi, params);
					expect(JSON.parse(JSON.stringify(expected))).toEqual(output);
					// check that params has not been mutated
					expect(JSON.parse(JSON.stringify(params))).toEqual(
						JSON.parse(JSON.stringify(expectedInput)),
					);
				},
			);
		});
	});

	describe('decodeParameters', () => {
		describe('valid data', () => {
			it.each(validDecodeParametersData)(
				'%#: should pass for valid values: %j',
				({ input: [abi, bytes], outputResult }) => {
					// Output returns mix of array and object which can't be matched in
					// jest, so have to use stringify+parse to match
					// {
					//   '0': [ '34', '255' ],
					//   '1': [
					//     '42',
					//     '56',
					//     [ '45', '78', propertyOne: '45', propertyTwo: '78' ],
					//     propertyOne: '42',
					//     propertyTwo: '56',
					//     ChildStruct: [ '45', '78', propertyOne: '45', propertyTwo: '78' ]
					//   ],
					//   __length__: 2
					// }
					expect(JSON.parse(JSON.stringify(decodeParameters(abi, bytes)))).toEqual(
						outputResult,
					);
				},
			);
		});

		describe('invalid data', () => {
			it.each(inValidDecodeParametersData)(
				'%#: should not pass for invalid values: %j',
				({ input: [abi, bytes], output }) => {
					expect(() => decodeParameters(abi, bytes)).toThrow(output);
				},
			);
		});
	});

	describe('encode and decode', () => {
		describe('input should be the same as returned value from encode and decode', () => {
			it.each(validEncodeDecodeParametersData)(
				'%#: should pass for valid values: %j',
				({ input: [abi, params], output, outputResult }) => {
					const rwAbi = abi as AbiInput[];
					const encodedBytes = encodeParameters(abi, params);
					expect(JSON.parse(JSON.stringify(encodedBytes))).toEqual(output);

					const decodedParams = decodeParameters(rwAbi, encodedBytes);
					expect(JSON.parse(JSON.stringify(decodedParams))).toEqual(outputResult);
				},
			);
		});
	});

	describe('decimal strings for signed integers narrower than 256 bits', () => {
		it.each([
			['int8', '-57'],
			['int8', '-128'],
			['int8', '-1'],
			['int16', '-300'],
			['int128', '-1'],
			['int8', '127'],
			['uint8', '200'],
		])('encodes %s %s exactly like the bigint and round-trips', (type, value) => {
			const encoded = encodeParameter(type, value);
			expect(encoded).toBe(encodeParameter(type, BigInt(value)));
			expect(decodeParameters([type], encoded)[0]).toBe(BigInt(value));
		});

		it('still normalises the width of hex strings', () => {
			expect(encodeParameter('int8', '-0x39')).toBe(encodeParameter('int8', -57));
			expect(encodeParameter('uint8', '0xff')).toBe(encodeParameter('uint8', 255));
		});
	});
});
