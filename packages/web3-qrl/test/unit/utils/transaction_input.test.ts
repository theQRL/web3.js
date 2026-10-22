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
	InvalidNumberError,
	InvalidPropertiesForTransactionTypeError,
} from '@theqrl/web3-errors';

import {
	TRANSACTION_QUANTITY_FIELDS,
	validateNoLegacyGasPrice,
	validateTransactionInput,
	validateTransactionQuantities,
} from '../../../src/utils/transaction_input';

describe('transaction input checks', () => {
	describe('validateTransactionQuantities (L-55)', () => {
		it.each([[2 ** 53 + 1], [2 ** 53], [1e21], [1.5], [NaN], [Infinity], [-Infinity], [-1.5]])(
			'rejects the unsafe JavaScript number %p in every quantity field',
			value => {
				for (const field of TRANSACTION_QUANTITY_FIELDS) {
					expect(() => validateTransactionQuantities({ [field]: value })).toThrow(
						InvalidNumberError,
					);
				}
			},
		);

		it('names the field in the error', () => {
			expect(() => validateTransactionQuantities({ value: 2 ** 53 + 1 })).toThrow(
				'value: 9007199254740992',
			);
		});

		it.each([[0], [1], [2 ** 53 - 1], [-1], [BigInt(2) ** BigInt(64)], ['0x20000000000000'], ['9007199254740993'], ['abc'], [undefined]])(
			'leaves %p to the formatters',
			value => {
				expect(() => validateTransactionQuantities({ value, nonce: value })).not.toThrow();
			},
		);

		it('ignores non-objects', () => {
			expect(() => validateTransactionQuantities(undefined)).not.toThrow();
			expect(() => validateTransactionQuantities('abc')).not.toThrow();
		});
	});

	describe('validateNoLegacyGasPrice (L-50)', () => {
		it.each([[1], ['0x1'], ['1'], [BigInt(1)], [0]])('rejects gasPrice %p', gasPrice => {
			expect(() => validateNoLegacyGasPrice({ gasPrice })).toThrow(
				InvalidPropertiesForTransactionTypeError,
			);
			expect(() => validateNoLegacyGasPrice({ gasPrice })).toThrow('gasPrice');
		});

		it('accepts a transaction without gasPrice', () => {
			expect(() =>
				validateNoLegacyGasPrice({ maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x1' }),
			).not.toThrow();
			expect(() => validateNoLegacyGasPrice({ gasPrice: undefined })).not.toThrow();
		});
	});

	it('validateTransactionInput applies both checks', () => {
		expect(() => validateTransactionInput({ value: 1.5 })).toThrow(InvalidNumberError);
		expect(() => validateTransactionInput({ gasPrice: 1 })).toThrow(
			InvalidPropertiesForTransactionTypeError,
		);
		expect(() => validateTransactionInput({ value: 1 })).not.toThrow();
	});
});
