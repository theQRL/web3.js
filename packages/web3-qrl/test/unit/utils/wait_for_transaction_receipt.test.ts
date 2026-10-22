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
import { Web3Context } from '@theqrl/web3-core';
import { TransactionBlockTimeoutError, TransactionPollingTimeoutError } from '@theqrl/web3-errors';
import { DEFAULT_RETURN_FORMAT, QRLExecutionAPI, Web3BaseProvider } from '@theqrl/web3-types';
import * as rpcMethodWrappersReaders from '../../../src/utils/rpc_method_wrappers_readers';
import { waitForTransactionReceipt } from '../../../src/utils/wait_for_transaction_receipt';

jest.mock('../../../src/utils/rpc_method_wrappers_readers');

describe('waitForTransactionReceipt', () => {
	const transactionHash = `0x${'ab'.repeat(32)}`;
	let web3Context: Web3Context<QRLExecutionAPI>;

	beforeEach(() => {
		jest.useFakeTimers();
		(rpcMethodWrappersReaders.getTransactionReceipt as jest.Mock).mockResolvedValue(undefined);
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockResolvedValue(BigInt(1));
		web3Context = new Web3Context<QRLExecutionAPI>({
			request: jest.fn(),
			supportsSubscriptions: () => false,
		} as never);
		web3Context.transactionPollingTimeout = 1_000;
		web3Context.transactionPollingInterval = 100;
		web3Context.transactionReceiptPollingInterval = 100;
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
		jest.resetAllMocks();
	});

	it('stops polling for the receipt once the polling timeout has rejected', async () => {
		const outcome = waitForTransactionReceipt(
			web3Context,
			transactionHash,
			DEFAULT_RETURN_FORMAT,
		).then(
			() => undefined,
			(error: unknown) => error,
		);

		await jest.advanceTimersByTimeAsync(1_000);
		await expect(outcome).resolves.toBeInstanceOf(TransactionPollingTimeoutError);

		const receiptCalls = rpcMethodWrappersReaders.getTransactionReceipt as jest.Mock;
		const blockNumberCalls = rpcMethodWrappersReaders.getBlockNumber as jest.Mock;
		const receiptCallsAtTimeout = receiptCalls.mock.calls.length;
		const blockNumberCallsAtTimeout = blockNumberCalls.mock.calls.length;
		expect(receiptCallsAtTimeout).toBeGreaterThan(1);

		await jest.advanceTimersByTimeAsync(5_000);

		// Both pollers must be dead: the receipt poller used to keep running forever.
		expect(receiptCalls.mock.calls.length).toBe(receiptCallsAtTimeout);
		expect(blockNumberCalls.mock.calls.length).toBe(blockNumberCallsAtTimeout);
	});

	it('resolves with the receipt and stops polling afterwards', async () => {
		const receipt = { transactionHash, blockNumber: BigInt(1), status: BigInt(1) };
		(rpcMethodWrappersReaders.getTransactionReceipt as jest.Mock)
			.mockResolvedValueOnce(undefined)
			.mockResolvedValue(receipt);

		const outcome = waitForTransactionReceipt(
			web3Context,
			transactionHash,
			DEFAULT_RETURN_FORMAT,
		);
		await jest.advanceTimersByTimeAsync(300);
		await expect(outcome).resolves.toEqual(receipt);

		const receiptCalls = rpcMethodWrappersReaders.getTransactionReceipt as jest.Mock;
		const callsAtResolution = receiptCalls.mock.calls.length;
		await jest.advanceTimersByTimeAsync(5_000);
		expect(receiptCalls.mock.calls.length).toBe(callsAtResolution);
	});

	it('cleans up when the initial block-number request fails', async () => {
		const error = new Error('block-number request failed');
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockRejectedValueOnce(error);

		await expect(
			waitForTransactionReceipt(web3Context, transactionHash, DEFAULT_RETURN_FORMAT),
		).rejects.toBe(error);

		const receiptCalls = rpcMethodWrappersReaders.getTransactionReceipt as jest.Mock;
		const callsAtRejection = receiptCalls.mock.calls.length;
		await jest.advanceTimersByTimeAsync(5_000);
		expect(receiptCalls.mock.calls.length).toBe(callsAtRejection);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('times out while block-number setup is pending and cleans up a late watcher', async () => {
		let resolveBlockNumber!: (blockNumber: bigint) => void;
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockReturnValueOnce(
			new Promise<bigint>(resolve => {
				resolveBlockNumber = resolve;
			}),
		);
		const outcome = waitForTransactionReceipt(
			web3Context,
			transactionHash,
			DEFAULT_RETURN_FORMAT,
		).catch((error: unknown) => error);

		await jest.advanceTimersByTimeAsync(1_000);
		await expect(outcome).resolves.toBeInstanceOf(TransactionPollingTimeoutError);
		const receiptCalls = rpcMethodWrappersReaders.getTransactionReceipt as jest.Mock;
		const callsAtTimeout = receiptCalls.mock.calls.length;

		resolveBlockNumber(BigInt(1));
		await jest.advanceTimersByTimeAsync(5_000);
		expect(receiptCalls.mock.calls.length).toBe(callsAtTimeout);
		expect(rpcMethodWrappersReaders.getBlockNumber).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('returns a receipt while block-number setup is pending and handles a late rejection', async () => {
		let rejectBlockNumber!: (error: Error) => void;
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockReturnValueOnce(
			new Promise<never>((_, reject) => {
				rejectBlockNumber = reject;
			}),
		);
		const receipt = { transactionHash, blockNumber: BigInt(1), status: BigInt(1) };
		(rpcMethodWrappersReaders.getTransactionReceipt as jest.Mock).mockResolvedValue(receipt);

		await expect(
			waitForTransactionReceipt(web3Context, transactionHash, DEFAULT_RETURN_FORMAT),
		).resolves.toEqual(receipt);

		rejectBlockNumber(new Error('late block-number failure'));
		await jest.advanceTimersByTimeAsync(5_000);
		expect(rpcMethodWrappersReaders.getTransactionReceipt).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('cleans up both pollers after the block timeout', async () => {
		web3Context.transactionBlockTimeout = 1;
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock)
			.mockResolvedValueOnce(BigInt(1))
			.mockResolvedValue(BigInt(2));
		const outcome = waitForTransactionReceipt(
			web3Context,
			transactionHash,
			DEFAULT_RETURN_FORMAT,
		).catch((error: unknown) => error);

		await jest.advanceTimersByTimeAsync(100);
		await expect(outcome).resolves.toBeInstanceOf(TransactionBlockTimeoutError);
		const receiptCalls = rpcMethodWrappersReaders.getTransactionReceipt as jest.Mock;
		const blockCalls = rpcMethodWrappersReaders.getBlockNumber as jest.Mock;
		const receiptCount = receiptCalls.mock.calls.length;
		const blockCount = blockCalls.mock.calls.length;

		await jest.advanceTimersByTimeAsync(5_000);
		expect(receiptCalls.mock.calls.length).toBe(receiptCount);
		expect(blockCalls.mock.calls.length).toBe(blockCount);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('does not restart block polling after a subscription watcher is cleaned up', async () => {
		const provider = web3Context.requestManager.provider as Web3BaseProvider;
		jest.spyOn(provider, 'supportsSubscriptions').mockReturnValue(true);
		web3Context.enableExperimentalFeatures = {
			...web3Context.enableExperimentalFeatures,
			useSubscriptionWhenCheckingBlockTimeout: true,
		};
		web3Context.blockHeaderTimeout = 2;
		const subscription = Object.assign(new EventEmitter(), { id: 'block-subscription' });
		jest.spyOn(web3Context.subscriptionManager, 'subscribe').mockResolvedValue(
			subscription as never,
		);
		const unsubscribe = jest
			.spyOn(web3Context.subscriptionManager, 'removeSubscription')
			.mockResolvedValue(undefined as never);
		const outcome = waitForTransactionReceipt(
			web3Context,
			transactionHash,
			DEFAULT_RETURN_FORMAT,
		).catch((error: unknown) => error);

		await jest.advanceTimersByTimeAsync(1_000);
		await expect(outcome).resolves.toBeInstanceOf(TransactionPollingTimeoutError);
		expect(unsubscribe).toHaveBeenCalledTimes(1);

		// A queued notification or the fallback timer must not resurrect the watcher.
		subscription.emit('error', new Error('late subscription error'));
		await jest.advanceTimersByTimeAsync(5_000);
		expect(rpcMethodWrappersReaders.getBlockNumber).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('still falls back to block polling while the receipt wait is active', async () => {
		const provider = web3Context.requestManager.provider as Web3BaseProvider;
		jest.spyOn(provider, 'supportsSubscriptions').mockReturnValue(true);
		web3Context.enableExperimentalFeatures = {
			...web3Context.enableExperimentalFeatures,
			useSubscriptionWhenCheckingBlockTimeout: true,
		};
		web3Context.transactionPollingTimeout = 5_000;
		web3Context.transactionBlockTimeout = 1;
		web3Context.blockHeaderTimeout = 1;
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock)
			.mockResolvedValueOnce(BigInt(1))
			.mockResolvedValue(BigInt(2));
		const subscription = Object.assign(new EventEmitter(), { id: 'block-subscription' });
		jest.spyOn(web3Context.subscriptionManager, 'subscribe').mockResolvedValue(
			subscription as never,
		);
		jest.spyOn(web3Context.subscriptionManager, 'removeSubscription').mockResolvedValue(
			undefined as never,
		);
		const outcome = waitForTransactionReceipt(
			web3Context,
			transactionHash,
			DEFAULT_RETURN_FORMAT,
		).catch((error: unknown) => error);

		await jest.advanceTimersByTimeAsync(1_100);
		await expect(outcome).resolves.toBeInstanceOf(TransactionBlockTimeoutError);
		await jest.advanceTimersByTimeAsync(5_000);
		expect(rpcMethodWrappersReaders.getBlockNumber).toHaveBeenCalledTimes(2);
		expect(jest.getTimerCount()).toBe(0);
	});
});
