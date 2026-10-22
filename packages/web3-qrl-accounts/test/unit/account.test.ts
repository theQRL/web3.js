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

import { Address, KeyStore } from '@theqrl/web3-types';
import { Web3ValidatorError, isAddressString } from '@theqrl/web3-validator';
import { bytesToHex, hexToBytes, uint8ArrayConcat } from '@theqrl/web3-utils';
import {
	InvalidCipherError,
	InvalidKdfError,
	InvalidPasswordError,
	InvalidSeedError,
	IVLengthError,
	KeyStoreDecryptionError,
	SeedLengthError,
	TransactionSigningError,
} from '@theqrl/web3-errors';
import { keccak256 } from '@theqrl/qrl-cryptography/keccak.js';
import {
	create,
	decrypt,
	encrypt,
	hashMessage,
	seedToAccount,
	recoverTransaction,
	sign,
	signTransaction,
} from '../../src/account';
import {
	invalidDecryptData,
	invalidEncryptData,
	invalidKeyStore,
	invalidSeedtoAccountData,
	signatureRecoverData,
	transactionsTestData,
	validDecryptData,
	validEncryptData,
	validHashMessageData,
	validSeedtoAccountData,
} from '../fixtures/account';
import { TransactionFactory } from '../../src/tx/transactionFactory';
import { FeeMarketEIP1559TxData, TxData } from '../../src/tx/types';
import { newMLDSA87WalletFromExtendedSeed, verifyMLDSA87Signature } from '../../src/qrl_wallet';

