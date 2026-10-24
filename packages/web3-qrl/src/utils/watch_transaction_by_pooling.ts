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
import {
	Bytes,
	DataFormat,
	Numbers,
	QRLExecutionAPI,
	TransactionReceipt,
} from '@theqrl/web3-types';
import { Web3Context, Web3PromiEvent } from '@theqrl/web3-core';
import { format, numberToHex } from '@theqrl/web3-utils';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import { SendSignedTransactionEvents, SendTransactionEvents } from '../types.js';
import { transactionReceiptSchema } from '../schemas.js';
import { MAX_CONSECUTIVE_POLLING_ERRORS } from '../constants.js';
import { reportWatcherError, emitConfirmation } from './promi_event_errors.js';
import {
	missingReceiptError,
	recheckReceipt,
	changedReceiptStatusError,
} from './receipt_recheck.js';

export type Web3PromiEventEventTypeBase<ReturnFormat extends DataFormat> =
	| SendTransactionEvents<ReturnFormat>
	| SendSignedTransactionEvents<ReturnFormat>;

export type WaitProps<ReturnFormat extends DataFormat, ResolveType = TransactionReceipt> = {
	web3Context: Web3Context<QRLExecutionAPI>;
	transactionReceipt: TransactionReceipt;
	transactionPromiEvent: Web3PromiEvent<ResolveType, Web3PromiEventEventTypeBase<ReturnFormat>>;
	returnFormat: ReturnFormat;
};

/**
 * This function watches a Transaction by polling for the blocks after the receipt's block.
 * It is used by `watchTransactionForConfirmations`, in case the provider does not support subscription.
 * And it is also used by `watchTransactionBySubscription`, as a fallback, if the subscription failed for any reason.
 *
 * A `confirmation` event is emitted for every block found; polling stops as soon as
 * `transactionConfirmationBlocks` confirmations have been emitted, so neither an extra event nor
 * an extra request follows the last one (L-54). A failed block request is retried on the next
 * tick up to {@link MAX_CONSECUTIVE_POLLING_ERRORS} times in a row; a persistent failure stops
 * the poller and is reported through the PromiEvent's `error` event when a listener is attached,
 * and logged otherwise (M-7c).
 *
 * Every block found is followed by a fresh `qrl_getTransactionReceipt`: a transaction that a
 * reorg dropped from the chain is reported (`TransactionMissingReceiptOrBlockHashError`) and the
 * poller stops, one that was re-included in another block is confirmed from that block with the
 * node's new receipt (pass-4 informational, round 2).
 */
export const watchTransactionByPolling = <
	ReturnFormat extends DataFormat,
	ResolveType = TransactionReceipt,
>({
	web3Context,
	transactionReceipt,
	transactionPromiEvent,
	returnFormat,
}: WaitProps<ReturnFormat, ResolveType>) => {
	// Having a transactionReceipt means that the transaction has already been included
	// in at least one block, so we start with 1
	let confirmations = 1;
	// The receipt confirmations are counted from; replaced when a reorg moved the transaction.
	let receipt: TransactionReceipt = transactionReceipt;
	let consecutiveErrors = 0;
	let missingReceipts = 0;
	let checking = false;
	let stopped = false;
	let intervalId: ReturnType<typeof setInterval> | undefined;

	const stop = () => {
		stopped = true;
		if (intervalId !== undefined) {
			clearInterval(intervalId);
			intervalId = undefined;
		}
	};

	const poll = async () => {
		if (stopped || checking) return;
		checking = true;
		try {
			const nextNumber = BigInt(receipt.blockNumber) + BigInt(confirmations);
			const nextBlock = await qrlRpcMethods.getBlockByNumber(
				web3Context.requestManager,
				numberToHex(nextNumber),
				false,
			);
			// Stopped while the request was in flight.
			if (stopped) return;
			consecutiveErrors = 0;

			if (!nextBlock?.hash) return;

			// The chain grew past the receipt's block; make sure the transaction is still in it.
			const recheck = await recheckReceipt(web3Context, receipt);
			if (stopped) return;
			if (recheck.kind === 'missing') {
				missingReceipts += 1;
				if (missingReceipts < MAX_CONSECUTIVE_POLLING_ERRORS) return;
				stop();
				reportWatcherError(
					transactionPromiEvent,
					missingReceiptError(receipt, returnFormat),
				);
				return;
			}
			if (recheck.kind !== 'unknown') missingReceipts = 0;
			if (recheck.kind === 'moved') {
				const changed = changedReceiptStatusError(receipt, recheck.receipt);
				if (changed) {
					stop();
					reportWatcherError(transactionPromiEvent, changed);
					return;
				}
				receipt = recheck.receipt;
			}

			// Depth of the fetched block above the (possibly new) receipt block: the receipt's own
			// block is confirmation 1. A transaction re-included at or after the fetched block
			// has nothing new to confirm yet; the next tick starts from its new block.
			const depth = nextNumber - BigInt(receipt.blockNumber) + BigInt(1);
			if (depth < BigInt(2)) {
				confirmations = 1;
				return;
			}
			confirmations = Number(depth);
			const formattedConfirmations: Numbers = confirmations;

			emitConfirmation(transactionPromiEvent, {
				confirmations: format({ format: 'uint' }, formattedConfirmations, returnFormat),
				receipt: format(transactionReceiptSchema, receipt, returnFormat),
				latestBlockHash: format(
					{ format: 'bytes32' },
					nextBlock.hash as Bytes,
					returnFormat,
				),
			});

			if (confirmations >= web3Context.transactionConfirmationBlocks) stop();
		} catch (error) {
			if (stopped) return;
			consecutiveErrors += 1;
			// A transient error is retried on the next tick.
			if (consecutiveErrors < MAX_CONSECUTIVE_POLLING_ERRORS) return;
			// A persistent one stops the poller, so a failing node cannot cause an endless loop
			// of failed requests, and is reported without ever throwing out of the timer.
			stop();
			reportWatcherError(transactionPromiEvent, error);
		} finally {
			checking = false;
		}
	};

	intervalId = setInterval(() => {
		void poll();
	}, web3Context.transactionReceiptPollingInterval ?? web3Context.transactionPollingInterval);
};
