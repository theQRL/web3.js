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

import { Address } from '@theqrl/web3-types';
import { Web3ValidatorError, isAddressString } from '@theqrl/web3-validator';
import { bytesToHex, hexToBytes } from '@theqrl/web3-utils';
import {
	create,
	decrypt,
	encrypt,
	hashMessage,
	seedToAccount,
	recoverTransaction,
	sign,
	signTransaction,
} from '../../src';
import { TransactionFactory } from '../../src/tx/transactionFactory';
import { newMLDSA87WalletFromExtendedSeed, verifyMLDSA87Signature } from '../../src/qrl_wallet';
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
				TransactionFactory.fromTxData(txData),
				account.seed,
			);
			expect(signedResult).toBeDefined();
			expect(signedResult.messageHash).toBeDefined();
			expect(signedResult.rawTransaction).toBeDefined();
			expect(signedResult.transactionHash).toBeDefined();
			expect(signedResult.signature).toBeDefined();
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
			expect(address).toEqual(account.address);
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
				const wallet = newMLDSA87WalletFromExtendedSeed(testObj.seed);
				const result = sign(data, testObj.seed);
				const signature = hexToBytes(result.signature);

				expect(result.message).toBe(data);
				expect(result.messageHash).toBe(hashMessage(data));
				expect(signature).toHaveLength(4627);
				expect(
					verifyMLDSA87Signature(
						signature,
						hexToBytes(result.messageHash),
						wallet.getPK(),
						wallet.getDescriptor(),
					),
				).toBe(true);
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
				const expectedSeed =
					typeof input[0] === 'string' ? input[0] : bytesToHex(input[0]);
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
	});

	describe('decrypt', () => {
		describe('valid cases', () => {
			it.each(validDecryptData)('%s', async input => {
				const keystore = await encrypt(input[0], input[1], input[2]).catch(err => {
					throw err;
				});

				// make sure decrypt does not throw invalid password error
				const result = await decrypt(keystore, input[1]);

				expect(JSON.stringify(result)).toEqual(
					JSON.stringify(seedToAccount(input[3])),
				);

				const keystoreString = JSON.stringify(keystore);

				const stringResult = await decrypt(keystoreString, input[1], true);

				expect(JSON.stringify(stringResult)).toEqual(
					JSON.stringify(seedToAccount(input[3])),
				);
			});
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
	});
});
