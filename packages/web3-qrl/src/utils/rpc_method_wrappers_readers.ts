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

// Leaf module holding the low-level JSON-RPC *read* wrappers. These were split
// out of `rpc_method_wrappers.ts` so the transaction-orchestration utilities can
// depend on them without forming a source-level import cycle with
// `rpc_method_wrappers.ts` (which in turn imports those orchestration utilities).
// `rpc_method_wrappers.ts` re-exports every symbol below, so its public export
// surface is unchanged.
import {
	QRL_DATA_FORMAT,
	DataFormat,
	DEFAULT_RETURN_FORMAT,
	QRLExecutionAPI,
	Address,
	BlockTag,
	BlockNumberOrTag,
	Bytes,
	HexString,
	Numbers,
	Block,
	TransactionReceipt,
	Transaction,
	TransactionCall,
} from '@theqrl/web3-types';
import { Web3Context } from '@theqrl/web3-core';
import { format } from '@theqrl/web3-utils';
import { isBlockTag, isBytes, isNullish, isObject } from '@theqrl/web3-validator';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import { blockSchema, transactionReceiptSchema } from '../schemas.js';
import { formatTransaction } from './format_transaction.js';
import { expectQuantityReply, invalidResponseError } from './invalid_response_error.js';
import { validateTransactionInput } from './transaction_input.js';

/**
 * View additional documentations here: {@link Web3QRL.getBlockNumber}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getBlockNumber<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	returnFormat: ReturnFormat,
) {
	const response = await qrlRpcMethods.getBlockNumber(web3Context.requestManager);

	return format({ format: 'uint' }, response as Numbers, returnFormat);
}

/**
 * View additional documentations here: {@link Web3QRL.getBlock}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getBlock<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	block: Bytes | BlockNumberOrTag = web3Context.defaultBlock,
	hydrated = false,
	returnFormat: ReturnFormat,
) {
	let response;
	if (isBytes(block)) {
		const blockHashFormatted = format({ format: 'bytes32' }, block, QRL_DATA_FORMAT);
		response = await qrlRpcMethods.getBlockByHash(
			web3Context.requestManager,
			blockHashFormatted as HexString,
			hydrated,
		);
	} else {
		const blockNumberFormatted = isBlockTag(block as string)
			? (block as BlockTag)
			: format({ format: 'uint' }, block as Numbers, QRL_DATA_FORMAT);
		response = await qrlRpcMethods.getBlockByNumber(
			web3Context.requestManager,
			blockNumberFormatted,
			hydrated,
		);
	}
	return format(blockSchema, response as unknown as Block, returnFormat);
}

/**
 * View additional documentations here: {@link Web3QRL.getTransactionReceipt}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getTransactionReceipt<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	transactionHash: Bytes,
	returnFormat: ReturnFormat,
) {
	const transactionHashFormatted = format(
		{ format: 'bytes32' },
		transactionHash,
		DEFAULT_RETURN_FORMAT,
	);
	const response = await qrlRpcMethods.getTransactionReceipt(
		web3Context.requestManager,
		transactionHashFormatted,
	);

	if (isNullish(response)) return response;
	// A receipt that is not an object (`'abc'`) used to be handed back as is (L-26).
	if (!isObject(response)) {
		throw invalidResponseError('qrl_getTransactionReceipt', 'a receipt object', response);
	}

	return format(
		transactionReceiptSchema,
		response as unknown as TransactionReceipt,
		returnFormat,
	) as TransactionReceipt;
}

/**
 * View additional documentations here: {@link Web3QRL.getTransactionCount}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getTransactionCount<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	address: Address,
	blockNumber: BlockNumberOrTag = web3Context.defaultBlock,
	returnFormat: ReturnFormat,
) {
	const blockNumberFormatted = isBlockTag(blockNumber as string)
		? (blockNumber as BlockTag)
		: format({ format: 'uint' }, blockNumber as Numbers, QRL_DATA_FORMAT);
	const response = await qrlRpcMethods.getTransactionCount(
		web3Context.requestManager,
		address,
		blockNumberFormatted,
	);

	return format({ format: 'uint' }, response as Numbers, returnFormat);
}

// TODO - Investigate whether response is padded as 1.x docs suggest
/**
 * View additional documentations here: {@link Web3QRL.estimateGas}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function estimateGas<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	transaction: Transaction,
	blockNumber: BlockNumberOrTag = web3Context.defaultBlock,
	returnFormat: ReturnFormat,
) {
	validateTransactionInput(transaction);
	const transactionFormatted = formatTransaction(transaction, QRL_DATA_FORMAT);
	const blockNumberFormatted = isBlockTag(blockNumber as string)
		? (blockNumber as BlockTag)
		: format({ format: 'uint' }, blockNumber as Numbers, QRL_DATA_FORMAT);

	const response = await qrlRpcMethods.estimateGas(
		web3Context.requestManager,
		transactionFormatted,
		blockNumberFormatted,
	);

	return format({ format: 'uint' }, response as Numbers, returnFormat);
}

/**
 * View additional documentations here: {@link Web3QRL.getChainId}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getChainId<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	returnFormat: ReturnFormat,
) {
	const response = await qrlRpcMethods.getChainId(web3Context.requestManager);

	// `qrl_chainId` answers a hex quantity. Anything else (`'0x'`, `'abc'`, `null`) used to
	// surface as a raw `SyntaxError` or a mis-typed number error far down the signing path (L-26).
	return format({ format: 'uint' }, expectQuantityReply('qrl_chainId', response), returnFormat);
}

// TODO Decide what to do with transaction.to
// https://github.com/theqrl/web3.js/pull/4525#issuecomment-982330076
/**
 * View additional documentations here: {@link Web3QRL.call}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function call<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	transaction: TransactionCall,
	blockNumber: BlockNumberOrTag = web3Context.defaultBlock,
	returnFormat: ReturnFormat,
) {
	validateTransactionInput(transaction);
	const blockNumberFormatted = isBlockTag(blockNumber as string)
		? (blockNumber as BlockTag)
		: format({ format: 'uint' }, blockNumber as Numbers, QRL_DATA_FORMAT);

	const response = await qrlRpcMethods.call(
		web3Context.requestManager,
		formatTransaction(transaction, QRL_DATA_FORMAT),
		blockNumberFormatted,
	);

	return format({ format: 'bytes' }, response as Bytes, returnFormat);
}
