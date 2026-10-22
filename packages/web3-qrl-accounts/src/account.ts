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
	decrypt as createDecipheriv,
	encrypt as createCipheriv,
} from '@theqrl/qrl-cryptography/aes.js';
import { argon2idSync } from '@theqrl/qrl-cryptography/argon2id.js';
import {
	InvalidCipherError,
	InvalidKdfError,
	InvalidPasswordError,
	InvalidPublicKeyError,
	InvalidSeedError,
	IVLengthError,
	KeyStoreDecryptionError,
	KeyStoreMismatchError,
	KeyStoreVersionError,
	PublicKeyLengthError,
	SeedLengthError,
	TransactionSigningError,
	UndefinedRawTransactionError,
} from '@theqrl/web3-errors';
import {
	Address,
	Bytes,
	CipherOptions,
	HexString,
	KeyStore,
	Argon2idParams,
	Transaction,
} from '@theqrl/web3-types';
import {
	bytesToUint8Array,
	bytesToHex,
	fromUtf8,
	hexToBytes,
	randomBytes,
	sha3Raw,
	toChecksumAddress,
	uint8ArrayConcat,
	utf8ToHex,
	uuidV4,
} from '@theqrl/web3-utils';

import { isHexStrict, isNullish, isString, validator } from '@theqrl/web3-validator';
import { keyStoreSchema } from './schemas.js';
import { validateArgon2idParams, validateArgon2idSalt } from './kdf_policy.js';
import { CryptoPublicKeyBytes } from './qrl_crypto.js';
import {
	addressFromPublicKeyAndDescriptor,
	newMLDSA87Descriptor,
	newMLDSA87WalletFromExtendedSeed,
	newQrlExtendedSeed,
	qrlSeedFromBytes,
} from './qrl_wallet.js';
import { TransactionFactory } from './tx/transactionFactory.js';
import type { SignTransactionResult, TypedTransaction, Web3Account, SignResult } from './types.js';

/**
 * Get the public key Uint8Array after the validation
 */
export const parseAndValidatePublicKey = (data: Bytes, ignoreLength?: boolean): Uint8Array => {
	let publicKeyUint8Array: Uint8Array;

	// To avoid the case of 1 character less in a hex string which is prefixed with '0' by using 'bytesToUint8Array'
	if (!ignoreLength && typeof data === 'string' && isHexStrict(data) && data.length !== 5186) {
		throw new PublicKeyLengthError();
	}

	try {
		publicKeyUint8Array = data instanceof Uint8Array ? data : bytesToUint8Array(data);
	} catch {
		throw new InvalidPublicKeyError();
	}

	if (!ignoreLength && publicKeyUint8Array.byteLength !== CryptoPublicKeyBytes) {
		throw new PublicKeyLengthError();
	}

	return publicKeyUint8Array;
};

/**
 *
 * Hashes the given message. The data will be UTF-8 HEX decoded and enveloped as follows: "\\x19QRL Signed Message:\\n" + message.length + message and hashed using keccak256.
 *
 * @param message - A message to hash, if its HEX it will be UTF8 decoded.
 * @returns The hashed message
 *
 * ```ts
 * hashMessage("Hello world")
 * > "0x134c45c81b617d89c51b691341f45f5b75ec9fa825f1d44e8f8b354e734e822c"
 * hashMessage(utf8ToHex("Hello world")) // Will be hex decoded in hashMessage
 * > "0x134c45c81b617d89c51b691341f45f5b75ec9fa825f1d44e8f8b354e734e822c"
 * ```
 */
export const hashMessage = (message: string): string => {
	const messageHex = isHexStrict(message) ? message : utf8ToHex(message);

	const messageBytes = hexToBytes(messageHex);

	const preamble = hexToBytes(fromUtf8(`\x19QRL Signed Message:\n${messageBytes.byteLength}`));

	const qrlMessage = uint8ArrayConcat(preamble, messageBytes);

	return sha3Raw(qrlMessage); // using keccak in web3-utils.sha3Raw instead of SHA3 (NIST Standard) as both are different
};

