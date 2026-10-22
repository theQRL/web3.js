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

import { InvalidStringError } from '@theqrl/web3-errors';
import { bytesToHex, hexToBytes, keccak256 } from '@theqrl/web3-utils';
import { namehash, normalize } from '../../src/utils';
import { namehashValidData, normalizeValidData } from '../fixtures/utils';

/** The ENS namehash computed with an explicit UTF-8 keccak256 of every label. */
const referenceNamehash = (name: string): string => {
	let node: Uint8Array = new Uint8Array(32);
	for (const label of name.split('.').reverse()) {
		const labelHash = hexToBytes(keccak256(new TextEncoder().encode(label)));
		const combined = new Uint8Array(64);
		combined.set(node, 0);
		combined.set(labelHash, 32);
		node = hexToBytes(keccak256(combined));
	}
	return bytesToHex(node);
};

describe('qrns utils', () => {
	describe('namehash', () => {
		describe('valid cases', () => {
			it.each(namehashValidData)('%s', (input, output) => {
				expect(namehash(input)).toEqual(output);
			});
		});

		it('hashes a hex-looking label as text, so 0x6162.qrl is not ab.qrl (M-11)', () => {
			expect(namehash('0x6162.qrl')).not.toBe(namehash('ab.qrl'));
			expect(namehash('0x6162.qrl')).toBe(referenceNamehash('0x6162.qrl'));
			expect(namehash('ab.qrl')).toBe(referenceNamehash('ab.qrl'));
		});

		it('hashes an odd-length hex-looking label instead of throwing (M-11)', () => {
			expect(() => namehash('0xabc.qrl')).not.toThrow();
			expect(namehash('0xabc.qrl')).toBe(referenceNamehash('0xabc.qrl'));
			expect(namehash('0X6162.qrl')).toBe(referenceNamehash('0x6162.qrl'));
		});

		it('returns the root node for an empty name', () => {
			expect(namehash('')).toBe(`0x${'0'.repeat(64)}`);
			expect(namehash(undefined as unknown as string)).toBe(`0x${'0'.repeat(64)}`);
		});

		it('rejects a name that is not a string with a typed error (L-26)', () => {
			expect(() => namehash(5 as unknown as string)).toThrow(InvalidStringError);
			expect(() => namehash({} as unknown as string)).toThrow(InvalidStringError);
			expect(() => namehash([] as unknown as string)).toThrow(InvalidStringError);
		});
	});

	describe('toAscii', () => {
		it.each(normalizeValidData)('should normalize %s', (input, output) => {
			expect(normalize(input)).toEqual(output);
		});
	});
});
