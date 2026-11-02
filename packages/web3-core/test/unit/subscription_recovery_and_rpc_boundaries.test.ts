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

import { JsonRpcRequest } from '@theqrl/web3-types';
import { EventEmitter } from '@theqrl/web3-utils';
import { Web3Context } from '../../src/web3_context';
import { Web3RequestManagerEvent } from '../../src/web3_request_manager';
import { Web3RequestManager } from '../../src/web3_request_manager';
import { Web3SubscriptionManager } from '../../src/web3_subscription_manager';
import { ExampleSubscription } from './fixtures/example_subscription';

class RaceProvider extends EventEmitter {
	public requests: JsonRpcRequest[] = [];
	public live = new Set<string>();
	public held: { resolve: (id: string) => void; reject: (error: Error) => void }[] = [];
	public heldUnsubscribes: (() => void)[] = [];
	public hold = false;
	public holdUnsubscribe = false;
	public nextId?: string;
	private counter = 0;
	// eslint-disable-next-line class-methods-use-this
	public getStatus() {
		return 'connected';
	}
	// eslint-disable-next-line class-methods-use-this
	public supportsSubscriptions() {
		return true;
	}
	public async request(payload: JsonRpcRequest): Promise<unknown> {
		this.requests.push(payload);
		if (payload.method === 'qrl_subscribe') {
			const id = this.hold
				? await new Promise<string>((resolve, reject) => {
						this.held.push({ resolve, reject });
					})
				: (this.nextId ?? `0x${++this.counter}`);
			this.live.add(id);
			return id;
		}
		if (payload.method === 'qrl_unsubscribe') {
			this.live.delete((payload.params as string[])[0]);
			if (this.holdUnsubscribe)
				await new Promise<void>(resolve => {
					this.heldUnsubscribes.push(resolve);
				});
			return true;
		}
		return '0x1';
	}
}
const flush = async () => {
	await new Promise(resolve => setImmediate(resolve));
	await new Promise(resolve => setImmediate(resolve));
};
const setup = () => {
	const provider = new RaceProvider();
	const requests = new Web3RequestManager(provider as never);
	const manager = new Web3SubscriptionManager(requests, {
		example: ExampleSubscription as never,
	});
	const subscribe = async () => manager.subscribe('example') as Promise<ExampleSubscription>;
	return { provider, requests, manager, subscribe };
};

