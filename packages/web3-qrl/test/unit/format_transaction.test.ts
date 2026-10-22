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
import { DEFAULT_RETURN_FORMAT, FMT_BYTES, FMT_NUMBER, Transaction } from '@theqrl/web3-types';
import { InvalidNumberError, TransactionDataAndInputError } from '@theqrl/web3-errors';
import { Web3ValidatorError } from '@theqrl/web3-validator';

import { formatTransaction } from '../../src/utils/format_transaction';
import {
	bytesAsHexStringTransaction,
	numbersAsBigIntTransaction,
	numbersAsHexStringTransaction,
	numbersAsStringTransaction,
	numbersAsNumberTransaction,
	bytesAsUint8ArrayTransaction,
} from '../fixtures/format_transaction';
import { objectBigintToString } from '../fixtures/system_test_utils';

const transactionsDataForNumberTypes: Record<FMT_NUMBER, Record<string, unknown>> = {
	[FMT_NUMBER.BIGINT]: numbersAsBigIntTransaction,
	[FMT_NUMBER.HEX]: numbersAsHexStringTransaction,
	[FMT_NUMBER.NUMBER]: numbersAsNumberTransaction,
	[FMT_NUMBER.STR]: numbersAsStringTransaction,
};

const transactionsDataForByteTypes: Record<FMT_BYTES, Record<string, unknown>> = {
	[FMT_BYTES.HEX]: bytesAsHexStringTransaction,
	[FMT_BYTES.UINT8ARRAY]: bytesAsUint8ArrayTransaction,
};

describe('formatTransaction', () => {
	it.skip('should call override method', () => {
		const overrideFunction = jest.fn();
		formatTransaction(numbersAsHexStringTransaction, DEFAULT_RETURN_FORMAT);
		expect(overrideFunction).toHaveBeenCalledWith(numbersAsHexStringTransaction);
	});

	describe('numbers fields', () => {
		for (const sourceType of Object.keys(transactionsDataForNumberTypes)) {
			for (const destinationType of Object.keys(transactionsDataForNumberTypes)) {
				it(`should convert "${sourceType}" properties to "${destinationType}"`, () => {
					// formatTransaction replaces gasLimit with gas property to follow ETH spec
					// https://github.com/ethereum/execution-apis/issues/283
					const expectedFormattedTransaction =
						transactionsDataForNumberTypes[destinationType as FMT_NUMBER];
					delete expectedFormattedTransaction.gasLimit;
					// formatTransaction replaces data with input to follow ETH spec
					delete expectedFormattedTransaction.data;

					expect(
						objectBigintToString(
							formatTransaction(
								transactionsDataForNumberTypes[sourceType as FMT_NUMBER],
								{
									...DEFAULT_RETURN_FORMAT,
									number: destinationType as FMT_NUMBER,
								},
							),
						),
					).toStrictEqual(objectBigintToString(expectedFormattedTransaction));
				});
			}
		}
	});

	describe('bytes fields', () => {
		for (const sourceType of Object.keys(transactionsDataForByteTypes)) {
			for (const destinationType of Object.keys(transactionsDataForByteTypes)) {
				it(`should convert "${sourceType}" properties to "${destinationType}"`, () => {
					// formatTransaction replaces gasLimit with gas property to follow ETH spec
					// https://github.com/ethereum/execution-apis/issues/283
					const expectedFormattedTransaction =
						transactionsDataForByteTypes[destinationType as FMT_BYTES];
					delete expectedFormattedTransaction.gasLimit;
					// formatTransaction replaces data with input to follow ETH spec
					delete expectedFormattedTransaction.data;

					expect(
						objectBigintToString(
							formatTransaction(
								transactionsDataForByteTypes[sourceType as FMT_BYTES],
								{
									...DEFAULT_RETURN_FORMAT,
									bytes: destinationType as FMT_BYTES,
								},
							),
						),
					).toStrictEqual(objectBigintToString(expectedFormattedTransaction));
				});
			}
		}
	});

	it('Should throw a TransactionDataAndInputError error', () => {
		const transaction: Transaction = {
			data: '0x00',
			input: '0x01',
		};

		expect(() => formatTransaction(transaction)).toThrow(
			new TransactionDataAndInputError({
				data: transaction.data as string,
				input: transaction.input as string,
			}),
		);
	});

	describe('gas and gasLimit (L-50)', () => {
		it('rejects a gas/gasLimit pair that disagrees instead of letting gasLimit win', () => {
			expect(() => formatTransaction({ gas: 21000, gasLimit: 1000000 })).toThrow(
				Web3ValidatorError,
			);
			expect(() => formatTransaction({ gas: '0x5208', gasLimit: '0xf4240' })).toThrow(
				'gasLimit',
			);
		});

		it('folds an agreeing gasLimit into gas', () => {
			expect(formatTransaction({ gas: 21000, gasLimit: '0x5208' })).toStrictEqual({
				gas: BigInt(21000),
			});
			expect(formatTransaction({ gasLimit: 21000 })).toStrictEqual({ gas: BigInt(21000) });
		});
	});

	describe('unsafe JavaScript numbers (L-55)', () => {
		it.each([
			['value', 2 ** 53 + 1],
			['value', 1e21],
			['gas', 1.5],
			['nonce', NaN],
			['maxFeePerGas', Infinity],
			['chainId', 2 ** 53],
		])('rejects %s given as %p instead of rounding it', (field, value) => {
			expect(() => formatTransaction({ [field]: value })).toThrow(InvalidNumberError);
		});

		it('still accepts safe integers, bigints and strings', () => {
			expect(
				formatTransaction({
					value: 2 ** 53 - 1,
					gas: BigInt(2) ** BigInt(64),
					nonce: '9007199254740993',
				}),
			).toStrictEqual({
				value: BigInt(2 ** 53 - 1),
				gas: BigInt(2) ** BigInt(64),
				nonce: BigInt('9007199254740993'),
			});
		});
	});
});
