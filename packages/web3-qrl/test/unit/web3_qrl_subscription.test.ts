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
import { Web3SubscriptionManager } from '@theqrl/web3-core';
import { InvalidResponseError, SubscriptionError } from '@theqrl/web3-errors';
import { Web3BaseProvider } from '@theqrl/web3-types';
import * as rpcMethodWrappers from '../../src/rpc_method_wrappers';
import { LogsSubscription, SyncingSubscription } from '../../src';
import { Web3QRL } from '../../src/web3_qrl';
import { mockRpcResponse as mockGetLogsRpcResponse } from './rpc_method_wrappers/fixtures/get_logs';
import { sleep } from '../shared_fixtures/utils';

jest.mock('../../src/rpc_method_wrappers');

describe('Web3QRL subscribe and clear subscriptions', () => {
	let web3QRL: Web3QRL;

	it('should return the subscription data provided by the Subscription Manager', async () => {
		const requestManager = { send: jest.fn(), on: jest.fn(), provider: { on: jest.fn() } };

		const subManager = new Web3SubscriptionManager(requestManager as any, undefined as any);
		const dummyLogs = { logs: { test1: 'test1' } };

		jest.spyOn(subManager, 'subscribe').mockResolvedValueOnce(dummyLogs);
		web3QRL = new Web3QRL({
			provider: {
				on: jest.fn(),
			} as unknown as Web3BaseProvider,
			subscriptionManager: subManager,
		});

		const logs = await web3QRL.subscribe('logs');
		expect(logs).toStrictEqual(dummyLogs);
	});

	it('should call `_processSubscriptionResult` when the logs are of type LogsSubscription and the `fromBlock` is provided', async () => {
		const requestManager = { send: jest.fn(), on: jest.fn(), provider: { on: jest.fn() } };
		const subManager = new Web3SubscriptionManager(requestManager as any, undefined as any);

		const dummyLogs = new LogsSubscription({}, { subscriptionManager: subManager });
		jest.spyOn(subManager, 'subscribe').mockResolvedValueOnce(dummyLogs);
		jest.spyOn(rpcMethodWrappers, 'getLogs').mockResolvedValueOnce(mockGetLogsRpcResponse);

		web3QRL = new Web3QRL({
			provider: {
				on: jest.fn(),
			} as unknown as Web3BaseProvider,
			subscriptionManager: subManager,
		});
		jest.spyOn(dummyLogs, '_processSubscriptionResult');

		const logs = await web3QRL.subscribe('logs', {
			fromBlock: 0,
		});
		await sleep(100);

		expect(logs).toStrictEqual(dummyLogs);
		expect(dummyLogs._processSubscriptionResult).toHaveBeenCalled();
	});

	it('should be able to clear subscriptions', async () => {
		const requestManager = { send: jest.fn(), on: jest.fn(), provider: { on: jest.fn() } };
		const subManager = new Web3SubscriptionManager(requestManager as any, undefined as any);

		jest.spyOn(subManager, 'unsubscribe');

		web3QRL = new Web3QRL({
			provider: {
				on: jest.fn(),
			} as unknown as Web3BaseProvider,
			subscriptionManager: subManager,
		});

		await web3QRL.clearSubscriptions();

		expect(subManager.unsubscribe).toHaveBeenCalledWith(undefined);
	});

	it('should be able to clear subscriptions and pass `shouldClearSubscription` when passing `notClearSyncing`', async () => {
		const requestManager = { send: jest.fn(), on: jest.fn(), provider: { on: jest.fn() } };
		const subManager = new Web3SubscriptionManager(requestManager as any, undefined as any);

		jest.spyOn(subManager, 'unsubscribe');

		web3QRL = new Web3QRL({
			provider: {
				on: jest.fn(),
			} as unknown as Web3BaseProvider,
			subscriptionManager: subManager,
		});

		await web3QRL.clearSubscriptions(true);

		expect(subManager.unsubscribe).toHaveBeenCalledWith(Web3QRL['shouldClearSubscription']);
	});

	const makeSubscriptionManager = (): Web3SubscriptionManager => {
		const requestManager = { send: jest.fn(), on: jest.fn(), provider: { on: jest.fn() } };
		return new Web3SubscriptionManager(
			requestManager as never,
			{},
		) as unknown as Web3SubscriptionManager;
	};

	describe('logs backfill failures (M-7d)', () => {

		const backfillError = () =>
			new InvalidResponseError({
				jsonrpc: '2.0',
				id: 1,
				error: { code: -32000, message: 'query timeout exceeded' },
			});

		let unhandledRejections: unknown[];
		const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);

		beforeEach(() => {
			unhandledRejections = [];
			process.on('unhandledRejection', onUnhandledRejection);
		});

		afterEach(() => {
			process.off('unhandledRejection', onUnhandledRejection);
		});

		it('reports a failed backfill on the error event when a listener is attached', async () => {
			const subManager = makeSubscriptionManager();
			const subscription = new LogsSubscription({}, { subscriptionManager: subManager });
			jest.spyOn(subManager, 'subscribe').mockResolvedValueOnce(subscription as never);
			const error = backfillError();
			jest.spyOn(rpcMethodWrappers, 'getLogs').mockRejectedValueOnce(error);
			web3QRL = new Web3QRL({
				provider: { on: jest.fn() } as unknown as Web3BaseProvider,
				subscriptionManager: subManager,
			});

			const logs = await web3QRL.subscribe('logs', { fromBlock: 0 });
			const errorListener = jest.fn<void, [Error]>();
			logs.on('error', errorListener);
			await sleep(50);

			expect(errorListener).toHaveBeenCalledWith(error);
			expect(unhandledRejections).toStrictEqual([]);
		});

		it('warns about a failed backfill when no error listener is attached', async () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
			const subManager = makeSubscriptionManager();
			const subscription = new LogsSubscription({}, { subscriptionManager: subManager });
			jest.spyOn(subManager, 'subscribe').mockResolvedValueOnce(subscription as never);
			const error = backfillError();
			jest.spyOn(rpcMethodWrappers, 'getLogs').mockRejectedValueOnce(error);
			web3QRL = new Web3QRL({
				provider: { on: jest.fn() } as unknown as Web3BaseProvider,
				subscriptionManager: subManager,
			});

			const logs = await web3QRL.subscribe('logs', { fromBlock: 0 });
			logs.on('data', () => undefined);
			await sleep(50);

			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0][1]).toBe(error);
			expect(unhandledRejections).toStrictEqual([]);
		});
	});

	describe('SyncingSubscription notifications (L-53)', () => {
		const makeSubscription = () =>
			new SyncingSubscription(undefined, { subscriptionManager: makeSubscriptionManager() });

		it('emits changed for a boolean and changed plus data for a status object', () => {
			const subscription = makeSubscription();
			const changed = jest.fn();
			const data = jest.fn();
			const error = jest.fn();
			subscription.on('changed', changed);
			subscription.on('data', data);
			subscription.on('error', error);

			subscription._processSubscriptionResult(true);
			subscription._processSubscriptionResult({
				syncing: true,
				status: { StartingBlock: '0x1', CurrentBlock: '0x2', HighestBlock: '0x3' },
			});

			expect(changed.mock.calls).toStrictEqual([[true], [true]]);
			expect(data).toHaveBeenCalledWith({
				startingBlock: '0x1',
				currentBlock: '0x2',
				highestBlock: '0x3',
			});
			expect(error).not.toHaveBeenCalled();
		});

		it.each([
			// eslint-disable-next-line no-null/no-null
			[{ syncing: true, status: null }],
			[{ syncing: true }],
			// eslint-disable-next-line no-null/no-null
			[null],
			['abc'],
			[42],
			[{ syncing: 'yes', status: 'nope' }],
		])('reports the malformed notification %p on the error event instead of throwing', notification => {
			const subscription = makeSubscription();
			const changed = jest.fn();
			const data = jest.fn();
			const error = jest.fn<void, [Error]>();
			subscription.on('changed', changed);
			subscription.on('data', data);
			subscription.on('error', error);

			expect(() => subscription._processSubscriptionResult(notification)).not.toThrow();

			expect(error).toHaveBeenCalledTimes(1);
			expect(error.mock.calls[0][0]).toBeInstanceOf(SubscriptionError);
			expect(changed).not.toHaveBeenCalled();
			expect(data).not.toHaveBeenCalled();
		});

		it('warns instead of throwing when no error listener is attached', () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
			const subscription = makeSubscription();

			expect(() => subscription._processSubscriptionResult('abc')).not.toThrow();

			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0][1]).toBeInstanceOf(SubscriptionError);
		});
	});

	describe('LogsSubscription parameters (I-12)', () => {
		const address = `Q${'00'.repeat(64)}`;

		it.each([
			[1, '0x1'],
			[BigInt(16), '0x10'],
			['5', '0x5'],
			['0x10', '0x10'],
			['latest', 'latest'],
		])('sends fromBlock %p to the node as %p', (fromBlock, expected) => {
			const subscription = new LogsSubscription(
				{ fromBlock, address },
				{ subscriptionManager: makeSubscriptionManager() },
			);

			expect(subscription['_buildSubscriptionParams']()).toStrictEqual([
				'logs',
				{ fromBlock: expected, address },
			]);
		});
	});
});
