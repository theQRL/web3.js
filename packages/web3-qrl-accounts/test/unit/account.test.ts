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
import { bytesToHex, hexToBytes } from '@theqrl/web3-utils';
import {
	InvalidCipherError,
	InvalidKdfError,
	IVLengthError,
	KeyStoreDecryptionError,
	TransactionSigningError,
} from '@theqrl/web3-errors';
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
import { TxData } from '../../src/tx/types';
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
});
