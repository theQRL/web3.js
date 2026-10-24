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

import { Web3SubscriptionManager } from '../../src';
import { ExampleSubscription } from './fixtures/example_subscription';

const subscriptions = { example: ExampleSubscription as never };

describe('Web3Subscription', () => {
	let requestManager: any;
	let subscriptionManager: Web3SubscriptionManager<any, any>;
	let sub: ExampleSubscription;

	beforeEach(() => {
		requestManager = {
			send: jest.fn().mockImplementation(async () => {
				return '0x5ab1d';
			}),
			on: jest.fn(),
			provider: { on: jest.fn(), removeListener: jest.fn(), request: jest.fn() },
		};
		subscriptionManager = new Web3SubscriptionManager(requestManager, subscriptions);
	});

	describe('subscriptionManager', () => {
		it('subscriptionManager is accessible in inherited subscription', async () => {
			class InheritedExampleSubscription extends ExampleSubscription {
				public verifyAccessToSubscriptionManager(
					originalSubscriptionManager: Web3SubscriptionManager,
				) {
					expect(this.subscriptionManager).toBe(originalSubscriptionManager);
				}
			}
			new InheritedExampleSubscription(
				{ param1: 'value' },
				{ subscriptionManager },
			).verifyAccessToSubscriptionManager(subscriptionManager);
		});
	});

	describe('subscribe', () => {
		beforeEach(() => {
			sub = new ExampleSubscription({ param1: 'value' }, { subscriptionManager });
		});
		it('should invoke request manager for subscription', async () => {
			await sub.subscribe();

			expect(requestManager.send).toHaveBeenCalledTimes(1);
			expect(requestManager.send).toHaveBeenCalledWith({
				method: 'qrl_subscribe',
				params: ['newHeads'],
			});
		});

		it('should set correct subscription id', async () => {
			expect(sub.id).toBeUndefined();
			await sub.subscribe();
			expect(sub.id).toBe('0x5ab1d');
		});

		it('should start listening to the "message" event', async () => {
			await sub.subscribe();

			// `message` for the notifications, `disconnect`/`connect` to re-subscribe after a
			// reconnect (P4-L-3).
			expect(requestManager.provider.on).toHaveBeenCalledTimes(3);
			expect(requestManager.provider.on).toHaveBeenCalledWith(
				'message',
				expect.any(Function),
			);
			expect(requestManager.provider.on).toHaveBeenCalledWith(
				'disconnect',
				expect.any(Function),
			);
			expect(requestManager.provider.on).toHaveBeenCalledWith(
				'connect',
				expect.any(Function),
			);
		});
	});

	describe('unsubscribe', () => {
		beforeEach(() => {
			sub = new ExampleSubscription({ param1: 'value' }, { subscriptionManager });
			sub['_id'] = '0x5ab1d';
			subscriptionManager.subscriptions.set('0x5ab1d', sub);
		});

		it('should invoke request manager to unsubscribe', async () => {
			await sub.unsubscribe();

			expect(requestManager.send).toHaveBeenCalledTimes(1);
			expect(requestManager.send).toHaveBeenCalledWith({
				method: 'qrl_unsubscribe',
				params: ['0x5ab1d'],
			});
		});

		it('should remove the subscription id', async () => {
			expect(sub.id).toBe('0x5ab1d');
			await sub.unsubscribe();
			expect(sub.id).toBeUndefined();
		});
	});

	describe('formatting failures', () => {
		it('reports a notification it cannot format on its own error event', () => {
			class ThrowingSubscription extends ExampleSubscription {
				// eslint-disable-next-line class-methods-use-this
				protected formatSubscriptionResult(): never {
					throw new Error('undecodable');
				}
			}
			const subscription = new ThrowingSubscription(
				{ param1: 'value' },
				{ subscriptionManager },
			);
			const errors: unknown[] = [];
			const data: unknown[] = [];
			subscription.on('error', error => {
				errors.push(error);
			});
			subscription.on('data', item => {
				data.push(item);
			});

			subscription.processSubscriptionData({
				jsonrpc: '2.0',
				method: 'qrl_subscription',
				params: { subscription: '0x5ab1d', result: { foo: 1 } },
			} as never);

			expect(data).toEqual([]);
			expect(errors).toHaveLength(1);
			expect((errors[0] as Error).message).toBe('undecodable');
		});
	});
});
