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

import { AbiError, ResponseError } from '@theqrl/web3-errors';
import { Contract, EventLog } from '../../src';
import {
	ADDR,
	FakeProvider,
	RECEIPT,
	topicOf,
	uintWord,
	flush,
	filterLogs,
} from '../fixtures/fake_provider';

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

test.each(['Value', 'allEvents'] as const)(
	'keeps matching past logs when a shared signature has another topic count (%s)',
	async name => {
		const provider = new FakeProvider(method =>
			method === 'qrl_getLogs'
				? [log, { ...log, topics: [...log.topics, topicOf('Other(uint256)')] }, log]
				: undefined,
		);
		const contract = new Contract([event], ADDR, { provider: provider.asProvider() });
		const logs = await contract.getPastEvents(name);
		expect(logs).toHaveLength(2);
		expect((logs[0] as EventLog).returnValues.value).toBe(BigInt(7));
	},
);

test.each(['fast', 'slow'])(
	'never emits backfill when live subscription fails (%s backfill)',
	async mode => {
		let release!: (logs: (typeof log)[]) => void;
		const backfill = new Promise<(typeof log)[]>(resolve => {
			release = resolve;
		});
		const provider = new FakeProvider(async method => {
			if (method === 'qrl_subscribe') throw new Error('subscribe refused');
			if (method === 'qrl_getLogs') return mode === 'fast' ? [log] : backfill;
			return undefined;
		}, true);
		const contract = new Contract([event], ADDR, { provider: provider.asProvider() });
		const sub = contract.events.Value({ fromBlock: 0 });
		const data = jest.fn();
		const errors = jest.fn();
		sub.on('data', data);
		sub.on('error', errors);
		await expect(sub.subscribed).rejects.toThrow('Failed to subscribe');
		release([log]);
		await flush();
		expect(data).not.toHaveBeenCalled();
		expect(errors).toHaveBeenCalledTimes(1);
		expect(contract.subscriptionManager.subscriptions.size).toBe(0);
	},
);

test('reports only the backfill failure when cancellation precedes a late subscription reply', async () => {
	let release!: (id: string) => void;
	const registration = new Promise<string>(resolve => {
		release = resolve;
	});
	const provider = new FakeProvider(async method => {
		if (method === 'qrl_subscribe') return registration;
		if (method === 'qrl_getLogs') throw new Error('logs refused');
		return undefined;
	}, true);
	const contract = new Contract([event], ADDR, { provider: provider.asProvider() });
	const sub = contract.events.Value({ fromBlock: 0 });
	const errors = jest.fn();
	sub.on('error', errors);
	await expect(sub.subscribed).rejects.toThrow('Failed to get past events');
	release('0xa');
	await flush();
	expect(errors).toHaveBeenCalledTimes(1);
	expect(provider.lastCall('qrl_unsubscribe')?.params).toEqual(['0xa']);
	expect(contract.subscriptionManager.subscriptions.size).toBe(0);
});

test('includes log identity in a live topic-count error', async () => {
	const provider = new FakeProvider(
		method => (method === 'qrl_subscribe' ? '0x1' : undefined),
		true,
	);
	const contract = new Contract([event], ADDR, { provider: provider.asProvider() });
	const sub = contract.events.Value();
	const errors = jest.fn();
	sub.on('error', errors);
	await sub.subscribed;
	provider.notify('0x1', { ...log, topics: [...log.topics, topicOf('Other(uint256)')] });
	expect(errors.mock.calls[0][0].message).toContain(log.transactionHash);
	expect(errors.mock.calls[0][0].message).toContain('logIndex: 0x0');
	await sub.unsubscribe();
});

test('encodes a safe boundary number through the contract API', () => {
	const contract = new Contract([
		{
			type: 'function',
			name: 'big',
			inputs: [{ name: 'x', type: 'uint256' }],
			outputs: [],
			stateMutability: 'nonpayable',
		},
	] as const);
	expect(contract.methods.big(Number.MAX_SAFE_INTEGER).encodeABI()).toBe(
		contract.methods.big(String(Number.MAX_SAFE_INTEGER)).encodeABI(),
	);
});

