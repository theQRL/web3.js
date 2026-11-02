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
	Address,
	HexString32Bytes,
	Uint,
	HexStringBytes,
	HexStringSingleByte,
	HexString256Bytes,
	FeeHistoryBase,
	Uint256,
	BlockNumberOrTag,
	Filter,
	AccessList,
	TransactionHash,
	TransactionReceiptBase,
	BlockBase,
	LogBase,
	HexString3Bytes,
} from '../qrl_types.js';
import { HexString } from '../primitives_types.js';

// The types are generated manually by referring to following doc
// https://github.com/ethereum/execution-apis
// These types follow closely to the v1.0.0-alpha.9 Ethereum spec
export interface TransactionCallAPI {
	readonly from?: Address;
	readonly to: Address;
	readonly gas?: Uint;
	readonly value?: Uint;
	readonly data?: HexStringBytes;
	readonly type?: HexStringSingleByte;
	readonly maxFeePerGas?: Uint;
	readonly maxPriorityFeePerGas?: Uint;
	readonly accessList?: AccessList;
}

export interface BaseTransactionAPI {
	readonly to?: Address | null;
	readonly type: HexStringSingleByte;
	readonly nonce: Uint;
	readonly gas: Uint;
	readonly value: Uint;
	// TODO - https://github.com/ethereum/execution-apis/pull/201
	readonly input: HexStringBytes;
	readonly data?: HexStringBytes;
	readonly chainId?: Uint;
	readonly hash?: HexString32Bytes;
}

export interface Transaction1559UnsignedAPI extends BaseTransactionAPI {
	readonly maxFeePerGas: Uint;
	readonly maxPriorityFeePerGas: Uint;
	readonly accessList: AccessList;
}

export interface Transaction1559SignedAPI extends Transaction1559UnsignedAPI {
	readonly descriptor: HexString3Bytes;
	readonly extraParams: HexStringBytes;
	readonly signature: HexStringBytes;
	readonly publicKey: HexStringBytes;	
}

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/transaction.yaml#L144
export type TransactionUnsignedAPI = Transaction1559UnsignedAPI;

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/transaction.yaml#L211
export type TransactionSignedAPI = Transaction1559SignedAPI;

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/transaction.yaml#L216
export type TransactionInfoAPI = TransactionSignedAPI & {
	readonly blockHash?: HexString32Bytes;
	readonly blockNumber?: Uint;
	readonly from: Address;
	readonly hash: HexString32Bytes;
	readonly transactionIndex?: Uint;
};

export interface SignedTransactionInfoAPI {
	raw: HexStringBytes;
	tx: TransactionSignedAPI;
}

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/transaction.yaml#L244
export type TransactionWithSenderAPI = TransactionUnsignedAPI & { from: Address };

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/block.yaml#L2
export type BlockAPI = BlockBase<
	HexString32Bytes,
	HexString,
	Uint,
	HexStringBytes,
	TransactionHash[] | TransactionInfoAPI[],
	HexString256Bytes
>;

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/receipt.yaml#L2
export type LogAPI = LogBase<Uint, HexString32Bytes>;

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/receipt.yaml#L36
export type TransactionReceiptAPI = TransactionReceiptBase<
	Uint,
	HexString32Bytes,
	HexString256Bytes,
	LogAPI
>;

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/client.yaml#L2
export type SyncingStatusAPI =
	| { startingBlock: Uint; currentBlock: Uint; highestBlock: Uint }
	| boolean;

// https://github.com/ethereum/execution-apis/blob/main/src/eth/fee_market.yaml#L42
export type FeeHistoryResultAPI = FeeHistoryBase<Uint>;

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/filter.yaml#L2
export type FilterResultsAPI = HexString32Bytes[] | LogAPI[];

// The reply of `qrl_createAccessList` (go-qrl `internal/qrlapi` `accessListResult`): the
// access list the call touched, the gas it used with that list, and the revert reason when
// the simulated call failed.
export interface AccessListResultAPI {
	readonly accessList: AccessList;
	readonly gasUsed: Uint;
	readonly error?: string;
}