/**
 * Signs arbitrary data with the private key derived from the given seed.
 * **_NOTE:_** The value passed as the data parameter will be UTF-8 HEX decoded and wrapped as follows: "\\x19QRL Signed Message:\\n" + message.length + message
 *
 * @param data - The data to sign
 * @param seed - The 51 byte extended seed (3-byte descriptor + 48-byte seed)
 * @returns The signature Object containing the message, messageHash, signature
 *
 * ```ts
 * web3.qrl.accounts.sign('Some data', '0x010000034da61fe50c659a3285549dc395571e2bf6891c462c041e3c6b9061fc73eb3687d03f940e5e65d582019ef10ce1327f')
 * > {
 * message: 'Some data',
 * messageHash: '0xd7e167cfdeb44fcd5a0704e7f6de0e9116d8feaf60ea0298cb444048bf0f6716',
 * signature: '0x…' // 4627-byte ML-DSA-87 signature (hedged, differs per call)
 * }
 * ```
 */
export const sign = (data: string, seed: Bytes): SignResult => {
	const wallet = newMLDSA87WalletFromExtendedSeed(seed);
	const hash = hashMessage(data);
	const signature = wallet.sign(hexToBytes(hash));

	return {
		message: data,
		messageHash: hash,
		signature: bytesToHex(signature),
	};
};

/**
 * Signs a QRL transaction with the private key derived from the given seed.
 *
 * @param transaction - The transaction, must be a EIP 1559 transaction type
 * @param seed -  The extended seed to import. This is a 51-byte value (3-byte descriptor + 48-byte seed).
 * @returns A signTransactionResult object that contains message hash, signature, transaction hash and raw transaction.
 *
 * This function is not stateful here. We need network access to get the account `nonce` and `chainId` to sign the transaction.
 * This function will rely on user to provide the full transaction to be signed. If you want to sign a partial transaction object
 * Use {@link Web3.qrl.accounts.sign} instead.
 *
 * Signing an eip 1559 transaction
 * ```ts
 * const tx = TransactionFactory.fromTxData({
 *	type: 2,
 *	to: 'Q0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f0109fc8df283027b6285cc889f5aa624eac1f55',
 *	maxPriorityFeePerGas: '0x3B9ACA00',
 *	maxFeePerGas: '0xB2D05E00',
 *	gasLimit: '0x6A4012',
 *	value: '0x186A0',
 *	data: '',
 *	chainId: 1,
 *	nonce: 0,
 * });
 * await signTransaction(tx, '0x010000034da61fe50c659a3285549dc395571e2bf6891c462c041e3c6b9061fc73eb3687d03f940e5e65d582019ef10ce1327f');
 * > {
 *  messageHash: '0x…',        // keccak256 of the type-2 signing preimage (32 bytes)
 *  signature: '0x…',          // 4627-byte ML-DSA-87 signature (hedged, differs per call)
 *  rawTransaction: '0x02f9…', // 0x02 || rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, descriptor, extraParams, signature, publicKey])
 *  transactionHash: '0x…'     // keccak256(rawTransaction)
 * }
 * ```
 */
export const signTransaction = async (
	transaction: TypedTransaction,
	seed: HexString,
	// To make it compatible with rest of the API, have to keep it async
	// eslint-disable-next-line @typescript-eslint/require-await
): Promise<SignTransactionResult> => {
	const signedTx = transaction.sign(hexToBytes(seed));
	if (
		isNullish(signedTx.descriptor) ||
		isNullish(signedTx.signature) ||
		isNullish(signedTx.publicKey)
	)
		throw new TransactionSigningError('Signer Error');

	const validationErrors = signedTx.validate(true);

	if (validationErrors.length > 0) {
		let errorString = 'Signer Error ';
		for (const validationError of validationErrors) {
			errorString += `${errorString} ${validationError}.`;
		}
		throw new TransactionSigningError(errorString);
	}

	const rawTx = bytesToHex(signedTx.serialize());
	const txHash = sha3Raw(rawTx); // using keccak in web3-utils.sha3Raw instead of SHA3 (NIST Standard) as both are different
	const extraParams = isNullish(signedTx.extraParams)
		? Uint8Array.from([])
		: signedTx.extraParams;

	return {
		messageHash: bytesToHex(signedTx.getMessageToSign(signedTx.descriptor, extraParams, true)),
		signature: bytesToHex(signedTx.signature),
		rawTransaction: rawTx,
		transactionHash: bytesToHex(txHash),
	};
};

