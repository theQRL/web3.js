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
	ZondExecutionAPI,
	Address,
	HexString,
	ValidChains,
	Hardfork,
	Transaction,
	TransactionWithFromLocalWalletIndex,
	TransactionWithToLocalWalletIndex,
	TransactionWithFromAndToLocalWalletIndex,
	Common,
	Web3NetAPI,
	Numbers,
	DataFormat,
	DEFAULT_RETURN_FORMAT,
	FormatType,
	ZOND_DATA_FORMAT,
} from '@theqrl/web3-types';
import { Web3Context } from '@theqrl/web3-core';
import { publicKeyToAddress } from '@theqrl/web3-zond-accounts';
import { getId } from '@theqrl/web3-net';
import { isNullish, isNumber, isAddressString } from '@theqrl/web3-validator';
import {
	InvalidTransactionWithSender,
	InvalidTransactionWithReceiver,
	LocalWalletNotAvailableError,
	TransactionDataAndInputError,
	UnableToPopulateNonceError,
} from '@theqrl/web3-errors';
import { bytesToHex, format, hexToBytes } from '@theqrl/web3-utils';
import { Dilithium } from '@theqrl/wallet.js';
import { NUMBER_DATA_FORMAT } from '../constants.js';
// eslint-disable-next-line import/no-cycle
import { getChainId, getTransactionCount, estimateGas } from '../rpc_method_wrappers.js';
import { detectTransactionType } from './detect_transaction_type.js';
import { transactionSchema } from '../schemas.js';
import { InternalTransaction } from '../types.js';
// eslint-disable-next-line import/no-cycle
import { getTransactionGasPricing } from './get_transaction_gas_pricing.js';

export const getTransactionFromOrToAttr = (
	attr: 'from' | 'to',
	web3Context: Web3Context<ZondExecutionAPI>,
	transaction?:
		| Transaction
		| TransactionWithFromLocalWalletIndex
		| TransactionWithToLocalWalletIndex
		| TransactionWithFromAndToLocalWalletIndex,
	publicKey?: HexString | Uint8Array,
): Address | undefined => {
	if (transaction !== undefined && attr in transaction && transaction[attr] !== undefined) {
		if (typeof transaction[attr] === 'string' && isAddressString(transaction[attr] as string)) {
			return transaction[attr] as Address;
		}
		if (isNumber(transaction[attr] as Numbers)) {
			if (web3Context.wallet) {
				const account = web3Context.wallet.get(
					format({ format: 'uint' }, transaction[attr] as Numbers, NUMBER_DATA_FORMAT),
				);

				if (!isNullish(account)) {
					return account.address;
				}

				throw new LocalWalletNotAvailableError();
			}
			throw new LocalWalletNotAvailableError();
		} else {
			throw attr === 'from'
				? new InvalidTransactionWithSender(transaction.from)
				: // eslint-disable-next-line @typescript-eslint/no-unsafe-call
				  new InvalidTransactionWithReceiver(transaction.to);
		}
	}
	if (attr === 'from') {
		if (!isNullish(publicKey)) return publicKeyToAddress(publicKey);
		if (!isNullish(web3Context.defaultAccount)) return web3Context.defaultAccount;
	}

	return undefined;
};

export const getTransactionNonce = async <ReturnFormat extends DataFormat>(
	web3Context: Web3Context<ZondExecutionAPI>,
	address?: Address,
	returnFormat: ReturnFormat = DEFAULT_RETURN_FORMAT as ReturnFormat,
) => {
	if (isNullish(address)) {
		// TODO if (web3.zond.accounts.wallet) use address from local wallet
		throw new UnableToPopulateNonceError();
	}

	return getTransactionCount(web3Context, address, web3Context.defaultBlock, returnFormat);
};

export const getTransactionType = (
	transaction: FormatType<Transaction, typeof ZOND_DATA_FORMAT>,
	web3Context: Web3Context<ZondExecutionAPI>,
) => {
	const inferredType = detectTransactionType(transaction, web3Context);

	if (!isNullish(inferredType)) return inferredType;
	if (!isNullish(web3Context.defaultTransactionType))
		return format({ format: 'uint' }, web3Context.defaultTransactionType, ZOND_DATA_FORMAT);

	return undefined;
};