test.each([
	['Value', false],
	['allEvents', false],
	['Value', true],
	['allEvents', true],
] as const)(
	'selects matching indexed layout for a shared signature (%s, reversed=%s)',
	async (name, reversed) => {
		const indexed = {
			...event,
			inputs: [{ name: 'value', type: 'uint256', indexed: true }],
		} as const;
		const indexedLog = { ...log, topics: [...log.topics, `0x${uintWord(8)}`], data: '0x' };
		const provider = new FakeProvider(
			(method, params) =>
				method === 'qrl_getLogs'
					? filterLogs([log, indexedLog], params[0])
					: method === 'qrl_subscribe'
						? '0x1'
						: undefined,
			true,
		);
		const contract = new Contract(reversed ? [indexed, event] : [event, indexed], ADDR, {
			provider: provider.asProvider(),
		});
		const past = await contract.getPastEvents(name);
		expect(past.map(entry => (entry as EventLog).returnValues.value)).toEqual([
			BigInt(7),
			BigInt(8),
		]);
		const sub = contract.events[name]();
		const data = jest.fn();
		sub.on('data', data);
		await sub.subscribed;
		provider.notify('0x1', log);
		provider.notify('0x1', indexedLog);
		expect(data.mock.calls.map(([entry]) => (entry as EventLog).returnValues.value)).toEqual([
			BigInt(7),
			BigInt(8),
		]);
		await sub.unsubscribe();
	},
);

test('anonymous events exclude declared signatures and require exact indexed counts', async () => {
	const anonymous = {
		type: 'event',
		name: 'Anon',
		anonymous: true,
		inputs: [{ name: 'value', type: 'uint256', indexed: true }],
	} as const;
	const ping = { type: 'event', name: 'Ping', anonymous: false, inputs: [] } as const;
	const anonLog = { ...log, topics: [`0x${uintWord(7)}`], data: '0x' };
	const candidates = [
		anonLog,
		{ ...anonLog, topics: [topicOf('Ping()')] },
		{ ...anonLog, topics: [...log.topics, `0x${uintWord(9)}`] },
		{ ...anonLog, topics: [] },
	];
	const provider = new FakeProvider(
		(method, params) =>
			method === 'qrl_getLogs'
				? filterLogs(candidates, params[0])
				: method === 'qrl_subscribe'
					? '0x1'
					: undefined,
		true,
	);
	const contract = new Contract([anonymous, ping, event], ADDR, {
		provider: provider.asProvider(),
	});
	const past = await contract.getPastEvents('Anon');
	expect(past).toHaveLength(1);
	expect((past[0] as EventLog).returnValues.value).toBe(BigInt(7));
	const sub = contract.events.Anon();
	const data = jest.fn();
	sub.on('data', data);
	sub.on('error', jest.fn());
	await sub.subscribed;
	for (const candidate of candidates) provider.notify('0x1', candidate);
	expect(data).toHaveBeenCalledTimes(1);
	await sub.unsubscribe();
});

test('throwing replay listeners do not suppress other listeners, valid logs or the live subscription', async () => {
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	const provider = new FakeProvider(
		method =>
			method === 'qrl_getLogs'
				? [log, { ...log, data: '0x01' }, { ...log, data: `0x${uintWord(9)}` }]
				: method === 'qrl_subscribe'
					? '0x1'
					: undefined,
		true,
	);
	const contract = new Contract([event], ADDR, { provider: provider.asProvider() });
	const sub = contract.events.Value({ fromBlock: 0 });
	const data = jest.fn();
	sub.on('data', () => {
		throw new Error('consumer data');
	});
	sub.on('data', data);
	sub.on('error', () => {
		throw new Error('consumer error');
	});
	try {
		await expect(sub.subscribed).resolves.toBe('0x1');
		expect(data.mock.calls.map(([entry]) => (entry as EventLog).returnValues.value)).toEqual([
			BigInt(7),
			BigInt(9),
		]);
		expect(contract.subscriptionManager.subscriptions.get('0x1')).toBe(sub);
		expect(() => provider.notify('0x1', log)).not.toThrow();
		expect(data).toHaveBeenCalledTimes(3);
		await sub.unsubscribe();
	} finally {
		warn.mockRestore();
	}
});

