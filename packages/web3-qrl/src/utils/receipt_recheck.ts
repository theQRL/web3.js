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
import { TransactionMissingReceiptOrBlockHashError, TransactionError } from '@theqrl/web3-errors';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';
import {
	Bytes,
	DataFormat,
	HexString,
	QRL_DATA_FORMAT,
	QRLExecutionAPI,
	TransactionReceipt,
} from '@theqrl/web3-types';
import { format } from '@theqrl/web3-utils';
import { isNullish, isObject, isUInt } from '@theqrl/web3-validator';

import { transactionReceiptSchema } from '../schemas.js';
import { isHash32, isValidUnsignedHexNumber } from './hex_guards.js';

/**
 * What a fresh `qrl_getTransactionReceipt` says about a transaction whose receipt is being
 * confirmed: still in the same block (`unchanged`), re-included in another block after a reorg
 * (`moved`, with the node's new receipt), gone from the canonical chain (`missing`), or nothing
 * usable (`unknown`: the lookup failed or the reply is malformed).
 */
export type ReceiptRecheck =
	| { kind: 'unchanged' }
	| { kind: 'moved'; receipt: TransactionReceipt }
	| { kind: 'missing' }
	| { kind: 'unknown' };

const blockHashHex = (receipt: TransactionReceipt): string | undefined => {
	if (isNullish(receipt.blockHash)) return undefined;
	return String(
		format({ format: 'bytes32' }, receipt.blockHash as Bytes, QRL_DATA_FORMAT),
	).toLowerCase();
};

/**
 * Re-fetches the receipt of the transaction being confirmed and compares the block it is in with
 * the one the watcher counts from. The confirmation watchers call it for every new block, so a
 * transaction that a reorg dropped is reported instead of being "confirmed" by blocks that no
 * longer contain it, and one that was re-included is confirmed from its new block.
 *
 * Only a `null` reply means the transaction is gone; a failed lookup or a malformed reply is
 * `unknown` and leaves the watcher counting from the receipt it has.
 */
export const recheckReceipt = async (
	web3Context: Web3Context<QRLExecutionAPI>,
	receipt: TransactionReceipt,
): Promise<ReceiptRecheck> => {
	if (isNullish(receipt.transactionHash)) return { kind: 'unknown' };
	const transactionHash = format(
		{ format: 'bytes32' },
		receipt.transactionHash as Bytes,
		QRL_DATA_FORMAT,
	) as HexString;

	let fresh: unknown;
	try {
		fresh = await qrlRpcMethods.getTransactionReceipt(
			web3Context.requestManager,
			transactionHash,
		);
	} catch {
		return { kind: 'unknown' };
	}
	// eslint-disable-next-line no-null/no-null
	if (fresh === null) return { kind: 'missing' };
	if (
		!isObject(fresh) ||
		!isHash32(fresh.blockHash) ||
		!isValidUnsignedHexNumber(fresh.blockNumber) ||
		!isValidUnsignedHexNumber(fresh.status)
	) {
		return { kind: 'unknown' };
	}
	if (fresh.blockHash.toLowerCase() === blockHashHex(receipt)) return { kind: 'unchanged' };
	return { kind: 'moved', receipt: fresh as unknown as TransactionReceipt };
};

/** The error reported when the confirmed transaction has left the canonical chain. */
export const missingReceiptError = <ReturnFormat extends DataFormat>(
	receipt: TransactionReceipt,
	returnFormat: ReturnFormat,
): TransactionMissingReceiptOrBlockHashError =>
	new TransactionMissingReceiptOrBlockHashError({
		receipt: format(transactionReceiptSchema, receipt, returnFormat),
		blockHash: format({ format: 'bytes32' }, receipt.blockHash as Bytes, returnFormat),
		transactionHash: format(
			{ format: 'bytes32' },
			receipt.transactionHash as Bytes,
			returnFormat,
		),
	});

/** A reorg can change execution outcome; surface that change instead of confirming it silently. */
export const changedReceiptStatusError = (
	previous: TransactionReceipt,
	fresh: TransactionReceipt,
) =>
	isUInt(previous.status) &&
	isUInt(fresh.status) &&
	BigInt(previous.status) !== BigInt(fresh.status)
		? new TransactionError(
				'Transaction execution status changed after a chain reorganization',
				fresh,
			)
		: undefined;