export type QRLExecutionAPI = {
	// https://github.com/ethereum/execution-apis/blob/main/src/eth/block.yaml
	qrl_getBlockByHash: (blockHash: HexString32Bytes, hydrated: boolean) => BlockAPI;
	qrl_getBlockByNumber: (blockNumber: BlockNumberOrTag, hydrated: boolean) => BlockAPI;
	qrl_getBlockTransactionCountByHash: (blockHash: HexString32Bytes) => Uint;
	qrl_getBlockTransactionCountByNumber: (blockNumber: BlockNumberOrTag) => Uint;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/transaction.yaml
	qrl_getTransactionByHash: (
		transactionHash: HexString32Bytes,
	) => TransactionInfoAPI | undefined;
	qrl_getTransactionByBlockHashAndIndex: (
		blockHash: HexString32Bytes,
		transactionIndex: Uint,
	) => TransactionInfoAPI | undefined;
	qrl_getTransactionByBlockNumberAndIndex: (
		blockNumber: BlockNumberOrTag,
		transactionIndex: Uint,
	) => TransactionInfoAPI | undefined;
	qrl_getTransactionReceipt: (
		transactionHash: HexString32Bytes,
	) => TransactionReceiptAPI | undefined;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/client.yaml
	qrl_syncing: () => SyncingStatusAPI;
	qrl_accounts: () => Address[];
	qrl_blockNumber: () => Uint;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/execute.yaml
	qrl_call: (transaction: TransactionCallAPI, blockNumber: BlockNumberOrTag) => HexStringBytes;
	qrl_estimateGas: (
		transaction: Partial<TransactionWithSenderAPI>,
		blockNumber: BlockNumberOrTag,
	) => Uint;
	qrl_createAccessList: (
		transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
		blockNumber: BlockNumberOrTag,
	) => AccessListResultAPI;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/fee_market.yaml
	qrl_gasPrice: () => Uint;
	qrl_maxPriorityFeePerGas: () => Uint;
	qrl_feeHistory: (
		blockCount: Uint,
		newestBlock: BlockNumberOrTag,
		rewardPercentiles: number[],
	) => FeeHistoryResultAPI;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/filter.yaml
	qrl_newFilter: (filter: Filter) => Uint;
	qrl_newBlockFilter: () => Uint;
	qrl_newPendingTransactionFilter: () => Uint;
	qrl_uninstallFilter: (filterIdentifier: Uint) => boolean;
	qrl_getFilterChanges: (filterIdentifier: Uint) => FilterResultsAPI;
	qrl_getFilterLogs: (filterIdentifier: Uint) => FilterResultsAPI;
	qrl_getLogs: (filter: Filter) => FilterResultsAPI;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/sign.yaml
	qrl_sign: (address: Address, message: HexStringBytes) => HexString256Bytes;
	qrl_signTransaction: (
		transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
	) => HexStringBytes | SignedTransactionInfoAPI;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/state.yaml
	qrl_getBalance: (address: Address, blockNumber: BlockNumberOrTag) => Uint;
	qrl_getStorageAt: (
		address: Address,
		storageSlot: Uint256,
		blockNumber: BlockNumberOrTag,
	) => HexStringBytes;
	qrl_getTransactionCount: (address: Address, blockNumber: BlockNumberOrTag) => Uint;
	qrl_getCode: (address: Address, blockNumber: BlockNumberOrTag) => HexStringBytes;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/submit.yaml
	qrl_sendTransaction: (
		transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
	) => HexString32Bytes;
	qrl_sendRawTransaction: (transaction: HexStringBytes) => HexString32Bytes;

	// https://geth.ethereum.org/docs/rpc/pubsub
	qrl_subscribe: (
		...params:
			| ['newHeads']
			| ['newPendingTransactions']
			| ['syncing']
			| ['logs', { address?: HexString; topics?: HexString[] }]
	) => HexString;
	qrl_unsubscribe: (subscriptionId: HexString) => HexString;
	// `qrl_clearSubscriptions` is a client-side helper of the subscription manager, not a
	// JSON-RPC method served by any node, so it is not part of this API surface.
};
