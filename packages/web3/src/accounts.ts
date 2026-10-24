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
	Bytes,
	Transaction,
	KeyStore,
	QRL_DATA_FORMAT,
	Web3BaseWallet,
	Web3BaseWalletAccount,
} from '@theqrl/web3-types';
import { bytesToHex, format } from '@theqrl/web3-utils';
import { Web3Context } from '@theqrl/web3-core';
import { prepareTransactionForSigning } from '@theqrl/web3-qrl';
import {
	create,
	decrypt,
	encrypt,
	hashMessage,
	recoverTransaction,
	signTransaction,
	sign,
	Wallet,
	seedToAccount,
} from '@theqrl/web3-qrl-accounts';

/**
 * Initialize the accounts module for the given context.
 *
 * To avoid multiple package dependencies for `@theqrl/web3-qrl-accounts` we are creating
 * this function in `web3` package. In future the actual `@theqrl/web3-qrl-accounts` package
 * should be converted to context aware.
 *
 * @param context - The context the signing helpers are bound to.
 * @param existingWallet - A wallet the context already holds (supplied through
 * `Web3ContextInitOptions`); it becomes `accounts.wallet` instead of a fresh empty one (L-41).
 */
export const initAccountsForContext = (
	context: Web3Context<QRLExecutionAPI> | (() => Web3Context<QRLExecutionAPI>),
	existingWallet?: Web3BaseWallet<Web3BaseWalletAccount>,
) => {
	const resolveContext = () => (typeof context === 'function' ? context() : context);
	const signTransactionWithContext = async (
		transaction: Transaction,
		seed: Bytes,
		signingContext = resolveContext(),
	) => {
		// Snapshot mutable seeds so sender validation, nonce lookup, and signing use the same key.
		const signingSeed = seed instanceof Uint8Array ? bytesToHex(seed) : seed;
		const tx = await prepareTransactionForSigning(transaction, signingContext, signingSeed);

		const seedBytes = format({ format: 'bytes' }, signingSeed, QRL_DATA_FORMAT);

		return signTransaction(tx, seedBytes);
	};

	const wrapAccount = <S extends (transaction: Transaction) => unknown>(
		account: ReturnType<typeof seedToAccount>,
		signTx: S,
	) => {
		const wrapper = { ...account, signTransaction: signTx };
		Object.defineProperty(wrapper, 'seed', {
			value: account.seed,
			enumerable: false,
			writable: false,
			configurable: false,
		});
		Object.defineProperty(wrapper, 'toJSON', {
			value: () => ({ address: wrapper.address, seed: '<redacted>' }),
			enumerable: false,
		});
		return wrapper;
	};

	const seedToAccountWithContext = (seed: Uint8Array | string) => {
		const account = seedToAccount(seed);
		return wrapAccount(
			account,
			async (transaction: Transaction, signingContext?: Web3Context<QRLExecutionAPI>) =>
				signTransactionWithContext(transaction, account.seed, signingContext),
		);
	};

	const decryptWithContext = async (
		keystore: KeyStore | string,
		password: string,
		options?: Record<string, unknown>,
	) => {
		const account = await decrypt(keystore, password, (options?.nonStrict as boolean) ?? true);
		return wrapAccount(
			account,
			async (transaction: Transaction, signingContext?: Web3Context<QRLExecutionAPI>) =>
				signTransactionWithContext(transaction, account.seed, signingContext),
		);
	};

	const createWithContext = () => {
		const account = create();
		return wrapAccount(
			account,
			async (transaction: Transaction, signingContext?: Web3Context<QRLExecutionAPI>) =>
				signTransactionWithContext(transaction, account.seed, signingContext),
		);
	};

	// `Wallet` is the only wallet implementation the umbrella ships; a caller-supplied wallet
	// is exposed under the same type.
	const wallet =
		(existingWallet as Wallet | undefined) ??
		new Wallet({
			create: createWithContext,
			seedToAccount: seedToAccountWithContext,
			decrypt: decryptWithContext,
		});

	return {
		signTransaction: signTransactionWithContext,
		create: createWithContext,
		seedToAccount: seedToAccountWithContext,
		decrypt: decryptWithContext,
		recoverTransaction,
		hashMessage,
		sign,
		encrypt,
		wallet,
	};
};
