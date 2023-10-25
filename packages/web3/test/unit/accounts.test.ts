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

import * as zond from '@theqrl/web3-zond';
import * as zondAccounts from '@theqrl/web3-zond-accounts';
import { SignTransactionResult, Web3Account } from '@theqrl/web3-zond-accounts';
import { Web3ZondInterface } from '../../src/types';
import { Web3 } from '../../src';

jest.mock('@theqrl/web3-zond-accounts');
jest.mock('@theqrl/web3-zond');

describe('test new Web3().zond.accounts', () => {
	let accounts: Web3ZondInterface['accounts'];

	beforeAll(() => {
		const web3 = new Web3();
		accounts = web3.zond.accounts;
	});

	beforeEach(() => {
		jest.spyOn(zond, 'prepareTransactionForSigning').mockReturnValue({} as Promise<any>);
		jest.spyOn(zondAccounts, 'signTransaction').mockReturnValue(
			undefined as unknown as Promise<SignTransactionResult>,
		);
	});
	afterEach(() => {
		jest.clearAllMocks();
	});

	it('`signTransaction` should call the original `prepareTransactionForSigning` and `signTransaction`', async () => {
		await accounts.signTransaction({}, '');

		expect(zond.prepareTransactionForSigning).toHaveBeenCalledTimes(1);
		expect(zondAccounts.signTransaction).toHaveBeenCalledTimes(1);
	});

	it('`seedToAccount` should call the original `seedToAccount` and add `signTransaction`', async () => {
		jest.spyOn(zondAccounts, 'seedToAccount').mockReturnValue({
			seed: '',
		} as unknown as Web3Account);

		const account = accounts.seedToAccount('');
		expect(zondAccounts.seedToAccount).toHaveBeenCalledTimes(1);

		await account.signTransaction({});

		expect(zond.prepareTransactionForSigning).toHaveBeenCalledTimes(1);
		expect(zondAccounts.signTransaction).toHaveBeenCalledTimes(1);
	});

	// it('`decrypt` should call the original `decrypt` and add `signTransaction`', async () => {
	// 	jest.spyOn(zondAccounts, 'decrypt').mockReturnValue({
	// 		privateKey: '',
	// 	} as unknown as Promise<Web3Account>);

	// 	await accounts.decrypt('', '', { nonStrict: false });
	// 	expect(zondAccounts.decrypt).toHaveBeenCalledWith('', '', false);

	// 	const account = await accounts.decrypt('', '');
	// 	expect(zondAccounts.decrypt).toHaveBeenCalledWith('', '', true);

	// 	await account.signTransaction({});

	// 	expect(zond.prepareTransactionForSigning).toHaveBeenCalledTimes(1);
	// 	expect(zondAccounts.signTransaction).toHaveBeenCalledTimes(1);
	// });

	it('`create` should call the original `create` and add `signTransaction`', async () => {
		jest.spyOn(zondAccounts, 'create').mockReturnValue({
			seed: '',
		} as unknown as Web3Account);
		const account = accounts.create();

		expect(zondAccounts.create).toHaveBeenCalledTimes(1);

		await account.signTransaction({});

		expect(zond.prepareTransactionForSigning).toHaveBeenCalledTimes(1);
		expect(zondAccounts.signTransaction).toHaveBeenCalledTimes(1);
	});
});
