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
import { hexToBytes } from '@theqrl/web3-utils';

import { isBlockHash, isHash32, isValidUnsignedHexNumber } from '../../../src/utils/hex_guards';

const HASH = `0x${'ab'.repeat(32)}`;
// A `null` value is one of the inputs under test.
// eslint-disable-next-line no-null/no-null
const NULL_VALUE: unknown = null;

describe('hex guards', () => {
	describe('isValidUnsignedHexNumber (P4-L-14)', () => {
		it.each([['0x0'], ['0x10'], ['0xABC'], [0], [7], [BigInt(3)]])('accepts %p', value => {
			expect(isValidUnsignedHexNumber(value)).toBe(true);
			expect(() => BigInt(value as string)).not.toThrow();
		});

		it.each([
			['abc'],
			['-0x1'],
			['0x'],
			[''],
			['10'],
			[-1],
			[1.5],
			[Number.NaN],
			[Number.POSITIVE_INFINITY],
			[BigInt(-1)],
			[NULL_VALUE],
			[undefined],
			[{}],
			[[]],
		])('rejects %p', value => {
			expect(isValidUnsignedHexNumber(value)).toBe(false);
		});
	});

	describe('isHash32', () => {
		it('accepts exactly 64 hex digits behind 0x, in either letter case', () => {
			expect(isHash32(HASH)).toBe(true);
			expect(isHash32(HASH.toUpperCase().replace('0X', '0x'))).toBe(true);
		});

		it.each([
			[`0x${'ab'.repeat(31)}`],
			[`0x${'ab'.repeat(33)}`],
			[`-0x${'ab'.repeat(31)}cd`],
			[`0X${'ab'.repeat(32)}`],
			['ab'.repeat(32)],
			[hexToBytes(HASH)],
			[NULL_VALUE],
			[42],
		])('rejects %p', value => {
			expect(isHash32(value)).toBe(false);
		});
	});

	describe('isBlockHash (P4-L-11)', () => {
		it('accepts a 32-byte hex string or Uint8Array', () => {
			expect(isBlockHash(HASH)).toBe(true);
			expect(isBlockHash(hexToBytes(HASH))).toBe(true);
		});

		it.each([
			['0x10'],
			[`0x${'ab'.repeat(20)}`],
			[hexToBytes(`0x${'ab'.repeat(20)}`)],
			[new Uint8Array(31)],
			[new Uint8Array(33)],
			['latest'],
			['1207'],
			[16],
			[BigInt(16)],
			[undefined],
			[NULL_VALUE],
		])('treats %p as a block number or tag', value => {
			expect(isBlockHash(value)).toBe(false);
		});
	});
});
