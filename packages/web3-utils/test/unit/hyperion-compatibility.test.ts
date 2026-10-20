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

import { Sha3Input } from '@theqrl/web3-types';
import fixture from '../../../../fixtures/abi/hyperion-0.2.0.json';
import { encodePacked, hyperionSha3, keccak256 } from '../../src/hash';

describe('Hyperion compiler packed ABI compatibility', () => {
	it.each(fixture.cases.filter(test => test.packed))(
		'$name matches compiler output including array padding',
		({ inputs, values, encoded }) => {
			const args = inputs.map((input, index) => ({
				type: input.type,
				value: values[index],
			})) as Sha3Input[];
			expect(encodePacked(...args)).toBe(encoded);
			expect(hyperionSha3(...args)).toBe(keccak256(encoded));
		},
	);

	it('uses 256-bit aliases for inferred numbers and preserves explicit 512-bit types', () => {
		const one = `0x${'00'.repeat(31)}01`;
		expect(encodePacked(1)).toBe(one);
		expect(encodePacked(BigInt(1))).toBe(one);
		expect(encodePacked({ type: 'bigint', value: BigInt(1) })).toBe(one);
		expect(encodePacked({ type: 'uint', value: 1 })).toBe(one);
		expect(encodePacked({ type: 'uint512', value: 1 })).toBe(`0x${'00'.repeat(63)}01`);
		expect(() => encodePacked({ type: 'uint', value: BigInt(1) << BigInt(256) })).toThrow();
		expect(() => encodePacked({ type: 'int', value: BigInt(1) << BigInt(255) })).toThrow();
	});

	it.each([24, 64, 67, 69, 128])('rejects a %i-byte packed function value', length => {
		expect(() =>
			encodePacked({ type: 'function', value: `0x${'00'.repeat(length)}` }),
		).toThrow();
	});
});
