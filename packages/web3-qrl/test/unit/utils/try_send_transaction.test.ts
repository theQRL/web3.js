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
import { Web3Context } from '@theqrl/web3-core';
import { TransactionSendTimeoutError } from '@theqrl/web3-errors';
import { trySendTransaction } from '../../../src/utils/try_send_transaction';

describe('broadcast deadline', () => {
	const hash = `0x${'ab'.repeat(32)}`;
	let context: Web3Context;
	beforeEach(() => {
		jest.useFakeTimers();
		context = new Web3Context({ request: jest.fn() } as never);
		context.transactionSendTimeout = 1000;
		context.transactionBlockTimeout = 1;
	});
	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	it.each([false, true])(
		'never arms a block watcher during an accepted broadcast (subscriptions=%s)',
		async subscription => {
			context.enableExperimentalFeatures = {
				...context.enableExperimentalFeatures,
				useSubscriptionWhenCheckingBlockTimeout: subscription,
			};
			const subscribe = jest.spyOn(context.subscriptionManager, 'subscribe');
			let complete!: (value: string) => void;
			const send = jest.fn(
				async () =>
					new Promise<string>(resolve => {
						complete = resolve;
					}),
			);
			const pending = trySendTransaction(context, send, hash);
			await jest.advanceTimersByTimeAsync(500);
			expect(
				(context.requestManager.provider as { request: jest.Mock }).request,
			).not.toHaveBeenCalled();
			expect(subscribe).not.toHaveBeenCalled();
			complete(hash);
			await expect(pending).resolves.toBe(hash);
			expect(send).toHaveBeenCalledTimes(1);
			expect(jest.getTimerCount()).toBe(0);
		},
	);

	it.each(['resolve', 'reject'])(
		'bounds an unanswered broadcast and handles late %s',
		async mode => {
			let resolveSend!: (value: string) => void;
			let rejectSend!: (reason: Error) => void;
			const pending = trySendTransaction(
				context,
				async () =>
					new Promise<string>((resolve, reject) => {
						resolveSend = resolve;
						rejectSend = reject;
					}),
				hash,
			).catch((error: unknown) => error);
			await jest.advanceTimersByTimeAsync(1000);
			await expect(pending).resolves.toBeInstanceOf(TransactionSendTimeoutError);
			if (mode === 'resolve') resolveSend(hash);
			else rejectSend(new Error('late'));
			await jest.advanceTimersByTimeAsync(5000);
			expect(jest.getTimerCount()).toBe(0);
		},
	);

	it.each([false, true])(
		'clears the deadline on send rejection (synchronous=%s)',
		async synchronous => {
			const error = new Error('send failed');
			// eslint-disable-next-line @typescript-eslint/promise-function-async -- test a synchronous throw as well as a rejected promise
			const send = () => {
				if (synchronous) throw error;
				return Promise.reject(error);
			};
			await expect(trySendTransaction(context, send, hash)).rejects.toBe(error);
			expect(jest.getTimerCount()).toBe(0);
		},
	);
});
