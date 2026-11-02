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

import { InvalidNumberError, InvalidPropertiesForTransactionTypeError } from '@theqrl/web3-errors';
import { Web3ValidationErrorObject } from '@theqrl/web3-types';
import { isNullish, isObject } from '@theqrl/web3-validator';

/** The transaction fields that carry a quantity. */
export const TRANSACTION_QUANTITY_FIELDS = [
	'value',
	'gas',
	'gasLimit',
	'gasPrice',
	'maxFeePerGas',
	'maxPriorityFeePerGas',
	'nonce',
	'chainId',
	'networkId',
	'type',
] as const;

/**
 * Throws an {@link InvalidNumberError} for a quantity field that holds a JavaScript number which
 * is not a safe integer (L-55). `2 ** 53 + 1`, `1e21`, `1.5`, `NaN` and `Infinity` do not stand
 * for one integer, and the formatters used to round them silently: `value: 2 ** 53 + 1` was
 * signed as `2 ** 53`. Quantities above `Number.MAX_SAFE_INTEGER` must be given as a `bigint`,
 * a decimal string or a `0x` hex string. Values of any other type are left to the formatters
 * and to the signing validation.
 */
export const validateTransactionQuantities = (transaction: unknown): void => {
	if (!isObject(transaction)) return;
	for (const field of TRANSACTION_QUANTITY_FIELDS) {
		const value = transaction[field];
		if (typeof value === 'number' && !Number.isSafeInteger(value)) {
			throw new InvalidNumberError(`${field}: ${String(value)}`);
		}
	}
};

/**
 * Throws for a legacy `gasPrice` on a transaction that is about to be sent, simulated or signed
 * (L-50). QRL has fee-market (type 2) transactions only: the field used to be dropped silently,
 * after which `maxFeePerGas` and `maxPriorityFeePerGas` were filled from the node, so the
 * transaction was signed with fees the caller never chose. The `gasPrice` a node reports in
 * `qrl_getTransactionByHash` replies (the effective price paid) is not affected.
 *
 * @throws InvalidPropertiesForTransactionTypeError naming `gasPrice`.
 */
export const validateNoLegacyGasPrice = (transaction: unknown): void => {
	if (!isObject(transaction) || isNullish(transaction.gasPrice)) return;
	const error: Web3ValidationErrorObject = {
		keyword: 'gasPrice',
		instancePath: '/gasPrice',
		schemaPath: '#/properties/gasPrice',
		params: { gasPrice: transaction.gasPrice },
		message: 'legacy gasPrice is not supported; use maxFeePerGas and maxPriorityFeePerGas',
	};
	throw new InvalidPropertiesForTransactionTypeError([error], '0x2');
};

/**
 * The checks every caller-supplied transaction object goes through before it is formatted or
 * forwarded: {@link validateTransactionQuantities} and {@link validateNoLegacyGasPrice}.
 */
export const validateTransactionInput = (transaction: unknown): void => {
	validateTransactionQuantities(transaction);
	validateNoLegacyGasPrice(transaction);
};
