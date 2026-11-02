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

import { AbiError } from '@theqrl/web3-errors';
import { Filter, FMT_BYTES, FMT_NUMBER } from '@theqrl/web3-types';
import { Contract, EventLog } from '../../src';
import {
	ADDR,
	FakeProvider,
	RECEIPT,
	filterLogs,
	topicOf,
	uintWord,
} from '../fixtures/fake_provider';

const indexed = {
	type: 'event',
	name: 'Shared',
	inputs: [
		{ name: 'key', type: 'uint256', indexed: true },
		{ name: 'value', type: 'uint256', indexed: false },
	],
} as const;
const plain = {
	...indexed,
	inputs: [{ ...indexed.inputs[0], indexed: false }, indexed.inputs[1]],
} as const;
const signature = topicOf('Shared(uint256,uint256)');
const baseLog = {
	address: ADDR,
	blockNumber: '0x1',
	blockHash: RECEIPT.blockHash,
	transactionHash: RECEIPT.transactionHash,
	transactionIndex: '0x0',
	logIndex: '0x0',
	removed: false,
};
const indexedLogs = [20, 21, 22].map(value => ({
	...baseLog,
	topics: [signature, `0x${uintWord(7)}`],
	data: `0x${uintWord(value)}`,
}));
const plainLogs = [20, 21, 22].map(value => ({
	...baseLog,
	topics: [signature],
	data: `0x${uintWord(7)}${uintWord(value)}`,
}));
const scenarios = [
	{ label: 'single layout', abi: [indexed], name: 'Shared', logs: indexedLogs },
	{
		label: 'merged layouts',
		abi: [indexed, plain],
		name: 'Shared',
		logs: [...indexedLogs, ...plainLogs],
	},
	{
		label: 'reversed layouts',
		abi: [plain, indexed],
		name: 'Shared',
		logs: [...indexedLogs, ...plainLogs],
	},
	{ label: 'allEvents single layout', abi: [indexed], name: 'allEvents', logs: indexedLogs },
	{
		label: 'allEvents merged layouts',
		abi: [indexed, plain],
		name: 'allEvents',
		logs: [...indexedLogs, ...plainLogs],
	},
	{
		label: 'anonymous layout',
		abi: [{ ...indexed, anonymous: true }],
		name: 'Shared',
		logs: indexedLogs.map(log => ({ ...log, topics: log.topics.slice(1) })),
	},
] as const;
const formats = [
	{ number: FMT_NUMBER.BIGINT, bytes: FMT_BYTES.HEX },
	{ number: FMT_NUMBER.NUMBER, bytes: FMT_BYTES.UINT8ARRAY },
	{ number: FMT_NUMBER.STR, bytes: FMT_BYTES.HEX },
];

const setup = (scenario: (typeof scenarios)[number], returnFormat = formats[0]) => {
	const provider = new FakeProvider(
		(method, params) =>
			method === 'qrl_getLogs' ? filterLogs([...scenario.logs], params[0]) : undefined,
		true,
	);
	const contract = new Contract(
		scenario.abi,
		ADDR,
		{ provider: provider.asProvider() },
		returnFormat,
	);
	return { contract, provider };
};

describe.each(scenarios)('non-indexed subscription filters: $label (P11R-1)', scenario => {
	it.each(formats)(
		'matches past events in replay, live and removed logs (%j)',
		async returnFormat => {
			const { contract, provider } = setup(scenario, returnFormat);
			const filter = { value: [20, 22] };
			const past = await contract.getPastEvents(scenario.name, { filter }, returnFormat);
			expect(past).toHaveLength((scenario.logs.length / 3) * 2);
			const sub = contract.events[scenario.name]({ fromBlock: 0, filter });
			const data = jest.fn<void, [EventLog]>();
			const changed = jest.fn<void, [EventLog]>();
			const errors = jest.fn();
			sub.on('data', data);
			sub.on('changed', changed);
			sub.on('error', errors);
			await sub.subscribed;
			expect(data.mock.calls.map(([entry]) => entry)).toEqual(past);
			data.mockClear();
			const query = provider.lastCall('qrl_subscribe')?.params[1];
			for (const log of filterLogs([...scenario.logs], query)) {
				provider.notify(sub.id!, log);
				provider.notify(sub.id!, { ...log, removed: true });
			}
			expect(data.mock.calls.map(([entry]) => entry)).toEqual(past);
			expect(changed.mock.calls.map(([entry]) => entry)).toEqual(
				past.map(entry => ({ ...(entry as EventLog), removed: true })),
			);
			expect(errors).not.toHaveBeenCalled();
			await sub.unsubscribe();
		},
	);

	it.each(['invalid', [20, 'invalid']])(
		'rejects invalid non-indexed value %j before requests',
		async value => {
			const { contract, provider } = setup(scenario);
			expect(() =>
				contract.events[scenario.name]({ fromBlock: 0, filter: { value } }),
			).toThrow(AbiError);
			await expect(
				contract.getPastEvents(scenario.name, { filter: { value } }),
			).rejects.toThrow(AbiError);
			expect(provider.calls).toHaveLength(0);
		},
	);
});

