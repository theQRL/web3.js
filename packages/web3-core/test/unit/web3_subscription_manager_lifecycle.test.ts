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

import { JsonRpcRequest, SupportedProviders } from '@theqrl/web3-types';
import { EventEmitter } from '@theqrl/web3-utils';
import { InvalidResponseError, SubscriptionError } from '@theqrl/web3-errors';
import { Web3Context, Web3PluginBase } from '../../src/web3_context';
import { Web3RequestManager, Web3RequestManagerEvent } from '../../src/web3_request_manager';
import {
	UNSUBSCRIBE_ON_PROVIDER_CHANGE_TIMEOUT,
	Web3SubscriptionManager,
} from '../../src/web3_subscription_manager';
import { ExampleSubscription } from './fixtures/example_subscription';

/* eslint-disable no-null/no-null */

/**
 * An EIP-1193 style provider with subscription support: `request` is an AsyncFunction, so the
 * request manager takes the EIP-1193 path, and notifications arrive as `message` events.
 */
class FakeProvider extends EventEmitter {
	public sent: string[] = [];
	public failUnsubscribe = false;
	public hangUnsubscribe = false;
	public sameId?: string;
	private _counter = 0;

	// eslint-disable-next-line class-methods-use-this
	public supportsSubscriptions() {
		return true;
	}

	public async request(payload: JsonRpcRequest) {
		this.sent.push(payload.method);
		if (payload.method === 'qrl_subscribe') {
			this._counter += 1;
			return { jsonrpc: '2.0', id: payload.id, result: this.sameId ?? `0x5ab${this._counter}` };
		}
		if (payload.method === 'qrl_unsubscribe') {
			if (this.hangUnsubscribe) {
				return new Promise(() => undefined);
			}
			if (this.failUnsubscribe) {
				return {
					jsonrpc: '2.0',
					id: payload.id,
					error: { code: -32000, message: 'subscription not found' },
				};
			}
			return { jsonrpc: '2.0', id: payload.id, result: true };
		}
		return { jsonrpc: '2.0', id: payload.id, result: '0x1' };
	}

	public notify(subscriptionId: string, result: unknown) {
		this.emit('message', {
			jsonrpc: '2.0',
			method: 'qrl_subscription',
			params: { subscription: subscriptionId, result },
		});
	}
}

const subscriptions = { example: ExampleSubscription as never };

type Manager = Web3SubscriptionManager<any, any>;

const flush = async () => {
	await new Promise(resolve => setImmediate(resolve));
	await new Promise(resolve => setImmediate(resolve));
};

const setup = () => {
	const provider = new FakeProvider();
	const requestManager = new Web3RequestManager(provider as unknown as SupportedProviders);
	const manager: Manager = new Web3SubscriptionManager(requestManager as never, subscriptions);
	return { provider, requestManager, manager };
};

const subscribe = async (manager: Manager) =>
	(await manager.subscribe('example')) as ExampleSubscription;

