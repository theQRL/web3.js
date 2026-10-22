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

import { AbiInput } from '@theqrl/web3-types';
import {
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