describe.each(scenarios)('own enumerable event filters: $label (P12R-1)', scenario => {
	it.each([
		{
			label: 'inherited indexed key',
			filter: Object.create({ key: 8 }) as Record<string, unknown>,
			expectedPerLayout: 3,
		},
		{
			label: 'non-enumerable indexed key',
			filter: Object.defineProperty({}, 'key', { value: 8 }),
			expectedPerLayout: 3,
		},
		{
			label: 'own value with inherited indexed key',
			filter: Object.assign(Object.create({ key: 8 }), { value: 20 }) as Record<
				string,
				unknown
			>,
			expectedPerLayout: 1,
		},
		{
			label: 'own value with non-enumerable indexed key',
			filter: Object.defineProperty({ value: 20 }, 'key', { value: 8 }),
			expectedPerLayout: 1,
		},
		{
			label: 'non-matching own indexed key',
			filter: { key: 8 },
			expectedPerLayout: 0,
		},
		{
			label: 'own indexed key shadows inherited key',
			filter: Object.assign(Object.create({ key: 8 }), { key: 7, value: 20 }) as Record<
				string,
				unknown
			>,
			expectedPerLayout: 1,
		},
		{
			label: 'own keys on a null-prototype filter',
			// eslint-disable-next-line no-null/no-null -- exercise a filter without a prototype
			filter: Object.assign(Object.create(null), { key: 7, value: 20 }) as Record<
				string,
				unknown
			>,
			expectedPerLayout: 1,
		},
	])(
		'agrees across past, replay and live delivery: $label',
		async ({ filter, expectedPerLayout }) => {
			const { contract, provider } = setup(scenario);
			const past = await contract.getPastEvents(scenario.name, { filter });
			expect(past).toHaveLength((scenario.logs.length / 3) * expectedPerLayout);
			const pastQuery = provider.lastCall('qrl_getLogs')?.params[0] as Filter;
			const sub = contract.events[scenario.name]({ fromBlock: 0, filter });
			const data = jest.fn<void, [EventLog]>();
			const changed = jest.fn<void, [EventLog]>();
			const errors = jest.fn();
			sub.on('data', data);
			sub.on('changed', changed);
			sub.on('error', errors);
			await sub.subscribed;
			expect(data.mock.calls.map(([entry]) => entry)).toEqual(past);
			const query = provider.lastCall('qrl_subscribe')?.params[1] as Filter;
			expect(query.topics).toEqual(pastQuery.topics);
			data.mockClear();
			for (const log of filterLogs([...scenario.logs], query)) {
				provider.notify(sub.id!, log);
				provider.notify(sub.id!, { ...log, removed: true });
			}
			expect(data.mock.calls.map(([entry]) => entry)).toEqual(past);
			expect(changed.mock.calls.map(([entry]) => entry)).toEqual(
				past.map(entry => ({ ...(entry as EventLog), removed: true })),
			);
			expect(errors).not.toHaveBeenCalled();
			await sub.unsubscribe();
		},
	);
});

test.each([
	{ filter: {}, expected: 3 },
	{ filter: { value: undefined }, expected: 3 },
	// eslint-disable-next-line no-null/no-null -- null filter values are wildcards
	{ filter: { value: null }, expected: 3 },
	{ filter: { key: 7, value: 20 }, expected: 1 },
])('preserves wildcard and indexed filters (%j)', async ({ filter, expected }) => {
	const { contract, provider } = setup(scenarios[0]);
	const sub = contract.events.Shared({ fromBlock: 0, filter });
	const data = jest.fn();
	sub.on('data', data);
	await sub.subscribed;
	expect(data).toHaveBeenCalledTimes(expected);
	data.mockClear();
	for (const log of indexedLogs) provider.notify(sub.id!, log);
	expect(data).toHaveBeenCalledTimes(expected);
	await sub.unsubscribe();
});