/**
 * Recovers the QRL address which was used to sign the given RLP encoded transaction.
 *
 * @param rawTransaction - The hex string having RLP encoded transaction
 * @returns The QRL address used to sign this transaction
 * ```ts
 * recoverTransaction('0x02f9…'); // a signed type-2 QRL transaction, see signTransaction
 * > "QA467d314BBB1E36687FfC9B277d3E163787E59641390075162BDd080E28Ddf6Ca810e1eA17308d3bec9300f85dF4F3dE54C647b4f7F02e0c9821478ac20491A1"
 * ```
 */
export const recoverTransaction = (rawTransaction: HexString): Address => {
	if (isNullish(rawTransaction)) throw new UndefinedRawTransactionError();

	const tx = TransactionFactory.fromSerializedData(hexToBytes(rawTransaction));

	// Verify the ML-DSA-87 signature before deriving the sender. Without this,
	// getSenderAddress() would return an address derived from an unauthenticated
	// public key embedded in the raw transaction, letting a tampered/forged tx
	// resolve to an arbitrary sender.
	if (!tx.verifySignature()) {
		throw new TransactionSigningError('Signature verification failed');
	}

	return toChecksumAddress(tx.getSenderAddress().toString());
};

/**
 * Options accepted by {@link encrypt}.
 *
 * This intentionally omits `iv` from {@link CipherOptions}: AES-GCM fails
 * catastrophically on nonce (IV) reuse, so `encrypt` always generates a fresh
 * random 12-byte IV internally and never lets the caller supply one.
 * Matches the go-qrl keystore behaviour.
 */
export type EncryptOptions = Omit<CipherOptions, 'iv'>;

/**
 * encrypt a private key seed with a password, returns a V1 JSON Keystore
 *
 * Read more: https://github.com/ethereum/wiki/wiki/Web3-Secret-Storage-Definition
 *
 * **Performance / threading:** this function is CPU-bound and **blocks the
 * calling thread** for a significant time (~15s at the default
 * `m=262144, t=8`) while it runs Argon2id synchronously. Despite being
 * declared `async` it does not yield the event loop. Callers on a UI thread or
 * a server event loop SHOULD run it in a worker thread (as the QRL wallet
 * does).
 *
 * @param privateKey - The private key to encrypt, 32 bytes.
 * @param password - The password used for encryption.
 * @param options - Options to configure to encrypt the keystore with argon2id. The GCM IV is always generated internally and cannot be supplied.
 * @returns Returns a V1 JSON Keystore
 *
 *
 * Encrypt using argon2id options
 * ```ts
 * encrypt(
 *   '0xcea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2',
 *    '123',
 *    {
 *      m: 262144,
 *      salt: web3.utils.hexToBytes('0x210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd'),
 *    }
 * ).then((res) => console.log(util.inspect(res, { depth: null })));
 * >
 * // Note: cipherparams.iv is a fresh random 12-byte value on every call, so
 * // ciphertext is non-deterministic even for identical inputs.
 * {
 *   version: 1,
 *   id: '1b1dd3e2-ee6f-49c6-8a9b-a4722046582e',
 *   address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
 *   crypto: {
 *     ciphertext: '02383d4ea331fdf518651aa638d77f36de002f6b2cb340712c2957b68f927234a9c87f776e40b61227aca366bd4b7056046dfdddee29df22290939a1e96f5be5',
 *     cipherparams: { iv: 'bfb43120ae00e9de110f8325' },
 *     cipher: 'aes-256-gcm',
 *     kdf: 'argon2id',
 *     kdfparams: {
 *       m: 262144,
 *       t: 8,
 *       p: 1,
 *       dklen: 32,
 *       salt: '210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd'
 *     }
 *   }
 * }
 *```
 */
