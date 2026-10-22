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

import { Web3BaseWallet, Web3BaseWalletAccount, KeyStore } from '@theqrl/web3-types';
import { isNullish } from '@theqrl/web3-validator';
import { keystoreContainerError } from './keystore_utils.js';
import { WebStorage } from './types.js';

type BrowserError = { code: number; name: string };

/**
 * Wallet is an in memory `wallet` that can hold multiple accounts.
 * These accounts can be used when using web3.qrl.sendTransaction().
 *
 * Account objects carry their seed as a non-enumerable `seed` property, so it is readable as
 * `wallet[0].seed` but never shows up in `console.log`, spreads or `JSON.stringify` output.
 *
 * ### Parameters
 *  Web3AccountProvider - AccountProvider for the wallet
 *
 * ```ts
 * import Web3 from '@theqrl/web3';
 * const web3 = new Web3("https://localhost:8454")
 * web3.qrl.accounts.wallet
 * > Wallet(0) [
 *   _accountProvider: {
 *     create: [Function: createWithContext],
 *     seedToAccount: [Function: seedToAccountWithContext],
 *     decrypt: [Function: decryptWithContext]
 *   },
 *   _addressMap: Map(0) {},
 *   _defaultKeyName: 'web3js_wallet'
 * ]
 * ```
 */
export class Wallet<
	T extends Web3BaseWalletAccount = Web3BaseWalletAccount,
