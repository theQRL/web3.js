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
import { Web3Context, Web3PromiEvent } from '@theqrl/web3-core';
import { format, numberToHex, sha3Raw } from '@theqrl/web3-utils';
import { DEFAULT_RETURN_FORMAT, TransactionReceipt, Web3QRLExecutionAPI } from '@theqrl/web3-types';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';
import {
	BaseWeb3Error,
	TransactionError,
	TransactionMissingReceiptOrBlockHashError,
} from '@theqrl/web3-errors';
import * as rpcMethodWrappers from '../../../src/rpc_method_wrappers';
import * as WaitForTransactionReceipt from '../../../src/utils/wait_for_transaction_receipt';

import * as WatchTransactionByPolling from '../../../src/utils/watch_transaction_by_pooling';
import {
	expectedTransactionReceipt,
	testData,
} from '../rpc_method_wrappers/fixtures/send_signed_transaction';
import { transactionReceiptSchema } from '../../../src/schemas';
import { MAX_CONSECUTIVE_POLLING_ERRORS } from '../../../src/constants';
import { SendSignedTransactionEvents } from '../../../src/types';
import { sleep } from '../../shared_fixtures/utils';

jest.mock('@theqrl/web3-rpc-methods');

beforeEach(() => {
	(qrlRpcMethods.call as jest.Mock).mockResolvedValue('0x');
});
jest.mock('../../../src/utils/wait_for_transaction_receipt');

const mockBlockData = {
	hash: '0xdc0818cf78f21a8e70579cb46a43643f78291264dda342ae31049421c82d21ae',
};

const testMessage =
	'Title: %s\ninputSignedTransaction: %s\nexpectedTransactionHash: %s\nexpectedTransactionReceipt: %s\n';