export const encrypt = async (
	seed: Bytes,
	password: string | Uint8Array,
	options?: EncryptOptions,
): Promise<KeyStore> => {
	// eslint-disable-next-line no-use-before-define
	const seedUint8Array = parseAndValidateSeed(seed);

	// if given salt is a string, convert it to a Uint8Array
	let salt;
	if (options?.salt) {
		salt =
			typeof options.salt === 'string'
				? hexToBytes(options.salt)
				: bytesToUint8Array(options.salt);
	} else {
		salt = randomBytes(32);
	}

	if (!(isString(password) || password instanceof Uint8Array)) {
		throw new InvalidPasswordError();
	}

	const uint8ArrayPassword =
		typeof password === 'string' ? hexToBytes(utf8ToHex(password)) : password;

	// AES-GCM catastrophically fails on (key, nonce) reuse: a repeated nonce
	// leaks the authentication key. The caller must NOT control the GCM nonce,
	// so we always draw a fresh random 12-byte IV internally (matching go-qrl)
	// and ignore any caller-supplied value (finding C18a).
	const initializationVector = randomBytes(12);

	const kdf = options?.kdf ?? 'argon2id';

	let derivedKey;
	let kdfparams: Argon2idParams;

	// derive key from key derivation function
	if (kdf === 'argon2id') {
		validateArgon2idSalt(salt);
		kdfparams = {
			m: options?.m ?? 262144,
			t: options?.t ?? 8,
			p: options?.p ?? 1,
			dklen: options?.dklen ?? 32,
			salt: bytesToHex(salt).replace('0x', ''),
		};
		// Reject out-of-bounds Argon2id parameters (after defaults are applied)
		// to avoid unreasonable memory/time costs.
		validateArgon2idParams(kdfparams);
		derivedKey = argon2idSync(
			uint8ArrayPassword,
			salt,
			kdfparams.t,
			kdfparams.m,
			kdfparams.p,
			kdfparams.dklen,
		);
	} else {
		throw new InvalidKdfError();
	}

	const cipher = await createCipheriv(seedUint8Array, derivedKey, initializationVector);
	const ciphertext = bytesToHex(cipher).slice(2);
	// eslint-disable-next-line no-use-before-define
	const acc = seedToAccount(seedUint8Array);

	return {
		version: 1,
		id: uuidV4(),
		address: `Q${acc.address.slice(1).toLowerCase()}`,
		crypto: {
			ciphertext,
			cipherparams: {
				iv: bytesToHex(initializationVector).replace('0x', ''),
			},
			cipher: 'aes-256-gcm',
			kdf,
			kdfparams,
		},
	};
};

/**
 * Get the seed Uint8Array after the validation
 */
export const parseAndValidateSeed = (data: Bytes, ignoreLength?: boolean): Uint8Array => {
	let seedUint8Array: Uint8Array;
	if (typeof data === 'string' && !data.startsWith('0x')) {
		throw new InvalidSeedError();
	}

	// To avoid the case of 1 character less in a hex string which is prefixed with '0' by using 'bytesToUint8Array'
	if (!ignoreLength && typeof data === 'string' && isHexStrict(data) && data.length !== 104) {
		throw new SeedLengthError();
	}

	try {
		seedUint8Array = data instanceof Uint8Array ? data : bytesToUint8Array(data);
	} catch {
		throw new InvalidSeedError();
	}

	if (!ignoreLength && seedUint8Array.byteLength !== 51) {
		throw new SeedLengthError();
	}

	return seedUint8Array;
};