describe('Web3SubscriptionManager lifecycle', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	describe('provider listener (L-37, L-36)', () => {
		it('attaches the provider listener with the first subscription and detaches it with the last (L-37)', async () => {
			const { provider, manager } = setup();
			expect(provider.listenerCount('message')).toBe(0);

			const first = await subscribe(manager);
			expect(provider.listenerCount('message')).toBe(1);
			const second = await subscribe(manager);
			expect(provider.listenerCount('message')).toBe(1);

			await first.unsubscribe();
			expect(provider.listenerCount('message')).toBe(1);
			await second.unsubscribe();
			expect(provider.listenerCount('message')).toBe(0);
			expect(manager.subscriptions.size).toBe(0);
		});

		it('keeps one listener for many subscriptions and dispatches each notification once (L-37)', async () => {
			const { provider, manager } = setup();
			const subs = [];
			for (let i = 0; i < 50; i += 1) {
				// eslint-disable-next-line no-await-in-loop
				subs.push(await subscribe(manager));
			}
			expect(provider.listenerCount('message')).toBe(1);
			expect(manager.subscriptions.size).toBe(50);

			const received: unknown[] = [];
			subs[7].on('data', item => {
				received.push(item);
			});
			provider.notify(subs[7].id as string, { number: '0x1' });
			expect(received).toEqual([{ number: '0x1' }]);
		});

		it('moves the listener to the new provider only when a subscription is added there (L-36, L-37)', async () => {
			const { provider, requestManager, manager } = setup();
			await subscribe(manager);
			expect(provider.listenerCount('message')).toBe(1);

			const next = new FakeProvider();
			requestManager.setProvider(next as unknown as SupportedProviders);
			await flush();
			expect(provider.listenerCount('message')).toBe(0);
			expect(next.listenerCount('message')).toBe(0);

			await subscribe(manager);
			expect(next.listenerCount('message')).toBe(1);
			expect(provider.listenerCount('message')).toBe(0);
		});

		it('does not attach a listener for a context that never subscribes (L-37)', () => {
			const provider = new FakeProvider();
			const requestManager = new Web3RequestManager(provider as unknown as SupportedProviders);
			const contexts = [];
			for (let i = 0; i < 100; i += 1) {
				contexts.push(
					new Web3Context({ provider: provider as unknown as SupportedProviders, requestManager }),
				);
			}
			expect(contexts).toHaveLength(100);
			expect(provider.listenerCount('message')).toBe(0);
		});
	});

	describe('provider change with live subscriptions (M-7f)', () => {
		// jest-circus reports an unhandled rejection raised while a test runs as a failure of
		// that test, so this test fails on its own when the refusal is left unhandled.
		it('does not produce an unhandled rejection when the old provider refuses qrl_unsubscribe (M-7f)', async () => {
			const { provider, requestManager, manager } = setup();
			const sub = await subscribe(manager);
			provider.failUnsubscribe = true;

			requestManager.setProvider(new FakeProvider() as unknown as SupportedProviders);
			await flush();

			expect(provider.sent).toContain('qrl_unsubscribe');
			expect(sub.id).toBeUndefined();
			expect(manager.subscriptions.size).toBe(0);
			expect(provider.listenerCount('message')).toBe(0);
		});

		it('reports the refusal on the subscription error event when listened (M-7f)', async () => {
			const { provider, requestManager, manager } = setup();
			const sub = await subscribe(manager);
			provider.failUnsubscribe = true;
			const subErrors: unknown[] = [];
			const managerErrors: unknown[] = [];
			sub.on('error', error => {
				subErrors.push(error);
			});
			manager.on('error', error => {
				managerErrors.push(error);
			});

			requestManager.setProvider(new FakeProvider() as unknown as SupportedProviders);
			await flush();

			expect(subErrors).toEqual([expect.any(InvalidResponseError)]);
			expect(managerErrors).toEqual([]);
		});

		it('reports the refusal on the manager error event when the subscription has no listener (M-7f)', async () => {
			const { provider, requestManager, manager } = setup();
			await subscribe(manager);
			provider.failUnsubscribe = true;
			const managerErrors: unknown[] = [];
			manager.on('error', error => {
				managerErrors.push(error);
			});

			requestManager.setProvider(new FakeProvider() as unknown as SupportedProviders);
			await flush();

			expect(managerErrors).toEqual([expect.any(InvalidResponseError)]);
		});

		it('abandons an unanswered qrl_unsubscribe after the timeout and reports it (M-7f)', async () => {
			jest.useFakeTimers();
			const { provider, requestManager, manager } = setup();
			const sub = await subscribe(manager);
			provider.hangUnsubscribe = true;
			const errors: unknown[] = [];
			sub.on('error', error => {
				errors.push(error);
			});

			requestManager.setProvider(new FakeProvider() as unknown as SupportedProviders);
			expect(sub.id).toBeUndefined();
			expect(manager.subscriptions.size).toBe(0);

			await jest.advanceTimersByTimeAsync(UNSUBSCRIBE_ON_PROVIDER_CHANGE_TIMEOUT - 1);
			expect(errors).toEqual([]);
			await jest.advanceTimersByTimeAsync(1);
			expect(errors).toEqual([expect.any(SubscriptionError)]);
			expect((errors[0] as Error).message).toContain('Timed out');
		});

		it('sends the unsubscribe to the provider being replaced, not to the new one (M-7f)', async () => {
			const { provider, requestManager, manager } = setup();
			await subscribe(manager);
			const next = new FakeProvider();

			requestManager.setProvider(next as unknown as SupportedProviders);
			await flush();

			expect(provider.sent).toEqual(['qrl_subscribe', 'qrl_unsubscribe']);
			expect(next.sent).toEqual([]);
		});
	});

	describe('removeSubscription() when the node refuses (M-7f)', () => {
		it('drops the entry and clears the id but still throws the refusal (M-7f)', async () => {
			const { provider, manager } = setup();
			const sub = await subscribe(manager);
			provider.failUnsubscribe = true;

			await expect(sub.unsubscribe()).rejects.toBeInstanceOf(InvalidResponseError);
			expect(sub.id).toBeUndefined();
			expect(manager.subscriptions.size).toBe(0);
			expect(provider.listenerCount('message')).toBe(0);
			// A second call is a no-op instead of "does not exist".
			await expect(sub.unsubscribe()).resolves.toBeUndefined();
		});
	});

	describe('registerPlugin() / link() with live subscriptions (L-36)', () => {
		class Plugin extends Web3PluginBase {
			public pluginNamespace = 'myPlugin';
		}

		it('keeps the subscription and the single provider listener (L-36)', async () => {
			const provider = new FakeProvider();
			const context = new Web3Context<any, typeof subscriptions>({
				provider: provider as unknown as SupportedProviders,
				registeredSubscriptions: subscriptions,
			});
			const sub = await subscribe(context.subscriptionManager);
			const received: unknown[] = [];
			sub.on('data', item => {
				received.push(item);
			});

			context.registerPlugin(new Plugin());
			for (let i = 0; i < 5; i += 1) {
				const plugin = new Plugin();
				plugin.pluginNamespace = `plugin${i}`;
				context.registerPlugin(plugin);
			}
			await flush();

			expect(provider.sent).not.toContain('qrl_unsubscribe');
			expect(sub.id).toBe('0x5ab1');
			expect(context.subscriptionManager.subscriptions.size).toBe(1);
			expect(provider.listenerCount('message')).toBe(1);

			provider.notify('0x5ab1', { number: '0x2' });
			expect(received).toEqual([{ number: '0x2' }]);
		});

		it('setProvider() with the provider already in use keeps the subscription (L-36)', async () => {
			const provider = new FakeProvider();
			const context = new Web3Context<any, typeof subscriptions>({
				provider: provider as unknown as SupportedProviders,
				registeredSubscriptions: subscriptions,
			});
			const sub = await subscribe(context.subscriptionManager);

			context.setProvider(provider as unknown as SupportedProviders);
			await flush();

			expect(provider.sent).not.toContain('qrl_unsubscribe');
			expect(sub.id).toBe('0x5ab1');
			expect(provider.listenerCount('message')).toBe(1);
		});
	});

	describe('subscription id handed out twice by the node (I-14)', () => {
		it('rejects the second subscription and keeps the first intact (I-14)', async () => {
			const { provider, manager } = setup();
			provider.sameId = '0x5a3e';
			const first = await subscribe(manager);

			await expect(manager.subscribe('example')).rejects.toBeInstanceOf(SubscriptionError);
			await expect(manager.subscribe('example')).rejects.toThrow(
				'Subscription with id "0x5a3e" already exists',
			);
			expect(manager.subscriptions.get('0x5a3e')).toBe(first);
			expect(first.id).toBe('0x5a3e');
			expect(provider.sent).not.toContain('qrl_unsubscribe');
			expect(provider.listenerCount('message')).toBe(1);
		});
	});

	describe('messageListener() without a payload (I-14)', () => {
		it.each([undefined, null])('ignores a %p message instead of throwing into the provider (I-14)', async value => {
			const { provider, manager } = setup();
			await subscribe(manager);
			expect(() => provider.emit('message', value)).not.toThrow();
			const exposed = manager as unknown as { messageListener: (data?: unknown) => void };
			expect(() => exposed.messageListener(value)).not.toThrow();
		});
	});

	describe('dispose() (L-37)', () => {
		it('removes the provider and request-manager listeners and drops the subscriptions (L-37)', async () => {
			const { provider, requestManager, manager } = setup();
			const sub = await subscribe(manager);
			expect(requestManager.listenerCount(Web3RequestManagerEvent.BEFORE_PROVIDER_CHANGE)).toBe(1);
			expect(requestManager.listenerCount(Web3RequestManagerEvent.PROVIDER_CHANGED)).toBe(1);

			manager.dispose();

			expect(provider.listenerCount('message')).toBe(0);
			expect(requestManager.listenerCount(Web3RequestManagerEvent.BEFORE_PROVIDER_CHANGE)).toBe(0);
			expect(requestManager.listenerCount(Web3RequestManagerEvent.PROVIDER_CHANGED)).toBe(0);
			expect(manager.subscriptions.size).toBe(0);
			expect(sub.id).toBeUndefined();
		});

		it('tolerates a request manager without off()', () => {
			const requestManager = { send: jest.fn(), on: jest.fn(), provider: { on: jest.fn() } };
			const manager: Manager = new Web3SubscriptionManager(requestManager as never, subscriptions);
			expect(() => manager.dispose()).not.toThrow();
		});
	});
});