describe('subscription recovery ownership (pass-5 audit)', () => {
	it('waits for cancellation of an in-flight resubscribe and never restores the removed subscription', async () => {
		const { provider, manager, subscribe } = setup();
		const sub = await subscribe();
		provider.hold = true;
		provider.emit('connect', {});
		await flush();
		const removal = sub.unsubscribe();
		provider.held.shift()!.resolve('0x3');
		await removal;
		await flush();
		expect(sub.id).toBeUndefined();
		expect(manager.subscriptions.size).toBe(0);
		expect(provider.live.size).toBe(0);
		expect(provider.listenerCount('message')).toBe(0);
	});

	it('does not resubscribe another subscription removed while it waits in the recovery queue', async () => {
		const { provider, manager, subscribe } = setup();
		const a = await subscribe();
		const b = await subscribe();
		provider.hold = true;
		provider.emit('connect', {});
		await flush();
		await b.unsubscribe();
		provider.held.shift()!.resolve('0x3');
		await flush();
		expect([...manager.subscriptions.values()]).toEqual([a]);
		expect(b.id).toBeUndefined();
		expect(provider.held).toHaveLength(0);
		expect([...provider.live]).toEqual(['0x3']);
		await a.unsubscribe();
	});

	it.each(['owner', 'manager'])(
		'cancels recovery intent without a current node id (%s)',
		async who => {
			const { provider, manager, subscribe } = setup();
			const sub = await subscribe();
			provider.hold = true;
			provider.emit('connect', {});
			provider.emit('disconnect', {});
			provider.held.shift()!.resolve('0x3');
			await flush();
			expect(sub.id).toBeUndefined();
			if (who === 'owner') await sub.unsubscribe();
			else await manager.unsubscribe();
			provider.emit('connect', {});
			await flush();
			expect(provider.held).toHaveLength(0);
			expect(provider.live.size).toBe(0);
			expect(manager.subscriptions.size).toBe(0);
		},
	);

	it('releases an initial registration returned after clear', async () => {
		const { provider, manager, subscribe } = setup();
		provider.hold = true;
		const pending = subscribe().catch((error: unknown) => error);
		manager.clear();
		provider.held.shift()!.resolve('0x3');
		expect(await pending).toBeInstanceOf(Error);
		expect(provider.live.size).toBe(0);
		expect(manager.subscriptions.size).toBe(0);
		expect(provider.listenerCount('message')).toBe(0);
	});

	it('serializes flapping reconnects and registers each live subscription exactly once', async () => {
		const { provider, manager, subscribe } = setup();
		const a = await subscribe();
		const b = await subscribe();
		provider.hold = true;
		provider.emit('connect', {});
		provider.emit('disconnect', {});
		provider.emit('connect', {});
		expect(provider.held).toHaveLength(1);
		provider.held.shift()!.resolve('0x3');
		await flush();
		expect(provider.held).toHaveLength(1);
		provider.held.shift()!.resolve('0x4');
		await flush();
		provider.held.shift()!.resolve('0x5');
		await flush();
		expect([...manager.subscriptions.keys()]).toEqual(['0x4', '0x5']);
		expect(a.id).toBe('0x4');
		expect(b.id).toBe('0x5');
		expect([...provider.live]).toEqual(['0x4', '0x5']);
		await manager.unsubscribe();
	});

	it.each(['replace', 'clear', 'dispose'] as const)(
		'does not restore listeners or registrations after %s during recovery',
		async action => {
			const { provider, manager, requests, subscribe } = setup();
			const sub = await subscribe();
			provider.hold = true;
			provider.emit('connect', {});
			const replacement = new RaceProvider();
			if (action === 'replace') requests.setProvider(replacement as never);
			else manager[action]();
			provider.held.shift()!.resolve('0x3');
			await flush();
			expect(manager.subscriptions.size).toBe(0);
			expect(sub.id).toBeUndefined();
			expect(provider.listenerCount('message')).toBe(0);
			expect(replacement.listenerCount('message')).toBe(0);
			expect(provider.live.size).toBe(0);
		},
	);

	it('retries a failed recovery on the next stable connection', async () => {
		const { provider, manager, subscribe } = setup();
		const sub = await subscribe();
		provider.hold = true;
		provider.emit('connect', {});
		provider.held.shift()!.reject(new Error('socket closed again'));
		await flush();
		provider.emit('connect', {});
		provider.held.shift()!.resolve('0x3');
		await flush();
		expect(manager.subscriptions.get('0x3')).toBe(sub);
		await sub.unsubscribe();
	});

	it('does not clear a newly issued identical id when an old unsubscribe is acknowledged', async () => {
		const { provider, manager, subscribe } = setup();
		const sub = await subscribe();
		provider.nextId = sub.id;
		provider.holdUnsubscribe = true;
		provider.emit('connect', {});
		await flush();
		provider.heldUnsubscribes.shift()!();
		await flush();
		expect(sub.id).toBe('0x1');
		expect(manager.subscriptions.get('0x1')).toBe(sub);
		provider.holdUnsubscribe = false;
		await sub.unsubscribe();
	});
});