describe('accounts', () => {
	describe('create', () => {
		describe('valid cases', () => {
			it('%s', () => {
				const account = create();
				expect(typeof account.seed).toBe('string');
				expect(typeof account.address).toBe('string');
				expect(isAddressString(account.address)).toBe(true);
				expect(typeof account.encrypt).toBe('function');
				expect(typeof account.sign).toBe('function');
				expect(typeof account.signTransaction).toBe('function');
			});
		});
	});

	describe('seedToAccount', () => {
		describe('valid cases', () => {
			it.each(validSeedtoAccountData)('%s', (input, output) => {
				const account = seedToAccount(input.address);
				expect(account.address).toEqual(output.address);
				expect(account.seed).toEqual(output.seed);
				expect(typeof account.sign).toBe('function');
				expect(typeof account.signTransaction).toBe('function');
				expect(typeof account.encrypt).toBe('function');
			});

			it('should not enumerate seed and should redact JSON.stringify', () => {
				const account = seedToAccount(validSeedtoAccountData[0][0].address);
				expect(Object.keys(account)).not.toContain('seed');
				expect(JSON.stringify(account)).not.toContain(account.seed);
				expect(JSON.stringify(account)).toContain('<redacted>');
			});

			it.each([
				{ name: 'Uint8Array', makeSeed: (hex: string) => hexToBytes(hex) },
				{ name: 'Buffer', makeSeed: (hex: string) => Buffer.from(hexToBytes(hex)) },
			])('keeps the signing key when the imported $name is mutated', ({ makeSeed }) => {
				const seedHex = `0x010000${'01'.repeat(48)}`;
				const seed = makeSeed(seedHex);
				const originalWallet = newMLDSA87WalletFromExtendedSeed(seedHex);
				const account = seedToAccount(seed);
				const originalAddress = account.address;

				seed[seed.length - 1] ^= 1;
				const mutatedWallet = newMLDSA87WalletFromExtendedSeed(seed);
				const message = 'The signing key must remain the imported key';
				const result = account.sign(message);
				const signature = hexToBytes(result.signature);
				const messageHash = hexToBytes(hashMessage(message));

				expect(account.address).toBe(originalAddress);
				expect(account.seed).toBe(seedHex);
				expect(result.messageHash).toBe(hashMessage(message));
				expect(
					verifyMLDSA87Signature(
						signature,
						messageHash,
						originalWallet.getPK(),
						originalWallet.getDescriptor(),
					),
				).toBe(true);
				expect(
					verifyMLDSA87Signature(
						signature,
						messageHash,
						mutatedWallet.getPK(),
						mutatedWallet.getDescriptor(),
					),
				).toBe(false);
			});
		});

		describe('invalid cases', () => {
			it.each(invalidSeedtoAccountData)('%s', (input, output) => {
				expect(() => seedToAccount(input)).toThrow(output);
			});
		});
	});

	describe('Signing and Recovery of Transaction', () => {
		it.each(transactionsTestData)('sign transaction', async txData => {
			const account = create();

			const signedResult = await signTransaction(
				TransactionFactory.fromTxData(txData as unknown as TxData),
				account.seed,
			);
			expect(signedResult).toBeDefined();
			expect(signedResult.messageHash).toBeDefined();
			expect(signedResult.rawTransaction).toBeDefined();
			expect(signedResult.transactionHash).toBeDefined();
			expect(signedResult.signature).toMatch(/0[xX][0-9a-fA-F]{9190}/);
		});

		it.each(transactionsTestData)('Recover transaction', async txData => {
			const account = create();
			const txObj = { ...txData, from: account.address };
			const signedResult = await signTransaction(
				TransactionFactory.fromTxData(txObj),
				account.seed,
			);
			expect(signedResult).toBeDefined();

			const address: Address = recoverTransaction(signedResult.rawTransaction);
			expect(address).toBeDefined();
			expect(address).toEqual(account.address);
		});

		it('recoverTransaction rejects a tampered signature', async () => {
			const account = create();
			const txObj = { ...transactionsTestData[0][0], from: account.address };
			const signedResult = await signTransaction(
				TransactionFactory.fromTxData(txObj as unknown as TxData),
				account.seed,
			);

			// A validly-signed raw tx returns the signer address.
			expect(recoverTransaction(signedResult.rawTransaction)).toEqual(account.address);

			// Re-decode and tamper the ML-DSA-87 signature while keeping the same
			// public key. `signature` is a readonly reference but the underlying
			// bytes are mutable.
			const tx = TransactionFactory.fromSerializedData(
				hexToBytes(signedResult.rawTransaction),
			);
			(tx.signature as Uint8Array)[0] ^= 0xff;
			const tamperedRaw = bytesToHex(tx.serialize());

			// getSenderAddress() would still derive the same address from the
			// (unauthenticated) public key, but signature verification must fail.
			expect(() => recoverTransaction(tamperedRaw)).toThrow(TransactionSigningError);
		});
	});

	describe('Hash Message', () => {
		it.each(validHashMessageData)('%s', (message, hash) => {
			expect(hashMessage(message)).toEqual(hash);
		});
	});

	describe('Sign Message', () => {
		describe('sign', () => {
			it.each(signatureRecoverData)('%s', (data, testObj) => {
				const result = sign(data, testObj.seed);
				expect(result.message).toEqual(data);
				expect(result.messageHash).toEqual(hashMessage(data));
				expect(result.signature).toMatch(/^0x[0-9a-f]+$/i);
			});
		});
	});

	describe('encrypt', () => {
		describe('valid cases', () => {
			it.each(validEncryptData)('%s', async (input, output) => {
				const result = await encrypt(input[0], input[1], input[2]).catch(err => {
					throw err;
				});
				expect(result.version).toBe(output.version);
				expect(result.address).toBe(output.address);
				// encrypt always generates a fresh random 12-byte IV
				// so ciphertext/iv are non-deterministic and
				// can't be asserted against fixed values. Assert the IV is a
				// well-formed random 12-byte value instead...
				expect(result.crypto.cipherparams.iv).toMatch(/^[0-9a-f]{24}$/);
				expect(result.crypto.cipher).toEqual(output.crypto.cipher);
				expect(result.crypto.kdf).toBe(output.crypto.kdf);
				expect(result.crypto.kdfparams).toEqual(output.crypto.kdfparams);
				expect(typeof result.version).toBe('number');
				expect(typeof result.id).toBe('string');
				// ...and prove correctness by round-tripping through decrypt.
				const recovered = await decrypt(result, input[1]);
				const expectedSeed = typeof input[0] === 'string' ? input[0] : bytesToHex(input[0]);
				expect(recovered.seed).toBe(expectedSeed);
				// recovered.address is checksum-cased; the stored keystore
				// address is lower-cased, so compare case-insensitively.
				expect(recovered.address.toLowerCase()).toBe(output.address.toLowerCase());
			});
		});

		describe('invalid cases', () => {
			it.each(invalidEncryptData)('%s', async (input, output) => {
				const result = encrypt(input[0], input[1], input[2]);
				await expect(result).rejects.toThrow(output);
			});
		});

		describe('random IV (finding C18a)', () => {
			it('generates a fresh random IV on every call and ignores any caller-supplied iv', async () => {
				const seed =
					'0x0100005dfdcad4f721fe41d1bdf632de24ba60ba7cfab9c9a79287fa007b6a0dec8200b1fa35d2575bb15bd44d59b8d878828b';
				const password = '1234567890';
				// Keep salt (and cost params) fixed so the ONLY difference
				// between the two keystores is the internally-generated IV.
				// Also pass an `iv` via a loosely-typed options object to prove
				// it is ignored, not honoured.
				const options = {
					t: 2,
					m: 19456,
					p: 1,
					iv: hexToBytes('0xf59185068e4cbe729dd0000c'),
					salt: hexToBytes(
						'6140afd0defbcc3fe45d2166969adf5fb45479da880c6cc10d4510b5dfa9908b',
					),
				} as unknown as Parameters<typeof encrypt>[2];

				const first = await encrypt(seed, password, options);
				const second = await encrypt(seed, password, options);

				// Different random IVs => different ciphertext.
				expect(first.crypto.cipherparams.iv).not.toBe(second.crypto.cipherparams.iv);
				expect(first.crypto.ciphertext).not.toBe(second.crypto.ciphertext);
				// The caller-supplied iv must have been ignored.
				expect(first.crypto.cipherparams.iv).not.toBe('f59185068e4cbe729dd0000c');
				expect(second.crypto.cipherparams.iv).not.toBe('f59185068e4cbe729dd0000c');

				// Both keystores still decrypt back to the same seed.
				const recoveredFirst = await decrypt(first, password);
				const recoveredSecond = await decrypt(second, password);
				expect(recoveredFirst.seed).toBe(seed);
				expect(recoveredSecond.seed).toBe(seed);
			});
		});
	});

	describe('decrypt', () => {
		it('rejects a keystore whose cipher is not aes-256-gcm', async () => {
			const account = create();
			const keystore = await encrypt(account.seed, 'password', { m: 19456, t: 2, p: 1 });
			const tampered = { ...keystore, crypto: { ...keystore.crypto, cipher: 'aes-128-ctr' } };

			await expect(decrypt(tampered as unknown as KeyStore, 'password')).rejects.toThrow(
				InvalidCipherError,
			);
		});

		describe('valid cases', () => {
			it.each(validDecryptData)('%s', async input => {
				const keystore = await encrypt(input[0], input[1], input[2]).catch(err => {
					throw err;
				});

				// make sure decrypt does not throw invalid password error
				const result = await decrypt(keystore, input[1]);

				expect(JSON.stringify(result)).toEqual(JSON.stringify(seedToAccount(input[3])));

				const keystoreString = JSON.stringify(keystore);

				const stringResult = await decrypt(keystoreString, input[1], true);

				expect(JSON.stringify(stringResult)).toEqual(
					JSON.stringify(seedToAccount(input[3])),
				);
			});
		});

		// Parity with go-qrl: the address label must match the address derived from the
		// decrypted seed (finding C18b).
		it('rejects a keystore whose address label does not match the decrypted key', async () => {
			const seed = create().seed;
			// Use the cheapest valid Argon2id cost (the ARGON2ID_BOUNDS floor) so the
			// test exercises the address-binding logic without paying the production
			// default's 256 MiB / t=8 KDF cost, which times out on CI runners.
			const keystore = await encrypt(seed, 'test-password', {
				m: 19456,
				t: 2,
				p: 1,
			} as unknown as Parameters<typeof encrypt>[2]);
			const tampered = {
				...keystore,
				address: `Q${'0'.repeat(128)}`,
			};

			await expect(decrypt(tampered, 'test-password')).rejects.toThrow(
				/Keystore address does not match/,
			);
			// the untampered keystore still decrypts fine
			await expect(decrypt(keystore, 'test-password')).resolves.toBeDefined();
		});

		describe('invalid cases', () => {
			it.each(invalidDecryptData)('%s', async (input, output) => {
				const result = decrypt(input[0], input[1]);

				await expect(result).rejects.toThrow(output);
			});
		});

		describe('invalid keystore, fails validation', () => {
			it.each(invalidKeyStore)('%s', async input => {
				const result = decrypt(input[0], input[1]);

				await expect(result).rejects.toThrow(Web3ValidatorError);
			});
		});

		describe('out-of-bounds Argon2id parameters', () => {
			it('rejects a keystore whose kdfparams.m exceeds the allowed bound', async () => {
				const keystore = {
					version: 1,
					address:
						'Q5f279a4668d52e544a5fdf0c6212236c693e7b760377adc0754066a409c30effd2472bf229ea506ea693c01386b8a2b73c22d7e375e20e1ce8d104dade60ff2a',
					crypto: {
						ciphertext:
							'c42ac873cf649cf61970f0ec1b382d25495a77ed4865f1366cfa10b2560514b0b618ea6e2c83c1473baf619897c9495b8e97e4c16e0cc5c92c00d2c3f3940d2e40a460',
						cipherparams: { iv: 'f59185068e4cbe729dd0000c' },
						cipher: 'aes-256-gcm',
						kdf: 'argon2id',
						kdfparams: {
							// exceeds ARGON2ID_BOUNDS.m.max (1_048_576)
							m: 2_097_152,
							t: 8,
							p: 1,
							dklen: 32,
							salt: '6140afd0defbcc3fe45d2166969adf5fb45479da880c6cc10d4510b5dfa9908b',
						},
					},
					id: 'e59590d4-3ef3-4a8d-829e-790b83bbf4da7',
				};

				// Must be rejected by the bounds check before any key derivation.
				await expect(
					decrypt(keystore as unknown as KeyStore, '1234567890'),
				).rejects.toThrow(/Argon2id m out of range/);
			});
		});
	});

	describe('decrypt error types', () => {
		const argon2 = { m: 19456, t: 2, p: 1 };
		const withCrypto = (keystore: KeyStore, crypto: Record<string, unknown>) =>
			({ ...keystore, crypto: { ...keystore.crypto, ...crypto } }) as unknown as KeyStore;
		// These failures must be detected before key derivation or ciphertext authentication.
		const invalidKeystore: KeyStore = {
			version: 1,
			id: 'invalid-kdf-test',
			address: `Q${'00'.repeat(64)}`,
			crypto: {
				cipher: 'aes-256-gcm',
				ciphertext: '00'.repeat(67),
				cipherparams: { iv: '00'.repeat(12) },
				kdf: 'argon2id',
				kdfparams: { ...argon2, dklen: 32, salt: '00'.repeat(32) },
			},
		};

		it.each([
			['m', 1],
			['t', 0],
			['p', 0],
			['dklen', 0],
		])('reports an out-of-range %s as InvalidKdfError', async (field, value) => {
			const kdfparams = { ...invalidKeystore.crypto.kdfparams, [field]: value };
			await expect(
				decrypt(withCrypto(invalidKeystore, { kdfparams }), 'password'),
			).rejects.toThrow(InvalidKdfError);
		});

		it.each([new Uint8Array(), [], '00', '00'.repeat(7)])(
			'reports a short salt %s as InvalidKdfError',
			async salt => {
				const kdfparams = { ...invalidKeystore.crypto.kdfparams, salt };
				await expect(
					decrypt(withCrypto(invalidKeystore, { kdfparams }), 'password'),
				).rejects.toThrow(InvalidKdfError);
			},
		);

		it('rejects a short encryption salt with the same typed KDF error', async () => {
			const seed = `0x010000${'00'.repeat(48)}`;
			await expect(encrypt(seed, 'password', { ...argon2, salt: '00' })).rejects.toThrow(
				InvalidKdfError,
			);
		});

		it('reports a wrong password as KeyStoreDecryptionError', async () => {
			const keystore = await encrypt(create().seed, 'password', argon2);
			await expect(decrypt(keystore, 'not the password')).rejects.toThrow(
				KeyStoreDecryptionError,
			);
		});

		it('reports a tampered ciphertext as KeyStoreDecryptionError', async () => {
			const keystore = await encrypt(create().seed, 'password', argon2);
			const { ciphertext } = keystore.crypto;
			const flipped = `${ciphertext.slice(0, -2)}${ciphertext.endsWith('00') ? '01' : '00'}`;
			await expect(
				decrypt(withCrypto(keystore, { ciphertext: flipped }), 'password'),
			).rejects.toThrow(KeyStoreDecryptionError);
		});

		it('rejects an IV that is not 12 bytes with IVLengthError', async () => {
			const keystore = await encrypt(create().seed, 'password', argon2);
			await expect(
				decrypt(withCrypto(keystore, { cipherparams: { iv: '00'.repeat(8) } }), 'password'),
			).rejects.toThrow(IVLengthError);
		});

		it('rejects a salt that is not bytes with a typed validation error', async () => {
			const keystore = await encrypt(create().seed, 'password', argon2);
			const kdfparams = { ...keystore.crypto.kdfparams, salt: true };
			await expect(decrypt(withCrypto(keystore, { kdfparams }), 'password')).rejects.toThrow(
				Web3ValidatorError,
			);
		});

		it('normalizes a byte-array salt before calling Argon2', async () => {
			const account = create();
			const keystore = await encrypt(account.seed, 'password', argon2);
			const salt = Array.from(hexToBytes(keystore.crypto.kdfparams.salt as string));
			const kdfparams = { ...keystore.crypto.kdfparams, salt };
			await expect(
				decrypt(withCrypto(keystore, { kdfparams }), 'password'),
			).resolves.toMatchObject({ seed: account.seed, address: account.address });
		});
	});
	describe('strict seed policy in sign() and signTransaction() (M-12, L-11)', () => {
		const seed = validSeedtoAccountData[0][0].address as string;
		const expectedAddress = validSeedtoAccountData[0][1].address as string;
		const unsignedTxData: FeeMarketEIP1559TxData = {
			type: 2,
			chainId: 1,
			nonce: 0,
			gasLimit: 21000,
			maxFeePerGas: 1,
			maxPriorityFeePerGas: 1,
			to: `Q${'0'.repeat(128)}`,
		};
		const unsignedTx = () => TransactionFactory.fromTxData(unsignedTxData);
		const pairs = seed.slice(2).match(/../g) as string[];
		const lenientSpellings: [string, string][] = [
			['no 0x prefix', seed.slice(2)],
			['a leading space', ` ${seed}`],
			['a trailing newline', `${seed}\n`],
			['colon separators', pairs.join(':')],
			['an uppercase 0X prefix', `0X${seed.slice(2)}`],
			['underscore separators', pairs.join('_')],
		];

		it.each(lenientSpellings)(
			'sign() rejects a seed with %s with a value-free InvalidSeedError (L-11)',
			(_name, spelling) => {
				expect(() => sign('message', spelling)).toThrow(InvalidSeedError);
			},
		);

		it.each(lenientSpellings)(
			'signTransaction() rejects a seed with %s with a value-free InvalidSeedError (L-11)',
			async (_name, spelling) => {
				await expect(signTransaction(unsignedTx(), spelling)).rejects.toThrow(
					InvalidSeedError,
				);
			},
		);

		it('sign() and signTransaction() accept a 51-byte Uint8Array seed (L-11)', async () => {
			const seedBytes = hexToBytes(seed);
			const signed = await signTransaction(unsignedTx(), seedBytes);
			expect(recoverTransaction(signed.rawTransaction)).toBe(expectedAddress);
			expect(sign('message', seedBytes).messageHash).toBe(hashMessage('message'));
		});

		it('sign() and signTransaction() reject a wrong-length byte seed with SeedLengthError (L-11)', async () => {
			expect(() => sign('message', new Uint8Array(50))).toThrow(SeedLengthError);
			await expect(signTransaction(unsignedTx(), new Uint8Array(52))).rejects.toThrow(
				SeedLengthError,
			);
		});

		it('never echoes a malformed seed in the signTransaction() error (M-12)', async () => {
			// e.g. fs.readFileSync('seed.txt', 'utf8') with a trailing newline
			const seedFromFile = `${seed}\n`;
			const error = await signTransaction(unsignedTx(), seedFromFile).catch(
				(e: unknown) => e,
			);
			expect(error).toBeInstanceOf(InvalidSeedError);
			expect((error as Error).message).not.toContain(seed.slice(2, 40));
			expect(JSON.stringify(error)).not.toContain(seed.slice(2, 40));
		});

		it('never echoes a non-string password in the decrypt() error (M-12)', async () => {
			// The password type is checked before the keystore is even looked at, so an empty
			// object is enough: the error must be the typed password error, not a validator error
			// that would interpolate the value.
			const error = await decrypt({} as unknown as KeyStore, 123456 as unknown as string).catch(
				(e: unknown) => e,
			);
			expect(error).toBeInstanceOf(InvalidPasswordError);
			expect((error as Error).message).not.toContain('123456');
			expect(JSON.stringify(error)).not.toContain('123456');
		});
	});

	describe('hashMessage hashes the raw UTF-8 bytes (L-14)', () => {
		// Reference: go-qrl accounts.TextAndHash — keccak256("\x19QRL Signed Message:\n" + len(data) + data)
		const goTextHash = (message: string): string => {
			const bytes = new TextEncoder().encode(message);
			const preamble = new TextEncoder().encode(`\x19QRL Signed Message:\n${bytes.length}`);
			return bytesToHex(keccak256(uint8ArrayConcat(preamble, bytes)));
		};

		it.each(['\u0000abc', 'abc\u0000', '\u0000\u0000abc'])(
			'does not strip NUL characters from %j',
			message => {
				expect(hashMessage(message)).toBe(goTextHash(message));
				expect(hashMessage(message)).not.toBe(hashMessage('abc'));
			},
		);

		it('matches the go-qrl TextHash vectors', () => {
			expect(hashMessage('Hello world')).toBe(
				'0x134c45c81b617d89c51b691341f45f5b75ec9fa825f1d44e8f8b354e734e822c',
			);
			expect(hashMessage('héllo ✓ 日本')).toBe(
				'0xf9fa48b78d4c50124b71e7b7867fa7089507d2f2acede83960cc35189fed6aba',
			);
			expect(hashMessage('')).toBe(
				'0xd1e20245c66f2cc8733c0a25cf6136279aab0d4e4d5eb18ede8759cd83b69516',
			);
			// A 0x-prefixed hex string is hashed as the bytes it encodes (go-qrl qrl_sign receives
			// hexutil.Bytes), not as the text "0x1234".
			expect(hashMessage('0x1234')).toBe(
				'0x2a0eeed79c5f517afc69e4c075f26b37b8a470e4bba020b76ecfd3fd1fea7364',
			);
		});

		it('a signature over "abc" is not a signature over "\\u0000abc"', () => {
			const result = sign('abc', validSeedtoAccountData[0][0].address as string);
			expect(result.messageHash).toBe(hashMessage('abc'));
			expect(result.messageHash).not.toBe(hashMessage('\u0000abc'));
		});
	});

	describe('keystore hardening (L-12, L-17, L-72, I-7)', () => {
		const seed = validSeedtoAccountData[0][0].address as string;
		const argon2 = { m: 19456, t: 2, p: 1 };
		let keystore: KeyStore;
		const withCrypto = (crypto: Record<string, unknown>) =>
			({ ...keystore, crypto: { ...keystore.crypto, ...crypto } }) as unknown as KeyStore;
		const withKdfparams = (kdfparams: Record<string, unknown>) =>
			withCrypto({ kdfparams: { ...keystore.crypto.kdfparams, ...kdfparams } });

		beforeAll(async () => {
			keystore = await encrypt(seed, 'pw', argon2);
		});

		it.each([16, 24, 31, 33, 64])(
			'encrypt rejects dklen=%s with InvalidKdfError instead of failing inside AES (L-12)',
			async dklen => {
				await expect(encrypt(seed, 'pw', { ...argon2, dklen })).rejects.toThrow(
					InvalidKdfError,
				);
			},
		);

		it('decrypt reports an edited dklen as InvalidKdfError, not as a wrong password (L-12)', async () => {
			await expect(decrypt(withKdfparams({ dklen: 16 }), 'pw')).rejects.toThrow(
				InvalidKdfError,
			);
		});

		it('reports a missing cipherparams.iv as a validation error that does not echo the keystore (L-17)', async () => {
			const error = await decrypt(withCrypto({ cipherparams: {} }), 'pw').catch(
				(e: unknown) => e,
			);
			expect(error).toBeInstanceOf(Web3ValidatorError);
			expect((error as Error).message).not.toContain(keystore.crypto.ciphertext);
		});

		it.each(['zz', '00'.repeat(12).slice(1), '0xzz', ''])(
			'reports a malformed iv %j as IVLengthError (L-17)',
			async iv => {
				await expect(decrypt(withCrypto({ cipherparams: { iv } }), 'pw')).rejects.toThrow(
					IVLengthError,
				);
			},
		);

		it.each(['zz', 'abc', '00'.repeat(66), '00'.repeat(68)])(
			'reports a malformed ciphertext %j as KeyStoreDecryptionError before key derivation (L-17)',
			async ciphertext => {
				await expect(decrypt(withCrypto({ ciphertext }), 'pw')).rejects.toThrow(
					KeyStoreDecryptionError,
				);
			},
		);

		it.each(['zz'.repeat(16), '0xzz', '012'])(
			'reports a non-hex salt %j as InvalidKdfError (L-17)',
			async salt => {
				await expect(decrypt(withKdfparams({ salt }), 'pw')).rejects.toThrow(InvalidKdfError);
			},
		);

		it('still accepts a 0x-prefixed hex salt and a byte-array salt (L-17)', async () => {
			const salt = keystore.crypto.kdfparams.salt as string;
			await expect(decrypt(withKdfparams({ salt: `0x${salt}` }), 'pw')).resolves.toMatchObject({
				seed,
			});
			await expect(
				decrypt(withKdfparams({ salt: Array.from(hexToBytes(salt)) }), 'pw'),
			).resolves.toMatchObject({ seed });
		});

		it.each(['m', 't', 'p', 'dklen', 'salt'])(
			'reports a missing kdfparams.%s as a validation error (L-17)',
			async member => {
				const kdfparams = { ...keystore.crypto.kdfparams } as Record<string, unknown>;
				delete kdfparams[member];
				await expect(decrypt(withCrypto({ kdfparams }), 'pw')).rejects.toThrow(
					Web3ValidatorError,
				);
			},
		);

		it('reports a non-numeric kdf parameter as a validation error without echoing it (L-17)', async () => {
			const error = await decrypt(withKdfparams({ m: '19456' }), 'pw').catch((e: unknown) => e);
			expect(error).toBeInstanceOf(Web3ValidatorError);
			expect((error as Error).message).not.toContain('19456');
		});

		it('reports a keystore string that is not JSON as a Web3ValidatorError (L-17)', async () => {
			const error = await decrypt('{not json', 'pw').catch((e: unknown) => e);
			expect(error).toBeInstanceOf(Web3ValidatorError);
			expect((error as Web3ValidatorError).innerError).toBeInstanceOf(SyntaxError);
			expect((error as Error).message).not.toContain('{not json');
		});

		it('accepts an empty password on encrypt and decrypt, as go-qrl does (I-7)', async () => {
			const emptyPasswordKeystore = await encrypt(seed, '', argon2);
			await expect(decrypt(emptyPasswordKeystore, '')).resolves.toMatchObject({ seed });
			await expect(decrypt(emptyPasswordKeystore, new Uint8Array(0))).resolves.toMatchObject({
				seed,
			});
		});

		it('encodes a string password as its raw UTF-8 bytes, NUL characters included (L-14)', async () => {
			const nulPasswordKeystore = await encrypt(seed, '\u0000pw', argon2);
			await expect(decrypt(nulPasswordKeystore, '\u0000pw')).resolves.toMatchObject({ seed });
			await expect(decrypt(nulPasswordKeystore, 'pw')).rejects.toThrow(KeyStoreDecryptionError);
		});

		it('does not repeat the "Signer Error" prefix in a validation failure (I-7)', async () => {
			const lowGasTxData: FeeMarketEIP1559TxData = {
				type: 2,
				chainId: 1,
				nonce: 0,
				gasLimit: 1,
				maxFeePerGas: 1,
				maxPriorityFeePerGas: 1,
				to: `Q${'0'.repeat(128)}`,
			};
			const tx = TransactionFactory.fromTxData(lowGasTxData);
			const error = await signTransaction(tx, seed).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(TransactionSigningError);
			// TransactionSigningError wraps its detail as: Invalid signature. "<detail>"
			expect((error as Error).message).toMatch(/"Signer Error: gasLimit is too low/);
			expect((error as Error).message.match(/Signer Error/g)).toHaveLength(1);
		});
	});

	describe('go-qrl keystore interoperability (L-72)', () => {
		// Vectors produced by go-qrl `keystore.EncryptKey` (crosscheck vectors_go.json): the same
		// seed encrypted with the standard profile (m = 19456 here) and with the `--lightkdf`
		// profile (LightArgon2idM = 1 << 12 = 4096, t = 8, p = 1). Password "123".
		const goSeed =
			'0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2';
		const goAddress =
			'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40';
		const goLightKeystore: KeyStore = {
			address:
				'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
			crypto: {
				cipher: 'aes-256-gcm',
				ciphertext:
					'427682b088ff4046a1047274b3a45556112408cfde125e1d2c38b7e002efbbac281fcd7e5f4910ba08c246476ab96349acc29d0032aebe36fa9250f1b3b99d832ffcba',
				cipherparams: { iv: 'b8bf6350763dab3d272310e8' },
				kdf: 'argon2id',
				kdfparams: {
					dklen: 32,
					m: 4096,
					p: 1,
					salt: '1542fe3f826524aaf50b8de0f4f13923feee0e6fa6ec4bb0820fa494978ad3e4',
					t: 8,
				},
			},
			id: '5bfd0b36-45ee-49a9-8e04-4a9d10690b6a',
			version: 1,
		};
		const goStandardKeystore: KeyStore = {
			address:
				'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
			crypto: {
				cipher: 'aes-256-gcm',
				ciphertext:
					'ca1c95a0b3bab6c874d4262313c35865817409de4b7c1a5f66bc9eda8a1bbb21cbf9ea7494cb221228f7a769127e76cc5d5ae2a2c5cc3d4efe727ab67bba3b7ec2d777',
				cipherparams: { iv: '7a9776c14cb6e9a17b368f31' },
				kdf: 'argon2id',
				kdfparams: {
					dklen: 32,
					m: 19456,
					p: 1,
					salt: '5e83ebc2b13ad12b8d0b20fdf22e385dc87192c0c1f1bb660a4ad480a96877b9',
					t: 8,
				},
			},
			id: '5bfd0b36-45ee-49a9-8e04-4a9d10690b6a',
			version: 1,
		};

		it('decrypts a go-qrl --lightkdf keystore (Argon2id m = 4096)', async () => {
			const account = await decrypt(goLightKeystore, '123');
			expect(account.seed).toBe(goSeed);
			expect(account.address).toBe(goAddress);
		});

		it('decrypts a standard go-qrl keystore', async () => {
			const account = await decrypt(goStandardKeystore, '123');
			expect(account.seed).toBe(goSeed);
			expect(account.address).toBe(goAddress);
		});

		it('still refuses to create a keystore below the encrypt memory floor', async () => {
			await expect(encrypt(goSeed, '123', { m: 4096, t: 8, p: 1 })).rejects.toThrow(
				InvalidKdfError,
			);
		});

		it('rejects a keystore below the go-qrl light profile on decrypt', async () => {
			const kdfparams = { ...goLightKeystore.crypto.kdfparams, m: 4095 };
			await expect(
				decrypt({ ...goLightKeystore, crypto: { ...goLightKeystore.crypto, kdfparams } }, '123'),
			).rejects.toThrow(InvalidKdfError);
		});
	});
});
