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
	QRLExecutionAPI,
	HexString,
	PopulatedUnsignedTransaction,
	Transaction,
	ValidChains,
	FormatType,
	QRL_DATA_FORMAT,
} from '@theqrl/web3-types';
import { Web3Context } from '@theqrl/web3-core';
import { toChecksumAddress, toNumber } from '@theqrl/web3-utils';
import { TransactionFactory, TxOptions, Common, seedToAccount } from '@theqrl/web3-qrl-accounts';
import { TransactionSigningError } from '@theqrl/web3-errors';
import { isNullish } from '@theqrl/web3-validator';
import { validateTransactionForSigning } from '../validation.js';
import { formatTransaction } from './format_transaction.js';
import { transactionBuilder } from './transaction_builder.js';

const getQRLjsTxDataFromTransaction = (
	transaction: FormatType<PopulatedUnsignedTransaction, typeof QRL_DATA_FORMAT>,
) => ({
	nonce: transaction.nonce,
	gasLimit: transaction.gasLimit ?? transaction.gas,
	to: transaction.to,
	value: transaction.value,
	data: transaction.data ?? transaction.input,
	type: transaction.type,
	chainId: transaction.chainId,
	accessList: (
		transaction 
	).accessList,
	maxPriorityFeePerGas: (
		transaction 
	).maxPriorityFeePerGas,
	maxFeePerGas: (
		transaction 
	).maxFeePerGas,
});

const getQRLjsTransactionOptions = (
	transaction: FormatType<PopulatedUnsignedTransaction, typeof QRL_DATA_FORMAT>,
	web3Context: Web3Context<QRLExecutionAPI>,
) => {
	const hasTransactionSigningOptions =
		(!isNullish(transaction.chain) && !isNullish(transaction.hardfork)) ||
		!isNullish(transaction.common);

	let common;
	if (!hasTransactionSigningOptions) {
		// if defaultcommon is specified, use that.
		if (web3Context.defaultCommon) {
			// `defaultCommon` is a plain configuration object owned by the context: build the
			// `Common` instance the transaction classes expect from it, and never mutate it.
			const defaultCommon = web3Context.defaultCommon;
			const networkId = defaultCommon.customChain.networkId ?? transaction.networkId;
			common = Common.custom(
				{
					name: defaultCommon.customChain.name ?? 'custom-network',
					chainId: toNumber(defaultCommon.customChain.chainId) as number,
					networkId: !isNullish(networkId) ? (toNumber(networkId) as number) : undefined,
					defaultHardfork:
						defaultCommon.hardfork ?? transaction.hardfork ?? web3Context.defaultHardfork,
				},
				{
					baseChain: defaultCommon.baseChain ?? (web3Context.defaultChain as ValidChains),
				},
			);
		} else {
			common = Common.custom(
				{
					name: 'custom-network',
					chainId: toNumber(transaction.chainId) as number,
					networkId: !isNullish(transaction.networkId)
						? (toNumber(transaction.networkId) as number)
						: undefined,
					defaultHardfork: transaction.hardfork ?? web3Context.defaultHardfork,
				},
				{
					baseChain: web3Context.defaultChain,
				},
			);
		}
	} else {
		const name =
			transaction?.common?.customChain?.name ?? transaction.chain ?? 'custom-network';
		const chainId = toNumber(
			transaction?.common?.customChain?.chainId ?? transaction?.chainId,
		) as number;
		const networkId = toNumber(
			transaction?.common?.customChain?.networkId ?? transaction?.networkId,
		) as number;
		const defaultHardfork =
			transaction?.common?.hardfork ?? transaction?.hardfork ?? web3Context.defaultHardfork;
		const baseChain =
			transaction.common?.baseChain ?? transaction.chain ?? web3Context.defaultChain;

		if (chainId && networkId && name) {
			common = Common.custom(
				{
					name,
					chainId,
					networkId,
					defaultHardfork,
				},
				{
					baseChain,
				},
			);
		}
	}
	return { common } as TxOptions;
};

export const prepareTransactionForSigning = async (
	transaction: Transaction,
	web3Context: Web3Context<QRLExecutionAPI>,
	seed?: HexString | Uint8Array,
	fillGasPrice = false,
	fillGasLimit = true,
) => {
	// If a 'from' address is supplied together with a signing seed, assert that
	// 'from' matches the address derived from that seed. Otherwise the tx would
	// be signed by the seed's key while claiming a different sender, and the
	// mismatch would only surface (if at all) far downstream.
	if (!isNullish(transaction.from) && !isNullish(seed)) {
		const derivedAddress = seedToAccount(seed).address;
		if (toChecksumAddress(String(transaction.from)) !== toChecksumAddress(derivedAddress)) {
			throw new TransactionSigningError(
				`Provided 'from' address (${String(
					transaction.from,
				)}) does not match the address derived from the signing seed (${derivedAddress}).`,
			);
		}
	}

	const populatedTransaction = (await transactionBuilder({
		transaction,
		web3Context,
		seed,
		fillGasPrice,
		fillGasLimit,
	})) as unknown as PopulatedUnsignedTransaction;
	const formattedTransaction = formatTransaction(
		populatedTransaction,
		QRL_DATA_FORMAT,
	) as unknown as FormatType<PopulatedUnsignedTransaction, typeof QRL_DATA_FORMAT>;
	validateTransactionForSigning(
		formattedTransaction as unknown as FormatType<Transaction, typeof QRL_DATA_FORMAT>,
	);

	return TransactionFactory.fromTxData(
		getQRLjsTxDataFromTransaction(formattedTransaction),
		getQRLjsTransactionOptions(formattedTransaction, web3Context),
	);
};