describe('RPC boundaries and configuration (pass-5 audit)', () => {
	it.each([{ id: 'other', result: '0x1' }, [{ jsonrpc: '2.0', id: 'other', result: '0x1' }]])(
		'rejects a malformed or batch envelope from request()',
		async response => {
			const manager = new Web3RequestManager({
				request: jest.fn().mockResolvedValue(response),
			} as never);
			await expect(manager.send({ method: 'qrl_blockNumber', params: [] })).rejects.toThrow();
		},
	);
	it('keeps bare arrays as valid EIP-1193 results', async () => {
		const manager = new Web3RequestManager({
			request: jest.fn().mockResolvedValue(['account']),
		} as never);
		await expect(manager.send({ method: 'qrl_accounts', params: [] })).resolves.toEqual([
			'account',
		]);
	});
	it('retains wallet rejection codes and does not turn a transport message into a revert', async () => {
		const manager = new Web3RequestManager({
			request: jest.fn().mockRejectedValue({ code: 4001, message: 'revert cancelled' }),
		} as never);
		await expect(manager.send({ method: 'qrl_accounts', params: [] })).rejects.toMatchObject({
			code: 4001,
		});
		const transport = new Error('cannot revert network changes');
		manager.setProvider({
			request: jest.fn().mockRejectedValue(transport),
		} as never);
		await expect(manager.send({ method: 'qrl_accounts', params: [] })).rejects.toBe(transport);
	});
	it('applies no partial config and emits no events when a later value is invalid', () => {
		const context = new Web3Context();
		const listener = jest.fn();
		context.on('CONFIG_CHANGE' as never, listener);
		const before = context.config;
		expect(() =>
			context.setConfig({ transactionPollingTimeout: 5, handleRevert: 'x' as never }),
		).toThrow();
		expect(context.config).toBe(before);
		expect(listener).not.toHaveBeenCalled();
	});
	it('copies object options and prevents mutation through config snapshots and getters', () => {
		const features = {
			useRpcCallSpecification: true,
			useSubscriptionWhenCheckingBlockTimeout: false,
		};
		const common = { customChain: { chainId: 2, networkId: 2 } };
		const context = new Web3Context({
			config: { enableExperimentalFeatures: features, defaultCommon: common },
		});
		features.useRpcCallSpecification = false;
		common.customChain.chainId = 3;
		expect(context.enableExperimentalFeatures.useRpcCallSpecification).toBe(true);
		expect(context.requestManager.useRpcCallSpecification).toBe(true);
		expect(context.defaultCommon?.customChain.chainId).toBe(2);
		expect(() => {
			context.getContextObject().config!.handleRevert = 'x' as never;
		}).toThrow();
		expect(() => {
			context.defaultCommon!.customChain.chainId = 4;
		}).toThrow();
	});
});

describe('pass-6 registration races', () => {
	it('does not recover a registration whose retry finished before an older recovery', async () => {
		const { provider, manager, subscribe } = setup();
		const first = await subscribe();
		provider.hold = true;
		const pending = subscribe();
		provider.emit('connect', {});
		expect(provider.held).toHaveLength(2);
		provider.held.shift()!.resolve('0x9');
		await flush();
		expect(provider.held).toHaveLength(2);
		provider.held.pop()!.resolve('0xa');
		const second = await pending;
		provider.held.shift()!.resolve('0xb');
		await flush();
		expect(first.id).toBe('0xb');
		expect(second.id).toBe('0xa');
		expect(manager.subscriptions.size).toBe(2);
		expect(provider.held).toHaveLength(0);
		expect([...provider.live].sort()).toEqual(['0xa', '0xb']);
		await manager.unsubscribe();
		expect(provider.live.size).toBe(0);
	});
	it('releases a stale reply and retries once without overlapping recovery', async () => {
		const { provider, manager, subscribe } = setup();
		provider.hold = true;
		const result = subscribe().catch((error: unknown) => error);
		provider.emit('connect', {});
		expect(provider.held).toHaveLength(1);
		provider.held.shift()!.resolve('0x9');
		await flush();
		expect(provider.live.size).toBe(0);
		expect(provider.held).toHaveLength(1);
		provider.held.shift()!.resolve('0xa');
		const sub = (await result) as ExampleSubscription;
		expect(sub.id).toBe('0xa');
		expect([...provider.live]).toEqual(['0xa']);
		await sub.unsubscribe();
		expect(manager.subscriptions.size).toBe(0);
	});
	it.each(['reconnect', 'owner', 'clear', 'dispose', 'replace'] as const)(
		'does not register a retry superseded by %s',
		async action => {
			const { provider, manager, requests, subscribe } = setup();
			provider.hold = true;
			const result = subscribe().catch((error: unknown) => error);
			provider.emit('connect', {});
			provider.held.shift()!.resolve('0x9');
			await flush();
			expect(provider.held).toHaveLength(1);
			if (action === 'reconnect') provider.emit('connect', {});
			else if (action === 'owner') await manager.unsubscribe();
			else if (action === 'replace') requests.setProvider(new RaceProvider() as never);
			else manager[action]();
			provider.held.shift()!.resolve('0xa');
			const error = await result;
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain(
				action === 'reconnect'
					? 'connection changed again'
					: 'cancelled or the provider was replaced',
			);
			await flush();
			expect(provider.live.size).toBe(0);
			expect(manager.subscriptions.size).toBe(0);
			expect(provider.held).toHaveLength(0);
			manager.dispose();
		},
	);
	it('cancels a queued recovery even when the node refuses its stale id', async () => {
		const { provider, manager, subscribe } = setup();
		await subscribe();
		const second = await subscribe();
		const original = provider.request.bind(provider);
		jest.spyOn(provider, 'request').mockImplementation(async payload => {
			if (payload.method === 'qrl_unsubscribe') throw new Error('subscription not found');
			return original(payload);
		});
		provider.hold = true;
		provider.emit('connect', {});
		await expect(second.unsubscribe()).resolves.toBeUndefined();
		provider.held.shift()!.resolve('0x9');
		await flush();
		expect(manager.hasSubscription(second as never)).toBe(false);
		expect(provider.held).toHaveLength(0);
		manager.dispose();
	});
	it('does not wait for a late-id release to acknowledge cancellation', async () => {
		const { provider, manager, subscribe } = setup();
		provider.hold = true;
		provider.holdUnsubscribe = true;
		const result = subscribe().catch((error: unknown) => error);
		manager.dispose();
		provider.held.shift()!.resolve('0x9');
		expect(await result).toBeInstanceOf(Error);
		expect(provider.live.size).toBe(0);
		provider.heldUnsubscribes.shift()!();
	});
});

