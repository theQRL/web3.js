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

// Disabling because returnTypes must be last param to match 1.x params
import {
	QRL_DATA_FORMAT,
	FormatType,
	DataFormat,
	DEFAULT_RETURN_FORMAT,
	QRLExecutionAPI,
	TransactionWithSenderAPI,
	SignedTransactionInfoAPI,
	Web3BaseWalletAccount,
	Address,
	BlockTag,
	BlockNumberOrTag,
	Bytes,
	Filter,
	HexString,
	Numbers,
	HexStringBytes,
	AccountObject,
	FeeHistory,
	Log,
	TransactionReceipt,
	Transaction,
	TransactionCall,
	Web3QRLExecutionAPI,
	TransactionWithFromLocalWalletIndex,
	TransactionWithToLocalWalletIndex,
	TransactionWithFromAndToLocalWalletIndex,
	TransactionForAccessList,
	AccessListResult,
	QRLTypedData,
} from '@theqrl/web3-types';
import { Web3Context, Web3PromiEvent } from '@theqrl/web3-core';
import { format, hexToBytes, bytesToUint8Array, sha3Raw } from '@theqrl/web3-utils';
import { TransactionFactory } from '@theqrl/web3-qrl-accounts';
import { isBlockTag, isHexStrict, isNullish, isObject, isString } from '@theqrl/web3-validator';
import { ContractExecutionError, SignatureError } from '@theqrl/web3-errors';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import { decodeSignedTransaction } from './utils/decode_signed_transaction.js';
import {
	transactionInfoSchema,
	accountSchema,
	feeHistorySchema,
	logSchema,
	transactionReceiptSchema,
	accessListResultSchema,
	SignatureObjectSchema,
} from './schemas.js';
import {
	SendSignedTransactionEvents,
	SendSignedTransactionOptions,
	SendTransactionEvents,
	SendTransactionOptions,
} from './types.js';
import { getTransactionFromOrToAttr } from './utils/transaction_builder.js';
import { formatTransaction } from './utils/format_transaction.js';
import { getTransactionGasPricing } from './utils/get_transaction_gas_pricing.js';
import { trySendTransaction } from './utils/try_send_transaction.js';
import { waitForTransactionReceipt } from './utils/wait_for_transaction_receipt.js';
import { watchTransactionForConfirmations } from './utils/watch_transaction_for_confirmations.js';
import { NUMBER_DATA_FORMAT } from './constants.js';
import { getTransactionError } from './utils/get_transaction_error.js';
import { getRevertReason } from './utils/get_revert_reason.js';
import { isTransactionStatusSuccessful } from './validation.js';
import { validateTransactionInput } from './utils/transaction_input.js';
import {
	reportListenerError,
	reportSendFailure,
	reportWatcherError,
} from './utils/promi_event_errors.js';
import {
	expectBytesReply,
	assertRpcResult,
	expectQuantityReply,
	expectTransactionHashReply,
	invalidResponseError,
} from './utils/invalid_response_error.js';
import { isBlockHash } from './utils/hex_guards.js';

/** A block number given as a number, bigint or decimal string is sent as a hex quantity. */
const toBlockNumberOrTag = (block: BlockNumberOrTag | undefined): BlockNumberOrTag | undefined =>
	isNullish(block) || isBlockTag(block as string)
		? block
		: format({ format: 'uint' }, block as Numbers, QRL_DATA_FORMAT);

// The low-level JSON-RPC *read* wrappers below were moved to a leaf module so the
// transaction-orchestration utilities imported above can depend on them without
// forming a source-level import cycle back into this file. They are re-exported
// here so this module's public export surface remains unchanged.
export {
	getBlockNumber,
	getBlock,
	getTransactionReceipt,
	getTransactionCount,
	estimateGas,
	getChainId,
	call,
} from './utils/rpc_method_wrappers_readers.js';

// TODO Add returnFormat parameter
/**
 * View additional documentations here: {@link Web3QRL.isSyncing}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export const isSyncing = async (web3Context: Web3Context<QRLExecutionAPI>) =>
	qrlRpcMethods.getSyncing(web3Context.requestManager);

/**
 * View additional documentations here: {@link Web3QRL.getGasPrice}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getGasPrice<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	returnFormat: ReturnFormat,
) {
	const response = await qrlRpcMethods.getGasPrice(web3Context.requestManager);

	return format({ format: 'uint' }, expectQuantityReply('qrl_gasPrice', response), returnFormat);
}

/**
 * View additional documentations here: {@link Web3QRL.getMaxPriorityFeePerGas}
 * @param web3Context - ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 * @throws InvalidResponseError when the node's reply is not a hex quantity (L-26).
 */
