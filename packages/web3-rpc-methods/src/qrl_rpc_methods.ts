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
import { Web3RequestManager } from '@theqrl/web3-core';
import {
	Address,
	BlockNumberOrTag,
	Filter,
	HexString32Bytes,
	HexStringBytes,
	QRLTypedData,
	TransactionCallAPI,
	TransactionWithSenderAPI,
	Uint,
	Uint256,
	Web3QRLExecutionAPI,
} from '@theqrl/web3-types';
import { validator, Web3ValidatorError } from '@theqrl/web3-validator';

export async function getSyncing(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'qrl_syncing',
		params: [],
	});
}

export async function getGasPrice(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'qrl_gasPrice',
		params: [],
	});
}

export async function getMaxPriorityFeePerGas(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'qrl_maxPriorityFeePerGas',
		params: [],
	});
}

export async function getAccounts(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'qrl_accounts',
		params: [],
	});
}

export async function getBlockNumber(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'qrl_blockNumber',
		params: [],
	});
}

export async function getBalance(
	requestManager: Web3RequestManager,
	address: Address,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['address', 'blockNumberOrTag'], [address, blockNumber]);

	return requestManager.send({
		method: 'qrl_getBalance',
		params: [address, blockNumber],
	});
}

export async function getStorageAt(
	requestManager: Web3RequestManager,
	address: Address,
	storageSlot: Uint256,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['address', 'hex', 'blockNumberOrTag'], [address, storageSlot, blockNumber]);

	return requestManager.send({
		method: 'qrl_getStorageAt',
		params: [address, storageSlot, blockNumber],
	});
}

export async function getTransactionCount(
	requestManager: Web3RequestManager,
	address: Address,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['address', 'blockNumberOrTag'], [address, blockNumber]);

	return requestManager.send({
		method: 'qrl_getTransactionCount',
		params: [address, blockNumber],
	});
}

export async function getBlockTransactionCountByHash(
	requestManager: Web3RequestManager,
	blockHash: HexString32Bytes,
) {
	validator.validate(['bytes32'], [blockHash]);

	return requestManager.send({
		method: 'qrl_getBlockTransactionCountByHash',
		params: [blockHash],
	});
}

export async function getBlockTransactionCountByNumber(
	requestManager: Web3RequestManager,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['blockNumberOrTag'], [blockNumber]);

	return requestManager.send({
		method: 'qrl_getBlockTransactionCountByNumber',
		params: [blockNumber],
	});
}

export async function getCode(
	requestManager: Web3RequestManager,
	address: Address,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['address', 'blockNumberOrTag'], [address, blockNumber]);

	return requestManager.send({
		method: 'qrl_getCode',
		params: [address, blockNumber],
	});
}

export async function sign(
	requestManager: Web3RequestManager,
	address: Address,
	message: HexStringBytes,
) {
	validator.validate(['address', 'hex'], [address, message]);

	return requestManager.send({
		method: 'qrl_sign',
		params: [address, message],
	});
}

/**
 * Asks the connected provider to sign a transaction. This is a low-level wrapper that
 * deliberately does **not** validate the transaction object — it forwards it as given.
 *
 * Providers may accept extension fields this library cannot enumerate, so a strict schema here
 * would reject legitimate provider-specific input. Validating the transaction is therefore the
 * caller's (or the provider's) responsibility.
 *
 * The local-signing path does not rely on this: `prepare_transaction_for_signing`
 * (@theqrl/web3-qrl) enforces validation at the wallet boundary, asserting that the requested
 * `from` matches the address derived from the signing seed.
 */
export async function signTransaction(
	requestManager: Web3RequestManager,
	transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
) {
	return requestManager.send({
		method: 'qrl_signTransaction',
		params: [transaction],
	});
}

/**
 * Asks the connected provider to sign and broadcast a transaction. This is a low-level wrapper
 * that deliberately does **not** validate the transaction object — it forwards it as given.
 *
 * Providers may accept extension fields this library cannot enumerate, so a strict schema here
 * would reject legitimate provider-specific input. Validating the transaction is therefore the
 * caller's (or the provider's) responsibility.
 *
 * The local-signing path does not rely on this: `prepare_transaction_for_signing`
 * (@theqrl/web3-qrl) enforces validation at the wallet boundary, asserting that the requested
 * `from` matches the address derived from the signing seed.
 */
export async function sendTransaction(
	requestManager: Web3RequestManager,
	transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
) {
	return requestManager.send({
		method: 'qrl_sendTransaction',
		params: [transaction],
	});
}

export async function sendRawTransaction(
	requestManager: Web3RequestManager,
	transaction: HexStringBytes,
) {
	validator.validate(['hex'], [transaction]);

	return requestManager.send({
		method: 'qrl_sendRawTransaction',
		params: [transaction],
	});
}

