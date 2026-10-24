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

import { AbiError, InvalidResponseError } from '@theqrl/web3-errors';
import { ContractAbi } from '@theqrl/web3-types';
import { Contract } from '../../src';
import { ADDR, FakeProvider, boundMethod, uintWord } from '../fixtures/fake_provider';

const abi: ContractAbi = [
	{
		type: 'function',
		name: 'get',
		inputs: [],
		outputs: [{ type: 'uint256', name: '' }],
		stateMutability: 'view',
	},
	{ type: 'function', name: 'noOutputs', inputs: [], stateMutability: 'nonpayable' },
];

describe('qrl_call reply validation (P4-L-30)', () => {
	const contractReplying = (reply: unknown) =>
		new Contract(abi, ADDR, {
			provider: new FakeProvider(method =>
				method === 'qrl_call' ? reply : undefined,
			).asProvider(),
		});

	// eslint-disable-next-line no-null/no-null -- a JSON null is one of the replies a node can send
	it.each([null, false, 0, '', 7, 'nope'])(
		'rejects a reply of %p with an InvalidResponseError naming qrl_call (P4-L-30)',
		async reply => {
			await expect(boundMethod(contractReplying(reply), 'get')().call()).rejects.toThrow(
				InvalidResponseError,
			);
			await expect(boundMethod(contractReplying(reply), 'get')().call()).rejects.toThrow(
				'qrl_call',
			);
		},
	);

	it('decodes a hex reply', async () => {
		await expect(
			boundMethod(contractReplying(`0x${uintWord(42)}`), 'get')().call(),
		).resolves.toBe(BigInt(42));
	});

	it('still reports empty return data for a function with outputs as an ABI error', async () => {
		await expect(boundMethod(contractReplying('0x'), 'get')().call()).rejects.toThrow(AbiError);
	});

	it('still resolves null for an empty reply to a function without outputs', async () => {
		await expect(boundMethod(contractReplying('0x'), 'noOutputs')().call()).resolves.toBeNull();
	});
});
