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
import {
	jsonInterfaceMethodToString,
	isAbiConstructorFragment,
	formatParam,
	mapTypes,
} from '../../src/utils';
import {
	jsonInterfaceInvalidData,
	jsonInterfaceValidData,
	validIsAbiConstructorFragment,
	invalidIsAbiConstructorFragment,
} from '../fixtures/data';

describe('utils', () => {
	describe('jsonInterfaceMethodToString', () => {
		describe('valid cases', () => {
			it.each(jsonInterfaceValidData)('%s', (input, output) => {
				expect(jsonInterfaceMethodToString(input)).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			// TODO: To be done after `sha3` is implemented
			it.todo('should throw error for invalid cases');
		});
	});
	describe('jsonInterface', () => {
		describe('valid cases', () => {
			it.each(jsonInterfaceValidData)('%s', (input, output) => {
				expect(jsonInterfaceMethodToString(input)).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			it.each(jsonInterfaceInvalidData)('%s', (input, output) => {
				expect(() => jsonInterfaceMethodToString(input)).toThrow(output);
			});
		});
	});
	describe('formatParam', () => {
		// 66 hex digits, i.e. a 68 character string. `formatParam` compares the
		// string length against the byte width of the type, so this is wide enough
		// to trigger the padding for every width tested below.
		const digits = 'ab'.repeat(33);
		const wideHex = `0x${digits}`;
		const paddedTo256 = `0x${'0'.repeat(256 - 66)}${digits}`;

		it('pads a bare uint to 256 hex characters', () => {
			expect(formatParam('uint', wideHex)).toBe(paddedTo256);
		});

		it('pads a bare int to 256 hex characters', () => {
			expect(formatParam('int', wideHex)).toBe(paddedTo256);
		});

		it('pads bare uint array members to 256 hex characters', () => {
			expect(formatParam('uint[]', [wideHex])).toEqual([paddedTo256]);
		});

		it('uses an explicit width instead of the bare default', () => {
			expect(formatParam('uint256', wideHex)).toBe(`0x${'0'.repeat(256 - 66)}${digits}`);
			expect(formatParam('int128', wideHex)).toBe(`0x${'0'.repeat(128 - 66)}${digits}`);
			// Decimal strings are numbers to the coder and are never padded: padding turned
			// '-57' into '00000-57', which no longer parsed for any `intN` narrower than 256 bits.
			expect(formatParam('uint8', '34')).toBe('34');
			expect(formatParam('int8', '-57')).toBe('-57');
			expect(formatParam('int8', '-0x39')).toBe('-0x00000039');
		});

		it('leaves numeric params that already fit untouched', () => {
			expect(formatParam('uint', '0x1234')).toBe('0x1234');
			expect(formatParam('uint256', '0x1234')).toBe('0x1234');
			// A number has no `length`, so the width comparison never applies.
			expect(formatParam('uint', 1234)).toBe(1234);
		});

		it('leaves fixed bytes unchanged for the coder to validate their length', () => {
			expect(formatParam('bytes48', '0xabababab')).toBe('0xabababab');
			expect(formatParam('bytes32', '0xabc')).toBe('0xabc');
		});

		it('leaves a full-width bytes64 value untouched', () => {
			const full = `0x${'ab'.repeat(64)}`;
			expect(formatParam('bytes64', full)).toBe(full);
		});

		it('does not apply a default width to a dynamic bytes param', () => {
			expect(formatParam('bytes', '0x1234')).toBe('0x1234');
			expect(formatParam('bytes', '0x123')).toBe('0x0123');
		});

		it('normalises the explicit bool forms by value and leaves anything else to the coder (H-3)', () => {
			for (const value of ['0', '0x0', 0, BigInt(0), false]) {
				expect(formatParam('bool', value)).toBe(false);
			}
			for (const value of ['1', '0x1', 1, BigInt(1), true]) {
				expect(formatParam('bool', value)).toBe(true);
			}
			expect(formatParam('bool', 'false')).toBe('false');
			expect(formatParam('bool', 2)).toBe(2);
			expect(formatParam('bool[]', ['0', '1', true, 'x'])).toEqual([false, true, true, 'x']);
		});
	});

	describe('ABI JSON edge cases (I-10)', () => {
		it('rejects a parameter without a string type with an AbiError', () => {
			expect(() =>
				jsonInterfaceMethodToString({ type: 'function', name: 'f', inputs: [{ name: 'x' }] } as any),
			).toThrow(AbiError);
			expect(() =>
				jsonInterfaceMethodToString({
					type: 'function',
					name: 'f',
					inputs: [JSON.parse('{"type":null}')],
				} as any),
			).toThrow(AbiError);
		});

		it('rejects an empty object in a type list with an AbiError', () => {
			expect(() => mapTypes([{} as any])).toThrow(AbiError);
		});
	});
	describe('isAbiConstructorFragment', () => {
		describe('valid cases', () => {
			it.each(validIsAbiConstructorFragment)('%s', ({ input }) => {
				expect(isAbiConstructorFragment(input)).toBeTruthy();
			});
		});

		describe('invalid cases', () => {
			it.each(invalidIsAbiConstructorFragment)('%s', ({ input }) => {
				expect(isAbiConstructorFragment(input)).toBeFalsy();
			});
		});
	});
});