/**
 * Executes a call against the connected node without creating a transaction.
 *
 * The block identifier is validated, but the transaction object deliberately is **not** — it is
 * forwarded as given. Providers may accept extension fields this library cannot enumerate, so a
 * strict schema here would reject legitimate provider-specific input. Validating the transaction
 * is the caller's (or the provider's) responsibility; the local-signing path enforces validation
 * separately, at the wallet boundary (`prepare_transaction_for_signing` in @theqrl/web3-qrl).
 */
export async function call(
	requestManager: Web3RequestManager,
	transaction: TransactionCallAPI,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['blockNumberOrTag'], [blockNumber]);

	return requestManager.send({
		method: 'qrl_call',
		params: [transaction, blockNumber],
	});
}

/**
 * Estimates the gas a transaction would consume.
 *
 * The block identifier is validated, but the transaction object deliberately is **not** — it is
 * forwarded as given. Providers may accept extension fields this library cannot enumerate, so a
 * strict schema here would reject legitimate provider-specific input. Validating the transaction
 * is the caller's (or the provider's) responsibility; the local-signing path enforces validation
 * separately, at the wallet boundary (`prepare_transaction_for_signing` in @theqrl/web3-qrl).
 */
export async function estimateGas(
	requestManager: Web3RequestManager,
	transaction: Partial<TransactionWithSenderAPI>,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['blockNumberOrTag'], [blockNumber]);

	return requestManager.send({
		method: 'qrl_estimateGas',
		params: [transaction, blockNumber],
	});
}

export async function getBlockByHash(
	requestManager: Web3RequestManager,
	blockHash: HexString32Bytes,
	hydrated: boolean,
) {
	validator.validate(['bytes32', 'bool'], [blockHash, hydrated]);

	return requestManager.send({
		method: 'qrl_getBlockByHash',
		params: [blockHash, hydrated],
	});
}

export async function getBlockByNumber(
	requestManager: Web3RequestManager,
	blockNumber: BlockNumberOrTag,
	hydrated: boolean,
) {
	validator.validate(['blockNumberOrTag', 'bool'], [blockNumber, hydrated]);

	return requestManager.send({
		method: 'qrl_getBlockByNumber',
		params: [blockNumber, hydrated],
	});
}

export async function getTransactionByHash(
	requestManager: Web3RequestManager,
	transactionHash: HexString32Bytes,
) {
	validator.validate(['bytes32'], [transactionHash]);

	return requestManager.send({
		method: 'qrl_getTransactionByHash',
		params: [transactionHash],
	});
}

export async function getTransactionByBlockHashAndIndex(
	requestManager: Web3RequestManager,
	blockHash: HexString32Bytes,
	transactionIndex: Uint,
) {
	validator.validate(['bytes32', 'hex'], [blockHash, transactionIndex]);

	return requestManager.send({
		method: 'qrl_getTransactionByBlockHashAndIndex',
		params: [blockHash, transactionIndex],
	});
}

export async function getTransactionByBlockNumberAndIndex(
	requestManager: Web3RequestManager,
	blockNumber: BlockNumberOrTag,
	transactionIndex: Uint,
) {
	validator.validate(['blockNumberOrTag', 'hex'], [blockNumber, transactionIndex]);

	return requestManager.send({
		method: 'qrl_getTransactionByBlockNumberAndIndex',
		params: [blockNumber, transactionIndex],
	});
}

export async function getTransactionReceipt(
	requestManager: Web3RequestManager,
	transactionHash: HexString32Bytes,
) {
	validator.validate(['bytes32'], [transactionHash]);

	return requestManager.send({
		method: 'qrl_getTransactionReceipt',
		params: [transactionHash],
	});
}

export async function newFilter(requestManager: Web3RequestManager, filter: Filter) {
	validator.validate(['filter'], [filter]);

	return requestManager.send({
		method: 'qrl_newFilter',
		params: [filter],
	});
}

export async function newBlockFilter(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'qrl_newBlockFilter',
		params: [],
	});
}

export async function newPendingTransactionFilter(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'qrl_newPendingTransactionFilter',
		params: [],
	});
}

export async function uninstallFilter(requestManager: Web3RequestManager, filterIdentifier: Uint) {
	validator.validate(['hex'], [filterIdentifier]);

	return requestManager.send({
		method: 'qrl_uninstallFilter',
		params: [filterIdentifier],
	});
}

export async function getFilterChanges(requestManager: Web3RequestManager, filterIdentifier: Uint) {
	validator.validate(['hex'], [filterIdentifier]);

	return requestManager.send({
		method: 'qrl_getFilterChanges',
		params: [filterIdentifier],
	});
}

export async function getFilterLogs(requestManager: Web3RequestManager, filterIdentifier: Uint) {
	validator.validate(['hex'], [filterIdentifier]);

	return requestManager.send({
		method: 'qrl_getFilterLogs',
		params: [filterIdentifier],
	});
}

