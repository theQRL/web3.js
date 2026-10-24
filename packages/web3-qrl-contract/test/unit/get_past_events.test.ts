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

import { BaseWeb3Error, ResponseError } from '@theqrl/web3-errors';
import { encodeFunctionSignature } from '@theqrl/web3-qrl-abi';
import {
	AbiEventFragment,
	ContractAbi,
	DEFAULT_RETURN_FORMAT,
	FMT_BYTES,
	FMT_NUMBER,
	LogsInput,
} from '@theqrl/web3-types';
import { keccak256, rightPad } from '@theqrl/web3-utils';
import { Contract, EventLog, decodeEventABI } from '../../src';
import { ADDR, ADDR2, FakeProvider, addrWord, topicOf, uintWord } from '../fixtures/fake_provider';

const abi: ContractAbi = [
	// A function listed before the event of the same name (L-60).
	{
		type: 'function',
		name: 'Transfer',
		inputs: [{ type: 'uint256', name: 'amount' }],
		outputs: [],
		stateMutability: 'nonpayable',
	},
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
		name: 'Approval',
		inputs: [
			{ type: 'address', name: 'owner', indexed: true },
			{ type: 'uint256', name: 'value', indexed: false },
		],
		anonymous: false,
	},
	{
		type: 'function',
		name: 'withdraw',
		inputs: [
			{ type: 'address', name: 'to' },
			{ type: 'uint256', name: 'amount' },
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
	{
		type: 'event',
		name: 'Named',
		inputs: [
			{ type: 'string', name: 'tag', indexed: true },
			{ type: 'uint256', name: 'n', indexed: false },
		],
		anonymous: false,
	},
];

const base = {
	address: `Q${ADDR.slice(1).toLowerCase()}`,
	blockNumber: '0x1',
	transactionHash: `0x${'11'.repeat(32)}`,
	transactionIndex: '0x0',
	blockHash: `0x${'22'.repeat(32)}`,
	logIndex: '0x0',
	removed: false,
};
const transferTopic = topicOf('Transfer(address,address,uint256)');
const transferLog = {
	...base,
	topics: [transferTopic, `0x${addrWord(ADDR)}`, `0x${addrWord(ADDR2)}`],
	data: `0x${uintWord(20)}`,
};
const approvalLog = {
	...base,
	topics: [topicOf('Approval(address,uint256)'), `0x${addrWord(ADDR)}`],
	data: `0x${uintWord(99)}`,
};
const functionTopicLog = {
	...base,
	topics: [rightPad(encodeFunctionSignature('withdraw(address,uint256)'), 128)],
	data: `0x${addrWord(ADDR2)}${uintWord(1000)}`,
};
const namedLog = {
	...base,
	topics: [
		topicOf('Named(string,uint256)'),
		rightPad(keccak256(new TextEncoder().encode('hello')), 128),
	],
	data: `0x${uintWord(1)}`,
};

const eventOf = (name: string) =>
	abi.find(
		item => item.type === 'event' && (item as AbiEventFragment).name === name,
	) as AbiEventFragment;

describe('getPastEvents', () => {
	let logs: unknown;
	let provider: FakeProvider;
	let contract: Contract<ContractAbi>;

	beforeEach(() => {
		logs = [];
		provider = new FakeProvider(method => (method === 'qrl_getLogs' ? logs : undefined));
		contract = new Contract(abi, ADDR, { provider: provider.asProvider() });
	});

	it('resolves the event, not a same-named function, when building the filter (L-60)', async () => {
		logs = [transferLog];
		const events = (await contract.getPastEvents('Transfer' as never, {
			fromBlock: 0,
		})) as EventLog[];

		const sent = provider.lastCall('qrl_getLogs')?.params[0] as { topics: unknown[] };
		expect(sent.topics[0]).toBe(transferTopic);
		expect(events).toHaveLength(1);
		expect(events[0].event).toBe('Transfer');
		expect(events[0].returnValues.value).toBe(BigInt(20));
		expect(events[0].returnValues.from).toBe(ADDR);
	});

	it('does not label an allEvents log carrying a function selector as that function (L-60)', async () => {
		logs = [functionTopicLog];
		const events = (await contract.getPastEvents('allEvents')) as EventLog[];

		expect(events).toHaveLength(1);
		expect(events[0].event).toBeUndefined();
		expect(events[0].returnValues).toEqual({ __length__: 0 });
	});

	it('drops logs of another address or another event signature (I-13)', async () => {
		logs = [
			transferLog,
			{ ...transferLog, address: `Q${ADDR2.slice(1).toLowerCase()}` },
			approvalLog,
		];
		const events = (await contract.getPastEvents('Approval' as never, {
			fromBlock: 0,
		})) as EventLog[];

		expect(events).toHaveLength(1);
		expect(events[0].event).toBe('Approval');
		expect(events[0].returnValues.value).toBe(BigInt(99));
	});

	it('rejects a log whose custom topics do not match the requested ABI topic count', async () => {
		logs = [approvalLog];
		await expect(
			contract.getPastEvents('Transfer' as never, {
				topics: [topicOf('Approval(address,uint256)')],
			}),
		).rejects.toThrow('Event topic count does not match the ABI');
	});

	it.each([20, '20', BigInt(20), '0x14'])(
		'matches a client-side filter value given as %p through the ABI type (L-61)',
		async value => {
			logs = [transferLog];
			const events = await contract.getPastEvents('Transfer' as never, {
				fromBlock: 0,
				filter: { value },
			});
			expect(events).toHaveLength(1);
		},
	);

	it('drops logs whose value differs under the ABI type (L-61)', async () => {
		logs = [transferLog];
		await expect(
			contract.getPastEvents('Transfer' as never, { fromBlock: 0, filter: { value: 21 } }),
		).resolves.toHaveLength(0);
		await expect(
			contract.getPastEvents('Transfer' as never, {
				fromBlock: 0,
				filter: { value: [21, '0x14'] },
			}),
		).resolves.toHaveLength(1);
		await expect(
			contract.getPastEvents('Transfer' as never, {
				fromBlock: 0,
				filter: { to: `Q${ADDR2.slice(1).toLowerCase()}` },
			}),
		).resolves.toHaveLength(1);
		await expect(
			contract.getPastEvents('Transfer' as never, { fromBlock: 0, filter: { to: ADDR } }),
		).resolves.toHaveLength(0);
		await expect(
			contract.getPastEvents('Transfer' as never, {
				fromBlock: 0,
				filter: { unknownKey: 1 },
			}),
		).resolves.toHaveLength(0);
	});

	it('matches an indexed string filter through its keccak256 topic (L-61)', async () => {
		logs = [namedLog];
		await expect(
			contract.getPastEvents('Named' as never, { fromBlock: 0, filter: { tag: 'hello' } }),
		).resolves.toHaveLength(1);
		await expect(
			contract.getPastEvents('allEvents', {
				fromBlock: 0,
				filter: { tag: ['world', 'hello'] },
			}),
		).resolves.toHaveLength(1);
		await expect(
			contract.getPastEvents('Named' as never, { fromBlock: 0, filter: { tag: 'world' } }),
		).resolves.toHaveLength(0);
	});

	it('skips a nullish client-side filter value, the wildcard it was sent as (F-9)', async () => {
		logs = [transferLog];
		await expect(
			contract.getPastEvents('Transfer' as never, {
				fromBlock: 0,
				filter: { from: undefined },
			}),
		).resolves.toHaveLength(1);

		const sent = provider.lastCall('qrl_getLogs')?.params[0] as { topics: unknown[] };
		// eslint-disable-next-line no-null/no-null -- the wire form of a wildcard topic
		expect(sent.topics).toEqual([transferTopic, null, null]);
	});

	it('fetches the logs in the wire format and formats the events with the caller format (P4-L-29)', async () => {
		logs = [transferLog];
		const events = (await contract.getPastEvents(
			'Transfer' as never,
			{ fromBlock: 0 },
			{ number: FMT_NUMBER.NUMBER, bytes: FMT_BYTES.UINT8ARRAY },
		)) as EventLog[];

		expect(events).toHaveLength(1);
		expect(events[0].event).toBe('Transfer');
		expect(events[0].returnValues.value).toBe(BigInt(20));
		expect(events[0].blockNumber).toBe(1);
		expect(events[0].data).toBeInstanceOf(Uint8Array);
		expect(events[0].raw?.data).toBe(transferLog.data);
	});

	it('backfills a subscription of a contract constructed with FMT_BYTES.UINT8ARRAY (P4-L-29)', async () => {
		const subscribing = new FakeProvider(method => {
			if (method === 'qrl_subscribe') return '0x1';
			if (method === 'qrl_getLogs') return [transferLog];
			return undefined;
		}, true);
		const bytesContract = new Contract(
			abi,
			ADDR,
			{ provider: subscribing.asProvider() },
			{ number: FMT_NUMBER.BIGINT, bytes: FMT_BYTES.UINT8ARRAY },
		);

		const sub = bytesContract.events.Transfer({ fromBlock: 0 });
		const received: EventLog[] = [];
		sub.on('data', event => {
			received.push(event);
		});

		await expect(sub.subscribed).resolves.toBe('0x1');
		expect(received).toHaveLength(1);
		expect(received[0].returnValues.value).toBe(BigInt(20));
		expect(received[0].data).toBeInstanceOf(Uint8Array);
	});

	it('reports a null log entry with a typed error (L-26)', async () => {
		// eslint-disable-next-line no-null/no-null
		logs = [null];
		await expect(
			contract.getPastEvents('Transfer' as never, { fromBlock: 0 }),
		).rejects.toBeInstanceOf(BaseWeb3Error);
	});

	it('reports a reply that is not an array with a typed error (L-26)', async () => {
		logs = 'nope';
		await expect(
			contract.getPastEvents('Transfer' as never, { fromBlock: 0 }),
		).rejects.toBeInstanceOf(BaseWeb3Error);
	});
});

describe('decodeEventABI on malformed logs (L-26)', () => {
	const transfer = { ...eventOf('Transfer'), signature: transferTopic.slice(0, 66) };

	it('rejects a log that is not an object', () => {
		expect(() =>
			// eslint-disable-next-line no-null/no-null -- exercise a malformed JSON-RPC log
			decodeEventABI(transfer, null as unknown as LogsInput, [transfer] as never),
		).toThrow(ResponseError);
		expect(() =>
			decodeEventABI(transfer, 'abc' as unknown as LogsInput, [transfer] as never),
		).toThrow(ResponseError);
	});

	it('rejects topics that are not an array', () => {
		expect(() =>
			decodeEventABI(
				transfer,
				{ ...transferLog, topics: 'nope' } as unknown as LogsInput,
				[transfer] as never,
				DEFAULT_RETURN_FORMAT,
			),
		).toThrow(ResponseError);
	});
});