test('explicit topics override subscription filters in replay and live delivery', async () => {
	const { contract, provider } = setup(scenarios[1]);
	const sub = contract.events.Shared({
		fromBlock: 0,
		topics: [signature],
		filter: { value: 20 },
	});
	const data = jest.fn();
	const errors = jest.fn();
	sub.on('data', data);
	sub.on('error', errors);
	await sub.subscribed;
	expect(data).toHaveBeenCalledTimes(6);
	data.mockClear();
	for (const log of [...indexedLogs, ...plainLogs]) provider.notify(sub.id!, log);
	expect(data).toHaveBeenCalledTimes(6);
	expect(errors).not.toHaveBeenCalled();
	await sub.unsubscribe();
});

test('allEvents validates shared filter names against every matching layout', () => {
	const named = {
		type: 'event',
		name: 'Named',
		inputs: [{ name: 'value', type: 'string', indexed: false }],
	} as const;
	const provider = new FakeProvider(() => undefined, true);
	const contract = new Contract([indexed, named], ADDR, { provider: provider.asProvider() });
	expect(() => contract.events.allEvents({ filter: { value: 20 } })).toThrow(AbiError);
	expect(provider.calls).toHaveLength(0);
});

test.each([false, true])(
	'validates named sibling types before requests (reversed=%s, P12-CT-1)',
	async reversed => {
		const first = {
			type: 'event',
			name: 'Twin',
			inputs: [
				{ name: 'id', type: 'uint256', indexed: true },
				{ name: 'who', type: 'address', indexed: false },
			],
		} as const;
		const second = {
			...first,
			inputs: [
				{ name: 'who', type: 'uint256', indexed: false },
				{ name: 'id', type: 'address', indexed: false },
			],
		} as const;
		const provider = new FakeProvider(() => [], true);
		const contract = new Contract(reversed ? [second, first] : [first, second], ADDR, {
			provider: provider.asProvider(),
		});
		expect(() => contract.events.Twin({ fromBlock: 0, filter: { id: 5 } })).toThrow(AbiError);
		await expect(contract.getPastEvents('Twin', { filter: { id: 5 } })).rejects.toThrow(
			AbiError,
		);
		expect(provider.calls).toHaveLength(0);
	},
);

test.each([{ topics: undefined }, { topics: [] }, { topics: [signature] }])(
	'validates filters with explicit topics %j before requests (P12-CT-1)',
	async ({ topics }) => {
		const { contract, provider } = setup(scenarios[0]);
		const options = { topics, filter: { value: 'invalid' } };
		expect(() => contract.events.Shared(options)).toThrow(AbiError);
		await expect(contract.getPastEvents('Shared', options)).rejects.toThrow(AbiError);
		expect(provider.calls).toHaveLength(0);
	},
);

test.each(['uint256', 'tuple'])(
	'handles empty OR versus empty array values (%s, P12-CT-2)',
	async type => {
		const input = {
			name: 'value',
			type,
			indexed: true,
			...(type === 'tuple' ? { components: [{ name: 'n', type: 'uint256' }] } : {}),
		};
		const abi = { type: 'event', name: 'Empty', inputs: [input] } as const;
		const provider = new FakeProvider(
			method => (method === 'qrl_getLogs' ? [] : undefined),
			true,
		);
		const contract = new Contract([abi], ADDR, { provider: provider.asProvider() });
		expect(() => contract.events.Empty({ filter: { value: [] } })).toThrow(/must not be empty/);
		await expect(contract.getPastEvents('Empty', { filter: { value: [] } })).rejects.toThrow(
			AbiError,
		);
		expect(provider.calls).toHaveLength(0);
	},
);

test.each(['bad', {}, true])(
	'rejects malformed topics %j before they can disable filtering',
	topics => {
		const { contract, provider } = setup(scenarios[0]);
		expect(() =>
			contract.events.Shared({ topics: topics as never, filter: { value: 20 } }),
		).toThrow(AbiError);
		expect(provider.calls).toHaveLength(0);
	},
);

