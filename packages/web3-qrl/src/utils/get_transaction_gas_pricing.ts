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
import {
	QRLExecutionAPI,
	Numbers,
	Transaction,
	DataFormat,
	FormatType,
	QRL_DATA_FORMAT,
} from '@theqrl/web3-types';
import { isNullish, isObject } from '@theqrl/web3-validator';
import {
	InvalidMaxPriorityFeePerGasOrMaxFeePerGas,
	UnsupportedTransactionTypeError,
} from '@theqrl/web3-errors';
import { format, toBigInt } from '@theqrl/web3-utils';
import { getBlock } from './rpc_method_wrappers_readers.js';
import { InternalTransaction } from '../types.js';
import { getTransactionType } from './get_transaction_type.js';
import { invalidResponseError } from './invalid_response_error.js';

// 256-bit unsigned upper bound; on-chain fee fields are uint256.
const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

/**
 * The value as an unsigned 256-bit quantity, or `undefined` when it is missing, negative,
 * out of range or not a number at all.
 */
const toUint256 = (value: unknown): bigint | undefined => {
	if (typeof value === 'string' && value.startsWith('-')) return undefined;
	try {
		const result = toBigInt(value);
		return result < BigInt(0) || result > MAX_UINT256 ? undefined : result;
	} catch {
		return undefined;
	}
};

async function getEip1559GasPricing<ReturnFormat extends DataFormat>(
	transaction: FormatType<Transaction, typeof QRL_DATA_FORMAT>,
	web3Context: Web3Context<QRLExecutionAPI>,
	returnFormat: ReturnFormat,
): Promise<FormatType<{ maxPriorityFeePerGas?: Numbers; maxFeePerGas?: Numbers }, ReturnFormat>> {
	const block: unknown = await getBlock(
		web3Context,
		web3Context.defaultBlock,
		false,
		returnFormat,
	);

	// The block is node supplied: a missing block or a `baseFeePerGas` that is not a quantity
	// used to surface as a raw `TypeError`/`SyntaxError` or a plain `Error` (L-26).
	if (!isObject(block)) {
		throw invalidResponseError('qrl_getBlockByNumber', 'a block object', block);
	}
	const baseFeePerGas = toUint256(block.baseFeePerGas);
	if (baseFeePerGas === undefined) {
		throw invalidResponseError(
			'qrl_getBlockByNumber',
			'a block with a hex quantity in baseFeePerGas',
			block.baseFeePerGas,
		);
	}

	const requestedMaxPriorityFeePerGas =
		transaction.maxPriorityFeePerGas ?? web3Context.defaultMaxPriorityFeePerGas;
	let maxPriorityFeePerGas = toUint256(requestedMaxPriorityFeePerGas);
	if (maxPriorityFeePerGas === undefined) {
		throw new InvalidMaxPriorityFeePerGasOrMaxFeePerGas({
			maxPriorityFeePerGas: requestedMaxPriorityFeePerGas as Numbers | undefined,
			maxFeePerGas: transaction.maxFeePerGas,
		});
	}
	const maxFeePerGas = toUint256(
		transaction.maxFeePerGas ?? baseFeePerGas * BigInt(2) + maxPriorityFeePerGas,
	);
	if (maxFeePerGas === undefined) {
		throw new InvalidMaxPriorityFeePerGasOrMaxFeePerGas({
			maxPriorityFeePerGas,
			maxFeePerGas:
				transaction.maxFeePerGas ?? baseFeePerGas * BigInt(2) + maxPriorityFeePerGas,
		});
	}
	// An omitted tip is a default, not permission to exceed the caller's fee cap.
	if (isNullish(transaction.maxPriorityFeePerGas) && maxPriorityFeePerGas > maxFeePerGas)
		maxPriorityFeePerGas = maxFeePerGas;
	if (maxPriorityFeePerGas > maxFeePerGas) {
		throw new InvalidMaxPriorityFeePerGasOrMaxFeePerGas({ maxPriorityFeePerGas, maxFeePerGas });
	}

	return {
		maxPriorityFeePerGas: format(
			{ format: 'uint' },
			maxPriorityFeePerGas as Numbers,
			returnFormat,
		),
		maxFeePerGas: format({ format: 'uint' }, maxFeePerGas as Numbers, returnFormat),
	};
}

export async function getTransactionGasPricing<ReturnFormat extends DataFormat>(
	transaction: InternalTransaction,
	web3Context: Web3Context<QRLExecutionAPI>,
	returnFormat: ReturnFormat,
): Promise<
	FormatType<{ maxPriorityFeePerGas?: Numbers; maxFeePerGas?: Numbers }, ReturnFormat> | undefined
> {
	const transactionType = getTransactionType(transaction, web3Context);
	if (!isNullish(transactionType)) {
		if (transactionType.startsWith('-'))
			throw new UnsupportedTransactionTypeError(transactionType);

		if (transactionType !== '0x2') throw new UnsupportedTransactionTypeError(transactionType);

		return {
			...(await getEip1559GasPricing(transaction, web3Context, returnFormat)),
		};
	}

	return undefined;
}