/**
 * Get an Account object from the seed
 *
 * @param seed - String or Uint8Array of the 51-byte extended seed (3-byte descriptor + 48-byte seed)
 * @param ignoreLength - if true, will not error check length
 * @returns A Web3Account object
 *
 * The `Web3Account.signTransaction` is not stateful here. We need network access to get the account `nonce` and `chainId` to sign the transaction.
 * Use {@link Web3.qrl.accounts.signTransaction} instead.
 *
 * ```ts
 * seedToAccount("0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2");
 * >
 * {
 *   address: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
 *   seed: '0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2',
 *   signTransaction: [Function: signTransaction],
 *   sign: [Function: sign],
 *   encrypt: [Function: encrypt]
 * }
 * ```
 */
export const seedToAccount = (seed: Bytes): Web3Account => {
	// One strict entry point for every seed import: a 0x-prefixed hex string of exactly 51
	// bytes or a 51-byte array. Whitespace, separators and other lenient spellings are rejected
	// here instead of being normalised further down.
	const acc = newMLDSA87WalletFromExtendedSeed(parseAndValidateSeed(seed));
	const address = bytesToHex(
		addressFromPublicKeyAndDescriptor(acc.getPK(), acc.getDescriptor()),
	).replace('0x', 'Q');
	const seedHex = bytesToHex(acc.getExtendedSeed().toBytes());

	const account = {
		address: toChecksumAddress(address),
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		signTransaction: (_tx: Transaction) => {
			throw new TransactionSigningError('Do not have network access to sign the transaction');
		},
		sign: (data: Record<string, unknown> | string) =>
			sign(typeof data === 'string' ? data : JSON.stringify(data), seedHex),
		encrypt: async (password: string, options?: Record<string, unknown>) =>
			encrypt(acc.getExtendedSeed().toBytes(), password, options),
	} as unknown as Web3Account;

	Object.defineProperty(account, 'seed', {
		value: seedHex,
		enumerable: false,
		configurable: false,
		writable: false,
	});

	Object.defineProperty(account, 'toJSON', {
		value: () => ({ ...account, seed: '<redacted>' }),
		enumerable: false,
		configurable: false,
		writable: false,
	});

	return account;
};

/**
 *
 * Generates and returns a Web3Account object that includes the private and public key
 * and a seed if it's not provided.
 *
 * @returns A Web3Account object
 * ```ts
 * web3.qrl.accounts.create();
 * {
 * address: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
 * seed: '0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2',
 * signTransaction: [Function: signTransaction],
 * sign: [Function: sign],
 * encrypt: [AsyncFunction: encrypt]
 * }
 * ```
 */
export const create = (): Web3Account => {
	const descriptor = newMLDSA87Descriptor();
	const seed = qrlSeedFromBytes(randomBytes(48));
	const extendedSeed = newQrlExtendedSeed(descriptor, seed);
	return seedToAccount(extendedSeed.toBytes());
};

/**
 * Decrypts a v1 keystore JSON, and creates the account.
 *
 * **Performance / threading:** this function is CPU-bound and **blocks the
 * calling thread** for a significant time (~15s at the default
 * `m=262144, t=8`) while it runs Argon2id synchronously. Despite being
 * declared `async` it does not yield the event loop. Callers on a UI thread or
 * a server event loop SHOULD run it in a worker thread (as the QRL wallet
 * does).
 *
 * @param keystore - the encrypted Keystore object or string to decrypt
 * @param password - The password that was used for encryption
 * @param nonStrict - if true and given a json string, the keystore will be parsed as lowercase.
 * @returns Returns the decrypted Web3Account object
 * Decrypting argon2id
 *
 * ```ts
 * decrypt({
 *   version: 1,
 *   id: '1b1dd3e2-ee6f-49c6-8a9b-a4722046582e',
 *   address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
 *   crypto: {
 *     ciphertext: '02383d4ea331fdf518651aa638d77f36de002f6b2cb340712c2957b68f927234a9c87f776e40b61227aca366bd4b7056046dfdddee29df22290939a1e96f5be5',
 *     cipherparams: { iv: 'bfb43120ae00e9de110f8325' },
 *     cipher: 'aes-256-gcm',
 *     kdf: 'argon2id',
 *     kdfparams: {
 *       m: 262144,
 *       t: 8,
 *       p: 1,
 *       dklen: 32,
 *       salt: '210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd'
 *     }
 *   }
 * }, '123').then((res) => console.log(util.inspect(res, { depth: null })));
 * >
 * {
 *   address: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
 *   seed: '0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2',
 *   signTransaction: [Function: signTransaction],
 *   sign: [Function: sign],
 *   encrypt: [Function: encrypt]
 * }
 * ```
 */
