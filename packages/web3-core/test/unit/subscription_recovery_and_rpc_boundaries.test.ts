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
