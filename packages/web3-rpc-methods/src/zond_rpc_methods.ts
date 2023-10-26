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
	TransactionCallAPI,
	TransactionWithSenderAPI,
	Uint,
	Uint256,
	Web3ZondExecutionAPI,
} from '@theqrl/web3-types';
import { Eip712TypedData } from '@theqrl/web3-types/src/zond_types';
import { validator } from '@theqrl/web3-validator';

export async function getProtocolVersion(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'zond_protocolVersion',
		params: [],
	});
}

export async function getSyncing(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'zond_syncing',
		params: [],
	});
}

export async function getCoinbase(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'zond_coinbase',
		params: [],
	});
}

export async function getGasPrice(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'zond_gasPrice',
		params: [],
	});
}

export async function getAccounts(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'zond_accounts',
		params: [],
	});
}

export async function getBlockNumber(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'zond_blockNumber',
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
		method: 'zond_getBalance',
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
		method: 'zond_getStorageAt',
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
		method: 'zond_getTransactionCount',
		params: [address, blockNumber],
	});
}

export async function getBlockTransactionCountByHash(
	requestManager: Web3RequestManager,
	blockHash: HexString32Bytes,
) {
	validator.validate(['bytes32'], [blockHash]);

	return requestManager.send({
		method: 'zond_getBlockTransactionCountByHash',
		params: [blockHash],
	});
}

export async function getBlockTransactionCountByNumber(
	requestManager: Web3RequestManager,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['blockNumberOrTag'], [blockNumber]);

	return requestManager.send({
		method: 'zond_getBlockTransactionCountByNumber',
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
		method: 'zond_getCode',
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
		method: 'zond_sign',
		params: [address, message],
	});
}

// TODO - Validation should be:
// isTransactionWithSender(transaction)
// ? validateTransactionWithSender(transaction)
// : validateTransactionWithSender(transaction, true) with true being a isPartial flag
export async function signTransaction(
	requestManager: Web3RequestManager,
	transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
) {
	return requestManager.send({
		method: 'zond_signTransaction',
		params: [transaction],
	});
}

// TODO - Validation should be:
// isTransactionWithSender(transaction)
// ? validateTransactionWithSender(transaction)
// : validateTransactionWithSender(transaction, true) with true being a isPartial flag
export async function sendTransaction(
	requestManager: Web3RequestManager,
	transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
) {
	return requestManager.send({
		method: 'zond_sendTransaction',
		params: [transaction],
	});
}

export async function sendRawTransaction(
	requestManager: Web3RequestManager,
	transaction: HexStringBytes,
) {
	validator.validate(['hex'], [transaction]);

	return requestManager.send({
		method: 'zond_sendRawTransaction',
		params: [transaction],
	});
}

// TODO - validate transaction
export async function call(
	requestManager: Web3RequestManager,
	transaction: TransactionCallAPI,
	blockNumber: BlockNumberOrTag,
) {
	// validateTransactionCall(transaction);
	validator.validate(['blockNumberOrTag'], [blockNumber]);

	return requestManager.send({
		method: 'zond_call',
		params: [transaction, blockNumber],
	});
}

// TODO Not sure how to best validate Partial<TransactionWithSender>
export async function estimateGas(
	requestManager: Web3RequestManager,
	transaction: Partial<TransactionWithSenderAPI>,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['blockNumberOrTag'], [blockNumber]);

	return requestManager.send({
		method: 'zond_estimateGas',
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
		method: 'zond_getBlockByHash',
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
		method: 'zond_getBlockByNumber',
		params: [blockNumber, hydrated],
	});
}

export async function getTransactionByHash(
	requestManager: Web3RequestManager,
	transactionHash: HexString32Bytes,
) {
	validator.validate(['bytes32'], [transactionHash]);

	return requestManager.send({
		method: 'zond_getTransactionByHash',
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
		method: 'zond_getTransactionByBlockHashAndIndex',
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
		method: 'zond_getTransactionByBlockNumberAndIndex',
		params: [blockNumber, transactionIndex],
	});
}

export async function getTransactionReceipt(
	requestManager: Web3RequestManager,
	transactionHash: HexString32Bytes,
) {
	validator.validate(['bytes32'], [transactionHash]);

	return requestManager.send({
		method: 'zond_getTransactionReceipt',
		params: [transactionHash],
	});
}

export async function getCompilers(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'zond_getCompilers',
		params: [],
	});
}