export async function getMaxPriorityFeePerGas<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	returnFormat: ReturnFormat,
) {
	const response = await qrlRpcMethods.getMaxPriorityFeePerGas(web3Context.requestManager);

	return format(
		{ format: 'uint' },
		expectQuantityReply('qrl_maxPriorityFeePerGas', response),
		returnFormat,
	);
}
/**
 * View additional documentations here: {@link Web3QRL.getBalance}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getBalance<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	address: Address,
	blockNumber: BlockNumberOrTag = web3Context.defaultBlock,
	returnFormat: ReturnFormat,
) {
	const blockNumberFormatted = isBlockTag(blockNumber as string)
		? (blockNumber as BlockTag)
		: format({ format: 'uint' }, blockNumber as Numbers, QRL_DATA_FORMAT);
	const response = await qrlRpcMethods.getBalance(
		web3Context.requestManager,
		address,
		blockNumberFormatted,
	);
	// An object or `'abc'` used to be returned as the balance (P4-L-13).
	return format(
		{ format: 'uint' },
		expectQuantityReply('qrl_getBalance', response),
		returnFormat,
	);
}

/**
 * View additional documentations here: {@link Web3QRL.getStorageAt}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getStorageAt<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	address: Address,
	storageSlot: Numbers,
	blockNumber: BlockNumberOrTag = web3Context.defaultBlock,
	returnFormat: ReturnFormat,
) {
	const storageSlotFormatted = format({ format: 'uint' }, storageSlot, QRL_DATA_FORMAT);
	const blockNumberFormatted = isBlockTag(blockNumber as string)
		? (blockNumber as BlockTag)
		: format({ format: 'uint' }, blockNumber as Numbers, QRL_DATA_FORMAT);
	const response = await qrlRpcMethods.getStorageAt(
		web3Context.requestManager,
		address,
		storageSlotFormatted,
		blockNumberFormatted,
	);
	return format(
		{ format: 'bytes' },
		expectBytesReply('qrl_getStorageAt', response),
		returnFormat,
	);
}

/**
 * View additional documentations here: {@link Web3QRL.getCode}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getCode<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	address: Address,
	blockNumber: BlockNumberOrTag = web3Context.defaultBlock,
	returnFormat: ReturnFormat,
) {
	const blockNumberFormatted = isBlockTag(blockNumber as string)
		? (blockNumber as BlockTag)
		: format({ format: 'uint' }, blockNumber as Numbers, QRL_DATA_FORMAT);
	const response = await qrlRpcMethods.getCode(
		web3Context.requestManager,
		address,
		blockNumberFormatted,
	);
	return format({ format: 'bytes' }, expectBytesReply('qrl_getCode', response), returnFormat);
}

/**
 * View additional documentations here: {@link Web3QRL.getBlockTransactionCount}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getBlockTransactionCount<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	block: Bytes | BlockNumberOrTag = web3Context.defaultBlock,
	returnFormat: ReturnFormat,
) {
	let response;
	let method: 'qrl_getBlockTransactionCountByHash' | 'qrl_getBlockTransactionCountByNumber';
	// Only a 32-byte value is a block hash; `'0x10'` is a block number (P4-L-11).
	if (isBlockHash(block)) {
		method = 'qrl_getBlockTransactionCountByHash';
		const blockHashFormatted = format({ format: 'bytes32' }, block, QRL_DATA_FORMAT);
		response = await qrlRpcMethods.getBlockTransactionCountByHash(
			web3Context.requestManager,
			blockHashFormatted as HexString,
		);
	} else {
		method = 'qrl_getBlockTransactionCountByNumber';
		const blockNumberFormatted = isBlockTag(block as string)
			? (block as BlockTag)
			: format({ format: 'uint' }, block as Numbers, QRL_DATA_FORMAT);
		response = await qrlRpcMethods.getBlockTransactionCountByNumber(
			web3Context.requestManager,
			blockNumberFormatted,
		);
	}

	// A reply that is not a quantity used to be returned as it came (P4-L-13).
	return format({ format: 'uint' }, expectQuantityReply(method, response), returnFormat);
}

/**
 * View additional documentations here: {@link Web3QRL.getTransaction}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getTransaction<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	transactionHash: Bytes,
	returnFormat: ReturnFormat,
) {
	const transactionHashFormatted = format(
		{ format: 'bytes32' },
		transactionHash,
		DEFAULT_RETURN_FORMAT,
	);
	const response = await qrlRpcMethods.getTransactionByHash(
		web3Context.requestManager,
		transactionHashFormatted,
	);

	if (isNullish(response)) return response;
	if (!isObject(response)) {
		throw invalidResponseError('qrl_getTransactionByHash', 'a transaction object', response);
	}

	assertRpcResult('qrl_getTransaction', response, transactionInfoSchema);
	return formatTransaction(response, returnFormat, { fillInputAndData: true });
}

/**
 * View additional documentations here: {@link Web3QRL.getPendingTransactions}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 * @throws InvalidResponseError when the node's reply is not an array of transaction objects (L-26).
 */
