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
import { defaultAbiCoder, Fragment, ParamType } from '../../src/index.js';

const word = (hex: string) => hex.padStart(128, '0');

describe('pass-4 regressions (@theqrl/abi)', () => {
	describe('ParamType / Fragment branding (P4-M-2)', () => {
		it('does not accept a JSON object that merely carries the old duck-typing flags', () => {
			expect(ParamType.isParamType({ type: 'uint256', _isParamType: true })).toBe(false);
			expect(Fragment.isFragment({ type: 'function', name: 'f', _isFragment: true })).toBe(
				false,
			);
			expect(ParamType.isParamType(ParamType.from('uint256'))).toBe(true);
			expect(Fragment.isFragment(Fragment.from('function f()'))).toBe(true);
		});

		it('runs the ParamType checks on a forged entry instead of trusting its fields', () => {
			const forged = {
				name: 'a',
				type: 'x',
				_isParamType: true,
				baseType: 'array',
				arrayLength: -1e15,
				arrayChildren: {
					_isParamType: true,
					type: 'tuple',
					baseType: 'tuple',
					components: [],
				},
			};
			// `from` builds a real ParamType from the JSON fields it recognises; the forged
			// `baseType`/`arrayLength`/`arrayChildren` are not taken over.
			const real = ParamType.from(forged as never);
			expect(ParamType.isParamType(real)).toBe(true);
			expect(real.arrayLength).not.toBe(-1e15);
			expect(real.arrayChildren).toBeNull();
			expect(() =>
				defaultAbiCoder.decode(
					[forged as never, ParamType.from({ type: 'tuple[64][64][64]', components: [] })],
					`0x${word('0').repeat(64)}`,
				),
			).toThrow();
		});

		it('still rejects the legitimate zero-size nesting by the element budget', () => {
			expect(() =>
				defaultAbiCoder.decode(
					[ParamType.from({ type: 'tuple[64][64][64]', components: [] })],
					`0x${word('0').repeat(64)}`,
				),
			).toThrow(/budget/);
		});
	});

	describe('string decoding keeps a byte-order mark (P4-L-33)', () => {
		it('round-trips a leading U+FEFF', () => {
			const encoded = defaultAbiCoder.encode(['string'], ['﻿admin']);
			expect(defaultAbiCoder.decode(['string'], encoded)[0]).toBe('﻿admin');
			expect(encoded).not.toBe(defaultAbiCoder.encode(['string'], ['admin']));
		});
	});
});