test.each([false, true])(
	'filters shared signatures using the selected layout (reversed=%s)',
	async reversed => {
		const indexed = {
			...event,
			inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }],
		} as const;
		const indexedLog = { ...log, topics: [...log.topics, `0x${uintWord(8)}`], data: '0x' };
		const provider = new FakeProvider(
			(method, params) =>
				method === 'qrl_getLogs'
					? filterLogs([log, indexedLog], params[0])
					: method === 'qrl_subscribe'
						? '0x1'
						: undefined,
			true,
		);
		const contract = new Contract(reversed ? [indexed, event] : [event, indexed], ADDR, {
			provider: provider.asProvider(),
		});
		const past = await contract.getPastEvents('Value', { filter: { tokenId: 8 } });
		expect(past).toHaveLength(1);
		expect((past[0] as EventLog).returnValues.tokenId).toBe(BigInt(8));
		expect(provider.lastCall('qrl_getLogs')?.params?.[0]).toHaveProperty(
			'topics',
			indexedLog.topics,
		);
		const plain = await contract.getPastEvents('Value', { filter: { value: 7 } });
		expect(plain).toHaveLength(1);
		expect((plain[0] as EventLog).returnValues.value).toBe(BigInt(7));
		await expect(contract.getPastEvents('Value', { filter: { missing: 5 } })).rejects.toThrow(
			AbiError,
		);
		expect(() => contract.events.Value({ filter: { missing: 5 } })).toThrow(AbiError);
		const sub = contract.events.Value({ filter: { tokenId: 8 } });
		await sub.subscribed;
		expect(provider.lastCall('qrl_subscribe')?.params?.[1]).toHaveProperty(
			'topics',
			indexedLog.topics,
		);
		await sub.unsubscribe();
	},
);

test('rejects non-string topics on the live path', async () => {
	const provider = new FakeProvider(
		method => (method === 'qrl_subscribe' ? '0x1' : undefined),
		true,
	);
	const contract = new Contract([event], ADDR, { provider: provider.asProvider() });
	const sub = contract.events.Value();
	const data = jest.fn();
	const errors = jest.fn();
	sub.on('data', data);
	sub.on('error', errors);
	await sub.subscribed;
	provider.notify('0x1', { ...log, topics: [7] });
	expect(data).not.toHaveBeenCalled();
	expect(errors.mock.calls[0][0]).toBeInstanceOf(ResponseError);
	await sub.unsubscribe();
});

test('rejects excessive tuple depth while cloning a contract ABI', () => {
	type NestedParameter = { name: string; type: string; components?: NestedParameter[] };
	let input: NestedParameter = { name: '', type: 'uint8' };
	for (let i = 0; i < 2000; i += 1) input = { name: '', type: 'tuple', components: [input] };
	expect(
		() => new Contract([{ type: 'function', name: 'f', inputs: [input], outputs: [] }]),
	).toThrow(AbiError);
	expect(
		() =>
			new Contract([
				{
					type: 'function',
					name: 'f',
					inputs: [{ name: '', type: 'uint8' + '[]'.repeat(2000) }],
					outputs: [],
				},
			]),
	).toThrow(AbiError);
});
test.each([
	{ blockNumber: 'abc' },
	{ logIndex: {} },
	{ removed: 'yes' },
	{ address: 7 },
	{ blockHash: '0xzz' },
	// eslint-disable-next-line no-null/no-null -- malformed node reply
	{ transactionHash: null },
])('rejects malformed live log fields %p', async fields => {
	const provider = new FakeProvider(
		method => (method === 'qrl_subscribe' ? '0x1' : undefined),
		true,
	);
	const contract = new Contract([event], ADDR, { provider: provider.asProvider() });
	const sub = contract.events.Value();
	const data = jest.fn();
	const errors = jest.fn();
	sub.on('data', data);
	sub.on('error', errors);
	await sub.subscribed;
	provider.notify('0x1', { ...log, ...fields });
	expect(data).not.toHaveBeenCalled();
	expect(errors.mock.calls[0][0]).toBeInstanceOf(ResponseError);
	await sub.unsubscribe();
});

