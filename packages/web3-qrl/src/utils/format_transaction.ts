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

import { Transaction, DataFormat, DEFAULT_RETURN_FORMAT, FormatType } from '@theqrl/web3-types';
import { isNullish, ValidationSchemaInput, Web3ValidatorError } from '@theqrl/web3-validator';
import { mergeDeep, format, bytesToHex, toHex, toBigInt } from '@theqrl/web3-utils';
import { TransactionDataAndInputError } from '@theqrl/web3-errors';

import { transactionInfoSchema, transactionSchema } from '../schemas.js';
import { validateTransactionQuantities } from './transaction_input.js';

const isSameQuantity = (a: unknown, b: unknown): boolean => {
	try {
		return toBigInt(a) === toBigInt(b);
	} catch {
		return a === b;
	}
};

/**
 * Formats a transaction object (caller input or a node reply) into `returnFormat`.
 *
 * @throws InvalidNumberError for a quantity given as a JavaScript number that is not a safe
 * integer (L-55).
 * @throws TransactionDataAndInputError when `data` and `input` are both given and differ.
 * @throws Web3ValidatorError when `gas` and `gasLimit` are both given and differ (L-50); when
 * they agree, `gasLimit` is folded into `gas`.
 */
export function formatTransaction<
	ReturnFormat extends DataFormat = typeof DEFAULT_RETURN_FORMAT,
	TransactionType extends Transaction = Transaction,
>(
	transaction: TransactionType,
	returnFormat: ReturnFormat = DEFAULT_RETURN_FORMAT as ReturnFormat,
	options: {
		transactionSchema?: ValidationSchemaInput | typeof transactionSchema;
		fillInputAndData?: boolean;
	} = {
		transactionSchema: transactionInfoSchema,
		fillInputAndData: false,
	},
): FormatType<TransactionType, ReturnFormat> {
	validateTransactionQuantities(transaction);
	let formattedTransaction = mergeDeep({}, transaction as Record<string, unknown>) as Transaction;
	if (!isNullish(transaction?.common)) {
		formattedTransaction.common = { ...transaction.common };
		if (!isNullish(transaction.common?.customChain))
			formattedTransaction.common.customChain = { ...transaction.common.customChain };
	}
	formattedTransaction = format(
		options.transactionSchema ?? transactionInfoSchema,
		formattedTransaction,
		returnFormat,
	);
	if (
		!isNullish(formattedTransaction.data) &&
		!isNullish(formattedTransaction.input) &&
		// Converting toHex is accounting for data and input being Uint8Arrays
		// since comparing Uint8Array is not as straightforward as comparing strings
		toHex(formattedTransaction.data) !== toHex(formattedTransaction.input)
	)
		throw new TransactionDataAndInputError({
			data: bytesToHex(formattedTransaction.data),
			input: bytesToHex(formattedTransaction.input),
		});

	if (options.fillInputAndData) {
		if (!isNullish(formattedTransaction.data)) {
			formattedTransaction.input = formattedTransaction.data;
		} else if (!isNullish(formattedTransaction.input)) {
			formattedTransaction.data = formattedTransaction.input;
		}
	}

	if (!isNullish(formattedTransaction.gasLimit)) {
		if (
			!isNullish(formattedTransaction.gas) &&
			!isSameQuantity(formattedTransaction.gas, formattedTransaction.gasLimit)
		) {
			// `gasLimit` used to override `gas` silently, so a caller giving both signed with
			// a limit they did not expect (L-50).
			throw new Web3ValidatorError([
				{
					keyword: 'gasLimit',
					instancePath: '/gasLimit',
					schemaPath: '#/properties/gasLimit',
					params: {
						gas: String(formattedTransaction.gas),
						gasLimit: String(formattedTransaction.gasLimit),
					},
					message: `must equal "gas" when both are given (gas: ${String(
						formattedTransaction.gas,
					)}, gasLimit: ${String(formattedTransaction.gasLimit)})`,
				},
			]);
		}
		formattedTransaction.gas = formattedTransaction.gasLimit;
		delete formattedTransaction.gasLimit;
	}

	return formattedTransaction as FormatType<TransactionType, ReturnFormat>;
}