export async function getPendingTransactions<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	returnFormat: ReturnFormat,
) {
	const response: unknown = await qrlRpcMethods.getPendingTransactions(
		web3Context.requestManager,
	);

	// `null` or a non-array reply used to surface as a raw `TypeError` (`reading 'map'`).
	if (!Array.isArray(response)) {
		throw invalidResponseError(
			'qrl_pendingTransactions',
			'an array of transaction objects',
			response,
		);
	}

	return response.map((transaction: unknown) => {
		if (!isObject(transaction)) {
			throw invalidResponseError(
				'qrl_pendingTransactions',
				'an array of transaction objects',
				transaction,
			);
		}
		assertRpcResult('qrl_pendingTransactions', transaction, transactionInfoSchema);
		return formatTransaction(transaction as unknown as Transaction, returnFormat, {
			fillInputAndData: true,
		});
	});
}

/**
 * View additional documentations here: {@link Web3QRL.getTransactionFromBlock}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getTransactionFromBlock<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	block: Bytes | BlockNumberOrTag = web3Context.defaultBlock,
	transactionIndex: Numbers,
	returnFormat: ReturnFormat,
) {
	const transactionIndexFormatted = format({ format: 'uint' }, transactionIndex, QRL_DATA_FORMAT);

	let response;
	// Only a 32-byte value is a block hash; `'0x10'` is a block number (P4-L-11).
	if (isBlockHash(block)) {
		const blockHashFormatted = format({ format: 'bytes32' }, block, QRL_DATA_FORMAT);
		response = await qrlRpcMethods.getTransactionByBlockHashAndIndex(
			web3Context.requestManager,
			blockHashFormatted as HexString,
			transactionIndexFormatted,
		);
	} else {
		const blockNumberFormatted = isBlockTag(block as string)
			? (block as BlockTag)
			: format({ format: 'uint' }, block as Numbers, QRL_DATA_FORMAT);
		response = await qrlRpcMethods.getTransactionByBlockNumberAndIndex(
			web3Context.requestManager,
			blockNumberFormatted,
			transactionIndexFormatted,
		);
	}

	if (isNullish(response)) return response;
	if (!isObject(response)) {
		throw invalidResponseError(
			'qrl_getTransactionByBlock*AndIndex',
			'a transaction object',
			response,
		);
	}

	assertRpcResult('qrl_getTransaction', response, transactionInfoSchema);
	return formatTransaction(response, returnFormat, { fillInputAndData: true });
}

/**
 * View additional documentations here: {@link Web3QRL.sendTransaction}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export function sendTransaction<
	ReturnFormat extends DataFormat,
	ResolveType = FormatType<TransactionReceipt, ReturnFormat>,
>(
	web3Context: Web3Context<QRLExecutionAPI>,
	transaction:
		| Transaction
		| TransactionWithFromLocalWalletIndex
		| TransactionWithToLocalWalletIndex
		| TransactionWithFromAndToLocalWalletIndex,
	returnFormat: ReturnFormat,
	options: SendTransactionOptions<ResolveType> = { checkRevertBeforeSending: true },
): Web3PromiEvent<ResolveType, SendTransactionEvents<ReturnFormat>> {
	const promiEvent = new Web3PromiEvent<ResolveType, SendTransactionEvents<ReturnFormat>>(
		(resolve, reject) => {
			setImmediate(() => {
				// Terminal outcome contract: the PromiEvent settles exactly once and the
				// failure of the send is emitted as an `error` event at most once. Rejecting
				// an already settled Promise is a no-op, but emitting an event is not, so
				// every terminal branch goes through one of the guarded helpers below and
				// returns immediately. The Promise always rejects on failure; the `error`
				// event carries the same failure (as a typed error) to an attached listener.
				// (An exception thrown by one of the caller's own listeners after the
				// broadcast is reported there as well, see `reportListenerError`.)
				let settled = false;

				const succeedOnce = (value: ResolveType) => {
					if (settled) return;
					settled = true;
					resolve(value);
				};

				const failOnce = (error: unknown) => {
					if (settled) return;
					settled = true;
					// The rejection is the primary report and comes first: neither a failing
					// custom-error decode nor a throwing `error` listener can leave the PromiEvent
					// pending any more (P4-L-10). The event-side reporting follows (M-7b).
					reject(error);
					reportSendFailure(promiEvent, error, options?.contractAbi);
				};

				// A listener that throws after the transaction was broadcast must not reject a
				// transaction the node already holds; its failure is reported on the side
				// (P4-L-10). `sending` is emitted before the broadcast inside the `try`, so a
				// throwing `sending` listener still aborts the send through the error path.
				const emitAfterBroadcast = <K extends keyof SendTransactionEvents<ReturnFormat>>(
					event: K,
					value: SendTransactionEvents<ReturnFormat>[K],
				) => {
					if (promiEvent.listenerCount(event) === 0) return;
					try {
						promiEvent.emit(event, value);
					} catch (listenerError) {
						reportListenerError(promiEvent, event, listenerError);
					}
				};

				const execute = async () => {
					const formatInputTransaction = () => {
						// A legacy `gasPrice` and quantities given as unsafe JavaScript numbers
						// are rejected before the formatter can drop or round them (L-50, L-55).
						validateTransactionInput(transaction);
						return formatTransaction(
							{
								...transaction,
								from: getTransactionFromOrToAttr('from', web3Context, transaction),
								to: getTransactionFromOrToAttr('to', web3Context, transaction),
							},
							QRL_DATA_FORMAT,
						);
					};

					// Declared outside the `try` so the `catch` can still reference it for
					// typed-error normalization, while formatting and gas pricing - both of
					// which can throw - stay inside the catchable region.
					let transactionFormatted: ReturnType<typeof formatInputTransaction> | undefined;

					try {
						transactionFormatted = formatInputTransaction();

						if (
							!options?.ignoreGasPricing &&
							(isNullish(transaction.maxPriorityFeePerGas) ||
								isNullish(transaction.maxFeePerGas))
						) {
							transactionFormatted = {
								...transactionFormatted,
								// TODO maxPriorityFeePerGas, maxFeePerGas
								// should not be included if undefined, but currently are
								...(await getTransactionGasPricing(
									transactionFormatted,
									web3Context,
									QRL_DATA_FORMAT,
								)),
							};
						}

						if (options.checkRevertBeforeSending !== false) {
							const reason = await getRevertReason(
								web3Context,
								transactionFormatted as TransactionCall,
								options.contractAbi,
							);
							if (reason !== undefined) {
								const error = await getTransactionError<ReturnFormat>(
									web3Context,
									transactionFormatted as TransactionCall,
									undefined,
									undefined,
									options.contractAbi,
									reason,
								);

								failOnce(error);
								return;
							}
						}

						if (promiEvent.listenerCount('sending') > 0) {
							promiEvent.emit('sending', transactionFormatted);
						}

						let transactionHash: HexString;
						let wallet: Web3BaseWalletAccount | undefined;

						if (web3Context.wallet && !isNullish(transactionFormatted.from)) {
							wallet = web3Context.wallet.get(transactionFormatted.from);
						}

						if (wallet) {
							// Built-in accounts accept the calling context; custom wallets can
							// keep their one-argument signer and normal receiver binding.
							const signWithContext = wallet.signTransaction as (
								tx: Transaction,
								context?: Web3Context<QRLExecutionAPI>,
							) => ReturnType<NonNullable<typeof wallet>['signTransaction']>;
							const signedTransaction = await signWithContext.call(
								wallet,
								transactionFormatted,
								web3Context,
							);

							// The hash is known before the node answers: it is `keccak256` of the raw
							// transaction. The node's reply must be that hash, and the local value is
							// the one emitted and polled for, so a node cannot hand back the receipt
							// of a different transaction (P4-L-9).
							transactionHash = expectTransactionHashReply(
								'qrl_sendRawTransaction',
								await trySendTransaction(
									web3Context,
									async (): Promise<string> =>
										qrlRpcMethods.sendRawTransaction(
											web3Context.requestManager,
											signedTransaction.rawTransaction,
										),
									signedTransaction.transactionHash,
								),
								signedTransaction.transactionHash,
							);
						} else {
							// The node signs, so only the shape of its reply can be checked.
							transactionHash = expectTransactionHashReply(
								'qrl_sendTransaction',
								await trySendTransaction(
									web3Context,
									async (): Promise<string> =>
										qrlRpcMethods.sendTransaction(
											web3Context.requestManager,
											transactionFormatted as Partial<TransactionWithSenderAPI>,
										),
								),
							);
						}

						const transactionHashFormatted = format(
							{ format: 'bytes32' },
							transactionHash as Bytes,
							returnFormat,
						);

						emitAfterBroadcast('sent', transactionFormatted);
						emitAfterBroadcast('transactionHash', transactionHashFormatted);

						// The receipt is awaited in the wire format and its `status` is decided
						// on that: the caller's `returnFormat` must not be able to influence the
						// outcome (it used to, see H-1). It is formatted for the caller after.
						const transactionReceipt = await waitForTransactionReceipt(
							web3Context,
							transactionHash,
							QRL_DATA_FORMAT,
						);

						const transactionReceiptFormatted = format(
							transactionReceiptSchema,
							transactionReceipt,
							returnFormat,
						);

						emitAfterBroadcast('receipt', transactionReceiptFormatted);

						if (options?.transactionResolver) {
							succeedOnce(
								options?.transactionResolver(
									transactionReceiptFormatted,
								) as unknown as ResolveType,
							);
						} else if (!isTransactionStatusSuccessful(transactionReceipt.status)) {
							// Allow-list: only a status of 1 is a success. A `0`, a missing,
							// `null` or unparseable status is reported as a revert (H-1).
							const error = await getTransactionError<ReturnFormat>(
								web3Context,
								transactionFormatted as TransactionCall,
								transactionReceiptFormatted,
								undefined,
								options?.contractAbi,
							);

							failOnce(error);
						} else {
							succeedOnce(transactionReceiptFormatted as unknown as ResolveType);
						}

						if (promiEvent.listenerCount('confirmation') > 0) {
							try {
								watchTransactionForConfirmations<ReturnFormat, ResolveType>(
									web3Context,
									promiEvent,
									transactionReceiptFormatted as TransactionReceipt,
									transactionHash,
									returnFormat,
								);
							} catch (error) {
								// The PromiEvent has settled; a receipt the watcher cannot use
								// (no `blockNumber`) is reported instead of being lost (L-54).
								reportWatcherError(promiEvent, error);
							}
						}
					} catch (error) {
						let _error = error;

						if (_error instanceof ContractExecutionError && web3Context.handleRevert) {
							_error = await getTransactionError(
								web3Context,
								transactionFormatted as TransactionCall,
								undefined,
								error,
								options?.contractAbi,
							);
						}

						failOnce(_error);
					}
				};

				// Last-resort guard: `execute` handles its own errors, but if the `catch`
				// itself throws (e.g. the error normalization RPC call fails) the
				// PromiEvent must still settle rather than hang with an unhandled
				// rejection.
				void execute().catch((error: unknown) => {
					failOnce(error);
				});
			});
		},
	);

	return promiEvent;
}

/**
 * View additional documentations here: {@link Web3QRL.sendSignedTransaction}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export function sendSignedTransaction<
	ReturnFormat extends DataFormat,
	ResolveType = FormatType<TransactionReceipt, ReturnFormat>,
>(
	web3Context: Web3Context<QRLExecutionAPI>,
	signedTransaction: Bytes,
	returnFormat: ReturnFormat,
	options: SendSignedTransactionOptions<ResolveType> = { checkRevertBeforeSending: true },
): Web3PromiEvent<ResolveType, SendSignedTransactionEvents<ReturnFormat>> {
	const promiEvent = new Web3PromiEvent<ResolveType, SendSignedTransactionEvents<ReturnFormat>>(
		(resolve, reject) => {
			setImmediate(() => {
				// Terminal outcome contract: the PromiEvent settles exactly once and the
				// failure of the send is emitted as an `error` event at most once. Rejecting
				// an already settled Promise is a no-op, but emitting an event is not, so
				// every terminal branch goes through one of the guarded helpers below and
				// returns immediately. The Promise always rejects on failure; the `error`
				// event carries the same failure (as a typed error) to an attached listener.
				// (An exception thrown by one of the caller's own listeners after the
				// broadcast is reported there as well, see `reportListenerError`.)
				let settled = false;

				const succeedOnce = (value: ResolveType) => {
					if (settled) return;
					settled = true;
					resolve(value);
				};

				const failOnce = (error: unknown) => {
					if (settled) return;
					settled = true;
					// See `sendTransaction` (P4-L-10, M-7b): reject first, report on the side after.
					reject(error);
					reportSendFailure(promiEvent, error, options?.contractAbi);
				};

				// See `sendTransaction` (P4-L-10).
				const emitAfterBroadcast = <
					K extends keyof SendSignedTransactionEvents<ReturnFormat>,
				>(
					event: K,
					value: SendSignedTransactionEvents<ReturnFormat>[K],
				) => {
					if (promiEvent.listenerCount(event) === 0) return;
					try {
						promiEvent.emit(event, value);
					} catch (listenerError) {
						reportListenerError(promiEvent, event, listenerError);
					}
				};

				const execute = async () => {
					const deserializeTransaction = () => {
						// Formatting signedTransaction to be send to RPC endpoint
						const signedTransactionFormattedHex = format(
							{ format: 'bytes' },
							signedTransaction,
							QRL_DATA_FORMAT,
						);
						const unSerializedTransaction = TransactionFactory.fromSerializedData(
							bytesToUint8Array(hexToBytes(signedTransactionFormattedHex)),
						);

						return {
							signedTransactionFormattedHex,
							unSerializedTransactionWithFrom: {
								...unSerializedTransaction.toJSON(),
								// Some providers will default `from` to address(0) causing
								// the error reported from `qrl_call` to not be the reason
								// the user's tx failed e.g. `qrl_call` will return an Out
								// of Gas error for a failed smart contract execution
								// contract, because the sender, address(0), has no balance
								// to pay for the gas of the transaction execution
								// The sender is derived from the public key embedded in the raw
								// transaction, which is only meaningful once the signature over it
								// verifies; an unverifiable transaction is simulated without one.
								from: unSerializedTransaction.verifySignature()
									? unSerializedTransaction.getSenderAddress().toString()
									: undefined,
							},
						};
					};

					type UnSerializedTransactionWithFrom = ReturnType<
						typeof deserializeTransaction
					>['unSerializedTransactionWithFrom'];

					// Declared outside the `try` so the `catch` can still reference it for
					// typed-error normalization, while the formatting and deserialization -
					// both of which can throw - stay inside the catchable region.
					let unSerializedTransactionWithFrom:
						| UnSerializedTransactionWithFrom
						| undefined;

					try {
						const deserialized = deserializeTransaction();
						const { signedTransactionFormattedHex } = deserialized;
						unSerializedTransactionWithFrom =
							deserialized.unSerializedTransactionWithFrom;

						if (options.checkRevertBeforeSending !== false) {
							const reason = await getRevertReason(
								web3Context,
								unSerializedTransactionWithFrom as TransactionCall,
								options.contractAbi,
							);
							if (reason !== undefined) {
								const error = await getTransactionError<ReturnFormat>(
									web3Context,
									unSerializedTransactionWithFrom as TransactionCall,
									undefined,
									undefined,
									options.contractAbi,
									reason,
								);

								failOnce(error);
								return;
							}
						}

						if (promiEvent.listenerCount('sending') > 0) {
							promiEvent.emit('sending', signedTransactionFormattedHex);
						}

						// The hash of a raw transaction is `keccak256` of its bytes and is computed
						// here; the node's reply must equal it, and the local value is the one
						// emitted and polled for (P4-L-9).
						const localTransactionHash = sha3Raw(signedTransactionFormattedHex);
						const transactionHash = expectTransactionHashReply(
							'qrl_sendRawTransaction',
							await trySendTransaction(
								web3Context,
								async (): Promise<string> =>
									qrlRpcMethods.sendRawTransaction(
										web3Context.requestManager,
										signedTransactionFormattedHex,
									),
								localTransactionHash,
							),
							localTransactionHash,
						);

						emitAfterBroadcast('sent', signedTransactionFormattedHex);

						const transactionHashFormatted = format(
							{ format: 'bytes32' },
							transactionHash as Bytes,
							returnFormat,
						);

						emitAfterBroadcast('transactionHash', transactionHashFormatted);

						// See `sendTransaction` (H-1): the status is decided on the wire format.
						const transactionReceipt = await waitForTransactionReceipt(
							web3Context,
							transactionHash,
							QRL_DATA_FORMAT,
						);

						const transactionReceiptFormatted = format(
							transactionReceiptSchema,
							transactionReceipt,
							returnFormat,
						);

						emitAfterBroadcast('receipt', transactionReceiptFormatted);

						if (options?.transactionResolver) {
							succeedOnce(
								options?.transactionResolver(
									transactionReceiptFormatted,
								) as unknown as ResolveType,
							);
						} else if (!isTransactionStatusSuccessful(transactionReceipt.status)) {
							const error = await getTransactionError<ReturnFormat>(
								web3Context,
								unSerializedTransactionWithFrom as TransactionCall,
								transactionReceiptFormatted,
								undefined,
								options?.contractAbi,
							);

							failOnce(error);
						} else {
							succeedOnce(transactionReceiptFormatted as unknown as ResolveType);
						}

						if (promiEvent.listenerCount('confirmation') > 0) {
							try {
								watchTransactionForConfirmations<ReturnFormat, ResolveType>(
									web3Context,
									promiEvent,
									transactionReceiptFormatted as TransactionReceipt,
									transactionHash,
									returnFormat,
								);
							} catch (error) {
								reportWatcherError(promiEvent, error);
							}
						}
					} catch (error) {
						let _error = error;

						if (_error instanceof ContractExecutionError && web3Context.handleRevert) {
							_error = await getTransactionError(
								web3Context,
								unSerializedTransactionWithFrom as TransactionCall,
								undefined,
								error,
								options?.contractAbi,
							);
						}

						failOnce(_error);
					}
				};

				// Last-resort guard: `execute` handles its own errors, but if the `catch`
				// itself throws (e.g. the error normalization RPC call fails) the
				// PromiEvent must still settle rather than hang with an unhandled
				// rejection.
				void execute().catch((error: unknown) => {
					failOnce(error);
				});
			});
		},
	);

	return promiEvent;
}

/**
 * View additional documentations here: {@link Web3QRL.sign}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function sign<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	message: Bytes,
	addressOrIndex: Address | number,
	returnFormat: ReturnFormat,
) {
	const messageFormatted = format({ format: 'bytes' }, message, DEFAULT_RETURN_FORMAT);
	if (web3Context.wallet?.get(addressOrIndex)) {
		const wallet = web3Context.wallet.get(addressOrIndex) as Web3BaseWalletAccount;
		const signed = wallet.sign(messageFormatted);
		return format(SignatureObjectSchema, signed, returnFormat);
	}

	if (typeof addressOrIndex === 'number') {
		throw new SignatureError(
			message,
			'RPC method "qrl_sign" does not support index signatures',
		);
	}

	const response = await qrlRpcMethods.sign(
		web3Context.requestManager,
		addressOrIndex,
		messageFormatted,
	);

	return format({ format: 'bytes' }, expectBytesReply('qrl_sign', response), returnFormat);
}

/**
 * View additional documentations here: {@link Web3QRL.signTransaction}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function signTransaction<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	transaction: Transaction,
	returnFormat: ReturnFormat,
) {
	validateTransactionInput(transaction);
	const response: unknown = await qrlRpcMethods.signTransaction(
		web3Context.requestManager,
		formatTransaction(transaction, QRL_DATA_FORMAT),
	);
	// Some EVM-compatible test clients only return the encoded signed transaction,
	// while Gqrl returns the desired SignedTransactionInfoAPI object.
	if (isString(response as HexStringBytes)) {
		if (!isHexStrict(response as HexStringBytes)) {
			throw invalidResponseError(
				'qrl_signTransaction',
				'a hex encoded signed transaction',
				response,
			);
		}
		try {
			return decodeSignedTransaction(response as HexStringBytes, returnFormat, {
				fillInputAndData: true,
			});
		} catch {
			throw invalidResponseError(
				'qrl_signTransaction',
				'a decodable signed transaction',
				response,
			);
		}
	}
	// A `{ raw, tx }` reply used to be returned as it came, `null` included, so a missing or
	// mis-typed member surfaced as a raw `TypeError` or as garbage in the result (L-26).
	if (
		!isObject(response) ||
		!isHexStrict(response.raw as HexStringBytes) ||
		!isObject(response.tx)
	) {
		throw invalidResponseError('qrl_signTransaction', 'a { raw, tx } object', response);
	}
	const signed = response as unknown as SignedTransactionInfoAPI;
	try {
		decodeSignedTransaction(signed.raw, returnFormat);
	} catch {
		throw invalidResponseError(
			'qrl_signTransaction',
			'a decodable signed transaction',
			signed.raw,
		);
	}
	assertRpcResult('qrl_signTransaction', signed.tx, transactionInfoSchema);
	return {
		raw: format({ format: 'bytes' }, signed.raw, returnFormat),
		tx: formatTransaction(signed.tx, returnFormat, { fillInputAndData: true }),
	};
}

// TODO - Add input formatting to filter
/**
 * View additional documentations here: {@link Web3QRL.getPastLogs}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getLogs<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<Web3QRLExecutionAPI>,
	filter: Filter,
	returnFormat: ReturnFormat,
) {
	// A numeric `fromBlock`/`toBlock` (number, bigint or decimal string) is sent as a hex
	// quantity; block tags and hex strings pass through (I-12).
	const formattedFilter = {
		...filter,
		fromBlock: toBlockNumberOrTag(filter.fromBlock),
		toBlock: toBlockNumberOrTag(filter.toBlock),
	};

	const response: unknown = await qrlRpcMethods.getLogs(
		web3Context.requestManager,
		formattedFilter,
	);

	// `qrl_getLogs` answers an array of log objects; anything else used to surface as a raw
	// `TypeError` (`response.map is not a function`) or as unformatted garbage (L-26).
	if (!Array.isArray(response)) {
		throw invalidResponseError('qrl_getLogs', 'an array of logs', response);
	}

	return response.map((entry: unknown) => {
		if (!isObject(entry)) {
			throw invalidResponseError('qrl_getLogs', 'an array of log objects', entry);
		}

		assertRpcResult('qrl_getLogs', entry, logSchema);
		return format(logSchema, entry as unknown as Log, returnFormat);
	});
}

/**
 * View additional documentations here: {@link Web3QRL.getProof}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getProof<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<Web3QRLExecutionAPI>,
	address: Address,
	storageKeys: Bytes[],
	blockNumber: BlockNumberOrTag = web3Context.defaultBlock,
	returnFormat: ReturnFormat,
) {
	const storageKeysFormatted = storageKeys.map(storageKey =>
		format({ format: 'bytes' }, storageKey, QRL_DATA_FORMAT),
	);

	const blockNumberFormatted = isBlockTag(blockNumber as string)
		? (blockNumber as BlockTag)
		: format({ format: 'uint' }, blockNumber as Numbers, QRL_DATA_FORMAT);

	const response = await qrlRpcMethods.getProof(
		web3Context.requestManager,
		address,
		storageKeysFormatted,
		blockNumberFormatted,
	);

	assertRpcResult('qrl_getProof', response, accountSchema);
	return format(accountSchema, response as unknown as AccountObject, returnFormat);
}

// TODO Verify provider-specific fee history behavior against Gqrl.
// TODO gasUsedRatio and reward not formatting
/**
 * View additional documentations here: {@link Web3QRL.getFeeHistory}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function getFeeHistory<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	blockCount: Numbers,
	newestBlock: BlockNumberOrTag = web3Context.defaultBlock,
	rewardPercentiles: Numbers[],
	returnFormat: ReturnFormat,
) {
	const blockCountFormatted = format({ format: 'uint' }, blockCount, QRL_DATA_FORMAT);

	const newestBlockFormatted = isBlockTag(newestBlock as string)
		? (newestBlock as BlockTag)
		: format({ format: 'uint' }, newestBlock as Numbers, QRL_DATA_FORMAT);

	const rewardPercentilesFormatted = format(
		{
			type: 'array',
			items: {
				format: 'uint',
			},
		},
		rewardPercentiles,
		NUMBER_DATA_FORMAT,
	);

	const response = await qrlRpcMethods.getFeeHistory(
		web3Context.requestManager,
		blockCountFormatted,
		newestBlockFormatted,
		rewardPercentilesFormatted,
	);

	assertRpcResult('qrl_feeHistory', response, feeHistorySchema);
	// Ratios are JSON floats, not quantities; number formatting does not change them.
	return format(feeHistorySchema, response as unknown as FeeHistory, returnFormat) as Omit<
		FormatType<FeeHistory, ReturnFormat>,
		'gasUsedRatio'
	> & { gasUsedRatio: number[] };
}

/**
 * View additional documentations here: {@link Web3QRL.createAccessList}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function createAccessList<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	transaction: TransactionForAccessList,
	blockNumber: BlockNumberOrTag = web3Context.defaultBlock,
	returnFormat: ReturnFormat,
) {
	validateTransactionInput(transaction);
	const blockNumberFormatted = isBlockTag(blockNumber as string)
		? (blockNumber as BlockTag)
		: format({ format: 'uint' }, blockNumber as Numbers, QRL_DATA_FORMAT);

	const response = (await qrlRpcMethods.createAccessList(
		web3Context.requestManager,
		formatTransaction(transaction, QRL_DATA_FORMAT),
		blockNumberFormatted,
	)) as unknown as AccessListResult;

	assertRpcResult('qrl_createAccessList', response, accessListResultSchema);
	expectQuantityReply('qrl_createAccessList', response.gasUsed);
	assertRpcResult(
		'qrl_createAccessList',
		response.accessList,
		accessListResultSchema.properties.accessList,
	);
	return format(accessListResultSchema, response, returnFormat);
}

/**
 * View additional documentations here: {@link Web3QRL.signTypedData}
 * @param web3Context ({@link Web3Context}) Web3 configuration object that contains things such as the provider, request manager, wallet, etc.
 */
export async function signTypedData<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	address: Address,
	typedData: QRLTypedData,
	returnFormat: ReturnFormat,
) {
	const response = await qrlRpcMethods.signTypedData(
		web3Context.requestManager,
		address,
		typedData,
	);

	return format(
		{ format: 'bytes' },
		expectBytesReply('qrl_signTypedData', response),
		returnFormat,
	);
}
