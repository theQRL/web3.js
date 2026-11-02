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
import { AbiFunctionFragment } from '@theqrl/web3-types';
import { encodeFunctionCall, encodeFunctionSignature } from '../../../src/api/functions_api';
import {
	inValidFunctionsSignatures,
	validFunctionsSignatures,
	validFunctionsCall,
	inValidFunctionsCalls,
} from '../../fixtures/data';

describe('functions_api', () => {
	describe('encodeFunctionSignature', () => {
		describe('valid data', () => {
			it.each(validFunctionsSignatures)(
				'should pass for valid values: %s',
				({ input, output }) => {
					expect(encodeFunctionSignature(input)).toEqual(output);
				},
			);
		});

		describe('invalid data', () => {
			it.each(inValidFunctionsSignatures)(
				'should pass for valid values: %s',
				({ input, output }) => {
					expect(() => encodeFunctionSignature(input)).toThrow(output);
				},
			);
		});
	});

	describe('encodeFunctionCall', () => {
		describe('valid data', () => {
			it.each(validFunctionsCall)(
				'should pass for valid values: %s',
				({ input: { abi, params }, output }) => {
					expect(encodeFunctionCall(abi, params)).toEqual(output);
				},
			);
		});

		describe('invalid data', () => {
			it.each(inValidFunctionsCalls)(
				'should pass for valid values: %s',
				({ input, output }) => {
					expect(() => encodeFunctionCall(input, [])).toThrow(output);
				},
			);
		});

		describe('bool arguments (H-3)', () => {
			const setFlag: AbiFunctionFragment = {
				type: 'function',
				name: 'setFlag',
				stateMutability: 'nonpayable',
				inputs: [{ type: 'bool', name: 'flag' }],
				outputs: [],
			};
			const selector = encodeFunctionSignature(setFlag);
			const calldata = (bit: number) => `${selector}${'0'.repeat(127)}${bit}`;

			it('encodes "0" and "0x0" as false in the calldata, like false and 0', () => {
				expect(selector).toBe('0x3927f6af');
				for (const value of [false, 0, '0', '0x0', BigInt(0)]) {
					expect(encodeFunctionCall(setFlag, [value])).toBe(calldata(0));
				}
				for (const value of [true, 1, '1', '0x1', BigInt(1)]) {
					expect(encodeFunctionCall(setFlag, [value])).toBe(calldata(1));
				}
			});

			it.each(['false', 'true', 2, '0x00', {}])('rejects %p with an AbiError', value => {
				expect(() => encodeFunctionCall(setFlag, [value])).toThrow(AbiError);
				expect(() => encodeFunctionCall(setFlag, [value])).toThrow('invalid boolean value');
			});
		});
	});
});
