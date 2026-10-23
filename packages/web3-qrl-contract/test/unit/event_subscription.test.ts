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

import { SubscriptionError } from '@theqrl/web3-errors';
import { ContractAbi } from '@theqrl/web3-types';
import { Contract, EventLog } from '../../src';
import {
	ADDR,
	ADDR2,
	FakeProvider,
	RpcErrorReply,
	addrWord,
	flush,
	topicOf,
	uintWord,
} from '../fixtures/fake_provider';

const abi: ContractAbi = [
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
];

const log = {
	address: ADDR.toLowerCase(),
	topics: [topicOf('Transfer(address,address,uint256)'), `0x${addrWord(ADDR)}`, `0x${addrWord(ADDR)}`],
	data: `0x${uintWord(5)}`,
	blockNumber: '0x1',
	transactionHash: `0x${'11'.repeat(32)}`,
	transactionIndex: '0x0',
	blockHash: `0x${'22'.repeat(32)}`,
	logIndex: '0x0',
	removed: false,
};

describe('contract event subscriptions (M-7e)', () => {
	const unhandled: unknown[] = [];
	const onUnhandled = (reason: unknown) => {
		unhandled.push(reason);
	};

	beforeEach(() => {
		unhandled.length = 0;
		process.on('unhandledRejection', onUnhandled);
	});

	afterEach(() => {
		process.off('unhandledRejection', onUnhandled);
	});

	it('does not emit error without a listener and reports the failure on subscribed (M-7e)', async () => {
		const provider = new FakeProvider(method => {
			if (method === 'qrl_subscribe') return new RpcErrorReply(-32000, 'subscription limit reached');
			return undefined;
		}, true);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const sub = contract.events.Transfer();
		sub.on('data', () => undefined);

		await expect(sub.subscribed).rejects.toThrow(SubscriptionError);
		await expect(sub.subscribed).rejects.toThrow('Failed to subscribe.');
		await flush();
		expect(unhandled).toHaveLength(0);
		expect(sub.id).toBeUndefined();
	});

	it('emits the failure on error when a listener is attached (M-7e)', async () => {
		const provider = new FakeProvider(method => {
			if (method === 'qrl_subscribe') return new RpcErrorReply(-32000, 'subscription limit reached');
			return undefined;
		}, true);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const sub = contract.events.Transfer();
		const errors: Error[] = [];
		sub.on('error', error => {
			errors.push(error);
		});

		await expect(sub.subscribed).rejects.toThrow(SubscriptionError);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(SubscriptionError);
		expect((errors[0] as SubscriptionError).innerError).toBeDefined();
		expect(unhandled).toHaveLength(0);
	});

	it('resolves subscribed with the subscription id and delivers notifications', async () => {
		const provider = new FakeProvider(method => (method === 'qrl_subscribe' ? '0x1' : undefined), true);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const sub = contract.events.Transfer();
		const received: EventLog[] = [];
		sub.on('data', event => {
			received.push(event);
		});

		await expect(sub.subscribed).resolves.toBe('0x1');
		expect(sub.id).toBe('0x1');
		provider.notify('0x1', log);
		expect(received).toHaveLength(1);
		expect(received[0].returnValues.value).toBe(BigInt(5));
		expect(unhandled).toHaveLength(0);
	});

	it('starts the subscription on the next microtask so listeners can be attached first (M-7e)', async () => {
		const provider = new FakeProvider(method => (method === 'qrl_subscribe' ? '0x1' : undefined), true);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const sub = contract.events.Transfer();
		expect(provider.calls).toHaveLength(0);
		await sub.subscribed;
		expect(provider.calls.map(call => call.method)).toEqual(['qrl_subscribe']);
	});

	it('reports a failed past-events replay on subscribed and on a listened error event (M-7e)', async () => {
		let nextId = 0;
		const provider = new FakeProvider(method => {
			if (method === 'qrl_subscribe') {
				nextId += 1;
				return `0x${nextId.toString(16)}`;
			}
			if (method === 'qrl_getLogs') return new RpcErrorReply(-32000, 'query timeout');
			return undefined;
		}, true);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const silent = contract.events.Transfer({ fromBlock: 0 });
		await expect(silent.subscribed).rejects.toThrow('Failed to get past events.');
		expect(silent.id).toBe('0x1');

		const listened = contract.events.Transfer({ fromBlock: 0 });
		const errors: Error[] = [];
		listened.on('error', error => {
			errors.push(error);
		});
		await expect(listened.subscribed).rejects.toThrow(SubscriptionError);
		expect(errors).toHaveLength(1);
		await flush();
		expect(unhandled).toHaveLength(0);
	});

	it('replays past events before resolving subscribed', async () => {
		const provider = new FakeProvider(method => {
			if (method === 'qrl_subscribe') return '0x1';
			if (method === 'qrl_getLogs') return [log];
			return undefined;
		}, true);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const sub = contract.events.Transfer({ fromBlock: 0 });
		const received: EventLog[] = [];
		sub.on('data', event => {
			received.push(event);
		});

		await expect(sub.subscribed).resolves.toBe('0x1');
		expect(received).toHaveLength(1);
		expect(received[0].event).toBe('Transfer');
	});

	it('does not crash on a provider without subscription support (M-7e)', async () => {
		const provider = new FakeProvider(() => undefined, false);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		const sub = contract.events.allEvents();
		await expect(sub.subscribed).rejects.toThrow(SubscriptionError);
		await flush();
		expect(unhandled).toHaveLength(0);
		expect(provider.calls).toHaveLength(0);
	});
});