export async function getLogs(requestManager: Web3RequestManager, filter: Filter) {
	validator.validate(['filter'], [filter]);

	return requestManager.send({
		method: 'qrl_getLogs',
		params: [filter],
	});
}

/**
 * Requests the fee history of `blockCount` blocks ending at `newestBlock`.
 *
 * `rewardPercentiles` must be an array of numbers; `null`, `undefined` or any non-array value
 * throws a {@link Web3ValidatorError} instead of a raw `TypeError` (L-26).
 */
export async function getFeeHistory(
	requestManager: Web3RequestManager,
	blockCount: Uint,
	newestBlock: BlockNumberOrTag,
	rewardPercentiles: number[],
) {
	validator.validate(['hex', 'blockNumberOrTag'], [blockCount, newestBlock]);

	if (!Array.isArray(rewardPercentiles)) {
		throw new Web3ValidatorError([
			{
				keyword: 'type',
				instancePath: '/2',
				schemaPath: '#/items/2/type',
				params: { value: rewardPercentiles },
				message: 'value at "/2" (rewardPercentiles) must be an array of numbers',
			},
		]);
	}

	for (const rewardPercentile of rewardPercentiles) {
		validator.validate(['number'], [rewardPercentile]);
	}

	return requestManager.send({
		method: 'qrl_feeHistory',
		params: [blockCount, newestBlock, rewardPercentiles],
	});
}

export async function getPendingTransactions(
	requestManager: Web3RequestManager<Web3QRLExecutionAPI>,
) {
	return requestManager.send({
		method: 'qrl_pendingTransactions',
		params: [],
	});
}

export async function requestAccounts(requestManager: Web3RequestManager<Web3QRLExecutionAPI>) {
	return requestManager.send({
		method: 'qrl_requestAccounts',
		params: [],
	});
}

export async function getChainId(requestManager: Web3RequestManager<Web3QRLExecutionAPI>) {
	return requestManager.send({
		method: 'qrl_chainId',
		params: [],
	});
}

/**
 * Requests the account and storage proofs for `address`.
 *
 * Every storage key must be a 32-byte hex string: the `bytes32[]` schema only checks the array
 * shape, so each element is validated on its own and a short or long key throws a
 * {@link Web3ValidatorError} (L-26).
 */
export async function getProof(
	requestManager: Web3RequestManager<Web3QRLExecutionAPI>,
	address: Address,
	storageKeys: HexString32Bytes[],
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(
		['address', 'bytes32[]', 'blockNumberOrTag'],
		[address, storageKeys, blockNumber],
	);

	for (const storageKey of storageKeys) {
		validator.validate(['bytes32'], [storageKey]);
	}

	return requestManager.send({
		method: 'qrl_getProof',
		params: [address, storageKeys, blockNumber],
	});
}

export async function getNodeInfo(requestManager: Web3RequestManager<Web3QRLExecutionAPI>) {
	return requestManager.send({
		method: 'web3_clientVersion',
		params: [],
	});
}

/**
 * Creates an access list for a transaction.
 *
 * The block identifier is validated, but the transaction object deliberately is **not** — it is
 * forwarded as given. Providers may accept extension fields this library cannot enumerate, so a
 * strict schema here would reject legitimate provider-specific input. Validating the transaction
 * is the caller's (or the provider's) responsibility; the local-signing path enforces validation
 * separately, at the wallet boundary (`prepare_transaction_for_signing` in @theqrl/web3-qrl).
 */
export async function createAccessList(
	requestManager: Web3RequestManager,
	transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['blockNumberOrTag'], [blockNumber]);

	return requestManager.send({
		method: 'qrl_createAccessList',
		params: [transaction, blockNumber],
	});
}

/**
 * Sends QRL Typed Structured Data to the connected **wallet** provider to be signed. Typed-data signing
 * is a wallet capability, not a node one — gqrl does not implement it (as geth does not; it lives
 * in clef). The QRL web3 wallet extension answers `qrl_signTypedData_v4` and signs locally.
 *
 * There is no legacy suffix-less variant: no QRL wallet or node implements `qrl_signTypedData`.
 */
export async function signTypedData(
	requestManager: Web3RequestManager,
	address: Address,
	typedData: QRLTypedData,
): Promise<string> {
	// The `qrlTypedData` format mirrors `getEncodedQRLTypedData` (@theqrl/web3-qrl-abi) — the
	// encoder this library and the wallet share — rather than any node-side implementation,
	// because a wallet provider answers this request and encodes with that same function.
	// Without it, a malformed request fails inside the wallet's encoder with an opaque TypeError.
	validator.validate(['address', 'qrlTypedData'], [address, typedData]);

	return requestManager.send({
		method: 'qrl_signTypedData_v4',
		params: [address, typedData],
	});
}