test('snapshots top-level filter values for replay and live delivery', async () => {
	const { contract, provider } = setup(scenarios[0]);
	const filter = { value: 20 };
	const sub = contract.events.Shared({ fromBlock: 0, filter });
	filter.value = 21;
	const data = jest.fn<void, [EventLog]>();
	sub.on('data', data);
	await sub.subscribed;
	for (const log of indexedLogs) provider.notify(sub.id!, log);
	expect(data.mock.calls.map(([entry]) => entry.returnValues.value)).toEqual([
		BigInt(20),
		BigInt(20),
	]);
	await sub.unsubscribe();
});

test('drops a decoded sibling layout that lacks the filtered key', async () => {
	const sibling = {
		...indexed,
		inputs: [indexed.inputs[0], { name: 'other', type: 'uint256', indexed: true }],
	} as const;
	const foreignLayoutLog = {
		...indexedLogs[0],
		topics: [signature, `0x${uintWord(7)}`, `0x${uintWord(20)}`],
		data: '0x',
	};
	const all = [...indexedLogs, foreignLayoutLog];
	const provider = new FakeProvider(
		(method, params) => (method === 'qrl_getLogs' ? filterLogs(all, params[0]) : undefined),
		true,
	);
	const contract = new Contract([indexed, sibling], ADDR, { provider: provider.asProvider() });
	const past = await contract.getPastEvents('Shared', { filter: { value: 20 } });
	expect(past).toHaveLength(1);
	const sub = contract.events.Shared({ fromBlock: 0, filter: { value: 20 } });
	const data = jest.fn<void, [EventLog]>();
	const errors = jest.fn();
	sub.on('data', data);
	sub.on('error', errors);
	await sub.subscribed;
	for (const log of all) provider.notify(sub.id!, log);
	expect(data.mock.calls.map(([entry]) => entry)).toEqual([...past, ...past]);
	expect(errors).not.toHaveBeenCalled();
	await sub.unsubscribe();
});

test('does not encode filter values for a sibling missing another required key', async () => {
	const first = {
		type: 'event',
		name: 'Typed',
		inputs: [
			{ name: 'id', type: 'uint256', indexed: true },
			{ name: 'who', type: 'address', indexed: false },
			{ name: 'value', type: 'uint256', indexed: false },
		],
	} as const;
	const second = {
		...first,
		inputs: [
			{ name: 'who', type: 'uint256', indexed: false },
			{ name: 'id', type: 'address', indexed: true },
			{ name: 'other', type: 'uint256', indexed: true },
		],
	} as const;
	const topic = topicOf('Typed(uint256,address,uint256)');
	const matching = {
		...baseLog,
		topics: [topic, `0x${uintWord(7)}`],
		data: `0x${uintWord(7)}${uintWord(20)}`,
	};
	const sibling = {
		...baseLog,
		topics: [topic, `0x${uintWord(7)}`, `0x${uintWord(20)}`],
		data: `0x${uintWord(9)}`,
	};
	const all = [matching, sibling];
	const provider = new FakeProvider(
		(method, params) => (method === 'qrl_getLogs' ? filterLogs(all, params[0]) : undefined),
		true,
	);
	const contract = new Contract([first, second], ADDR, { provider: provider.asProvider() });
	const filter = { id: 7, value: 20 };
	const past = await contract.getPastEvents('Typed', { filter });
	expect(past).toHaveLength(1);
	const sub = contract.events.Typed({ fromBlock: 0, filter });
	const data = jest.fn<void, [EventLog]>();
	const errors = jest.fn();
	sub.on('data', data);
	sub.on('error', errors);
	await sub.subscribed;
	for (const log of all) provider.notify(sub.id!, log);
	expect(data.mock.calls.map(([entry]) => entry)).toEqual([...past, ...past]);
	expect(errors).not.toHaveBeenCalled();
	await sub.unsubscribe();
});

test('accepts an empty value for an array-typed filter input', async () => {
	const abi = {
		type: 'event',
		name: 'Empty',
		inputs: [{ name: 'value', type: 'uint256[]', indexed: true }],
	} as const;
	const provider = new FakeProvider(() => undefined, true);
	const contract = new Contract([abi], ADDR, { provider: provider.asProvider() });
	const sub = contract.events.Empty({ filter: { value: [] } });
	await expect(sub.subscribed).resolves.toBe('0x1');
	await sub.unsubscribe();
});
