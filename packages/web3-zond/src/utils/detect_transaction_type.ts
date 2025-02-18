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

import { format, toHex } from '@theqrl/web3-utils';
import { TransactionTypeParser, Web3Context } from '@theqrl/web3-core';
import { ZondExecutionAPI, HardforksOrdered, Transaction, ZOND_DATA_FORMAT } from '@theqrl/web3-types';
import { Web3ValidatorError, isNullish, validator } from '@theqrl/web3-validator';
import { InvalidPropertiesForTransactionTypeError } from '@theqrl/web3-errors';

import { InternalTransaction } from '../types.js';

const transactionType0x2Schema = {
	type: 'object',
};

const validateTxTypeAndHandleErrors = (
	txSchema: object,
	tx: Transaction,
	txType: '0x2',
) => {
	try {
		validator.validateJSONSchema(txSchema, tx);
	} catch (error) {
		if (error instanceof Web3ValidatorError)
			// Erroneously reported error
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			throw new InvalidPropertiesForTransactionTypeError(error.errors, txType);

		throw error;
	}
};

export const defaultTransactionTypeParser: TransactionTypeParser = transaction => {
	const tx = transaction as unknown as Transaction;

	if (!isNullish(tx.type)) {
		let txSchema;
		switch (tx.type) {
			case '0x2':
				txSchema = transactionType0x2Schema;
				break;

			default:
				return format({ format: 'uint' }, tx.type, ZOND_DATA_FORMAT);
		}

		validateTxTypeAndHandleErrors(txSchema, tx, tx.type);

		return format({ format: 'uint' }, tx.type, ZOND_DATA_FORMAT);
	}

	if (!isNullish(tx.maxFeePerGas) || !isNullish(tx.maxPriorityFeePerGas)) {
		validateTxTypeAndHandleErrors(transactionType0x2Schema, tx, '0x2');
		return '0x2';
	}

	const givenHardfork = tx.hardfork ?? tx.common?.hardfork;
	// If we don't have a hardfork, then we can't be sure we're post
	// EIP-2718 where transaction types are available
	if (givenHardfork === undefined) return undefined;

	const hardforkIndex = Object.keys(HardforksOrdered).indexOf(givenHardfork);

	// Unknown hardfork
	if (hardforkIndex === undefined) return undefined;

	return '0x2';
};

export const detectTransactionType = (
	transaction: InternalTransaction,
	web3Context?: Web3Context<ZondExecutionAPI>,
) =>
	(web3Context?.transactionTypeParser ?? defaultTransactionTypeParser)(
		transaction as unknown as Record<string, unknown>,
	);

export const detectRawTransactionType = (transaction: Uint8Array) =>
	toHex(transaction[0]);
