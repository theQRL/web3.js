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

/* eslint-disable no-null/no-null -- exercise topic wildcards */
import { AbiError } from '@theqrl/web3-errors';
import { encodeParameter, encodeParameters } from '@theqrl/web3-qrl-abi';
import { Contract, EventLog } from '../../src';
import {
	ADDR,
	ADDR2,
	FROM,
	RECEIPT,
	FakeProvider,
	filterLogs,
	topicOf,
	uintWord,
} from '../fixtures/fake_provider';

const single = {
	type: 'event',
	name: 'TransferSingle',
	inputs: [
		{ name: 'operator', type: 'address', indexed: true },
		{ name: 'from', type: 'address', indexed: true },
		{ name: 'to', type: 'address', indexed: true },
		{ name: 'id', type: 'uint256', indexed: false },
		{ name: 'value', type: 'uint256', indexed: false },
	],
} as const;
const uri = {
	type: 'event',
	name: 'URI',
	inputs: [
		{ name: 'value', type: 'string', indexed: false },
		{ name: 'id', type: 'uint256', indexed: true },
	],
} as const;
const singleTopic = topicOf('TransferSingle(address,address,address,uint256,uint256)');
const uriTopic = topicOf('URI(string,uint256)');
const base = {
	address: ADDR,
	blockNumber: '0x1',
	blockHash: RECEIPT.blockHash,
	transactionHash: RECEIPT.transactionHash,
	transactionIndex: '0x0',
	logIndex: '0x0',
	removed: false,
};
const singleLog = {
	...base,
	topics: [singleTopic, ...[FROM, ADDR, ADDR2].map(value => encodeParameter('address', value))],
	data: encodeParameters(['uint256', 'uint256'], [1, 100]),
};
const uriLog = {
	...base,
	topics: [uriTopic, `0x${uintWord(1)}`],
	data: encodeParameter('string', 'uri'),
};
const erc1155 = () => {
	const provider = new FakeProvider(
		(method, params) =>
			method === 'qrl_getLogs' ? filterLogs([singleLog, uriLog], params[0]) : undefined,
		true,
	);
	return {
		provider,
		contract: new Contract([single, uri, { ...uri, anonymous: true }], ADDR, {
			provider: provider.asProvider(),
		}),
	};
};

test.each([{ topics: [singleTopic] }, { topics: [[singleTopic]] }])(
	'allEvents validates only signatures admitted by topics $topics (P13-CT-1)',
	async ({ topics }) => {
		const { provider, contract } = erc1155();
		const options = { topics, filter: { value: 100 } };
		const past = await contract.getPastEvents('allEvents', options);
		expect(past).toHaveLength(1);
		expect(past[0]).toHaveProperty('event', 'TransferSingle');
		const sub = contract.events.allEvents({ ...options, fromBlock: 0 });
		const data = jest.fn<void, [EventLog]>();
		const errors = jest.fn();
		sub.on('data', data);
		sub.on('error', errors);
		await sub.subscribed;
		provider.notify(sub.id!, singleLog);
		expect(data.mock.calls.map(([entry]) => entry)).toEqual([...past, ...past]);
		expect(errors).not.toHaveBeenCalled();
		await sub.unsubscribe();
	},
);

test.each(
	[undefined, [], [null], [[]], [[singleTopic, uriTopic]], [uriTopic]].map(topics => ({
		topics,
	})),
)('still validates every admitted layout for topics $topics', async ({ topics }) => {
	const { provider, contract } = erc1155();
	const options = { topics, filter: { value: 100 } };
	expect(() => contract.events.allEvents(options)).toThrow(AbiError);
	await expect(contract.getPastEvents('allEvents', options)).rejects.toThrow(AbiError);
	expect(provider.calls).toHaveLength(0);
});