describe('watchTransactionByPolling', () => {
	describe('should call getBlockByNumber', () => {
		let web3Context: Web3Context<Web3QRLExecutionAPI>;

		beforeAll(() => {
			web3Context = new Web3Context(
				// dummy provider that does not supports subscription
				{
					request: jest.fn(),
				},
			);

			jest.spyOn(qrlRpcMethods, 'getBlockByNumber').mockResolvedValue(mockBlockData as any);
		});

		it.each(testData)(
			`watchTransactionByPolling logic\n ${testMessage}`,
			async (_, inputTransaction) => {
				const formattedTransactionReceipt = format(
					transactionReceiptSchema,
					expectedTransactionReceipt,
					DEFAULT_RETURN_FORMAT,
				);

				(
					WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
				).mockResolvedValueOnce(expectedTransactionReceipt);

				// The send pipeline checks the node's replies: the block number must be a quantity
				// (P4-L-13) and `qrl_sendRawTransaction` must answer the local hash (P4-L-9).
				(qrlRpcMethods.getBlockNumber as jest.Mock).mockResolvedValue('0x1');
				(qrlRpcMethods.sendRawTransaction as jest.Mock).mockImplementation(
					(_requestManager: unknown, raw: string) => sha3Raw(raw),
				);

				const promiEvent = rpcMethodWrappers.sendSignedTransaction(
					web3Context,
					inputTransaction,
					DEFAULT_RETURN_FORMAT,
				);
				await promiEvent;
				WatchTransactionByPolling.watchTransactionByPolling({
					web3Context,
					transactionReceipt: formattedTransactionReceipt,
					transactionPromiEvent: promiEvent,
					returnFormat: DEFAULT_RETURN_FORMAT,
				});

				await sleep(1000);
				expect(qrlRpcMethods.getBlockByNumber).toHaveBeenCalled();

				// to clear the interval inside the polling function:
				web3Context.transactionConfirmationBlocks = 0;
			},
		);
	});

	describe('polling behaviour (M-7c, L-54)', () => {
		let web3Context: Web3Context<Web3QRLExecutionAPI>;
		let promiEvent: Web3PromiEvent<
			TransactionReceipt,
			SendSignedTransactionEvents<typeof DEFAULT_RETURN_FORMAT>
		>;
		let confirmations: bigint[];
		const formattedTransactionReceipt = format(
			transactionReceiptSchema,
			expectedTransactionReceipt,
			DEFAULT_RETURN_FORMAT,
		);

		const start = () =>
			WatchTransactionByPolling.watchTransactionByPolling({
				web3Context,
				transactionReceipt: formattedTransactionReceipt,
				transactionPromiEvent: promiEvent,
				returnFormat: DEFAULT_RETURN_FORMAT,
			});

		beforeEach(() => {
			// The automock keeps the call counts of the describe above.
			jest.clearAllMocks();
			jest.useFakeTimers();
			web3Context = new Web3Context(
				// dummy provider that does not supports subscription
				{
					request: jest.fn(),
				},
			);
			web3Context.transactionReceiptPollingInterval = 50;
			web3Context.transactionPollingInterval = 50;
			web3Context.transactionConfirmationBlocks = 3;
			promiEvent = new Web3PromiEvent(() => undefined);
			confirmations = [];
			promiEvent.on('confirmation', ({ confirmations: count }) => {
				confirmations.push(count as bigint);
			});
		});

		afterEach(() => {
			jest.clearAllTimers();
			jest.useRealTimers();
			jest.resetAllMocks();
		});

		it('reports throwing confirmation listeners and still stops at the threshold', async () => {
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValue(mockBlockData);
			const errors = jest.fn();
			promiEvent.on('error', errors);
			promiEvent.on('confirmation', () => {
				throw new Error('listener boom');
			});
			start();
			await jest.advanceTimersByTimeAsync(1000);
			expect(confirmations).toEqual([BigInt(2), BigInt(3)]);
			expect(errors).toHaveBeenCalledTimes(2);
			expect(qrlRpcMethods.getBlockByNumber).toHaveBeenCalledTimes(2);
			expect(jest.getTimerCount()).toBe(0);
		});
		it('emits exactly the confirmations up to the threshold and stops polling (L-54)', async () => {
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValue(mockBlockData);

			start();
			await jest.advanceTimersByTimeAsync(1_000);

			// The receipt's own block is confirmation 1 (emitted by the caller); with a
			// threshold of 3 the poller adds 2 and 3 and then stops: no extra event or request.
			expect(confirmations).toStrictEqual([BigInt(2), BigInt(3)]);
			expect(qrlRpcMethods.getBlockByNumber).toHaveBeenCalledTimes(2);
		});

		it('retries a transient block fetch failure on the next tick (M-7c)', async () => {
			(qrlRpcMethods.getBlockByNumber as jest.Mock)
				.mockRejectedValueOnce(new Error('header not found'))
				.mockRejectedValueOnce(new Error('header not found'))
				.mockResolvedValue(mockBlockData);
			const errorListener = jest.fn<void, [BaseWeb3Error]>();
			promiEvent.on('error', errorListener);

			start();
			await jest.advanceTimersByTimeAsync(1_000);

			expect(confirmations).toStrictEqual([BigInt(2), BigInt(3)]);
			expect(errorListener).not.toHaveBeenCalled();
		});

		it('stops after MAX_CONSECUTIVE_POLLING_ERRORS failures and reports a typed error to the listener (M-7c)', async () => {
			const pollingError = new Error('polling failure');
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockRejectedValue(pollingError);
			const errorListener = jest.fn<void, [BaseWeb3Error]>();
			promiEvent.on('error', errorListener);

			start();
			await jest.advanceTimersByTimeAsync(2_000);

			expect(qrlRpcMethods.getBlockByNumber).toHaveBeenCalledTimes(
				MAX_CONSECUTIVE_POLLING_ERRORS,
			);
			expect(errorListener).toHaveBeenCalledTimes(1);
			expect(errorListener.mock.calls[0][0]).toBeInstanceOf(TransactionError);
			expect(errorListener.mock.calls[0][0].innerError).toBe(pollingError);
			expect(confirmations).toStrictEqual([]);
		});

		it('stops and reports a transaction that a reorg dropped from the chain (round 2)', async () => {
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValue(mockBlockData);
			// eslint-disable-next-line no-null/no-null
			(qrlRpcMethods.getTransactionReceipt as jest.Mock).mockResolvedValue(null);
			const errorListener = jest.fn<void, [BaseWeb3Error]>();
			promiEvent.on('error', errorListener);

			start();
			await jest.advanceTimersByTimeAsync(1_000);

			expect(confirmations).toStrictEqual([]);
			expect(qrlRpcMethods.getBlockByNumber).toHaveBeenCalledTimes(
				MAX_CONSECUTIVE_POLLING_ERRORS,
			);
			expect(errorListener).toHaveBeenCalledTimes(1);
			const reported = errorListener.mock.calls[0][0];
			expect(
				reported instanceof TransactionMissingReceiptOrBlockHashError ||
					reported.innerError instanceof TransactionMissingReceiptOrBlockHashError,
			).toBe(true);
		});

		it('follows a transaction that a reorg moved to another block (round 2)', async () => {
			const movedBlockHash = `0x${'ee'.repeat(32)}`;
			const movedReceipt = {
				...expectedTransactionReceipt,
				blockHash: movedBlockHash,
				blockNumber: numberToHex(
					BigInt(formattedTransactionReceipt.blockNumber) + BigInt(1),
				),
			};
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValue(mockBlockData);
			(qrlRpcMethods.getTransactionReceipt as jest.Mock).mockResolvedValue(movedReceipt);
			const receipts: TransactionReceipt[] = [];
			promiEvent.on('confirmation', ({ receipt }) => {
				receipts.push(receipt);
			});

			start();
			await jest.advanceTimersByTimeAsync(1_000);

			// The first block found is the one the transaction moved to (depth 1, nothing new);
			// the next two are confirmations 2 and 3 of the new block, carrying the new receipt.
			expect(confirmations).toStrictEqual([BigInt(2), BigInt(3)]);
			expect(receipts.map(r => r.blockHash)).toStrictEqual([movedBlockHash, movedBlockHash]);
			expect(qrlRpcMethods.getBlockByNumber).toHaveBeenCalledTimes(3);
		});

		it('warns instead of throwing when no error listener is attached (M-7c)', async () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockRejectedValue(
				new Error('polling failure'),
			);

			start();
			await jest.advanceTimersByTimeAsync(2_000);

			expect(warn).toHaveBeenCalledTimes(1);
			expect(qrlRpcMethods.getBlockByNumber).toHaveBeenCalledTimes(
				MAX_CONSECUTIVE_POLLING_ERRORS,
			);
		});
	});
});
