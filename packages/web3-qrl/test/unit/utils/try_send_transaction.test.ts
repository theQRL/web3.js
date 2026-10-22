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
import { TransactionBlockTimeoutError, TransactionSendTimeoutError } from '@theqrl/web3-errors';
import { QRLExecutionAPI, Web3BaseProvider } from '@theqrl/web3-types';
import * as rpcMethodWrappersReaders from '../../../src/utils/rpc_method_wrappers_readers';
import { trySendTransaction } from '../../../src/utils/try_send_transaction';

jest.mock('../../../src/utils/rpc_method_wrappers_readers');

describe('trySendTransaction', () => {
	const transactionHash = `0x${'ab'.repeat(32)}`;
	let web3Context: Web3Context<QRLExecutionAPI>;
	let send: jest.Mock<Promise<string>, []>;

	beforeEach(() => {
		jest.useFakeTimers();
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockResolvedValue(BigInt(1));
		web3Context = new Web3Context<QRLExecutionAPI>({
			request: jest.fn(),
			supportsSubscriptions: () => false,
		} as never);
		web3Context.transactionSendTimeout = 1_000;
		web3Context.transactionPollingInterval = 100;
		send = jest.fn().mockResolvedValue(transactionHash);
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
		jest.resetAllMocks();
	});

	it('clears the send timeout when block-number setup fails, without sending', async () => {
		const error = new Error('qrl_blockNumber failed');
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockRejectedValueOnce(error);

		await expect(trySendTransaction(web3Context, send, transactionHash)).rejects.toBe(error);
		expect(send).not.toHaveBeenCalled();
		expect(jest.getTimerCount()).toBe(0);
		// Advancing past the old deadline must not create an unhandled rejection.
		await jest.advanceTimersByTimeAsync(5_000);
		expect(rpcMethodWrappersReaders.getBlockNumber).toHaveBeenCalledTimes(1);
	});

	it('rejects with the send timeout when block-number setup never settles', async () => {
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockReturnValueOnce(
			new Promise<never>(() => {
				// Simulate a node that never answers the setup request.
			}),
		);
		const outcome = trySendTransaction(web3Context, send, transactionHash).catch(
			(error: unknown) => error,
		);

		await jest.advanceTimersByTimeAsync(1_000);
		await expect(outcome).resolves.toBeInstanceOf(TransactionSendTimeoutError);
		expect(send).not.toHaveBeenCalled();
		expect(jest.getTimerCount()).toBe(0);
	});

	it('cleans up late block-number setup without sending after the timeout', async () => {
		let resolveBlockNumber!: (blockNumber: bigint) => void;
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockReturnValueOnce(
			new Promise<bigint>(resolve => {
				resolveBlockNumber = resolve;
			}),
		);
		const outcome = trySendTransaction(web3Context, send, transactionHash).catch(
			(error: unknown) => error,
		);

		await jest.advanceTimersByTimeAsync(1_000);
		await expect(outcome).resolves.toBeInstanceOf(TransactionSendTimeoutError);
		resolveBlockNumber(BigInt(1));
		await jest.advanceTimersByTimeAsync(5_000);

		expect(send).not.toHaveBeenCalled();
		expect(rpcMethodWrappersReaders.getBlockNumber).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('handles a setup rejection that arrives after the send timeout', async () => {
		let rejectBlockNumber!: (error: Error) => void;
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockReturnValueOnce(
			new Promise<never>((_, reject) => {
				rejectBlockNumber = reject;
			}),
		);
		const outcome = trySendTransaction(web3Context, send, transactionHash).catch(
			(error: unknown) => error,
		);

		await jest.advanceTimersByTimeAsync(1_000);
		await expect(outcome).resolves.toBeInstanceOf(TransactionSendTimeoutError);
		rejectBlockNumber(new Error('late setup failure'));
		await jest.advanceTimersByTimeAsync(5_000);
		expect(send).not.toHaveBeenCalled();
		expect(jest.getTimerCount()).toBe(0);
	});

	it('waits for setup, sends once, and cleans up after success', async () => {
		let resolveBlockNumber!: (blockNumber: bigint) => void;
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock).mockReturnValueOnce(
			new Promise<bigint>(resolve => {
				resolveBlockNumber = resolve;
			}),
		);
		const outcome = trySendTransaction(web3Context, send, transactionHash);
		expect(send).not.toHaveBeenCalled();
		resolveBlockNumber(BigInt(1));

		await expect(outcome).resolves.toBe(transactionHash);
		expect(send).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(5_000);
		expect(rpcMethodWrappersReaders.getBlockNumber).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it.each(['synchronous', 'asynchronous'])('cleans up after a %s send failure', async kind => {
		const error = new Error('send failed');
		if (kind === 'synchronous') {
			send.mockImplementation(() => {
				throw error;
			});
		} else {
			send.mockRejectedValue(error);
		}

		await expect(trySendTransaction(web3Context, send, transactionHash)).rejects.toBe(error);
		await jest.advanceTimersByTimeAsync(5_000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(rpcMethodWrappersReaders.getBlockNumber).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('cleans up the block watcher when sending times out and handles a late send rejection', async () => {
		let rejectSend!: (error: Error) => void;
		send.mockReturnValue(
			new Promise<never>((_, reject) => {
				rejectSend = reject;
			}),
		);
		const outcome = trySendTransaction(web3Context, send, transactionHash).catch(
			(error: unknown) => error,
		);

		await jest.advanceTimersByTimeAsync(1_000);
		await expect(outcome).resolves.toBeInstanceOf(TransactionSendTimeoutError);
		const blockCalls = rpcMethodWrappersReaders.getBlockNumber as jest.Mock;
		const callsAtTimeout = blockCalls.mock.calls.length;
		expect(callsAtTimeout).toBeGreaterThan(1);
		rejectSend(new Error('late send failure'));
		await jest.advanceTimersByTimeAsync(5_000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(blockCalls.mock.calls.length).toBe(callsAtTimeout);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('rejects and cleans up when the block timeout wins during sending', async () => {
		web3Context.transactionBlockTimeout = 1;
		(rpcMethodWrappersReaders.getBlockNumber as jest.Mock)
			.mockResolvedValueOnce(BigInt(1))
			.mockResolvedValue(BigInt(2));
		send.mockReturnValue(
			new Promise<never>(() => {
				// Keep sending pending until the block timeout wins.
			}),
		);
		const outcome = trySendTransaction(web3Context, send, transactionHash).catch(
			(error: unknown) => error,
		);

		await jest.advanceTimersByTimeAsync(100);
		await expect(outcome).resolves.toBeInstanceOf(TransactionBlockTimeoutError);
		await jest.advanceTimersByTimeAsync(5_000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(rpcMethodWrappersReaders.getBlockNumber).toHaveBeenCalledTimes(2);
		expect(jest.getTimerCount()).toBe(0);
	});

	it('cleans up a subscription established after timeout without sending', async () => {
		jest.spyOn(
			web3Context.requestManager.provider as Web3BaseProvider,
			'supportsSubscriptions',
		).mockReturnValue(true);
		web3Context.enableExperimentalFeatures = {
			...web3Context.enableExperimentalFeatures,
			useSubscriptionWhenCheckingBlockTimeout: true,
		};
		web3Context.blockHeaderTimeout = 2;
		const subscription = Object.assign(new EventEmitter(), { id: 'late-block-subscription' });
		let resolveSubscription!: (value: typeof subscription) => void;
		jest.spyOn(web3Context.subscriptionManager, 'subscribe').mockReturnValue(
			new Promise<typeof subscription>(resolve => {
				resolveSubscription = resolve;
			}) as never,
		);
		const unsubscribe = jest
			.spyOn(web3Context.subscriptionManager, 'removeSubscription')
			.mockResolvedValue(undefined as never);
		const outcome = trySendTransaction(web3Context, send, transactionHash).catch(
			(error: unknown) => error,
		);

		await jest.advanceTimersByTimeAsync(1_000);
		await expect(outcome).resolves.toBeInstanceOf(TransactionSendTimeoutError);
		resolveSubscription(subscription);
		await jest.advanceTimersByTimeAsync(5_000);
		expect(unsubscribe).toHaveBeenCalledWith(subscription);
		expect(send).not.toHaveBeenCalled();
		expect(rpcMethodWrappersReaders.getBlockNumber).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(0);
	});
});