test('empty topics preserve named signatures and local filters (P13-CT-3)', async () => {
	const other = { ...single, name: 'Other' };
	const otherLog = {
		...singleLog,
		topics: [
			topicOf('Other(address,address,address,uint256,uint256)'),
			...singleLog.topics.slice(1),
		],
	};
	const unmatched = { ...singleLog, data: encodeParameters(['uint256', 'uint256'], [1, 101]) };
	const logs = [singleLog, unmatched, otherLog];
	const provider = new FakeProvider(
		(method, params) => (method === 'qrl_getLogs' ? filterLogs(logs, params[0]) : undefined),
		true,
	);
	const contract = new Contract([single, other], ADDR, { provider: provider.asProvider() });
	const filter = { value: 100 };
	const expected = await contract.getPastEvents('TransferSingle', { filter });
	expect(await contract.getPastEvents('TransferSingle', { topics: [], filter })).toEqual(
		expected,
	);
	expect(expected).toHaveLength(1);
	const sub = contract.events.TransferSingle({ fromBlock: 0, topics: [], filter });
	const data = jest.fn<void, [EventLog]>();
	const errors = jest.fn();
	sub.on('data', data);
	sub.on('error', errors);
	await sub.subscribed;
	for (const log of filterLogs(logs, provider.lastCall('qrl_subscribe')?.params[1]))
		provider.notify(sub.id!, log);
	expect(data.mock.calls.map(([entry]) => entry)).toEqual([...expected, ...expected]);
	expect(errors).not.toHaveBeenCalled();
	await sub.unsubscribe();
});

const mutableValues = [
	{
		label: 'indexed OR list',
		type: 'uint256',
		signature: 'uint256',
		indexed: true,
		make: () => {
			const value = [20];
			return {
				value,
				encoded: 20,
				mutate: () => {
					value[0] = 21;
					value.push(99);
				},
			};
		},
	},
	{
		label: 'tuple object',
		type: 'tuple',
		signature: '(uint256,bool)',
		components: [
			{ name: 'x', type: 'uint256' },
			{ name: 'y', type: 'bool' },
		],
		make: () => {
			const value = { x: 20, y: true };
			return {
				value,
				encoded: value,
				mutate: () => {
					value.x = 21;
				},
			};
		},
	},
	{
		label: 'array value',
		type: 'uint256[]',
		signature: 'uint256[]',
		make: () => {
			const value = [20];
			return {
				value,
				encoded: value,
				mutate: () => {
					value[0] = 21;
				},
			};
		},
	},
	{
		label: 'byte buffer',
		type: 'bytes',
		signature: 'bytes',
		make: () => {
			const value = Buffer.from([20]);
			return {
				value,
				encoded: value,
				mutate: () => {
					value[0] = 21;
				},
			};
		},
	},
];
test.each(mutableValues)(
	'snapshots $label before reads, replay and live delivery (P13-CT-2)',
	async row => {
		const input = {
			name: 'value',
			type: row.type,
			indexed: row.indexed ?? false,
			components: row.components,
		};
		const abi = { type: 'event', name: 'Mutable', inputs: [input] } as const;
		const word = encodeParameter(input, row.make().encoded);
		const log = {
			...base,
			topics: [topicOf(`Mutable(${row.signature})`), ...(input.indexed ? [word] : [])],
			data: input.indexed ? '0x' : word,
		};
		const provider = new FakeProvider(
			(method, params) =>
				method === 'qrl_getLogs' ? filterLogs([log], params[0]) : undefined,
			true,
		);
		const contract = new Contract([abi], ADDR, { provider: provider.asProvider() });
		const readValue = row.make();
		const pending = contract.getPastEvents('Mutable', { filter: { value: readValue.value } });
		readValue.mutate();
		const past = await pending;
		expect(past).toHaveLength(1);
		const liveValue = row.make();
		const sub = contract.events.Mutable({ fromBlock: 0, filter: { value: liveValue.value } });
		liveValue.mutate();
		const data = jest.fn<void, [EventLog]>();
		const errors = jest.fn();
		sub.on('data', data);
		sub.on('error', errors);
		await sub.subscribed;
		provider.notify(sub.id!, log);
		expect(data.mock.calls.map(([entry]) => entry)).toEqual([...past, ...past]);
		expect(errors).not.toHaveBeenCalled();
		await sub.unsubscribe();
	},
);

test('allows known filter keys when explicit topics admit no declared event', async () => {
	const { contract, provider } = erc1155();
	const options = { topics: [topicOf('Unrelated(uint256)')], filter: { value: 100 } };
	await expect(contract.getPastEvents('allEvents', options)).resolves.toEqual([]);
	const sub = contract.events.allEvents({ ...options, fromBlock: 0 });
	const data = jest.fn();
	const errors = jest.fn();
	sub.on('data', data);
	sub.on('error', errors);
	await sub.subscribed;
	expect(data).not.toHaveBeenCalled();
	expect(errors).not.toHaveBeenCalled();
	expect(provider.calls.filter(call => call.method === 'qrl_getLogs')).toHaveLength(2);
	await sub.unsubscribe();
});