test('ignores nullish layout keys and merges omitted anonymous with false', async () => {
	const indexed = {
		type: 'event',
		name: 'Value',
		inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }],
	} as const;
	const indexedLog = { ...log, topics: [...log.topics, `0x${uintWord(8)}`], data: '0x' };
	const provider = new FakeProvider(
		(method, params) =>
			method === 'qrl_getLogs'
				? filterLogs([log, indexedLog], params[0])
				: method === 'qrl_subscribe'
					? '0x1'
					: undefined,
		true,
	);
	const contract = new Contract([event, indexed], ADDR, { provider: provider.asProvider() });
	expect(await contract.getPastEvents('Value', { filter: { tokenId: undefined } })).toHaveLength(
		2,
	);
	expect(provider.lastCall('qrl_getLogs')?.params[0]).toHaveProperty('topics', log.topics);
	expect(
		await contract.getPastEvents('Value', { filter: { tokenId: 8, value: undefined } }),
	).toHaveLength(1);
	const sub = contract.events.Value({ filter: { tokenId: 8 } });
	await sub.subscribed;
	expect(provider.lastCall('qrl_subscribe')?.params[1]).toHaveProperty(
		'topics',
		indexedLog.topics,
	);
	await sub.unsubscribe();
});

test.each([false, true])(
	'fetches and filters every compatible indexed layout (reversed=%s)',
	async reversed => {
		const first = {
			type: 'event',
			name: 'Shared',
			inputs: [
				{ name: 'key', type: 'uint256', indexed: true },
				{ name: 'other', type: 'uint256', indexed: true },
				{ name: 'value', type: 'uint256', indexed: false },
			],
		} as const;
		const second = {
			...first,
			inputs: [
				{ name: 'other', type: 'uint256', indexed: true },
				{ name: 'key', type: 'uint256', indexed: true },
				{ name: 'value', type: 'uint256', indexed: true },
			],
		} as const;
		const signature = topicOf('Shared(uint256,uint256,uint256)');
		const one = {
			...log,
			topics: [signature, `0x${uintWord(7)}`, `0x${uintWord(9)}`],
			data: `0x${uintWord(20)}`,
		};
		const wrong = {
			...log,
			topics: [signature, `0x${uintWord(7)}`, `0x${uintWord(9)}`, `0x${uintWord(20)}`],
			data: '0x',
		};
		const two = {
			...wrong,
			topics: [signature, `0x${uintWord(9)}`, `0x${uintWord(7)}`, `0x${uintWord(20)}`],
		};
		const all = [one, wrong, two];
		const matchesTopics = (entry: typeof one, topics: (string | undefined)[]) =>
			topics.length <= entry.topics.length &&
			// eslint-disable-next-line no-null/no-null -- the node treats null topic slots as wildcards
			topics.every((topic, index) => topic == null || topic === entry.topics[index]);
		const provider = new FakeProvider((method, params) => {
			if (method === 'qrl_getLogs')
				return all.filter(entry =>
					matchesTopics(entry, (params[0] as { topics: string[] }).topics),
				);
			if (method === 'qrl_subscribe') return '0x1';
			return undefined;
		}, true);
		const contract = new Contract(reversed ? [second, first] : [first, second], ADDR, {
			provider: provider.asProvider(),
		});
		for (const key of ['invalid', [7, 'invalid']]) {
			expect(() => contract.events.Shared({ filter: { key } })).toThrow(AbiError);
			// eslint-disable-next-line no-await-in-loop -- each failed read must fail before RPC
			await expect(contract.getPastEvents('Shared', { filter: { key } })).rejects.toThrow(
				AbiError,
			);
		}
		expect(provider.calls).toHaveLength(0);
		const past = await contract.getPastEvents('Shared', { filter: { key: 7 } });
		expect(past).toHaveLength(2);
		expect(past.map(entry => (entry as EventLog).returnValues.key)).toEqual([
			BigInt(7),
			BigInt(7),
		]);
		expect(provider.lastCall('qrl_getLogs')?.params[0]).toHaveProperty('topics', [signature]);
		const sub = contract.events.Shared({ fromBlock: 0, filter: { key: 7 } });
		const received = jest.fn();
		sub.on('data', received);
		await sub.subscribed;
		expect(received.mock.calls.map(([entry]) => (entry as EventLog).returnValues.key)).toEqual([
			BigInt(7),
			BigInt(7),
		]);
		received.mockClear();
		const topics = (provider.lastCall('qrl_subscribe')?.params[1] as { topics: string[] })
			.topics;
		for (const entry of all) if (matchesTopics(entry, topics)) provider.notify('0x1', entry);
		expect(received).toHaveBeenCalledTimes(2);
		expect(received.mock.calls.map(([entry]) => (entry as EventLog).returnValues.key)).toEqual([
			BigInt(7),
			BigInt(7),
		]);
		await sub.unsubscribe();
	},
);

