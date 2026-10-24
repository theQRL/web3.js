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

import { Web3Context } from '@theqrl/web3-core';
import { ContractAbi } from '@theqrl/web3-types';
import { encodeFunctionCall } from '@theqrl/web3-qrl-abi';
import { Contract, EventLog } from '../../src';
import { encodeIndexedTopic } from '../../src/encoding';
import {
	ADDR,
	ADDR2,
	FROM,
	FakeProvider,
	RECEIPT,
	topicOf,
	uintWord,
} from '../fixtures/fake_provider';

const constructorAbi = [{ type: 'constructor', inputs: [], stateMutability: 'payable' }] as const;
const fees = { gas: '0x100000', maxFeePerGas: '0x10', maxPriorityFeePerGas: '0x1' };

describe('deployment, error fragments and event backfill (pass-5 audit)', () => {
	it.each([
		{
			name: 'one 12,000-element dynamic array',
			types: ['uint256[]'],
			args: [new Array(12_000).fill(1)],
		},
		{
			name: 'two 6,000-element fixed arrays',
			types: ['address[6000]', 'uint256[6000]'],
			args: [new Array(6000).fill(ADDR), new Array(6000).fill(1)],
		},
	])('encodes $name identically to the raw ABI encoder (P5R-1)', ({ types, args }) => {
		const method = {
			type: 'function',
			name: 'batch',
			inputs: types.map((type, index) => ({ name: `arg${index}`, type })),
			outputs: [],
			stateMutability: 'nonpayable',
		} as const;
		const contract = new Contract<ContractAbi>([method]);
		expect(contract.methods.batch(...args).encodeABI()).toBe(encodeFunctionCall(method, args));
	});

	it('deploys from an addressed instance without sending to its old address', async () => {
		const provider = new FakeProvider(method =>
			method === 'qrl_getTransactionReceipt'
				? { ...RECEIPT, contractAddress: ADDR2 }
				: undefined,
		);
		const contract = new Contract(constructorAbi, ADDR, {
			provider: provider.asProvider(),
			from: FROM,
		});
		const deployment = contract.deploy({ data: '0x60806040', arguments: [] });
		await deployment.estimateGas({ value: '0x7' });
		expect(provider.lastCall('qrl_estimateGas')?.params[0]).toMatchObject({ value: '0x7' });
		expect(provider.lastCall('qrl_estimateGas')?.params[0]).not.toHaveProperty('to');
		const result = await deployment.send({ ...fees, value: '0x7' });
		expect(result.options.address).toBe(ADDR2);
		expect(provider.lastCall('qrl_sendTransaction')?.params[0]).not.toHaveProperty('to');
		expect(contract.options.address).toBe(ADDR);
	});

	it('rejects an explicit deployment destination before estimation or sending', async () => {
		const provider = new FakeProvider();
		const deployment = new Contract(constructorAbi, {
			provider: provider.asProvider(),
			from: FROM,
		}).deploy({ data: '0x60806040', arguments: [] });
		await expect(deployment.estimateGas({ to: ADDR } as never)).rejects.toThrow(
			'cannot specify a "to"',
		);
		await expect(async () => deployment.send({ ...fees, to: ADDR } as never)).rejects.toThrow(
			'cannot specify a "to"',
		);
		expect(provider.lastCall('qrl_sendTransaction')).toBeUndefined();
	});

	it.each([{}, { from: FROM }])(
		'honours an explicit provider without changing the parent context (%j)',
		async extra => {
			const parentProvider = new FakeProvider();
			const provider = new FakeProvider(method =>
				method === 'qrl_call' ? `0x${uintWord(7)}` : undefined,
			);
			const context = new Web3Context({
				provider: parentProvider.asProvider(),
				config: { handleRevert: true },
			});
			const abi = [
				{
					type: 'function',
					name: 'f',
					inputs: [],
					outputs: [{ name: '', type: 'uint8' }],
					stateMutability: 'view',
				},
			] as const;
			const contract = new Contract(
				abi,
				ADDR,
				{ ...extra, provider: provider.asProvider() },
				context,
			);
			expect(contract.requestManager).not.toBe(context.requestManager);
			expect(contract.handleRevert).toBe(true);
			await expect(contract.methods.f().call()).resolves.toBe(BigInt(7));
			expect(parentProvider.calls).toHaveLength(0);
		},
	);

	it('clones and deduplicates error fragments', () => {
		const error = { type: 'error', name: 'E', inputs: [{ name: 'x', type: 'uint256' }] };
		const contract = new Contract([
			error,
			{ ...error, inputs: [{ name: 'y', type: 'uint256' }] },
		] as ContractAbi);
		expect(contract['_errorsInterface']).toHaveLength(1);
		error.inputs[0].type = 'int8';
		expect(contract['_errorsInterface'][0].inputs[0].type).toBe('uint256');
	});

	it('drops foreign backfill logs before decoding, including logs too short for the bound event', async () => {
		const event = {
			type: 'event',
			name: 'Value',
			inputs: [{ name: 'value', type: 'uint256', indexed: false }],
			anonymous: false,
		} as const;
		const log = {
			address: ADDR,
			blockNumber: '0x1',
			blockHash: RECEIPT.blockHash,
			transactionHash: RECEIPT.transactionHash,
			transactionIndex: '0x0',
			logIndex: '0x0',
			removed: false,
			topics: [topicOf('Value(uint256)')],
			data: `0x${uintWord(7)}`,
		};
		const provider = new FakeProvider(method => {
			if (method === 'qrl_subscribe') return '0x1';
			if (method === 'qrl_getLogs')
				return [{ ...log, topics: [topicOf('Other(uint256)')], data: '0x' }, log];
			return undefined;
		}, true);
		const contract = new Contract([event] as const, ADDR, { provider: provider.asProvider() });
		const sub = contract.events.Value({ fromBlock: 0 });
		const received: EventLog[] = [];
		sub.on('data', item => {
			received.push(item);
		});
		await sub.subscribed;
		expect(received).toHaveLength(1);
		expect(received[0].returnValues.value).toBe(BigInt(7));
		await sub.unsubscribe();
	});

	it('matches indexed array filters as a whole value', async () => {
		const input = { name: 'arr', type: 'uint256[]', indexed: true } as const;
		const event = { type: 'event', name: 'Values', inputs: [input], anonymous: false } as const;
		const provider = new FakeProvider(method =>
			method === 'qrl_getLogs'
				? [
						{
							address: ADDR,
							topics: [
								topicOf('Values(uint256[])'),
								encodeIndexedTopic(input, [1, 2]),
							],
							data: '0x',
						},
					]
				: undefined,
		);
		const contract = new Contract([event] as const, ADDR, { provider: provider.asProvider() });
		await expect(
			contract.getPastEvents('Values', { filter: { arr: [1, 2] } }),
		).resolves.toHaveLength(1);
		await expect(
			contract.getPastEvents('Values', { filter: { arr: [3, 4] } }),
		).resolves.toHaveLength(0);
	});
});
