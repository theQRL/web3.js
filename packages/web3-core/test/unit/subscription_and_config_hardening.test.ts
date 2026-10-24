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
import {
	ContractExecutionError,
	InvalidMethodParamsError,
	InvalidResponseError,
	MethodNotFoundError,
	SubscriptionError,
} from '@theqrl/web3-errors';
import { Web3BatchRequest } from '../../src/web3_batch_request';
import { Web3Context } from '../../src/web3_context';
import { Web3RequestManager } from '../../src/web3_request_manager';
import { Web3SubscriptionManager } from '../../src/web3_subscription_manager';
import { ExampleSubscription } from './fixtures/example_subscription';

/* eslint-disable no-null/no-null */

const NO_RESULT = Symbol('no forced subscribe result');

/** An EIP-1193 style provider with subscription support and a few knobs for the races below. */
class FakeProvider extends EventEmitter {
	public sent: JsonRpcRequest[] = [];
	public subscribeResult: unknown = NO_RESULT;
	public subscribeDelayMs = 0;
	public holdUnsubscribe = false;
	public heldUnsubscribes: (() => void)[] = [];
	/** What `getStatus()` reports; the manager reads it when it attaches its listeners. */
	public status = 'connected';
	private _counter: number;

	public constructor(counterStart = 0) {
		super();
		this._counter = counterStart;
	}

	// eslint-disable-next-line class-methods-use-this
	public supportsSubscriptions() {
		return true;
	}

	public getStatus() {
		return this.status;
	}

