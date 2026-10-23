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

import { InvalidTransactionCall, InvalidTransactionWithSender } from '@theqrl/web3-errors';
import {
	isAccessList,
	isAccessListEntry,
	isBaseTransaction,
	isTransaction1559Unsigned,
	isTransactionCall,
	isTransactionWithSender,
	validateTransactionCall,
	validateTransactionWithSender,
	validateFeeMarketGas,
} from '../../src/validation';
import {
	isAccessListEntryValidData,
	isAccessListValidData,
	isBaseTransactionValidData,
	isTransaction1559UnsignedValidData,
	isTransactionCallValidData,
	isTransactionWithSenderValidData,
	validateTransactionCallInvalidData,
	validateTransactionWithSenderInvalidData,
} from '../fixtures/validation';

describe('validation', () => {
	it('keeps transaction fee validation independent of 256-bit ABI aliases', () => {
		const wide = `0x${(BigInt(1) << BigInt(400)).toString(16)}`;
		expect(() =>
			validateFeeMarketGas({ gas: '0x5208', maxFeePerGas: wide, maxPriorityFeePerGas: wide }),
		).not.toThrow();
		expect(() =>
			validateFeeMarketGas({
				gas: '0x5208',
				maxFeePerGas: `-${wide}`,
				maxPriorityFeePerGas: wide,
			}),
		).toThrow();
	});

	describe('isBaseTransaction', () => {
		it.each(isBaseTransactionValidData)('%s', (input, output) => {
			expect(isBaseTransaction(input)).toEqual(output);
		});
	});
	describe('isAccessListEntry', () => {
		it.each(isAccessListEntryValidData)('%s', (input, output) => {
			expect(isAccessListEntry(input)).toEqual(output);
		});
	});
	describe('isAccessList', () => {
		it.each(isAccessListValidData())('%s', (input, output) => {
			expect(isAccessList(input)).toEqual(output);
		});
	});
	describe('isTransaction1559Unsigned', () => {
		it.each(isTransaction1559UnsignedValidData())('%s', (input, output) => {
			expect(isTransaction1559Unsigned(input)).toEqual(output);
		});
	});
	describe('isTransactionWithSender', () => {
		it.each(isTransactionWithSenderValidData())('%s', (input, output) => {
			expect(isTransactionWithSender(input)).toEqual(output);
		});
	});
	describe('validateTransactionWithSender', () => {
		it.each([
			...validateTransactionWithSenderInvalidData(),
			...isTransactionWithSenderValidData(),
		])('%s', (input, output) => {
			if (output instanceof InvalidTransactionWithSender) {
				expect(() => validateTransactionWithSender(input)).toThrow(output);
			} else {
				expect(() => validateTransactionWithSender(input)).not.toThrow();
			}
		});
	});
	describe('isTransactionCall', () => {
		it.each(isTransactionCallValidData)('%s', (input, output) => {
			expect(isTransactionCall(input)).toEqual(output);
		});
	});
	describe('validateTransactionCall', () => {
		it.each([...validateTransactionCallInvalidData(), ...isTransactionCallValidData])(
			'%s',
			(input, output) => {
				if (output instanceof InvalidTransactionCall) {
					expect(() => validateTransactionCall(input)).toThrow(output);
				} else {
					expect(() => validateTransactionCall(input)).not.toThrow();
				}
			},
		);
	});

	describe('type and fee-market fields (pass-4 informational)', () => {
		const [baseTransaction] = isBaseTransactionValidData[0];
		const { to } = isTransactionCallValidData[0][0];

		it('isBaseTransaction requires a hex type', () => {
			expect(isBaseTransaction({ ...baseTransaction, type: '0x2' })).toBe(true);
			expect(isBaseTransaction({ ...baseTransaction, type: 'ab' } as never)).toBe(false);
			expect(isBaseTransaction({ ...baseTransaction, type: '02' } as never)).toBe(false);
		});

		it('isTransactionCall recognises a call that sets a type or the 1559 fields', () => {
			expect(isTransactionCall({ to, type: '0x2' })).toBe(true);
			expect(
				isTransactionCall({
					to,
					type: '0x2',
					maxFeePerGas: '0x1',
					maxPriorityFeePerGas: '0x1',
					accessList: [],
				}),
			).toBe(true);
			expect(
				isTransactionCall({
					to,
					type: '0x2',
					nonce: '0x0',
					gas: '0x5208',
					value: '0x1',
					input: '0x',
					chainId: '0x1',
					maxFeePerGas: '0x1',
					maxPriorityFeePerGas: '0x1',
					accessList: [],
				}),
			).toBe(true);
		});

		it('isTransactionCall still rejects malformed type and fee-market fields', () => {
			expect(isTransactionCall({ to, type: 'abc' })).toBe(false);
			expect(isTransactionCall({ to, maxFeePerGas: 'abc' })).toBe(false);
			expect(isTransactionCall({ to, maxPriorityFeePerGas: '1' })).toBe(false);
			expect(isTransactionCall({ to, accessList: 'abc' } as never)).toBe(false);
		});
	});
});