export const decrypt = async (
	keystore: KeyStore | string,
	password: string | Uint8Array,
	nonStrict?: boolean,
): Promise<Web3Account> => {
	const json =
		typeof keystore === 'object'
			? keystore
			: (JSON.parse(nonStrict ? keystore.toLowerCase() : keystore) as KeyStore);

	validator.validateJSONSchema(keyStoreSchema, json);

	if (json.version !== 1) throw new KeyStoreVersionError();

	// The schema only establishes that `cipher` is a string; the value itself must name the one
	// cipher this keystore format defines, so a foreign keystore fails here with a clear error
	// rather than deep inside the AES-GCM decryption.
	if (json.crypto.cipher !== 'aes-256-gcm') throw new InvalidCipherError(json.crypto.cipher);

	const uint8ArrayPassword =
		typeof password === 'string' ? hexToBytes(utf8ToHex(password)) : password;

	validator.validate(['bytes'], [uint8ArrayPassword]);

	let derivedKey;
	if (json.crypto.kdf === 'argon2id') {
		const kdfparams = json.crypto.kdfparams as Argon2idParams;
		// Bound the untrusted KDF parameters from the keystore JSON before
		// deriving the key, to prevent maliciously large memory/time costs.
		validateArgon2idParams(kdfparams);
		// Normalize every accepted byte representation before handing it to Argon2.
		const uint8ArraySalt =
			typeof kdfparams.salt === 'string'
				? hexToBytes(kdfparams.salt)
				: bytesToUint8Array(kdfparams.salt);
		validateArgon2idSalt(uint8ArraySalt);
		derivedKey = argon2idSync(
			uint8ArrayPassword,
			uint8ArraySalt,
			kdfparams.t,
			kdfparams.m,
			kdfparams.p,
			kdfparams.dklen,
		);
	} else {
		throw new InvalidKdfError();
	}

	const initializationVector = hexToBytes(json.crypto.cipherparams.iv);
	if (initializationVector.length !== 12) throw new IVLengthError();
	const ciphertext = hexToBytes(json.crypto.ciphertext);

	let seed: Uint8Array;
	try {
		seed = await createDecipheriv(ciphertext, derivedKey, initializationVector);
	} catch {
		// AES-GCM authentication failed. A wrong password and a tampered ciphertext or IV are
		// indistinguishable by construction, so one typed error covers both instead of the
		// WebCrypto `DOMException` leaking out.
		throw new KeyStoreDecryptionError();
	}

	const account = seedToAccount(seed);

	// Parity with go-qrl (accounts/keystore/passphrase.go GetKey): confirm the address derived
	// from the decrypted seed matches the address recorded in the keystore. This is a local sanity
	// check on the (unauthenticated) `address` label — it does NOT bind metadata as GCM AAD, so it
	// keeps keystores interoperable with go-qrl (see C18 explainer). Case-insensitive because the
	// stored address is lower-cased while a derived address is checksum-cased.
	if (account.address.toLowerCase() !== `q${json.address.slice(1).toLowerCase()}`) {
		throw new KeyStoreMismatchError(json.address, account.address);
	}

	return account;
};