// Keep in mind that the order the properties of populateTransaction get populated matters
// as some of the properties are dependent on others
export async function defaultTransactionBuilder<ReturnType = Transaction>(options: {
	transaction: Transaction;
	web3Context: Web3Context<ZondExecutionAPI & Web3NetAPI>;
	seed?: HexString | Uint8Array;
	fillGasPrice?: boolean;
	fillGasLimit?: boolean;
}): Promise<ReturnType> {
	let populatedTransaction = format(
		transactionSchema,
		options.transaction,
		DEFAULT_RETURN_FORMAT,
	) as InternalTransaction;

	if (isNullish(populatedTransaction.from)) {
		let publicKey;
		if (!isNullish(options.seed)) {
			const _seed = typeof options.seed === 'string' ? hexToBytes(options.seed): options.seed
			const buf = Buffer.from(_seed)
 			const d = new Dilithium(buf)
			publicKey = d.getPK()
		}

		populatedTransaction.from = getTransactionFromOrToAttr(
			'from',
			options.web3Context,
			undefined,
			publicKey,
		);
	}

	// TODO: Debug why need to typecase getTransactionNonce
	if (isNullish(populatedTransaction.nonce)) {
		populatedTransaction.nonce = await getTransactionNonce(
			options.web3Context,
			populatedTransaction.from,
			ZOND_DATA_FORMAT,
		);
	}

	if (isNullish(populatedTransaction.value)) {
		populatedTransaction.value = '0x';
	}

	if (!isNullish(populatedTransaction.data)) {
		if (
			!isNullish(populatedTransaction.input) &&
			populatedTransaction.data !== populatedTransaction.input
		)
			throw new TransactionDataAndInputError({
				data: bytesToHex(populatedTransaction.data),
				input: bytesToHex(populatedTransaction.input),
			});

		if (!populatedTransaction.data.startsWith('0x'))
			populatedTransaction.data = `0x${populatedTransaction.data}`;
	} else if (!isNullish(populatedTransaction.input)) {
		if (!populatedTransaction.input.startsWith('0x'))
			populatedTransaction.input = `0x${populatedTransaction.input}`;
	} else {
		populatedTransaction.input = '0x';
	}

	if (isNullish(populatedTransaction.common)) {
		if (options.web3Context.defaultCommon) {
			const common = options.web3Context.defaultCommon as unknown as Common;
			const chainId = common.customChain.chainId as string;
			const networkId = common.customChain.networkId as string;
			const name = common.customChain.name as string;
			populatedTransaction.common = {
				...common,
				customChain: { chainId, networkId, name },
			};
		}

		if (isNullish(populatedTransaction.chain)) {
			populatedTransaction.chain = options.web3Context.defaultChain as ValidChains;
		}
		if (isNullish(populatedTransaction.hardfork)) {
			populatedTransaction.hardfork = options.web3Context.defaultHardfork as Hardfork;
		}
	}

	if (
		isNullish(populatedTransaction.chainId) &&
		isNullish(populatedTransaction.common?.customChain.chainId)
	) {
		populatedTransaction.chainId = await getChainId(options.web3Context, ZOND_DATA_FORMAT);
	}

	if (isNullish(populatedTransaction.networkId)) {
		populatedTransaction.networkId =
			(options.web3Context.defaultNetworkId as string) ??
			(await getId(options.web3Context, ZOND_DATA_FORMAT));
	}

	if (isNullish(populatedTransaction.gasLimit) && !isNullish(populatedTransaction.gas)) {
		populatedTransaction.gasLimit = populatedTransaction.gas;
	}

	populatedTransaction.type = getTransactionType(populatedTransaction, options.web3Context);
	if (
		isNullish(populatedTransaction.accessList) &&
		(populatedTransaction.type === '0x1' || populatedTransaction.type === '0x2')
	) {
		populatedTransaction.accessList = [];
	}
	if (options.fillGasPrice)
		populatedTransaction = {
			...populatedTransaction,
			...(await getTransactionGasPricing(
				populatedTransaction,
				options.web3Context,
				ZOND_DATA_FORMAT,
			)),
		};
	if (
		isNullish(populatedTransaction.gas) &&
		isNullish(populatedTransaction.gasLimit) &&
		options.fillGasLimit
	) {
		const fillGasLimit = await estimateGas(
			options.web3Context,
			populatedTransaction,
			'latest',
			ZOND_DATA_FORMAT,
		);
		populatedTransaction = {
			...populatedTransaction,
			gas: format({ format: 'uint' }, fillGasLimit as Numbers, ZOND_DATA_FORMAT),
		};
	}
	return populatedTransaction as ReturnType;
}

export const transactionBuilder = async <ReturnType = Transaction>(
	options: {
		transaction: Transaction;
		web3Context: Web3Context<ZondExecutionAPI>;
		seed?: HexString | Uint8Array;
		fillGasPrice?: boolean;
		fillGasLimit?: boolean;
	},
	// eslint-disable-next-line @typescript-eslint/require-await
) =>
	(options.web3Context.transactionBuilder ?? defaultTransactionBuilder)({
		...options,
		transaction: options.transaction,
	}) as unknown as ReturnType;
