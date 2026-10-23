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
	BaseWeb3Error,
	ContractExecutionError,
	TransactionError,
	TransactionRevertedWithoutReasonError,
	TransactionRevertInstructionError,
	TransactionRevertWithCustomError,
	InvalidResponseError,
} from '@theqrl/web3-errors';
import {
	FormatType,
	QRL_DATA_FORMAT,
	DataFormat,
	Bytes,
	ContractAbi,
	HexString,
	Numbers,
	Transaction,
	TransactionReceipt,
} from '@theqrl/web3-types';

export type InternalTransaction = FormatType<Transaction, typeof QRL_DATA_FORMAT>;

/**
 * The payload of the `error` event of `sendTransaction` and `sendSignedTransaction`. Every
 * failure of the send pipeline is reported as a typed error: errors raised by the library are
 * emitted as they are, anything else is wrapped in a {@link TransactionError} (M-7b).
 */
export type SendTransactionErrorEvent<ReturnFormat extends DataFormat> =
	| TransactionRevertedWithoutReasonError<FormatType<TransactionReceipt, ReturnFormat>>
	| TransactionRevertInstructionError<FormatType<TransactionReceipt, ReturnFormat>>
	| TransactionRevertWithCustomError<FormatType<TransactionReceipt, ReturnFormat>>
	| InvalidResponseError
	| ContractExecutionError
	| TransactionError<FormatType<TransactionReceipt, ReturnFormat>>
	| BaseWeb3Error;

export type SendTransactionEvents<ReturnFormat extends DataFormat> = {
	sending: FormatType<Transaction, typeof QRL_DATA_FORMAT>;
	sent: FormatType<Transaction, typeof QRL_DATA_FORMAT>;
	transactionHash: FormatType<Bytes, ReturnFormat>;
	receipt: FormatType<TransactionReceipt, ReturnFormat>;
	confirmation: {
		confirmations: FormatType<Numbers, ReturnFormat>;
		receipt: FormatType<TransactionReceipt, ReturnFormat>;
		latestBlockHash: FormatType<Bytes, ReturnFormat>;
	};
	error: SendTransactionErrorEvent<ReturnFormat>;
};

export type SendSignedTransactionEvents<ReturnFormat extends DataFormat> = {
	sending: FormatType<Bytes, typeof QRL_DATA_FORMAT>;
	sent: FormatType<Bytes, typeof QRL_DATA_FORMAT>;
	transactionHash: FormatType<Bytes, ReturnFormat>;
	receipt: FormatType<TransactionReceipt, ReturnFormat>;
	confirmation: {
		confirmations: FormatType<Numbers, ReturnFormat>;
		receipt: FormatType<TransactionReceipt, ReturnFormat>;
		latestBlockHash: FormatType<Bytes, ReturnFormat>;
	};
	error: SendTransactionErrorEvent<ReturnFormat>;
};

export interface SendTransactionOptions<ResolveType = TransactionReceipt> {
	ignoreGasPricing?: boolean;
	/**
	 * Decides the outcome from the formatted receipt instead of the default `status` check: when a
	 * resolver is given the status allow-list is bypassed and the PromiEvent resolves with whatever
	 * the resolver returns (or rejects with what it throws). A resolver that must only accept
	 * successful transactions has to check `receipt.status` itself, as the contract deploy resolver
	 * does.
	 */
	transactionResolver?: (receipt: TransactionReceipt) => ResolveType;
	contractAbi?: ContractAbi;
	checkRevertBeforeSending?: boolean;
}

export interface SendSignedTransactionOptions<ResolveType = TransactionReceipt> {
	/** See {@link SendTransactionOptions.transactionResolver}: a resolver bypasses the `status` check. */
	transactionResolver?: (receipt: TransactionReceipt) => ResolveType;
	contractAbi?: ContractAbi;
	checkRevertBeforeSending?: boolean;
}

export interface RevertReason {
	reason: string;
	signature?: HexString;
	data?: HexString;
}

export interface RevertReasonWithCustomError extends RevertReason {
	customErrorName: string;
	customErrorDecodedSignature: string;
	customErrorArguments: Record<string, unknown>;
}
