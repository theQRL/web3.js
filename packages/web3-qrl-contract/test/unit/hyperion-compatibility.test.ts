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

import { expectTypeOf, typecheck } from '@humeris/espresso-shot';
import { Bytes, MatchPrimitiveType } from '@theqrl/web3-types';
import fixture from '../../../../fixtures/abi/hyperion-0.2.0.json';
import { Contract } from '../../src/contract';
import { decodeMethodReturn } from '../../src/encoding';

describe('Hyperion external function contract methods', () => {
	const abi = [
		{
			type: 'function',
			name: 'echo',
			stateMutability: 'pure',
			inputs: [
				{ name: 'callback', type: 'function' },
				{ name: 'value', type: 'uint' },
				{ name: 'text', type: 'string' },
			],
			outputs: [
				{ name: 'callback', type: 'function' },
				{ name: 'value', type: 'uint' },
				{ name: 'text', type: 'string' },
			],
		},
	] as const;

	typecheck('function arguments use the byte representation', () =>
		expectTypeOf<MatchPrimitiveType<'function', undefined>>().toBe<Bytes>(),
	);
	typecheck('function arrays use arrays of byte representations', () =>
		expectTypeOf<MatchPrimitiveType<'function[]', undefined>>().toBe<Bytes[]>(),
	);

	it('validates and encodes a function argument through Contract.methods', () => {
		const compilerCase = fixture.cases.find(test => test.name === 'functionAndString');
		const pointer = compilerCase.values[0] as string;
		const contract = new Contract(abi);
		const call = contract.methods.echo(pointer, 7, 'hello').encodeABI();
		expect(call.slice(10)).toBe(compilerCase.encoded.slice(2));
		expect(() => contract.methods.echo(`0x${'00'.repeat(24)}`, 7, 'hello')).toThrow();
		expect(() => contract.methods.echo(pointer, BigInt(1) << BigInt(256), 'hello')).toThrow();
	});

	it('decodes a function return value with subsequent static and dynamic outputs', () => {
		const compilerCase = fixture.cases.find(test => test.name === 'functionAndString');
		const returned = decodeMethodReturn(abi[0], compilerCase.encoded);
		expect(returned).toMatchObject({
			callback: compilerCase.values[0],
			value: BigInt(7),
			text: 'hello',
		});
	});
});