describe('pass-7 cancelled registration ownership', () => {
	it('does not install a late id after provider replacement without a new registration', async () => {
		const { provider, manager, requests } = setup();
		provider.hold = true;
		const sub = new ExampleSubscription(
			{ param1: 'x' },
			{
				subscriptionManager: manager as unknown as Web3SubscriptionManager,
			},
		);
		const result = sub.subscribe().catch((error: unknown) => error);
		requests.setProvider(new RaceProvider() as never);
		provider.held.shift()!.resolve('0x9');
		expect(await result).toBeInstanceOf(Error);
		expect(sub.id).toBeUndefined();
		expect(provider.live.size).toBe(0);
		expect(manager.subscriptions.size).toBe(0);
	});
	it.each(['old-first', 'new-first', 'old-rejects'])(
		'allows immediate re-subscription without losing the new id (%s)',
		async order => {
			const { provider, manager } = setup();
			provider.hold = true;
			const sub = new ExampleSubscription(
				{ param1: 'x' },
				{ subscriptionManager: manager as unknown as Web3SubscriptionManager },
			);
			const first = sub.subscribe().catch((error: unknown) => error);
			await sub.unsubscribe();
			const second = sub.subscribe();
			expect(provider.held).toHaveLength(2);
			const [old, fresh] = provider.held.splice(0);
			if (order === 'old-first') {
				old.resolve('0x9');
				await flush();
			}
			fresh.resolve('0xa');
			await expect(second).resolves.toBe('0xa');
			if (order === 'new-first') old.resolve('0x9');
			if (order === 'old-rejects') old.reject(new Error('old request failed'));
			expect(await first).toBeInstanceOf(Error);
			await flush();
			expect(sub.id).toBe('0xa');
			expect([...manager.subscriptions.keys()]).toEqual(['0xa']);
			expect([...provider.live]).toEqual(['0xa']);
			await sub.unsubscribe();
			expect(provider.listenerCount('message')).toBe(0);
		},
	);
	it('removes a stale subscription during backoff before any connect event', async () => {
		const { provider, manager, subscribe } = setup();
		const sub = await subscribe();
		Object.assign(provider, { isConnected: () => false });
		jest.spyOn(provider, 'request').mockRejectedValue(new Error('subscription not found'));
		await expect(sub.unsubscribe()).resolves.toBeUndefined();
		expect(manager.subscriptions.size).toBe(0);
		expect(sub.id).toBeUndefined();
	});
	it.each([true, false])(
		'ignores only remote refusal when releasing a superseded id (%s)',
		async remoteRefusal => {
			const { provider, manager } = setup();
			provider.hold = true;
			const sub = new ExampleSubscription(
				{ param1: 'x' },
				{ subscriptionManager: manager as unknown as Web3SubscriptionManager },
			);
			const errors = jest.fn();
			sub.on('error', errors);
			const original = provider.request.bind(provider);
			jest.spyOn(provider, 'request').mockImplementation(async payload => {
				if (payload.method === 'qrl_unsubscribe') {
					provider.live.delete((payload.params as string[])[0]);
					if (remoteRefusal)
						return {
							jsonrpc: '2.0',
							id: payload.id,
							error: { code: -32000, message: 'subscription not found' },
						};
					throw new Error('transport failed');
				}
				return original(payload);
			});
			const pending = sub.subscribe();
			provider.emit('connect', {});
			provider.held.shift()!.resolve('0x9');
			await flush();
			provider.held.shift()!.resolve('0xa');
			await expect(pending).resolves.toBe('0xa');
			expect(errors).toHaveBeenCalledTimes(remoteRefusal ? 0 : 1);
			manager.clear();
		},
	);
});