> extends Web3BaseWallet<T> {
	private readonly _addressMap = new Map<string, number>();
	private readonly _defaultKeyName = 'web3js_wallet';

	/**
	 * Get the storage object of the browser
	 *
	 * @returns the storage
	 */
	public static getStorage(): WebStorage | undefined {
		let storage: WebStorage | undefined;

		try {
			storage = window.localStorage;
			const x = '__storage_test__';
			storage.setItem(x, x);
			storage.removeItem(x);

			return storage;
		} catch (e: unknown) {
			return (e as BrowserError) &&
				// everything except Firefox
				((e as BrowserError).code === 22 ||
					// Firefox
					(e as BrowserError).code === 1014 ||
					// test name field too, because code might not be present
					// everything except Firefox
					(e as BrowserError).name === 'QuotaExceededError' ||
					// Firefox
					(e as BrowserError).name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
				// acknowledge QuotaExceededError only if there's something already stored
				!isNullish(storage) &&
				storage.length !== 0
				? storage
				: undefined;
		}
	}
	/**
	 * Generates one or more accounts in the wallet. If wallets already exist they will not be overridden.
	 *
	 * @param numberOfAccounts - Number of accounts to create. Leave empty to create an empty wallet.
	 * @returns The wallet
	 * ```ts
	 * web3.qrl.accounts.wallet.create(2)
	 * > Wallet(2) [
	 *   {
	 *     address: 'QA467d314BBB1E36687FfC9B277d3E163787E59641390075162BDd080E28Ddf6Ca810e1eA17308d3bec9300f85dF4F3dE54C647b4f7F02e0c9821478ac20491A1',
	 *     signTransaction: [AsyncFunction (anonymous)],
	 *     sign: [Function: sign],
	 *     encrypt: [AsyncFunction: encrypt]
	 *   },
	 *   {
	 *     address: 'Q50d1766d3113D213131A20d97CcC89190Ef68ea3e34F6E797A402c2E18119f718f05898f2F47100b37375795f56b6F16b7a1F358f833c49DC4dDD64c3FDdb052',
	 *     signTransaction: [AsyncFunction (anonymous)],
	 *     sign: [Function: sign],
	 *     encrypt: [AsyncFunction: encrypt]
	 *   },
	 *   _accountProvider: {
	 *     create: [Function: createWithContext],
	 *     seedToAccount: [Function: seedToAccountWithContext],
	 *     decrypt: [Function: decryptWithContext]
	 *   },
	 *   _addressMap: Map(2) {
	 *     'Qa467d314bbb1e36687ffc9b277d3e163787e59641390075162bdd080e28ddf6ca810e1ea17308d3bec9300f85df4f3de54c647b4f7f02e0c9821478ac20491a1' => 0,
	 *     'Q50d1766d3113d213131a20d97ccc89190ef68ea3e34f6e797a402c2e18119f718f05898f2f47100b37375795f56b6f16b7a1f358f833c49dc4ddd64c3fddb052' => 1
	 *   },
	 *   _defaultKeyName: 'web3js_wallet'
	 * ]
	 *
	 * ```
	 */

	public create(numberOfAccounts: number) {
		for (let i = 0; i < numberOfAccounts; i += 1) {
			this.add(this._accountProvider.create());
		}

		return this;
	}

	/**
	 * Adds an account using a seed or account object to the wallet.
	 *
	 * @param account - A 51-byte extended seed (`0x`-prefixed hex string) or account object
	 * @returns The wallet
	 *
	 * ```ts
	 * web3.qrl.accounts.wallet.add('0x010000c902ea9bbf1dd51aaa2ee9bed126aba921f6a6afac9cf09a21f3d915b057bace6787a894a71d1d103992aca0a6a4250c');
	 * > Wallet(1) [
	 *   {
	 *     address: 'Q68eD7F1481bb2CDA83A0A0D55F1f54c3a6eaef4e45c93D7925b42537c61057B7A0F42E1627beafC0A2DE9d1437183e49c47fA79274cc640D051adBaE9d9aDa12',
	 *     signTransaction: [AsyncFunction (anonymous)],
	 *     sign: [Function: sign],
	 *     encrypt: [AsyncFunction: encrypt]
	 *   },
	 *   _accountProvider: {
	 *     create: [Function: createWithContext],
	 *     seedToAccount: [Function: seedToAccountWithContext],
	 *     decrypt: [Function: decryptWithContext]
	 *   },
	 *   _addressMap: Map(1) { 'Q68ed7f1481bb2cda83a0a0d55f1f54c3a6eaef4e45c93d7925b42537c61057b7a0f42e1627beafc0a2de9d1437183e49c47fa79274cc640d051adbae9d9ada12' => 0 },
	 *   _defaultKeyName: 'web3js_wallet'
	 * ]
	 * ```
	 */
	public add(account: T | string): this {
		if (typeof account === 'string') {
			return this.add(this._accountProvider.seedToAccount(account));
		}
		let index = this.length;
		const existAccount = this.get(account.address);
		if (existAccount) {
			console.warn(`Account Q${account.address.slice(1).toLowerCase()} already exists.`);
			index = this._addressMap.get(account.address.toLowerCase()) ?? index;
		}
		this._addressMap.set(account.address.toLowerCase(), index);
		this[index] = account;

		return this;
	}
	/**
	 * Get the account of the wallet with either the index or public address.
	 *
	 * @param addressOrIndex - A string of the address or number index within the wallet.
	 * @returns The account object or undefined if the account doesn't exist
	 */

	public get(addressOrIndex: string | number): T | undefined {
		if (typeof addressOrIndex === 'string') {
			const index = this._addressMap.get(addressOrIndex.toLowerCase());

			if (!isNullish(index)) {
				return this[index];
			}

			return undefined;
		}

		return this[addressOrIndex];
	}

	/**
	 * Removes an account from the wallet.
	 *
	 * @param addressOrIndex - The account address, or index in the wallet.
	 * @returns true if the wallet was removed. false if it couldn't be found.
	 * ```ts
	 * web3.qrl.accounts.wallet.add('0x010000c902ea9bbf1dd51aaa2ee9bed126aba921f6a6afac9cf09a21f3d915b057bace6787a894a71d1d103992aca0a6a4250c');
	 *
	 * web3.qrl.accounts.wallet.remove('Q68eD7F1481bb2CDA83A0A0D55F1f54c3a6eaef4e45c93D7925b42537c61057B7A0F42E1627beafC0A2DE9d1437183e49c47fA79274cc640D051adBaE9d9aDa12');
	 * > true
	 * web3.qrl.accounts.wallet
	 * > Wallet(0) [
	 * _accountProvider: {
	 *   create: [Function: createWithContext],
	 *   seedToAccount: [Function: seedToAccountWithContext],
	 *   decrypt: [Function: decryptWithContext]
	 * },
	 * _addressMap: Map(0) {},
	 * _defaultKeyName: 'web3js_wallet'
	 * ]
	 * ```
	 */
	public remove(addressOrIndex: string | number): boolean {
		if (typeof addressOrIndex === 'string') {
			const index = this._addressMap.get(addressOrIndex.toLowerCase());
			if (isNullish(index)) {
				return false;
			}
			this.splice(index, 1);
			this._rebuildAddressMap();

			return true;
		}

		if (this[addressOrIndex]) {
			this.splice(addressOrIndex, 1);
			this._rebuildAddressMap();
			return true;
		}

		return false;
	}

	/**
	 * Rebuilds the address-to-index map from the current array contents.
	 * Must be called after any operation (e.g. splice) that shifts account
	 * indices, so that lookups by address keep resolving to the right account.
	 */
	private _rebuildAddressMap(): void {
		this._addressMap.clear();
		for (let i = 0; i < this.length; i += 1) {
			const account = this[i];
			if (!isNullish(account)) {
				this._addressMap.set(account.address.toLowerCase(), i);
			}
		}
	}

	/**
	 * Securely empties the wallet and removes all its accounts.
	 * Use this with *caution as it will remove all accounts stored in local wallet.
	 *
	 * @returns The wallet object
	 * ```ts
	 *
	 * web3.qrl.accounts.wallet.clear();
	 * > Wallet(0) [
	 * _accountProvider: {
	 *   create: [Function: createWithContext],
	 *   seedToAccount: [Function: seedToAccountWithContext],
	 *   decrypt: [Function: decryptWithContext]
	 * },
	 * _addressMap: Map(0) {},
	 * _defaultKeyName: 'web3js_wallet'
	 * ]
	 * ```
	 */
	public clear() {
		this._addressMap.clear();

		// Setting length clears the Array in JS.
		this.length = 0;

		return this;
	}

	/**
	 * Encrypts all wallet accounts to an array of encrypted keystore v1 objects.
	 *
	 * @param password - The password which will be used for encryption
	 * @param options - encryption options
	 * @returns An array of the encrypted keystore v1.
	 *
	 * ```ts
	 * web3.qrl.accounts.wallet.add('0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2');
	 * web3.qrl.accounts.wallet.encrypt("123").then((res) => console.log(util.inspect(res, { depth: null })));
	 * >
	 * [
	 *   {
	 *     version: 1,
	 *     id: '039e0135-b74c-4b6b-8be7-398a52a70030',
	 *     address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
	 *     crypto: {
	 *       ciphertext: 'ef6a98e4915b6138affa96055bdbd6b2a0edcfe8a12fcaf6ae77853604d22c1f975323c36e57fea929cef736977a58274eab20b7355d536be9119dbdc7bc2108befdf5',
	 *       cipherparams: { iv: 'f8eaaf8c815653b05091ec99' },
	 *       cipher: 'aes-256-gcm',
	 *       kdf: 'argon2id',
	 *       kdfparams: {
	 *         m: 262144,
	 *         t: 8,
	 *         p: 1,
	 *         dklen: 32,
	 *         salt: '210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd'
	 *       }
	 *     }
	 *   }
	 * ]
	 * ```
	 */
	public async encrypt(
		password: string,
		options?: Record<string, unknown> | undefined,
	): Promise<KeyStore[]> {
		return Promise.all(this.map(async (account: T) => account.encrypt(password, options)));
	}

	/**
	 * Decrypts keystore v1 objects.
	 *
	 * @param encryptedWallets - An array of encrypted keystore v1 objects to decrypt
	 * @param password - The password to encrypt with
	 * @param options - decrypt options for the wallets
	 * @returns The decrypted wallet object
	 *
	 * Anything other than an array is rejected with a `Web3ValidatorError` before any keystore is
	 * touched.
	 *
	 * ```ts
	 * web3.qrl.accounts.wallet.decrypt([
	 *   {
	 *     version: 1,
	 *     id: '039e0135-b74c-4b6b-8be7-398a52a70030',
	 *     address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
	 *     crypto: {
	 *       ciphertext: 'ef6a98e4915b6138affa96055bdbd6b2a0edcfe8a12fcaf6ae77853604d22c1f975323c36e57fea929cef736977a58274eab20b7355d536be9119dbdc7bc2108befdf5',
	 *       cipherparams: { iv: 'f8eaaf8c815653b05091ec99' },
	 *       cipher: 'aes-256-gcm',
	 *       kdf: 'argon2id',
	 *       kdfparams: {
	 *         m: 262144,
	 *         t: 8,
	 *         p: 1,
	 *         dklen: 32,
	 *         salt: '210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd'
	 *       }
	 *     }
	 *   }
	 * ], "123").then((res) => console.log(util.inspect(res, { depth: null })));
	 * >
	 * Wallet(1) [
	 *   {
	 *     address: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
	 *     signTransaction: [AsyncFunction (anonymous)],
	 *     sign: [Function: sign],
	 *     encrypt: [AsyncFunction: encrypt]
	 *   },
	 *   _accountProvider: {
	 *     create: [Function: createWithContext],
	 *     seedToAccount: [Function: seedToAccountWithContext],
	 *     decrypt: [Function: decryptWithContext]
	 *   },
	 *   _addressMap: Map(1) { 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40' => 0 },
	 *   _defaultKeyName: 'web3js_wallet'
	 * ]
	 * ```
	 */
	public async decrypt(
		encryptedWallets: KeyStore[],
		password: string,
		options?: Record<string, unknown> | undefined,
	) {
		if (!Array.isArray(encryptedWallets)) {
			throw keystoreContainerError('encrypted wallets must be an array of keystore objects');
		}
		const results = await Promise.all(
			encryptedWallets.map(async (wallet: KeyStore) =>
				this._accountProvider.decrypt(wallet, password, options),
			),
		);
		for (const res of results) {
			this.add(res);
		}
		return this;
	}

	/**
	 * Stores the wallet encrypted and as string in local storage.
	 * **__NOTE:__** Browser only
	 *
	 * @param password - The password to encrypt the wallet
	 * @param keyName - (optional) The key used for the local storage position, defaults to `"web3js_wallet"`.
	 * @param options - (optional) encryption options
	 * @returns Will return boolean value true if saved properly
	 * ```ts
	 * web3.qrl.accounts.wallet.save('test#!$');
	 * >true
	 * ```
	 */
	public async save(
		password: string,
		keyName?: string,
		options?: Record<string, unknown> | undefined,
	) {
		const storage = Wallet.getStorage();

		if (!storage) {
			throw new Error('Local storage not available.');
		}

		storage.setItem(
			keyName ?? this._defaultKeyName,
			JSON.stringify(await this.encrypt(password, options)),
		);

		return true;
	}

	/**
	 * Loads a wallet from local storage and decrypts it.
	 * **__NOTE:__** Browser only
	 *
	 * The stored value must be the JSON array of keystores written by {@link Wallet.save}. A value
	 * that is not valid JSON, or that is not an array, is rejected with a `Web3ValidatorError`
	 * (the stored content is not included in the message); a stored `null` loads an empty wallet.
	 *
	 * @param password - The password to decrypt the wallet.
	 * @param keyName - (optional)The key used for local storage position, defaults to `web3js_wallet"`
	 * @returns Returns the wallet object
	 *
	 * ```ts
	 * web3.qrl.accounts.wallet.save('test#!$');
	 * > true
	 * web3.qrl.accounts.wallet.load('test#!$');
	 * > Wallet(1) [
	 *   {
	 *     address: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
	 *     signTransaction: [AsyncFunction (anonymous)],
	 *     sign: [Function: sign],
	 *     encrypt: [AsyncFunction: encrypt]
	 *   },
	 *   _accountProvider: {
	 *     create: [Function: createWithContext],
	 *     seedToAccount: [Function: seedToAccountWithContext],
	 *     decrypt: [Function: decryptWithContext]
	 *   },
	 *   _addressMap: Map(1) { 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40' => 0 },
	 *   _defaultKeyName: 'web3js_wallet'
	 * ]
	 * ```
	 */
	public async load(password: string, keyName?: string) {
		const storage = Wallet.getStorage();

		if (!storage) {
			throw new Error('Local storage not available.');
		}

		const key = keyName ?? this._defaultKeyName;
		const keystore = storage.getItem(key);

		if (keystore) {
			let parsed: unknown;
			try {
				parsed = JSON.parse(keystore);
			} catch (error) {
				throw keystoreContainerError(`stored wallet "${key}" is not valid JSON`, error);
			}
			// A stored `null` is an empty slot. Anything else must be the array written by
			// `save`; `decrypt` rejects other shapes with a typed error instead of a `TypeError`.
			if (!isNullish(parsed)) {
				if (!Array.isArray(parsed)) {
					throw keystoreContainerError(
						`stored wallet "${key}" must be a JSON array of keystore objects`,
					);
				}
				await this.decrypt(parsed as KeyStore[], password);
			}
		}

		return this;
	}
}
