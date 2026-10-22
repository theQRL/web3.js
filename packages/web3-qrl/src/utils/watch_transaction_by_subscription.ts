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
import { Bytes, Numbers, BlockHeaderOutput, TransactionReceipt } from '@theqrl/web3-types';
import { format } from '@theqrl/web3-utils';
import { isHexStrict } from '@theqrl/web3-validator';

import { DataFormat } from '@theqrl/web3-types';
import { NewHeadsSubscription } from '../web3_subscriptions.js';
import { transactionReceiptSchema } from '../schemas.js';
import { WaitProps, watchTransactionByPolling } from './watch_transaction_by_pooling.js';

const isValidUnsignedHexNumber = (value: unknown): value is string | number | bigint => {
	if (typeof value === 'bigint' || typeof value === 'number') {
		return value >= 0;
	}
	if (typeof value !== 'string') {
		return false;
	}
	if (value.startsWith('-')) return false;
	if (!isHexStrict(value)) return false;
	return true;
};

const isValidBlockHash = (value: unknown): value is string =>
	typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

/**
 * This function watches a Transaction by subscribing to new heads.
 * It is used by `watchTransactionForConfirmations`, in case the provider supports subscription.
 *
 * Exactly one source counts confirmations at any time: the `newHeads` subscription, or polling
 * once the subscription failed or stayed silent for `blockHeaderTimeout` seconds. Starting the
 * polling fallback drops the subscription and a header arriving in time cancels the fallback,
 * so confirmations are never counted twice (L-54).
 */
export const watchTransactionBySubscription = <
	ReturnFormat extends DataFormat,
	ResolveType = TransactionReceipt,
>({
	web3Context,
	transactionReceipt,
	transactionPromiEvent,
	returnFormat,
}: WaitProps<ReturnFormat, ResolveType>) => {
	let polling = false;
	let headerReceived = false;
	let subscription: NewHeadsSubscription | undefined;
	let lastCaughtBlockHash: string | undefined;
	let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

	const dropSubscription = (sub: NewHeadsSubscription | undefined) => {
		if (sub === undefined) return;
		if (sub === subscription) subscription = undefined;
		web3Context.subscriptionManager?.removeSubscription(sub).catch(() => {
			// Already removed (for example by `subscriptionManager.clear()`): nothing to do.
		});
	};

	const cancelFallback = () => {
		if (fallbackTimer !== undefined) {
			clearTimeout(fallbackTimer);
			fallbackTimer = undefined;
		}
	};

	const startPolling = () => {
		if (polling) return;
		polling = true;
		cancelFallback();
		dropSubscription(subscription);
		watchTransactionByPolling({
			web3Context,
			transactionReceipt,
			transactionPromiEvent,
			returnFormat,
		});
	};

	setImmediate(() => {
		web3Context.subscriptionManager
			?.subscribe('newHeads')
			.then((sub: NewHeadsSubscription) => {
				if (polling) {
					// The fallback fired while the subscription was being set up.
					dropSubscription(sub);
					return;
				}
				subscription = sub;
				sub.on('data', (newBlockHeader: BlockHeaderOutput) => {
					if (polling || subscription !== sub) return;
					headerReceived = true;
					cancelFallback();
					if (
						!newBlockHeader?.number ||
						!isValidUnsignedHexNumber(newBlockHeader.number) ||
						!isValidBlockHash(newBlockHeader.parentHash) ||
						// For some cases, the on-data event is fired couple times for the same block!
						// This needs investigation but seems to be because of multiple `subscription.on('data'...)` even this should not cause that.
						lastCaughtBlockHash === newBlockHeader?.parentHash
					) {
						return;
					}
					lastCaughtBlockHash = newBlockHeader?.parentHash;

					const confirmations =
						BigInt(newBlockHeader.number) -
						BigInt(transactionReceipt.blockNumber) +
						BigInt(1);

					transactionPromiEvent.emit('confirmation', {
						confirmations: format(
							{ format: 'uint' },
							confirmations as Numbers,
							returnFormat,
						),
						receipt: format(transactionReceiptSchema, transactionReceipt, returnFormat),
						latestBlockHash: format(
							{ format: 'bytes32' },
							newBlockHeader.parentHash as Bytes,
							returnFormat,
						),
					});
					if (confirmations >= web3Context.transactionConfirmationBlocks) {
						dropSubscription(sub);
					}
				});
				sub.on('error', () => {
					startPolling();
				});
			})
			.catch(() => {
				startPolling();
			});
	});

	// Fallback to polling if no block header arrived within "blockHeaderTimeout" [10 seconds]
	fallbackTimer = setTimeout(() => {
		if (!headerReceived) {
			startPolling();
		}
	}, web3Context.blockHeaderTimeout * 1000);
};