test('throwing connected and data listeners cannot orphan a registered id', async () => {
	const { provider, manager } = setup();
	const sub = new ExampleSubscription(
		{ param1: 'x' },
		{ subscriptionManager: manager as unknown as Web3SubscriptionManager },
	);
	const errors = jest.fn();
	const connected = jest.fn();
	const data = jest.fn();
	sub.on('error', errors);
	sub.on('connected', () => {
		throw new Error('consumer connected');
	});
	sub.on('connected', connected);
	sub.on('data', () => {
		throw new Error('consumer data');
	});
	sub.on('data', data);
	await sub.subscribe();
	expect(manager.subscriptions.get(sub.id!)).toBe(sub);
	provider.emit('connect', {});
	await flush();
	expect(manager.subscriptions.get(sub.id!)).toBe(sub);
	expect(connected).toHaveBeenCalledTimes(2);
	provider.emit('message', { data: { subscription: sub.id, result: { value: 1 } } });
	expect(data).toHaveBeenCalledTimes(1);
	expect(errors).toHaveBeenCalledTimes(3);
	await sub.unsubscribe();
	expect(provider.live.size).toBe(0);
});

test('drops buffered notifications when pending registration is cancelled or fails', async () => {
	const { provider, manager, subscribe } = setup();
	provider.hold = true;
	const pending = subscribe().catch((error: unknown) => error);
	provider.emit('message', { data: { subscription: '0x9', result: { value: 1 } } });
	manager.clear();
	provider.held.shift()!.resolve('0x9');
	expect(await pending).toBeInstanceOf(Error);
	await new Promise(resolve => setTimeout(resolve, 10));
	expect(manager.subscriptions.size).toBe(0);
	expect(provider.live.size).toBe(0);
});

test.each(['before', 'during'])(
	'retires buffered logs on unsubscribe %s a flush even if ids are reused',
	async when => {
		const { provider, manager, subscribe } = setup();
		provider.hold = true;
		const firstPending = subscribe();
		const nextPending = subscribe();
		for (const result of ['first', 'stale second', 'stale third']) {
			provider.emit('message', { data: { subscription: '0x1', result } });
		}
		provider.held.shift()!.resolve('0x1');
		const first = await firstPending;
		const received = jest.fn();
		first.on('data', received);
		let removal = Promise.resolve();
		if (when === 'before') removal = first.unsubscribe();
		else
			first.once('data', () => {
				removal = first.unsubscribe();
			});
		await new Promise(resolve => setTimeout(resolve, 5));
		await removal;
		expect(received.mock.calls).toEqual(when === 'before' ? [] : [['first']]);
		expect(
			(manager as unknown as { _earlyNotifications: unknown[] })._earlyNotifications,
		).toEqual([]);
		provider.held.shift()!.resolve('0x1');
		const next = await nextPending;
		const current = jest.fn();
		next.on('data', current);
		await new Promise(resolve => setTimeout(resolve, 5));
		expect(current).not.toHaveBeenCalled();
		provider.emit('message', { data: { subscription: '0x1', result: 'new' } });
		expect(current.mock.calls).toEqual([['new']]);
		await next.unsubscribe();
		manager.dispose();
	},
);