describe('live subscription log ownership and removed logs (P4-L-25)', () => {
	const foreignAddressLog = { ...log, address: ADDR2.toLowerCase() };
	const foreignTopicLog = {
		...log,
		topics: [topicOf('Foo(address,address,uint256)'), log.topics[1], log.topics[2]],
	};
	const removedLog = { ...log, removed: true };

	const subscribe = async (options?: { topics?: string[] }) => {
		const provider = new FakeProvider(
			method => (method === 'qrl_subscribe' ? '0x1' : undefined),
			true,
		);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });
		const sub = contract.events.Transfer(options);
		const data: EventLog[] = [];
		const changed: (EventLog & { removed: true })[] = [];
		sub.on('data', event => {
			data.push(event);
		});
		sub.on('changed', event => {
			changed.push(event);
		});
		await sub.subscribed;
		return { provider, sub, data, changed };
	};

	it('never emits a log of another address as data; reports it on a listened error (P4-L-25)', async () => {
		const { provider, sub, data, changed } = await subscribe();
		const errors: Error[] = [];
		sub.on('error', error => {
			errors.push(error);
		});

		provider.notify('0x1', foreignAddressLog);

		expect(data).toHaveLength(0);
		expect(changed).toHaveLength(0);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(SubscriptionError);
	});

	it('never emits a log of another event signature as data (P4-L-25)', async () => {
		const { provider, sub, data } = await subscribe();
		const errors: Error[] = [];
		sub.on('error', error => {
			errors.push(error);
		});

		provider.notify('0x1', foreignTopicLog);
		provider.notify('0x1', log);

		expect(data).toHaveLength(1);
		expect(data[0].returnValues.value).toBe(BigInt(5));
		expect(errors).toHaveLength(1);
	});

	it('ignores a foreign log silently when nobody listens for errors (P4-L-25)', async () => {
		const { provider, data } = await subscribe();

		expect(() => provider.notify('0x1', foreignAddressLog)).not.toThrow();
		expect(() => provider.notify('0x1', foreignTopicLog)).not.toThrow();
		expect(data).toHaveLength(0);
	});

	it('emits a removed log on changed instead of data (P4-L-25)', async () => {
		const { provider, data, changed } = await subscribe();

		provider.notify('0x1', removedLog);

		expect(data).toHaveLength(0);
		expect(changed).toHaveLength(1);
		expect(changed[0].removed).toBe(true);
		expect(changed[0].event).toBe('Transfer');
		expect(changed[0].returnValues.value).toBe(BigInt(5));
	});

	it("keeps the logs of custom topics, whose filter is the caller's choice (P4-L-25)", async () => {
		const { provider, data } = await subscribe({
			topics: [topicOf('Foo(address,address,uint256)')],
		});

		provider.notify('0x1', foreignTopicLog);

		expect(data).toHaveLength(1);
	});
});
