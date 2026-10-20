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

import {
	jsonInterfaceMethodToString,
	isAbiConstructorFragment,
	formatParam,
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
			expect(formatParam('uint8', '34')).toBe('00000034');
		});

		it('leaves numeric params that already fit untouched', () => {
			expect(formatParam('uint', '0x1234')).toBe('0x1234');
			expect(formatParam('uint256', '0x1234')).toBe('0x1234');
			// A number has no `length`, so the width comparison never applies.
			expect(formatParam('uint', 1234)).toBe(1234);
		});

		it('right-pads a short fixed bytes value to its declared width', () => {
			expect(formatParam('bytes48', `0x${'ab'.repeat(4)}`)).toBe(
				`0x${'ab'.repeat(4)}${'0'.repeat(88)}`,
			);
		});

		it('leaves a full-width bytes64 value untouched', () => {
			const full = `0x${'ab'.repeat(64)}`;
			expect(formatParam('bytes64', full)).toBe(full);
		});

		it('does not apply a default width to a dynamic bytes param', () => {
			expect(formatParam('bytes', '0x1234')).toBe('0x1234');
			expect(formatParam('bytes', '0x123')).toBe('0x0123');
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
