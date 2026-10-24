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
	QRL_DATA_FORMAT,
} from '@theqrl/web3-types';
import { Web3Context } from '@theqrl/web3-core';
import { getId } from '@theqrl/web3-net';
import { isNullish, isAddressString, isUInt } from '@theqrl/web3-validator';
import {
	InvalidTransactionWithSender,
	InvalidTransactionWithReceiver,
	LocalWalletNotAvailableError,
	TransactionDataAndInputError,
	UnableToPopulateNonceError,
	NodeChainIdMismatchError,
	InvalidNonceOrChainIdError,
} from '@theqrl/web3-errors';
import { seedToAccount } from '@theqrl/web3-qrl-accounts';
import { bytesToHex, format, toChecksumAddress } from '@theqrl/web3-utils';
import { getChainId, getTransactionCount, estimateGas } from './rpc_method_wrappers_readers.js';
import { transactionSchema } from '../schemas.js';
import { InternalTransaction } from '../types.js';
import { getTransactionGasPricing } from './get_transaction_gas_pricing.js';
import { getTransactionType } from './get_transaction_type.js';
import { validateTransactionInput } from './transaction_input.js';

// Re-exported for backward compatibility: `getTransactionType` previously lived
// in this module. Its definition moved to `./get_transaction_type.js` to break
// the `transaction_builder` <-> `get_transaction_gas_pricing` import cycle.
export { getTransactionType } from './get_transaction_type.js';

/**
 * Resolves the `from` or `to` field of a caller-supplied transaction to an address.
 *
 * A string is an address and must be a QRL address; a non-negative safe-integer `number` is the
 * index of an account in the context's wallet. `undefined` and `null` mean the field is not given:
 * for `to` that is a contract creation, for `from` the sender is derived from the seed or taken
 * from `defaultAccount` (P4-L-12). Nothing else is accepted: a hex string such as `'0x1'` used to
 * be read as a wallet index, so `to: '0x1'` sent the funds to wallet account 1 and a 20-byte
 * Ethereum address became a huge index that failed as "no wallet available" (L-51).
 *
 * @throws InvalidTransactionWithSender / InvalidTransactionWithReceiver for any other value.
 * @throws LocalWalletNotAvailableError for an index without a wallet or without such an account.
 */
export const getTransactionFromOrToAttr = (
	attr: 'from' | 'to',
	web3Context: Web3Context<QRLExecutionAPI>,
	transaction?:
		| Transaction
		| TransactionWithFromLocalWalletIndex
		| TransactionWithToLocalWalletIndex
		| TransactionWithFromAndToLocalWalletIndex,
	seed?: HexString | Uint8Array,
): Address | undefined => {
	if (transaction !== undefined && attr in transaction && !isNullish(transaction[attr])) {
		const transactionAttribute: unknown = transaction[attr];
		if (typeof transactionAttribute === 'string' && isAddressString(transactionAttribute)) {
			return transactionAttribute;
		}
		if (
			typeof transactionAttribute === 'number' &&
			Number.isSafeInteger(transactionAttribute) &&
			transactionAttribute >= 0
		) {
			const account = web3Context.wallet?.get(transactionAttribute);
			if (!isNullish(account)) {
				return account.address;
			}
			throw new LocalWalletNotAvailableError();
		}
		throw attr === 'from'
			? new InvalidTransactionWithSender(transaction.from)
			: new InvalidTransactionWithReceiver(transaction.to);
	}
	if (attr === 'from') {
		if (!isNullish(seed)) {
			return toChecksumAddress(seedToAccount(seed).address);
		}
		if (!isNullish(web3Context.defaultAccount)) return web3Context.defaultAccount;
	}

	return undefined;
};

export const getTransactionNonce = async <ReturnFormat extends DataFormat>(
	web3Context: Web3Context<QRLExecutionAPI>,
	address?: Address,
	returnFormat: ReturnFormat = DEFAULT_RETURN_FORMAT as ReturnFormat,
) => {
	if (isNullish(address)) {
		// TODO if (web3.qrl.accounts.wallet) use address from local wallet
		throw new UnableToPopulateNonceError();
	}

	return getTransactionCount(web3Context, address, web3Context.defaultBlock, returnFormat);
};

// Keep in mind that the order the properties of populateTransaction get populated matters
// as some of the properties are dependent on others
/**
 * Checks a chain id the caller supplied (directly, through `common.customChain` or through the
 * context's `defaultCommon`) against the one the connected node serves. A transaction signed for
 * another chain would be rejected by this node while the signature stays valid on that chain, so
 * it is not signed. Without a provider (offline signing) there is nothing to compare against and
 * the chain id is taken as given.
 *
 * @throws NodeChainIdMismatchError when the node reports a different chain id.
 */
