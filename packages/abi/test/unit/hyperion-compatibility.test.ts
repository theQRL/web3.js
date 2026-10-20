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

import { arrayify } from '@ethersproject/bytes';
import * as fixture from '../../../../fixtures/abi/hyperion-0.2.0.json';
import { defaultAbiCoder } from '../../src/abi-coder';
import { ParamType } from '../../src/fragments';

describe('Hyperion 0.2.0 compiler ABI fixtures', () => {
	it.each(fixture.cases.filter(test => !test.packed && !test.panic))(
		'$name matches compiler output and decodes back to the same values',
		({ inputs, values, encoded }) => {
			const types = inputs.map(input => ParamType.from(input));
			expect(defaultAbiCoder.encode(types, values)).toBe(encoded);
			expect(defaultAbiCoder.encode(types, defaultAbiCoder.decode(types, encoded))).toBe(
				encoded,
			);
		},
	);

	it('uses 256-bit bounds for aliases while keeping 64-byte words', () => {
		const maxUint = (BigInt(1) << BigInt(256)) - BigInt(1);
		const minInt = -(BigInt(1) << BigInt(255));
		expect(defaultAbiCoder.encode(['uint', 'int'], [maxUint, minInt])).toBe(
			defaultAbiCoder.encode(['uint256', 'int256'], [maxUint, minInt]),
		);
		expect(defaultAbiCoder.encode(['uint'], [maxUint])).toHaveLength(2 + 128);
		expect(() => defaultAbiCoder.encode(['uint'], [maxUint + BigInt(1)])).toThrow();
		expect(() => defaultAbiCoder.encode(['int'], [minInt - BigInt(1)])).toThrow();
		expect(() => defaultAbiCoder.encode(['int'], [-minInt])).toThrow();
	});

	it('accepts a byte array function value and returns its compact hex representation', () => {
		const pointer = `0x${'12'.repeat(64)}deadbeef`;
		const encoded = defaultAbiCoder.encode(['function'], [arrayify(pointer)]);
		expect(encoded).toBe(`0x${'12'.repeat(64)}${'00'.repeat(60)}deadbeef`);
		expect(defaultAbiCoder.decode(['function'], encoded)[0]).toBe(pointer);
		expect(defaultAbiCoder.getDefaultValue(['function'])[0]).toBe(`0x${'00'.repeat(68)}`);
	});

	it.each([0, 24, 64, 67, 69, 128])('rejects a %i-byte function value', length => {
		expect(() => defaultAbiCoder.encode(['function'], [`0x${'00'.repeat(length)}`])).toThrow();
	});

	it('rejects a truncated function return value', () => {
		expect(() => defaultAbiCoder.decode(['function'], `0x${'00'.repeat(127)}`)).toThrow();
	});
});
