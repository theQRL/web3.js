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

import { Web3ContractError } from '@theqrl/web3-errors';
import { Contract, EventLog } from '../../src';
import { ADDR, ADDR2, FakeProvider, addrWord, topicOf, uintWord } from '../fixtures/fake_provider';

// Declared `as const` so that the event name key of `getPastEvents` is typed.
const abi = [
	{
		type: 'event',
		name: 'Transfer',
		inputs: [
			{ type: 'address', name: 'from', indexed: true },
			{ type: 'address', name: 'to', indexed: true },
			{ type: 'uint256', name: 'value', indexed: false },
		],
		anonymous: false,
	},
	{
		type: 'event',
		name: 'Transfer',
		inputs: [
			{ type: 'address', name: 'from', indexed: true },
			{ type: 'address', name: 'to', indexed: true },
			{ type: 'uint256', name: 'value', indexed: false },
			{ type: 'bytes', name: 'data', indexed: false },
		],
		anonymous: false,
	},
] as const;

const transfer3 = topicOf('Transfer(address,address,uint256)');
const transfer4 = topicOf('Transfer(address,address,uint256,bytes)');
const base = {
	address: `Q${ADDR.slice(1).toLowerCase()}`,
	blockNumber: '0x1',
	transactionHash: `0x${'11'.repeat(32)}`,
	transactionIndex: '0x0',
	blockHash: `0x${'22'.repeat(32)}`,
	logIndex: '0x0',
	removed: false,
};
const log3 = {
	...base,
	topics: [transfer3, `0x${addrWord(ADDR)}`, `0x${addrWord(ADDR2)}`],
	data: `0x${uintWord(5)}`,
};
const log4 = {
	...base,
	topics: [transfer4, `0x${addrWord(ADDR)}`, `0x${addrWord(ADDR2)}`],
	data: `0x${uintWord(5)}${uintWord(128)}${uintWord(2)}${'abcd'.padEnd(128, '0')}`,
};

/** The named members of the decoded return values. */
const names = (event: EventLog) =>
	Object.keys(event.returnValues).filter(
		key => Number.isNaN(Number(key)) && key !== '__length__',
	);

const sentTopic0 = (provider: FakeProvider, method: string, index: number) => {
	const params = provider.lastCall(method)?.params ?? [];
	return (params[index] as { topics: string[] }).topics[0];
};

describe('overloaded events (P4-L-26)', () => {
	const providerReplaying = (logs: unknown[]) =>
		new FakeProvider(method => {
			if (method === 'qrl_subscribe') return '0x1';
			if (method === 'qrl_getLogs') return logs;
			return undefined;
		}, true);

	it('binds the name key to the first overload, the one getPastEvents(name) resolves (P4-L-26)', async () => {
		const provider = providerReplaying([log3]);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const sub = contract.events.Transfer({ fromBlock: 0 });
		const received: EventLog[] = [];
		sub.on('data', event => {
			received.push(event);
		});
		await sub.subscribed;

		expect(sentTopic0(provider, 'qrl_subscribe', 1)).toBe(transfer3);
		expect(sentTopic0(provider, 'qrl_getLogs', 0)).toBe(transfer3);
		expect(received).toHaveLength(1);
		expect(names(received[0])).toEqual(['from', 'to', 'value']);

		provider.notify('0x1', log3);
		expect(received).toHaveLength(2);
		expect(names(received[1])).toEqual(['from', 'to', 'value']);

		const past = (await contract.getPastEvents('Transfer', { fromBlock: 0 })) as EventLog[];
		expect(sentTopic0(provider, 'qrl_getLogs', 0)).toBe(transfer3);
		expect(past).toHaveLength(1);
	});

	it('replays and streams the bound overload through the signature key (P4-L-26)', async () => {
		const provider = providerReplaying([log4]);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const sub = contract.events['Transfer(address,address,uint256,bytes)']({ fromBlock: 0 });
		const received: EventLog[] = [];
		sub.on('data', event => {
			received.push(event);
		});
		await sub.subscribed;

		expect(sentTopic0(provider, 'qrl_subscribe', 1)).toBe(transfer4);
		expect(sentTopic0(provider, 'qrl_getLogs', 0)).toBe(transfer4);
		expect(received).toHaveLength(1);
		expect(names(received[0])).toEqual(['from', 'to', 'value', 'data']);
		expect(received[0].returnValues.data).toBe('0xabcd');

		provider.notify('0x1', log4);
		expect(received).toHaveLength(2);
		expect(names(received[1])).toEqual(['from', 'to', 'value', 'data']);
		expect(received[1].returnValues.data).toBe('0xabcd');
	});

	it('resolves getPastEvents by the signature key and by the signature hash (P4-L-26)', async () => {
		const provider = providerReplaying([log4]);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const bySignature = (await contract.getPastEvents(
			'Transfer(address,address,uint256,bytes)',
			{ fromBlock: 0 },
		)) as EventLog[];
		expect(sentTopic0(provider, 'qrl_getLogs', 0)).toBe(transfer4);
		expect(bySignature).toHaveLength(1);
		expect(bySignature[0].returnValues.data).toBe('0xabcd');

		const hash = transfer4.slice(0, 66) as `0x${string}`;
		const byHash = await contract.getPastEvents(hash, { fromBlock: 0 });
		expect(byHash).toHaveLength(1);

		const topic = transfer4.toUpperCase().replace('0X', '0x') as `0x${string}`;
		const byTopic = await contract.getPastEvents(topic, { fromBlock: 0 });
		expect(byTopic).toHaveLength(1);

		await expect(contract.getPastEvents('Transfer(address)', { fromBlock: 0 })).rejects.toThrow(
			Web3ContractError,
		);
		await expect(contract.getPastEvents('Transfer(address)', { fromBlock: 0 })).rejects.toThrow(
			'Event Transfer(address) not found.',
		);
	});
});
