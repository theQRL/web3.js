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
} from '../zond_types.js';
import { HexString } from '../primitives_types.js';

// The types are generated manually by referring to following doc
// https://github.com/ethereum/execution-apis
// These types follow closely to the v1.0.0-alpha.9 Ethereum spec
export interface TransactionCallAPI {
	readonly from?: Address;
	readonly to: Address;
	readonly gas?: Uint;
	readonly gasPrice?: Uint;
	readonly value?: Uint;
	readonly data?: HexStringBytes;
	readonly type?: HexStringSingleByte;
	readonly maxFeePerGas?: Uint;
	readonly maxPriorityFeePerGas?: Uint;
	readonly accessList?: AccessList;
}

export interface BaseTransactionAPI {
	// eslint-disable-next-line @typescript-eslint/ban-types
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
	readonly publicKey: HexStringBytes;
	readonly signature: HexStringBytes;
}

export interface Transaction2930UnsignedAPI extends BaseTransactionAPI {
	readonly gasPrice: Uint;
	readonly accessList: AccessList;
}

export interface Transaction2930SignedAPI extends Transaction2930UnsignedAPI {
	readonly publicKey: HexStringBytes;
	readonly signature: HexStringBytes;
}

export interface TransactionLegacyUnsignedAPI extends BaseTransactionAPI {
	readonly gasPrice: Uint;
}

export interface TransactionLegacySignedAPI extends TransactionLegacyUnsignedAPI {
	readonly publicKey: HexStringBytes;
	readonly signature: HexStringBytes;
}

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/transaction.yaml#L144
export type TransactionUnsignedAPI =
	| Transaction1559UnsignedAPI
	| Transaction2930UnsignedAPI
	| TransactionLegacyUnsignedAPI;

// https://github.com/ethereum/execution-apis/blob/main/src/schemas/transaction.yaml#L211
export type TransactionSignedAPI =
	| Transaction1559SignedAPI
	| Transaction2930SignedAPI
	| TransactionLegacySignedAPI;

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

export interface CompileResultAPI {
	readonly code: HexStringBytes;
	readonly info: {
		readonly source: string;
		readonly language: string;
		readonly languageVersion: string;
		readonly compilerVersion: string;
		readonly abiDefinition: Record<string, unknown>[];
		readonly userDoc: {
			readonly methods: Record<string, unknown>;
		};
		readonly developerDoc: {
			readonly methods: Record<string, unknown>;
		};
	};
}

/* eslint-disable camelcase */
export type ZondExecutionAPI = {
	// https://github.com/ethereum/execution-apis/blob/main/src/eth/block.yaml
	zond_getBlockByHash: (blockHash: HexString32Bytes, hydrated: boolean) => BlockAPI;
	zond_getBlockByNumber: (blockNumber: BlockNumberOrTag, hydrated: boolean) => BlockAPI;
	zond_getBlockTransactionCountByHash: (blockHash: HexString32Bytes) => Uint;
	zond_getBlockTransactionCountByNumber: (blockNumber: BlockNumberOrTag) => Uint;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/transaction.yaml
	zond_getTransactionByHash: (transactionHash: HexString32Bytes) => TransactionInfoAPI | undefined;
	zond_getTransactionByBlockHashAndIndex: (
		blockHash: HexString32Bytes,
		transactionIndex: Uint,
	) => TransactionInfoAPI | undefined;
	zond_getTransactionByBlockNumberAndIndex: (
		blockNumber: BlockNumberOrTag,
		transactionIndex: Uint,
	) => TransactionInfoAPI | undefined;
	zond_getTransactionReceipt: (
		transactionHash: HexString32Bytes,
	) => TransactionReceiptAPI | undefined;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/client.yaml
	zond_protocolVersion: () => string;
	zond_syncing: () => SyncingStatusAPI;
	zond_coinbase: () => Address;
	zond_accounts: () => Address[];
	zond_blockNumber: () => Uint;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/execute.yaml
	zond_call: (transaction: TransactionCallAPI, blockNumber: BlockNumberOrTag) => HexStringBytes;
	zond_estimateGas: (
		transaction: Partial<TransactionWithSenderAPI>,
		blockNumber: BlockNumberOrTag,
	) => Uint;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/fee_market.yaml
	zond_gasPrice: () => Uint;
	zond_feeHistory: (
		blockCount: Uint,
		newestBlock: BlockNumberOrTag,
		rewardPercentiles: number[],
	) => FeeHistoryResultAPI;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/filter.yaml
	zond_newFilter: (filter: Filter) => Uint;
	zond_newBlockFilter: () => Uint;
	zond_newPendingTransactionFilter: () => Uint;
	zond_uninstallFilter: (filterIdentifier: Uint) => boolean;
	zond_getFilterChanges: (filterIdentifier: Uint) => FilterResultsAPI;
	zond_getFilterLogs: (filterIdentifier: Uint) => FilterResultsAPI;
	zond_getLogs: (filter: Filter) => FilterResultsAPI;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/sign.yaml
	zond_sign: (address: Address, message: HexStringBytes) => HexString256Bytes;
	zond_signTransaction: (
		transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
	) => HexStringBytes | SignedTransactionInfoAPI;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/state.yaml
	zond_getBalance: (address: Address, blockNumber: BlockNumberOrTag) => Uint;
	zond_getStorageAt: (
		address: Address,
		storageSlot: Uint256,
		blockNumber: BlockNumberOrTag,
	) => HexStringBytes;
	zond_getTransactionCount: (address: Address, blockNumber: BlockNumberOrTag) => Uint;
	zond_getCode: (address: Address, blockNumber: BlockNumberOrTag) => HexStringBytes;

	// https://github.com/ethereum/execution-apis/blob/main/src/eth/submit.yaml
	zond_sendTransaction: (
		transaction: TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>,
	) => HexString32Bytes;
	zond_sendRawTransaction: (transaction: HexStringBytes) => HexString32Bytes;

	// https://geth.ethereum.org/docs/rpc/pubsub
	zond_subscribe: (
		...params:
			| ['newHeads']
			| ['newPendingTransactions']
			| ['syncing']
			| ['logs', { address?: HexString; topics?: HexString[] }]
	) => HexString;
	zond_unsubscribe: (subscriptionId: HexString) => HexString;
	zond_clearSubscriptions: (keepSyncing?: boolean) => void;
	// Non-supported by execution-apis specs
	zond_getCompilers: () => string[];
	zond_compileSolidity: (code: string) => CompileResultAPI;
	zond_compileLLL: (code: string) => HexStringBytes;
	zond_compileSerpent: (code: string) => HexStringBytes;
};