	public async request(payload: JsonRpcRequest): Promise<unknown> {
		this.sent.push(payload);
		if (payload.method === 'qrl_subscribe') {
			this._counter += 1;
			if (this.subscribeDelayMs > 0) {
				await new Promise(resolve => {
					setTimeout(resolve, this.subscribeDelayMs);
				});
			}
			return {
				jsonrpc: '2.0',
				id: payload.id,
				result:
					this.subscribeResult === NO_RESULT ? `0x5ab${this._counter}` : this.subscribeResult,
			};
		}
		if (payload.method === 'qrl_unsubscribe') {
			if (this.holdUnsubscribe) {
				await new Promise<void>(resolve => {
					this.heldUnsubscribes.push(resolve);
				});
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

	public methods() {
		return this.sent.map(payload => payload.method);
	}
}

const subscriptions = { example: ExampleSubscription as never };
type Manager = Web3SubscriptionManager<any, any>;

const flush = async () => {
	await new Promise(resolve => setImmediate(resolve));
	await new Promise(resolve => setImmediate(resolve));
};

const setup = (counterStart = 0) => {
	const provider = new FakeProvider(counterStart);
	const requestManager = new Web3RequestManager(provider as unknown as SupportedProviders);
	const manager: Manager = new Web3SubscriptionManager(requestManager as never, subscriptions);
	return { provider, requestManager, manager };
};

const subscribe = async (manager: Manager) =>
	(await manager.subscribe('example')) as ExampleSubscription;

describe('subscription manager and configuration hardening (pass-4 audit)', () => {
	describe('hostile qrl_subscribe replies (P4-M-1)', () => {
		it.each([
			['an object with a non-callable toString', { toString: 1 }],
			['a number', 7],
			['a non-hex string', 'sub-1'],
			['an empty string', ''],
			['null', null],
		])('rejects %s as a subscription id and registers nothing', async (_, result) => {
			const { provider, manager } = setup();
			provider.subscribeResult = result;

			await expect(manager.subscribe('example')).rejects.toBeInstanceOf(SubscriptionError);
			expect(manager.subscriptions.size).toBe(0);
			expect(provider.listenerCount('message')).toBe(0);
		});

		it('survives a provider change after a hostile reply without an unhandled rejection', async () => {
			const { provider, requestManager, manager } = setup();
			provider.subscribeResult = { toString: 1 };
			const unhandled: unknown[] = [];
			const onUnhandled = (reason: unknown) => {
				unhandled.push(reason);
			};
			process.on('unhandledRejection', onUnhandled);
			try {
				await expect(manager.subscribe('example')).rejects.toBeInstanceOf(
					SubscriptionError,
				);
				expect(() => requestManager.setProvider(new FakeProvider() as never)).not.toThrow();
				await flush();
				expect(unhandled).toEqual([]);
			} finally {
				process.off('unhandledRejection', onUnhandled);
			}
		});

		it('ignores a legacy notification whose id has a non-callable toString', async () => {
			const { provider, manager } = setup();
			await subscribe(manager);
			expect(() =>
				provider.emit('message', { id: { toString: 1 }, result: {} } as never),
			).not.toThrow();
		});
	});

	describe('subscribe racing an unsubscribe (P4-M-4)', () => {
		it('keeps the provider listener for a subscribe that is in flight while the last subscription is removed', async () => {
			const { provider, manager } = setup();
			const first = await subscribe(manager);

			provider.subscribeDelayMs = 30;
			const pending = manager.subscribe('example');
			await first.unsubscribe();
			const second = (await pending) as ExampleSubscription;

			expect(manager.subscriptions.size).toBe(1);
			expect(provider.listenerCount('message')).toBe(1);

			const received: unknown[] = [];
			second.on('data', item => {
				received.push(item);
			});
			provider.notify(second.id as string, { foo: 1 });
			expect(received).toEqual([{ foo: 1 }]);
		});

		it('keeps the listener when a concurrent subscribe fails while another is pending', async () => {
			const { provider, manager } = setup();
			provider.subscribeDelayMs = 30;
			const pendingOk = manager.subscribe('example');
			provider.subscribeResult = 'not-hex';
			const pendingBad = manager.subscribe('example');
			provider.subscribeResult = NO_RESULT;

			await expect(pendingBad).rejects.toBeInstanceOf(SubscriptionError);
			const ok = (await pendingOk) as ExampleSubscription;
			expect(provider.listenerCount('message')).toBe(1);

			const received: unknown[] = [];
			ok.on('data', item => {
				received.push(item);
			});
			provider.notify(ok.id as string, 'x');
			expect(received).toEqual(['x']);
		});
	});

	describe('provider switch during an in-flight subscribe (P4-L-1)', () => {
		it('rejects the subscription instead of registering a zombie', async () => {
			const { provider, requestManager, manager } = setup();
			provider.subscribeDelayMs = 30;
			const pending = manager.subscribe('example');
			const other = new FakeProvider(10);
			requestManager.setProvider(other as never);

			await expect(pending).rejects.toThrow('provider was replaced');
			expect(manager.subscriptions.size).toBe(0);
			expect(other.listenerCount('message')).toBe(0);
		});
	});

	describe('late qrl_unsubscribe acknowledgement (P4-L-2)', () => {
		it('does not wipe the id of a subscription re-subscribed on the new provider', async () => {
			const { provider, requestManager, manager } = setup();
			const sub = await subscribe(manager);
			provider.holdUnsubscribe = true;

			const other = new FakeProvider(10);
			requestManager.setProvider(other as never);
			await sub.subscribe();
			expect(sub.id).toBe('0x5ab11');

			// The replaced provider finally acknowledges the old unsubscribe.
			provider.heldUnsubscribes.forEach(resolve => resolve());
			await flush();

			expect(sub.id).toBe('0x5ab11');
			expect(manager.subscriptions.get('0x5ab11')).toBe(sub);
			await sub.unsubscribe();
			expect(other.methods()).toContain('qrl_unsubscribe');
			expect(manager.subscriptions.size).toBe(0);
		});
	});

	describe('reconnect (P4-L-3)', () => {
		it('re-subscribes live subscriptions when the provider reconnects and re-keys them', async () => {
			const { provider, manager } = setup();
			const sub = await subscribe(manager);
			expect(sub.id).toBe('0x5ab1');

			provider.emit('disconnect', undefined as never);
			provider.emit('connect', undefined as never);
			await flush();

			expect(sub.id).toBe('0x5ab2');
			expect([...manager.subscriptions.keys()]).toEqual(['0x5ab2']);
			expect(provider.methods().filter(m => m === 'qrl_subscribe')).toHaveLength(2);

			const received: unknown[] = [];
			sub.on('data', item => {
				received.push(item);
			});
			provider.notify('0x5ab2', 'after-reconnect');
			expect(received).toEqual(['after-reconnect']);
		});

		it('re-subscribes on a connect event without a prior disconnect when the provider was already connected (auto-reconnect)', async () => {
			// The socket providers re-open a dropped socket without emitting `disconnect`.
			const { provider, manager } = setup();
			const sub = await subscribe(manager);
			expect(sub.id).toBe('0x5ab1');

			provider.emit('connect', undefined as never);
			await flush();

			expect(sub.id).toBe('0x5ab2');
			expect([...manager.subscriptions.keys()]).toEqual(['0x5ab2']);
			expect(provider.methods().filter(m => m === 'qrl_subscribe')).toHaveLength(2);
			// The old id is released best-effort (a real reconnect makes this a harmless error reply).
			expect(provider.sent.filter(p => p.method === 'qrl_unsubscribe').map(p => p.params)).toEqual([
				['0x5ab1'],
			]);
		});

		it('does nothing on the connect event that completes the initial connection', async () => {
			const { provider, manager } = setup();
			provider.status = 'connecting';
			await subscribe(manager);
			provider.emit('connect', undefined as never);
			await flush();
			expect(provider.methods().filter(m => m === 'qrl_subscribe')).toHaveLength(1);
			expect(provider.methods()).not.toContain('qrl_unsubscribe');
		});

		it('treats a later connect as a reconnection once the initial connection completed', async () => {
			const { provider, manager } = setup();
			provider.status = 'connecting';
			const sub = await subscribe(manager);
			provider.emit('connect', undefined as never);
			await flush();
			provider.emit('connect', undefined as never);
			await flush();
			expect(sub.id).toBe('0x5ab2');
			expect(provider.methods().filter(m => m === 'qrl_subscribe')).toHaveLength(2);
		});

		it('resubscribe() tolerates a node that no longer knows the id', async () => {
			const { provider, manager } = setup();
			const sub = await subscribe(manager);
			provider.request = async (payload: JsonRpcRequest) => {
				provider.sent.push(payload);
				if (payload.method === 'qrl_unsubscribe') {
					return {
						jsonrpc: '2.0',
						id: payload.id,
						error: { code: -32000, message: 'subscription not found' },
					};
				}
				return { jsonrpc: '2.0', id: payload.id, result: '0x5abff' };
			};
			await expect(sub.resubscribe()).resolves.toBeUndefined();
			expect(sub.id).toBe('0x5abff');
			expect(manager.subscriptions.get('0x5abff')).toBe(sub);
		});
	});

	describe('useRpcCallSpecification wiring (P4-L-4)', () => {
		const paramsError = { code: -32602, message: 'invalid params' };
		const providerWith = () =>
			({
				// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction marks an EIP-1193 provider
				request: async (payload: { id: unknown }) => ({
					jsonrpc: '2.0',
					id: payload.id,
					error: paramsError,
				}),
			}) as unknown as SupportedProviders;

		it('passes the flag from the config to the request manager', async () => {
			const context = new Web3Context({
				provider: providerWith(),
				config: {
					enableExperimentalFeatures: {
						useRpcCallSpecification: true,
						useSubscriptionWhenCheckingBlockTimeout: false,
					},
				},
			});
			expect(context.requestManager.useRpcCallSpecification).toBe(true);
			const error = await context.requestManager
				.send({ method: 'qrl_blockNumber', params: [] })
				.catch((e: unknown) => e);
			expect((error as { code: number }).code).toBe(-32602);
		});

		it('follows a later change of the flag', async () => {
			const context = new Web3Context({
				provider: providerWith(),
				config: {
					enableExperimentalFeatures: {
						useRpcCallSpecification: false,
						useSubscriptionWhenCheckingBlockTimeout: true,
					},
				},
			});
			expect(context.requestManager.useRpcCallSpecification).toBe(false);
			const before = await context.requestManager
				.send({ method: 'qrl_blockNumber', params: [] })
				.catch((e: unknown) => e);
			expect(before).toBeInstanceOf(InvalidResponseError);

			context.setConfig({
				enableExperimentalFeatures: {
					useRpcCallSpecification: true,
					useSubscriptionWhenCheckingBlockTimeout: false,
				},
			});
			expect(context.requestManager.useRpcCallSpecification).toBe(true);
			const after = await context.requestManager
				.send({ method: 'qrl_blockNumber', params: [] })
				.catch((e: unknown) => e);
			expect((after as { code: number }).code).toBe(-32602);
		});
	});

	describe('timer bounds in the configuration (P4-L-5)', () => {
		it('rejects millisecond values a timer cannot hold and accepts the maximum', () => {
			const context = new Web3Context();
			expect(() => {
				context.transactionPollingTimeout = Number.MAX_SAFE_INTEGER;
			}).toThrow(InvalidMethodParamsError);
			expect(() => {
				context.transactionPollingTimeout = 2147483647;
			}).not.toThrow();
			expect(() => {
				context.blockHeaderTimeout = 2147484;
			}).toThrow(InvalidMethodParamsError);
			expect(() => {
				context.blockHeaderTimeout = 2147483;
			}).not.toThrow();
		});
	});

	describe('setConfig key order (P4-L-6)', () => {
		it('lets an explicit receipt or confirmation interval win over transactionPollingInterval', () => {
			const context = new Web3Context({
				config: { transactionReceiptPollingInterval: 5000, transactionPollingInterval: 1000 },
			});
			expect(context.transactionReceiptPollingInterval).toBe(5000);
			expect(context.transactionPollingInterval).toBe(1000);

			context.setConfig({
				transactionConfirmationPollingInterval: 30000,
				transactionPollingInterval: 2000,
			});
			expect(context.transactionConfirmationPollingInterval).toBe(30000);
			expect(context.transactionPollingInterval).toBe(2000);
		});
	});

	describe('max listeners threshold', () => {
		it('applies the configured threshold from construction', () => {
			expect(new Web3Context().getMaxListeners()).toBe(100);
			expect(
				new Web3Context({ config: { maxListenersWarningThreshold: 3 } }).getMaxListeners(),
			).toBe(3);
		});
	});

	describe('batch replies delivered through a legacy error path (P4-L-7)', () => {
		const batchReply = (payload: JsonRpcRequest[]) => [
			{ jsonrpc: '2.0', id: payload[0].id, result: '0x1' },
			{ jsonrpc: '2.0', id: payload[1].id, error: { code: -32601, message: 'not found' } },
		];

		it.each([
			[
				'legacy send callback',
				() => ({
					send: (payload: JsonRpcRequest[], cb: (err: unknown, res?: unknown) => void) => {
						cb(batchReply(payload));
					},
				}),
			],
			[
				'legacy request callback',
				() => ({
					request: (
						payload: JsonRpcRequest[],
						cb: (err: unknown, res?: unknown) => void,
					) => {
						cb(batchReply(payload));
					},
				}),
			],
			[
				'legacy request returning a rejected promise',
				() => ({
					// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/no-misused-promises, @typescript-eslint/prefer-promise-reject-errors -- a legacy (non-async) request function rejecting with the raw reply is the shape under test
					request: (payload: JsonRpcRequest[]) => Promise.reject(batchReply(payload)),
				}),
			],
		])('%s: execute() resolves with the array and reports the error per entry', async (_, make) => {
			const requestManager = new Web3RequestManager(make() as unknown as SupportedProviders);
			const batch = new Web3BatchRequest(requestManager);
			const first = batch.add({ method: 'qrl_blockNumber', params: [] });
			const second = batch.add({ method: 'qrl_nope', params: [] });

			const replies = await batch.execute();
			expect(Array.isArray(replies)).toBe(true);
			expect(replies).toHaveLength(2);
			await expect(first).resolves.toBe('0x1');
			await expect(second).rejects.toBeInstanceOf(MethodNotFoundError);
		});
	});

	describe('id-mismatched replies are not reverts (P4-L-8)', () => {
		it.each([
			[
				'EIP-1193',
				() => ({
					// eslint-disable-next-line @typescript-eslint/require-await
					request: async () => ({
						jsonrpc: '2.0',
						id: 'not-the-request-id',
						error: { message: 'execution reverted', data: '0x08c379a0deadbeef' },
					}),
				}),
			],
			[
				'sendAsync',
				() => ({
					// eslint-disable-next-line @typescript-eslint/promise-function-async -- a non-async function is what the legacy detection expects
					sendAsync: () =>
						Promise.resolve({
							jsonrpc: '2.0',
							id: 'not-the-request-id',
							error: { message: 'execution reverted', data: '0x08c379a0deadbeef' },
						}),
				}),
			],
			[
				'legacy request returning a promise',
				() => ({
					// eslint-disable-next-line @typescript-eslint/promise-function-async -- a non-async request function is the legacy shape under test
					request: () =>
						Promise.resolve({
							jsonrpc: '2.0',
							id: 'not-the-request-id',
							error: { message: 'execution reverted', data: '0x08c379a0deadbeef' },
						}),
				}),
			],
		])('%s: rejects with InvalidResponseError', async (_, make) => {
			const requestManager = new Web3RequestManager(make() as unknown as SupportedProviders);
			const error = await requestManager
				.send({ method: 'qrl_call', params: [] })
				.catch((e: unknown) => e);
			expect(error).toBeInstanceOf(InvalidResponseError);
			expect(error).not.toBeInstanceOf(ContractExecutionError);
		});

		it('still maps a revert reply with the right id to ContractExecutionError', async () => {
			const provider = {
				// eslint-disable-next-line @typescript-eslint/require-await
				request: async (payload: { id: unknown }) => ({
					jsonrpc: '2.0',
					id: payload.id,
					error: { code: 3, message: 'execution reverted', data: '0x08c379a0deadbeef' },
				}),
			};
			const requestManager = new Web3RequestManager(provider as unknown as SupportedProviders);
			const error = await requestManager
				.send({ method: 'qrl_call', params: [] })
				.catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ContractExecutionError);
		});
	});
});
