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

import { Web3Context } from '@theqrl/web3-core';

import { Wallet } from '@theqrl/web3-qrl-accounts';
import { getTransactionFromOrToAttr } from '../../../src/utils/transaction_builder';
import {
	validGetTransactionFromOrToAttrData,
	invalidGetTransactionFromOrToAttrData,
	invalidGetTransactionFromOrToAttrDataForWallet,
} from '../../fixtures/format_transaction';
import { createAccountProvider } from '../../fixtures/system_test_utils';

import Web3QRL from '../../../src';

describe('getTransactionFromOrToAttr', () => {
	const web3Context = new Web3Context();

	describe('valid data', () => {
		it.each(validGetTransactionFromOrToAttrData)('$title', ({ input, output }) => {
			const { role, transaction } = input;

			expect(getTransactionFromOrToAttr(role, web3Context, transaction)).toEqual(output);
		});
	});

	describe('invalid data', () => {
		it.each(invalidGetTransactionFromOrToAttrData)('$title', ({ input, output }) => {
			const { role, transaction } = input;
			expect(() => getTransactionFromOrToAttr(role, web3Context, transaction)).toThrow(
				output,
			);
		});

		it.each(invalidGetTransactionFromOrToAttrDataForWallet)(
			'$title with wallet',
			({ input, output }) => {
				const seed = '0x01000032c89a84a46859934c42dec330511fd3642e98f00575e74a44c486c8d112dbf19d7129cd61d3e6bd72c4f2f66e5556f3';

				// setup wallet
				const web3QRL = new Web3QRL('http://localhost:8545');
				const accountProvider = createAccountProvider(web3QRL);
				const wallet = new Wallet(accountProvider);
				web3QRL.wallet?.add(seed);
				web3QRL['_wallet'] = wallet;

				const { role, transaction } = input;
				expect(() => getTransactionFromOrToAttr(role, web3QRL, transaction)).toThrow(
					output,
				);
			},
		);
	});

	describe('wallet indexes (L-51)', () => {
		const seed =
			'0x01000032c89a84a46859934c42dec330511fd3642e98f00575e74a44c486c8d112dbf19d7129cd61d3e6bd72c4f2f66e5556f3';
		let web3QRL: Web3QRL;
		let address: string;

		beforeAll(() => {
			web3QRL = new Web3QRL('http://localhost:8545');
			const wallet = new Wallet(createAccountProvider(web3QRL));
			wallet.add(seed);
			web3QRL['_wallet'] = wallet;
			address = wallet.get(0)?.address as string;
		});

		it('resolves a non-negative safe integer to the wallet account', () => {
			expect(getTransactionFromOrToAttr('from', web3QRL, { from: 0 } as never)).toBe(address);
			expect(getTransactionFromOrToAttr('to', web3QRL, { to: 0 } as never)).toBe(address);
		});

		it('never reads a hex or decimal string as an index, even with a wallet', () => {
			expect(() => getTransactionFromOrToAttr('to', web3QRL, { to: '0x0' } as never)).toThrow(
				'invalid transaction with invalid receiver',
			);
			expect(() => getTransactionFromOrToAttr('from', web3QRL, { from: '0' } as never)).toThrow(
				'invalid transaction with invalid sender',
			);
		});

		it('reports a missing account for an index the wallet does not hold', () => {
			expect(() => getTransactionFromOrToAttr('from', web3QRL, { from: 1 } as never)).toThrow(
				'no wallet is available',
			);
		});
	});
});
