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
import { EventEmitter } from 'events';
import { Web3Context, Web3PromiEvent } from '@theqrl/web3-core';
import { DEFAULT_RETURN_FORMAT, QRLExecutionAPI, TransactionReceipt } from '@theqrl/web3-types';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import { watchTransactionBySubscription } from '../../../src/utils/watch_transaction_by_subscription';
import { SendTransactionEvents } from '../../../src/types';

jest.mock('@theqrl/web3-rpc-methods');

type Confirmation = SendTransactionEvents<typeof DEFAULT_RETURN_FORMAT>['confirmation'];

const header = (number: number) => ({
	number: `0x${number.toString(16)}`,
	parentHash: `0x${number.toString(16).padStart(64, '0')}`,
	hash: `0x${(number + 1).toString(16).padStart(64, '0')}`,
});

describe('watchTransactionBySubscription (L-54)', () => {
	const receipt = {
		transactionHash: `0x${'11'.repeat(32)}`,
		blockHash: `0x${'ab'.repeat(32)}`,
		blockNumber: BigInt(16),
		status: BigInt(1),
	} as unknown as TransactionReceipt;

	let web3Context: Web3Context<QRLExecutionAPI>;
	let subscription: EventEmitter & { id: string };
	let subscribe: jest.SpyInstance;
	let removeSubscription: jest.SpyInstance;
	let promiEvent: Web3PromiEvent<
		TransactionReceipt,
		SendTransactionEvents<typeof DEFAULT_RETURN_FORMAT>
	>;
	let confirmations: bigint[];

	beforeEach(() => {
		jest.useFakeTimers();
		web3Context = new Web3Context<QRLExecutionAPI>({
			request: jest.fn(),
			supportsSubscriptions: () => true,
		} as never);
		web3Context.blockHeaderTimeout = 1;
		web3Context.transactionConfirmationBlocks = 3;
		web3Context.transactionPollingInterval = 100;
		web3Context.transactionReceiptPollingInterval = 100;

		subscription = Object.assign(new EventEmitter(), { id: '0x1' });
		subscribe = jest
			.spyOn(web3Context.subscriptionManager, 'subscribe')
			.mockResolvedValue(subscription as never);
		removeSubscription = jest
			.spyOn(web3Context.subscriptionManager, 'removeSubscription')
			.mockResolvedValue('0x1' as never);
		(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValue({
			hash: `0x${'cd'.repeat(32)}`,
		});

		promiEvent = new Web3PromiEvent(() => undefined);
		confirmations = [];
		promiEvent.on('confirmation', ({ confirmations: count }: Confirmation) => {
			confirmations.push(count as bigint);
		});
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
		jest.resetAllMocks();
	});

	const start = () =>
		watchTransactionBySubscription({
			web3Context,
			transactionReceipt: receipt,
			transactionPromiEvent: promiEvent,
			returnFormat: DEFAULT_RETURN_FORMAT,
		});

	it('counts confirmations from the subscription, stops at the threshold and never starts polling', async () => {
		start();
		await jest.advanceTimersByTimeAsync(1);

		subscription.emit('data', header(0x11));
		subscription.emit('data', header(0x12));
		// Beyond the threshold: the subscription is already dropped.
		subscription.emit('data', header(0x13));
		await jest.advanceTimersByTimeAsync(5_000);

		expect(confirmations).toStrictEqual([BigInt(2), BigInt(3)]);
		expect(subscribe).toHaveBeenCalledTimes(1);
		expect(removeSubscription).toHaveBeenCalledTimes(1);
		expect(qrlRpcMethods.getBlockByNumber).not.toHaveBeenCalled();
	});

	it('falls back to polling after blockHeaderTimeout and ignores subscription data that arrives later', async () => {
		start();
		await jest.advanceTimersByTimeAsync(1);
		await jest.advanceTimersByTimeAsync(1_000);

		expect(removeSubscription).toHaveBeenCalledTimes(1);
		// Late headers must not be counted a second time (the audit saw [1,2,3,4,2,3,4]).
		subscription.emit('data', header(0x11));
		subscription.emit('data', header(0x12));
		await jest.advanceTimersByTimeAsync(1_000);

		expect(confirmations).toStrictEqual([BigInt(2), BigInt(3)]);
		expect(qrlRpcMethods.getBlockByNumber).toHaveBeenCalledTimes(2);
	});

	it('cancels the polling fallback once a header has arrived', async () => {
		start();
		await jest.advanceTimersByTimeAsync(1);
		subscription.emit('data', header(0x11));
		await jest.advanceTimersByTimeAsync(5_000);

		expect(confirmations).toStrictEqual([BigInt(2)]);
		expect(qrlRpcMethods.getBlockByNumber).not.toHaveBeenCalled();
		expect(removeSubscription).not.toHaveBeenCalled();
	});

	it('falls back to polling when the subscription reports an error', async () => {
		start();
		await jest.advanceTimersByTimeAsync(1);
		subscription.emit('error', new Error('subscription lost'));
		await jest.advanceTimersByTimeAsync(1_000);

		expect(removeSubscription).toHaveBeenCalledTimes(1);
		expect(confirmations).toStrictEqual([BigInt(2), BigInt(3)]);
		// The fallback timer was cancelled: no second poller was started.
		expect(qrlRpcMethods.getBlockByNumber).toHaveBeenCalledTimes(2);
	});

	it('falls back to polling when subscribing fails', async () => {
		subscribe.mockRejectedValue(new Error('subscriptions unavailable'));
		start();
		await jest.advanceTimersByTimeAsync(1);
		await jest.advanceTimersByTimeAsync(1_000);

		expect(confirmations).toStrictEqual([BigInt(2), BigInt(3)]);
		expect(removeSubscription).not.toHaveBeenCalled();
	});

	it('drops a subscription that is established after the fallback started', async () => {
		let resolveSubscription!: (value: unknown) => void;
		subscribe.mockReturnValue(
			new Promise(resolve => {
				resolveSubscription = resolve;
			}),
		);
		start();
		await jest.advanceTimersByTimeAsync(1_001);
		resolveSubscription(subscription);
		await jest.advanceTimersByTimeAsync(1);
		subscription.emit('data', header(0x11));
		await jest.advanceTimersByTimeAsync(1_000);

		expect(removeSubscription).toHaveBeenCalledWith(subscription);
		expect(confirmations).toStrictEqual([BigInt(2), BigInt(3)]);
	});
	it('waits through a missing receipt, follows reinclusion and never repeats confirmation one', async () => {
		const moved = { ...receipt, blockNumber: '0x11', blockHash: `0x${'cd'.repeat(32)}` };

		(qrlRpcMethods.getTransactionReceipt as jest.Mock)
			// eslint-disable-next-line no-null/no-null -- transient receipt disappearance
			.mockResolvedValueOnce(null)
			.mockResolvedValue(moved);
		const errors = jest.fn();
		promiEvent.on('error', errors);
		start();
		await jest.advanceTimersByTimeAsync(1);
		subscription.emit('data', header(0x11));
		await jest.advanceTimersByTimeAsync(1);
		expect(removeSubscription).not.toHaveBeenCalled();
		subscription.emit('data', header(0x12));
		await jest.advanceTimersByTimeAsync(1);
		expect(confirmations).toEqual([BigInt(2)]);
		expect(errors).not.toHaveBeenCalled();
	});
	it('reports a changed execution status after a reorg and releases the subscription', async () => {
		(qrlRpcMethods.getTransactionReceipt as jest.Mock).mockResolvedValue({
			...receipt,
			blockNumber: '0x11',
			blockHash: `0x${'cd'.repeat(32)}`,
			status: '0x0',
		});
		const errors = jest.fn();
		promiEvent.on('error', errors);
		start();
		await jest.advanceTimersByTimeAsync(1);
		subscription.emit('data', header(0x12));
		await jest.advanceTimersByTimeAsync(1);
		expect(confirmations).toEqual([]);
		expect(errors).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining('status changed') }),
		);
		expect(removeSubscription).toHaveBeenCalledTimes(1);
	});
});
