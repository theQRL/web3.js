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
import { Numbers } from '@theqrl/web3-types';
import { Contract } from '../../src/contract';
import { sqrcTf1Abi, SqrcTf1Interface } from '../fixtures/sqrcTf1';
import { sqrcTn1Abi, SqrcTn1Interface } from '../fixtures/sqrcTn1';
import { NonPayableMethodObject, PayableMethodObject } from '../../src';

describe('contract typing', () => {
	describe('custom abi', () => {
		const abi = [
			{
				inputs: [
					{
						internalType: 'string',
						name: 'tokenId',
						type: 'string',
					},
				],
				name: 'tokenURI',
				outputs: [{ internalType: 'string', name: '', type: 'string' }],
				stateMutability: 'view',
				type: 'function',
			},
		] as const;
		const contractInstance = new Contract(abi);
		interface CustomInterface {
			methods: {
				[key: string]: (
					...args: ReadonlyArray<any>
				) =>
					| PayableMethodObject<ReadonlyArray<unknown>, ReadonlyArray<unknown>>
					| NonPayableMethodObject<ReadonlyArray<unknown>, ReadonlyArray<unknown>>;
				tokenURI: (tokenId: Numbers) => NonPayableMethodObject<[Numbers], [string]>;
			};
		}

		typecheck('should contain all methods', () =>
			expectTypeOf<keyof typeof contractInstance.methods>().toBe<
				keyof CustomInterface['methods']
			>(),
		);
	});
	describe('sqrcTf1', () => {
		const contract = new Contract(sqrcTf1Abi);

		typecheck('should contain all methods', () =>
			expectTypeOf<keyof typeof contract.methods>().toBe<keyof SqrcTf1Interface['methods']>(),
		);

		typecheck('should have interface compliance methods', () =>
			expectTypeOf(contract.methods).toExtend<SqrcTf1Interface['methods']>(),
		);

		typecheck('should have all events', () =>
			expectTypeOf<keyof typeof contract.events>().toBe<keyof SqrcTf1Interface['events']>(),
		);

		typecheck('should have interface compliance events', () =>
			expectTypeOf(contract.events).toExtend<SqrcTf1Interface['events']>(),
		);
	});

	describe('sqrcTn1', () => {
		const contract = new Contract(sqrcTn1Abi);

		typecheck('should contain all methods', () =>
			expectTypeOf<keyof typeof contract.methods>().toBe<keyof SqrcTn1Interface['methods']>(),
		);

		// TODO: It's not matching types for `safeTransferFrom` because of overloaded method
		// typecheck('should have interface compliance methods', () =>
		// 	expectTypeOf(contract.methods).toExtend<SqrcTn1Interface['methods']>(),
		// );

		typecheck('should have all events', () =>
			expectTypeOf<keyof typeof contract.events>().toBe<keyof SqrcTn1Interface['events']>(),
		);

		typecheck('should have interface compliance events', () =>
			expectTypeOf(contract.events).toExtend<SqrcTn1Interface['events']>(),
		);
	});
});
