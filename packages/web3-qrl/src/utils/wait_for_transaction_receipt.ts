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
import { TransactionPollingTimeoutError } from '@theqrl/web3-errors';
import { QRLExecutionAPI, Bytes, TransactionReceipt, DataFormat } from '@theqrl/web3-types';

import { pollTillDefinedAndReturnIntervalId, rejectIfTimeout } from '@theqrl/web3-utils';
import { rejectIfBlockTimeout, ResourceCleaner } from './reject_if_block_timeout.js';
import { getTransactionReceipt } from './rpc_method_wrappers_readers.js';
import { MAX_CONSECUTIVE_POLLING_ERRORS } from '../constants.js';

/**
 * Polls for the receipt of a broadcast transaction until it is available, the polling timeout
 * fires or `transactionBlockTimeout` blocks have passed.
 *
 * A failed `qrl_getTransactionReceipt` is retried on the next tick: the transaction is already
 * broadcast, so a transient error (a load balancer hiccup, a node restart) must not turn the
 * wait into a rejection that makes a caller re-send with a fresh nonce. After
 * {@link MAX_CONSECUTIVE_POLLING_ERRORS} failures in a row the last error is thrown (L-49).
 */
export async function waitForTransactionReceipt<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	transactionHash: Bytes,
	returnFormat: ReturnFormat,
): Promise<TransactionReceipt> {
	const pollingInterval =
		web3Context.transactionReceiptPollingInterval ?? web3Context.transactionPollingInterval;

	let consecutiveErrors = 0;
	const [awaitableTransactionReceipt, receiptPollingIntervalId] =
		pollTillDefinedAndReturnIntervalId(async () => {
			try {
				const receipt = await getTransactionReceipt(
					web3Context,
					transactionHash,
					returnFormat,
				);
				consecutiveErrors = 0;
				return receipt;
			} catch (error) {
				consecutiveErrors += 1;
				if (consecutiveErrors >= MAX_CONSECUTIVE_POLLING_ERRORS) throw error;
				console.warn(
					`An error happened while trying to get the transaction receipt (attempt ${consecutiveErrors} of ${MAX_CONSECUTIVE_POLLING_ERRORS}); retrying`,
					error,
				);
				return undefined;
			}
		}, pollingInterval);

	const [timeoutId, rejectOnTimeout] = rejectIfTimeout(
		web3Context.transactionPollingTimeout,
		new TransactionPollingTimeoutError({
			numberOfSeconds: web3Context.transactionPollingTimeout / 1000,
			transactionHash,
		}),
	);

	let blockTimeoutResourceCleaner: ResourceCleaner | undefined;
	let waiting = true;

	try {
		// Setup performs an RPC call too. Race it against the receipt and polling timeout so
		// a failed or stalled setup cannot bypass cleanup or leave the timeout unhandled.
		const rejectOnBlockTimeout = rejectIfBlockTimeout(web3Context, transactionHash).then(
			async ([blockTimeout, resourceCleaner]) => {
				if (waiting) {
					blockTimeoutResourceCleaner = resourceCleaner;
				} else {
					// Setup can finish after this function has already returned or timed out.
					resourceCleaner.clean();
				}
				return blockTimeout;
			},
		);

		return await Promise.race([
			awaitableTransactionReceipt,
			rejectOnTimeout, // this will throw an error on Transaction Polling Timeout
			rejectOnBlockTimeout, // this will throw an error on Transaction Block Timeout
		]);
	} finally {
		waiting = false;
		clearTimeout(timeoutId);
		// The receipt poller is independent of the timers above: without this it kept calling
		// `qrl_getTransactionReceipt` after the timeout had rejected the race, forever for a
		// transaction that never mines.
		clearInterval(receiptPollingIntervalId);
		blockTimeoutResourceCleaner?.clean();
	}
}
