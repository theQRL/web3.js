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
	Web3BaseProvider,
	TransactionReceipt,
} from '@theqrl/web3-types';
import { Web3Context, Web3PromiEvent } from '@theqrl/web3-core';
import { format } from '@theqrl/web3-utils';
import { isNullish, isUInt } from '@theqrl/web3-validator';

import {
	TransactionMissingReceiptOrBlockHashError,
	TransactionReceiptMissingBlockNumberError,
} from '@theqrl/web3-errors';
import { transactionReceiptSchema } from '../schemas.js';
import {
	watchTransactionByPolling,
	Web3PromiEventEventTypeBase,
} from './watch_transaction_by_pooling.js';
import { isBlockHash } from './hex_guards.js';
import { emitConfirmation } from './promi_event_errors.js';
import { invalidResponseError } from './invalid_response_error.js';
import { watchTransactionBySubscription } from './watch_transaction_by_subscription.js';

/**
 * Emits the first `confirmation` for the receipt's own block and, while fewer than
 * `transactionConfirmationBlocks` confirmations have been emitted, watches the chain for the
 * next ones (through a `newHeads` subscription when the provider supports one, by polling
 * otherwise).
 *
 * @throws TransactionMissingReceiptOrBlockHashError / TransactionReceiptMissingBlockNumberError
 * for a receipt that cannot be watched; the caller reports it through the PromiEvent (L-54).
 */
export function watchTransactionForConfirmations<
	ReturnFormat extends DataFormat,
	ResolveType = TransactionReceipt,
>(
	web3Context: Web3Context<QRLExecutionAPI>,
	transactionPromiEvent: Web3PromiEvent<ResolveType, Web3PromiEventEventTypeBase<ReturnFormat>>,
	transactionReceipt: TransactionReceipt,
	transactionHash: Bytes,
	returnFormat: ReturnFormat,
) {
	if (isNullish(transactionReceipt) || isNullish(transactionReceipt.blockHash))
		throw new TransactionMissingReceiptOrBlockHashError({
			receipt: transactionReceipt,
			blockHash: format({ format: 'bytes32' }, transactionReceipt?.blockHash, returnFormat),
			transactionHash: format({ format: 'bytes32' }, transactionHash, returnFormat),
		});

	if (isNullish(transactionReceipt.blockNumber))
		throw new TransactionReceiptMissingBlockNumberError({ receipt: transactionReceipt });

	if (!isBlockHash(transactionReceipt.blockHash) || !isUInt(transactionReceipt.blockNumber)) {
		throw invalidResponseError(
			'qrl_getTransactionReceipt',
			'a receipt with a 32-byte block hash and an unsigned block number',
			transactionReceipt,
		);
	}
	const firstConfirmation: Numbers = 1;

	// As we have the receipt, it's the first confirmation that tx is accepted.
	emitConfirmation(transactionPromiEvent, {
		confirmations: format({ format: 'uint' }, firstConfirmation, returnFormat),
		receipt: format(transactionReceiptSchema, transactionReceipt, returnFormat),
		latestBlockHash: format({ format: 'bytes32' }, transactionReceipt.blockHash, returnFormat),
	});

	// One confirmation already satisfies a threshold of 0 or 1: no watcher is started, which
	// used to emit a second `confirmation` and send one request regardless (L-54).
	if (web3Context.transactionConfirmationBlocks <= 1) return;

	// so a subscription for newBlockHeaders can be made instead of polling
	const provider: Web3BaseProvider = web3Context.requestManager.provider as Web3BaseProvider;
	if (provider.supportsSubscriptions()) {
		watchTransactionBySubscription({
			web3Context,
			transactionReceipt,
			transactionPromiEvent,
			returnFormat,
		});
	} else {
		watchTransactionByPolling({
			web3Context,
			transactionReceipt,
			transactionPromiEvent,
			returnFormat,
		});
	}
}