test.each([false, true])(
	'uses prefix topics for different indexed counts (reversed=%s)',
	async reversed => {
		const first = {
			type: 'event',
			name: 'Shared',
			inputs: [
				{ name: 'key', type: 'uint256', indexed: true },
				{ name: 'other', type: 'uint256', indexed: false },
			],
		} as const;
		const second = {
			...first,
			inputs: [first.inputs[0], { ...first.inputs[1], indexed: true }],
		} as const;
		const signature = topicOf('Shared(uint256,uint256)');
		const one = { ...log, topics: [signature, `0x${uintWord(7)}`], data: `0x${uintWord(9)}` };
		const two = { ...one, topics: [...one.topics, `0x${uintWord(9)}`], data: '0x' };
		const all = [one, two, { ...one, topics: [signature, `0x${uintWord(8)}`] }];
		const provider = new FakeProvider((method, params) => {
			if (method !== 'qrl_getLogs') return undefined;
			const topics = (params[0] as { topics: string[] }).topics;
			return all.filter(
				entry =>
					topics.length <= entry.topics.length &&
					topics.every((value, i) => value === entry.topics[i]),
			);
		}, true);
		const contract = new Contract(reversed ? [second, first] : [first, second], ADDR, {
			provider: provider.asProvider(),
		});
		expect(await contract.getPastEvents('Shared', { filter: { key: 7 } })).toHaveLength(2);
		expect(provider.lastCall('qrl_getLogs')?.params[0]).toHaveProperty('topics', one.topics);
		const sub = contract.events.Shared({ fromBlock: 0, filter: { key: 7 } });
		const data = jest.fn();
		sub.on('data', data);
		await sub.subscribed;
		expect(data).toHaveBeenCalledTimes(2);
		expect(provider.lastCall('qrl_subscribe')?.params[1]).toHaveProperty('topics', one.topics);
		await sub.unsubscribe();
	},
);

test('keeps indexed topics for anonymous merged layouts', async () => {
	const indexed = {
		...event,
		anonymous: true,
		inputs: [{ name: 'value', type: 'uint256', indexed: true }],
	} as const;
	const unindexed = { ...event, anonymous: true } as const;
	const matching = { ...log, topics: [`0x${uintWord(7)}`], data: '0x' };
	const provider = new FakeProvider(
		method => (method === 'qrl_getLogs' ? [matching] : undefined),
		true,
	);
	const contract = new Contract([indexed, unindexed], ADDR, { provider: provider.asProvider() });
	expect(await contract.getPastEvents('Value', { filter: { value: 7 } })).toHaveLength(1);
	expect(provider.lastCall('qrl_getLogs')?.params[0]).toHaveProperty('topics', matching.topics);
	const sub = contract.events.Value({ filter: { value: 7 } });
	await sub.subscribed;
	expect(provider.lastCall('qrl_subscribe')?.params[1]).toHaveProperty('topics', matching.topics);
	await sub.unsubscribe();
});
