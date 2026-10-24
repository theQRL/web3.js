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

/* eslint-disable jest/no-conditional-expect */

import {
	InvalidBytesError,
	InvalidNonceOrChainIdError,
	InvalidNumberError,
	InvalidTransactionObjectError,
	InvalidTransactionWithReceiver,
} from '@theqrl/web3-errors';
import { Web3ValidatorError } from '@theqrl/web3-validator';
import { validateTransactionForSigning } from '../../src/validation';
import {
	invalidNonceOrChainIdData,
	invalidTransactionObject,
	validateChainInfoData,
	validateCustomChainInfoData,
	validateGasData,
} from '../fixtures/validate_transaction_for_signing';

describe('validateTransactionForSigning', () => {
	describe('should override validateTransactionForSigning method', () => {
		it('should call override method', () => {
			const overrideFunction = jest.fn();
			validateTransactionForSigning(invalidTransactionObject[0], overrideFunction);
			expect(overrideFunction).toHaveBeenCalledWith(invalidTransactionObject[0]);
		});
	});

	describe('should throw InvalidTransactionObjectError', () => {
		it.each(invalidTransactionObject)('%s', transaction => {
			expect(() => validateTransactionForSigning(transaction)).toThrow(
				new InvalidTransactionObjectError(transaction),
			);
		});
	});

	describe('validateCustomChainInfo', () => {
		it.each(validateCustomChainInfoData)('%s should return %s', (transaction, output) => {
			if (output instanceof Error) {
				expect(() => validateTransactionForSigning(transaction)).toThrow(output);
			} else {
				expect(validateTransactionForSigning(transaction)).toBeUndefined();
			}
		});
	});

	describe('validateChainInfo', () => {
		it.each(validateChainInfoData)('%s should return %s', (transaction, output) => {
			if (output instanceof Error) {
				expect(() => validateTransactionForSigning(transaction)).toThrow(output);
			} else {
				expect(validateTransactionForSigning(transaction)).toBeUndefined();
			}
		});
	});

	describe('validateGas', () => {
		it.each(validateGasData)('%s should return %s', (transaction, output) => {
			if (output instanceof Error) {
				expect(() => validateTransactionForSigning(transaction)).toThrow(output);
			} else {
				expect(validateTransactionForSigning(transaction)).toBeUndefined();
			}
		});
	});

	describe('should throw InvalidNonceOrChainIdError', () => {
		it.each(invalidNonceOrChainIdData)('%s', (transaction, output) => {
			if (output instanceof Error) {
				expect(() => validateTransactionForSigning(transaction)).toThrow(output);
			} else {
				expect(validateTransactionForSigning(transaction)).toBeUndefined();
			}
		});
	});

	describe('typed errors for malformed fields (L-26, L-55, I-12)', () => {
		const valid = validateCustomChainInfoData[0][0] as Record<string, unknown>;
		const withFields = (fields: Record<string, unknown>) => ({ ...valid, ...fields }) as never;

		it('accepts the valid base transaction', () => {
			expect(validateTransactionForSigning(withFields({}))).toBeUndefined();
		});

		it.each([
			['nonce 1.5', { nonce: 1.5 }, InvalidNumberError],
			['value 2 ** 53 + 1', { value: 2 ** 53 + 1 }, InvalidNumberError],
			["value '1 ether'", { value: '1 ether' }, InvalidNumberError],
			["value ''", { value: '' }, InvalidNumberError],
			['value -1', { value: '-0x1' }, InvalidNumberError],
			[
				"chainId '0x'",
				{ chainId: '0x', common: undefined, chain: 'mainnet', hardfork: 'zond' },
				InvalidNonceOrChainIdError,
			],
			["nonce '0x'", { nonce: '0x' }, InvalidNonceOrChainIdError],
			["nonce 'abc'", { nonce: 'abc' }, InvalidNonceOrChainIdError],
			[
				'to Ethereum address',
				{ to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
				InvalidTransactionWithReceiver,
			],
			["to ''", { to: '' }, InvalidTransactionWithReceiver],
			["data 'hello'", { data: 'hello' }, InvalidBytesError],
			["input '0xzz'", { input: '0xzz', data: undefined }, InvalidBytesError],
			[
				'accessList entry without storageKeys',
				{ accessList: [{ address: valid.to }] },
				Web3ValidatorError,
			],
			["accessList 'nope'", { accessList: 'nope' }, Web3ValidatorError],
			[
				'accessList with a 20-byte address',
				{ accessList: [{ address: `0x${'22'.repeat(20)}`, storageKeys: [] }] },
				Web3ValidatorError,
			],
			[
				'accessList with a 33-byte storage key',
				{ accessList: [{ address: valid.to, storageKeys: [`0x${'11'.repeat(33)}`] }] },
				Web3ValidatorError,
			],
			[
				"hardfork 'london'",
				{ hardfork: 'london', chain: 'mainnet', common: undefined },
				Web3ValidatorError,
			],
			["chain 'goerli'", { chain: 'goerli', hardfork: 'zond', common: undefined }, Web3ValidatorError],
			[
				"common.baseChain 'goerli'",
				{ common: { ...(valid.common as object), baseChain: 'goerli' } },
				Web3ValidatorError,
			],
		])('%s is rejected with a typed error', (_, fields, errorClass) => {
			expect(() => validateTransactionForSigning(withFields(fields))).toThrow(errorClass);
		});

		it("accepts value '0x' as zero and a well-formed accessList", () => {
			expect(
				validateTransactionForSigning(
					withFields({
						value: '0x',
						accessList: [{ address: valid.to, storageKeys: [`0x${'11'.repeat(32)}`] }],
					}),
				),
			).toBeUndefined();
		});
	});
});