export async function compileSolidity(requestManager: Web3RequestManager, code: string) {
	validator.validate(['string'], [code]);

	return requestManager.send({
		method: 'zond_compileSolidity',
		params: [code],
	});
}

export async function compileLLL(requestManager: Web3RequestManager, code: string) {
	validator.validate(['string'], [code]);

	return requestManager.send({
		method: 'zond_compileLLL',
		params: [code],
	});
}

export async function compileSerpent(requestManager: Web3RequestManager, code: string) {
	validator.validate(['string'], [code]);

	return requestManager.send({
		method: 'zond_compileSerpent',
		params: [code],
	});
}

export async function newFilter(requestManager: Web3RequestManager, filter: Filter) {
	validator.validate(['filter'], [filter]);

	return requestManager.send({
		method: 'zond_newFilter',
		params: [filter],
	});
}

export async function newBlockFilter(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'zond_newBlockFilter',
		params: [],
	});
}

export async function newPendingTransactionFilter(requestManager: Web3RequestManager) {
	return requestManager.send({
		method: 'zond_newPendingTransactionFilter',
		params: [],
	});
}

export async function uninstallFilter(requestManager: Web3RequestManager, filterIdentifier: Uint) {
	validator.validate(['hex'], [filterIdentifier]);

	return requestManager.send({
		method: 'zond_uninstallFilter',
		params: [filterIdentifier],
	});
}

export async function getFilterChanges(requestManager: Web3RequestManager, filterIdentifier: Uint) {
	validator.validate(['hex'], [filterIdentifier]);

	return requestManager.send({
		method: 'zond_getFilterChanges',
		params: [filterIdentifier],
	});
}

export async function getFilterLogs(requestManager: Web3RequestManager, filterIdentifier: Uint) {
	validator.validate(['hex'], [filterIdentifier]);

	return requestManager.send({
		method: 'zond_getFilterLogs',
		params: [filterIdentifier],
	});
}

export async function getLogs(requestManager: Web3RequestManager, filter: Filter) {
	validator.validate(['filter'], [filter]);

	return requestManager.send({
		method: 'zond_getLogs',
		params: [filter],
	});
}

export async function getFeeHistory(
	requestManager: Web3RequestManager,
	blockCount: Uint,
	newestBlock: BlockNumberOrTag,
	rewardPercentiles: number[],
) {
	validator.validate(['hex', 'blockNumberOrTag'], [blockCount, newestBlock]);

	for (const rewardPercentile of rewardPercentiles) {
		validator.validate(['number'], [rewardPercentile]);
	}

	return requestManager.send({
		method: 'zond_feeHistory',
		params: [blockCount, newestBlock, rewardPercentiles],
	});
}

export async function getPendingTransactions(
	requestManager: Web3RequestManager<Web3ZondExecutionAPI>,
) {
	return requestManager.send({
		method: 'zond_pendingTransactions',
		params: [],
	});
}

export async function requestAccounts(requestManager: Web3RequestManager<Web3ZondExecutionAPI>) {
	return requestManager.send({
		method: 'zond_requestAccounts',
		params: [],
	});
}

export async function getChainId(requestManager: Web3RequestManager<Web3ZondExecutionAPI>) {
	return requestManager.send({
		method: 'zond_chainId',
		params: [],
	});
}

export async function getProof(
	requestManager: Web3RequestManager<Web3ZondExecutionAPI>,
	address: Address,
	storageKeys: HexString32Bytes[],
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(
		['address', 'bytes32[]', 'blockNumberOrTag'],
		[address, storageKeys, blockNumber],
	);

	return requestManager.send({
		method: 'zond_getProof',
		params: [address, storageKeys, blockNumber],
	});
}

export async function getNodeInfo(requestManager: Web3RequestManager<Web3ZondExecutionAPI>) {
	return requestManager.send({
		method: 'web3_clientVersion',
		params: [],
	});
}

export async function createAccessList(
	requestManager: Web3RequestManager,
	transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
	blockNumber: BlockNumberOrTag,
) {
	validator.validate(['blockNumberOrTag'], [blockNumber]);

	return requestManager.send({
		method: 'zond_createAccessList',
		params: [transaction, blockNumber],
	});
}

export async function signTypedData(
	requestManager: Web3RequestManager,
	address: Address,
	typedData: Eip712TypedData,
	useLegacy = false,
): Promise<string> {
	// TODO Add validation for typedData
	validator.validate(['address'], [address]);

	return requestManager.send({
		method: `zond_signTypedData${useLegacy ? '' : '_v4'}`,
		params: [address, typedData],
	});
}