test.each([false, true])(
	'delivers an installed id burst after a parked notification (recovery=%s)',
	async recovery => {
		const { provider, manager, subscribe } = setup();
		provider.hold = true;
		const first = subscribe();
		provider.held.shift()!.resolve('0x1');
		const sub = await first;
		const data = jest.fn<void, [string]>();
		sub.on('data', data);
		const errors = jest.fn();
		manager.on('error', errors);
		let id = '0x1';
		if (recovery) {
			provider.emit('connect', {});
			id = '0x2';
		} else {
			await sub.unsubscribe();
			void sub.subscribe();
		}
		provider.emit('message', { data: { subscription: id, result: '0' } });
		provider.held.shift()!.resolve(id);
		// Settle registration microtasks without letting the scheduled flush run.
		for (let i = 0; i < 30; i += 1) {
			// eslint-disable-next-line no-await-in-loop -- settle registration without running timers
			await Promise.resolve();
		}
		for (let value = 1; value < 300; value += 1)
			provider.emit('message', { data: { subscription: id, result: String(value) } });
		expect(data.mock.calls.map(([value]) => value)).toEqual(
			Array.from({ length: 300 }, (_, i) => String(i)),
		);
		expect(errors).not.toHaveBeenCalled();
		await sub.unsubscribe();
		manager.clear();
	},
);

test('throwing provider-change listeners cannot interrupt teardown or a provider swap', async () => {
	const { provider, requests, manager, subscribe } = setup();
	const old = await subscribe();
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	const after = jest.fn();
	requests.on(Web3RequestManagerEvent.BEFORE_PROVIDER_CHANGE, () => {
		throw new Error('before');
	});
	requests.on(Web3RequestManagerEvent.PROVIDER_CHANGED, async () => {
		await Promise.resolve();
		throw new Error('after');
	});
	requests.on(Web3RequestManagerEvent.PROVIDER_CHANGED, after);
	const replacement = new RaceProvider();
	try {
		expect(requests.setProvider(replacement as never)).toBe(true);
		await flush();
		expect(requests.provider).toBe(replacement);
		expect(provider.live.size).toBe(0);
		expect(manager.subscriptions.has(old.id!)).toBe(false);
		expect(after).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledTimes(2);
		const next = await subscribe();
		await next.unsubscribe();
	} finally {
		warn.mockRestore();
		manager.clear();
	}
});

test.each(['setProvider', 'clear', 'dispose'] as const)(
	'discards the remaining flush snapshot after %s inside a listener (P12-CORE-1)',
	async action => {
		const { provider, requests, manager, subscribe } = setup();
		provider.hold = true;
		const firstPending = subscribe();
		const heldPending = subscribe().catch((error: unknown) => error);
		const next = new RaceProvider();
		next.nextId = '0x2';
		const notify = (id: string, result: unknown) =>
			provider.emit('message', {
				jsonrpc: '2.0',
				method: 'qrl_subscription',
				params: { subscription: id, result },
			});
		notify('0x1', 'switch');
		notify('0x1', 'old remainder');
		notify('0x2', 'old provider');
		provider.held.shift()!.resolve('0x1');
		const first = await firstPending;
		const received = jest.fn();
		first.on('data', received);
		first.on('data', () => {
			if (action === 'setProvider') requests.setProvider(next as never);
			else manager[action]();
		});
		await new Promise(resolve => setTimeout(resolve, 5));
		expect(received.mock.calls).toEqual([['switch']]);
		expect(
			(manager as unknown as { _earlyNotifications: unknown[] })._earlyNotifications,
		).toEqual([]);
		const currentData = jest.fn();
		let currentId: string | undefined;
		let callsBeforeNotification = 0;
		if (action !== 'dispose') {
			if (action === 'clear') requests.setProvider(next as never);
			const current = await subscribe();
			current.on('data', currentData);
			await new Promise(resolve => setTimeout(resolve, 5));
			currentId = current.id;
			callsBeforeNotification = currentData.mock.calls.length;
			next.emit('message', {
				jsonrpc: '2.0',
				method: 'qrl_subscription',
				params: { subscription: '0x2', result: 'new provider' },
			});
		}
		expect(currentId).toBe(action === 'dispose' ? undefined : '0x2');
		expect(callsBeforeNotification).toBe(0);
		expect(currentData.mock.calls).toEqual(action === 'dispose' ? [] : [['new provider']]);
		provider.held.shift()!.resolve('0x2');
		expect(await heldPending).toBeInstanceOf(Error);
		manager.dispose();
	},
);