const assertNodeChainId = async (
	web3Context: Web3Context<QRLExecutionAPI>,
	txChainId: Numbers,
): Promise<void> => {
	if (!isUInt(txChainId, { bitSize: 256 })) {
		throw new InvalidNonceOrChainIdError({ nonce: undefined, chainId: txChainId });
	}
	if (isNullish(web3Context.currentProvider)) {
		return;
	}
	const nodeChainId = await getChainId(web3Context, QRL_DATA_FORMAT);
	const txChainIdHex = format({ format: 'uint' }, txChainId, QRL_DATA_FORMAT);
	if (BigInt(txChainIdHex) !== BigInt(nodeChainId)) {
		throw new NodeChainIdMismatchError({ txChainId: txChainIdHex, nodeChainId });
	}
};

export async function defaultTransactionBuilder<ReturnType = Transaction>(options: {
	transaction: Transaction;
	web3Context: Web3Context<QRLExecutionAPI & Web3NetAPI>;
	seed?: HexString | Uint8Array;
	fillGasPrice?: boolean;
	fillGasLimit?: boolean;
}): Promise<ReturnType> {
	// A legacy `gasPrice` and quantities given as unsafe JavaScript numbers are rejected before
	// the formatter can drop or round them (L-50, L-55).
	validateTransactionInput(options.transaction);

	let populatedTransaction = format(
		transactionSchema,
		options.transaction,
		DEFAULT_RETURN_FORMAT,
	) as InternalTransaction;

	if (isNullish(populatedTransaction.from)) {
		let seed;
		if (!isNullish(options.seed)) {
			seed = options.seed;
		}

		populatedTransaction.from = getTransactionFromOrToAttr(
			'from',
			options.web3Context,
			undefined,
			seed,
		);
	}

	// TODO: Debug why need to typecase getTransactionNonce
	if (isNullish(populatedTransaction.nonce)) {
		populatedTransaction.nonce = await getTransactionNonce(
			options.web3Context,
			populatedTransaction.from,
			QRL_DATA_FORMAT,
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
		// `common` and the `chain`/`hardfork` pair are mutually exclusive signing options (see
		// `validateChainInfo`): the context's `defaultCommon` is only adopted when the caller
		// left the pair unset, and the pair's defaults are only applied when no `common` is used.
		const hasChainOrHardfork =
			!isNullish(populatedTransaction.chain) || !isNullish(populatedTransaction.hardfork);

		if (options.web3Context.defaultCommon && !hasChainOrHardfork) {
			const common = options.web3Context.defaultCommon as unknown as Common;
			const chainId = common.customChain.chainId as string;
			const networkId = common.customChain.networkId as string;
			const name = common.customChain.name as string;
			populatedTransaction.common = {
				...common,
				customChain: { chainId, networkId, name },
			};
		} else {
			if (isNullish(populatedTransaction.chain)) {
				populatedTransaction.chain = options.web3Context.defaultChain as ValidChains;
			}
			if (isNullish(populatedTransaction.hardfork)) {
				populatedTransaction.hardfork = options.web3Context.defaultHardfork as Hardfork;
			}
		}
	}

	if (isNullish(populatedTransaction.chainId)) {
		// A `common` (explicit or adopted from `defaultCommon`) names the chain the caller
		// intends to sign for, so its chain id is used before the node is asked for one;
		// signing validation requires `chainId` itself to be set either way. A `common` without
		// a `customChain` is left for the signing validation to reject (L-26).
		const commonChainId = populatedTransaction.common?.customChain?.chainId;
		populatedTransaction.chainId = isNullish(commonChainId)
			? await getChainId(options.web3Context, QRL_DATA_FORMAT)
			: format({ format: 'uint' }, commonChainId as Numbers, QRL_DATA_FORMAT);
		if (!isNullish(commonChainId)) {
			await assertNodeChainId(options.web3Context, populatedTransaction.chainId);
		}
	} else {
		await assertNodeChainId(options.web3Context, populatedTransaction.chainId);
	}

	if (isNullish(populatedTransaction.networkId)) {
		// `networkId` is not signed; it only parameterises the `Common` of the transaction
		// class. The node is asked for `net_version` only when neither the transaction's
		// `common`, nor the context, names it (I-12).
		const commonNetworkId = populatedTransaction.common?.customChain?.networkId;
		if (!isNullish(commonNetworkId)) {
			populatedTransaction.networkId = format(
				{ format: 'uint' },
				commonNetworkId as Numbers,
				QRL_DATA_FORMAT,
			);
		} else {
			populatedTransaction.networkId =
				(options.web3Context.defaultNetworkId as string) ??
				(await getId(options.web3Context, QRL_DATA_FORMAT));
		}
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
				QRL_DATA_FORMAT,
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
			QRL_DATA_FORMAT,
		);
		populatedTransaction = {
			...populatedTransaction,
			gas: format({ format: 'uint' }, fillGasLimit as Numbers, QRL_DATA_FORMAT),
		};
	}
	return populatedTransaction as ReturnType;
}

export const transactionBuilder = async <ReturnType = Transaction>(
	options: {
		transaction: Transaction;
		web3Context: Web3Context<QRLExecutionAPI>;
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
