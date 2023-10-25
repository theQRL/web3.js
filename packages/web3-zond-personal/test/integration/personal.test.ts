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
import { ZondPersonalAPI, SupportedProviders } from '@theqrl/web3-types';
import { toChecksumAddress } from '@theqrl/web3-utils';
import { isHexStrict } from '@theqrl/web3-validator';
import { Personal } from '../../src/index';
import {
	closeOpenConnection,
	createAccount,
	createNewAccount,
	createTempAccount,
	getSystemTestBackend,
	getSystemTestProvider,
	itIf,
} from '../fixtures/system_test_utils';

describe('personal integration tests', () => {
	let zondPersonal: Personal;
	let clientUrl: string | SupportedProviders<ZondPersonalAPI>;

	beforeAll(() => {
		clientUrl = getSystemTestProvider();
		zondPersonal = new Personal(clientUrl);
	});

	afterAll(async () => {
		await closeOpenConnection(zondPersonal);
	});

	it('new account', async () => {
		const newAccount = await zondPersonal.newAccount('!@superpassword');
		expect(isHexStrict(newAccount)).toBe(true);
	});

	it('lock account', async () => {
		const { address } = await createTempAccount();
		const lockAccount = await zondPersonal.lockAccount(address);
		expect(lockAccount).toBe(true);

		const from = address;
		const tx = {
			from,
			to: '0x1337C75FdF978ABABaACC038A1dCd580FeC28ab2',
			value: `0`,
			gas: '21000',
			maxFeePerGas: '0x59682F00',
			maxPriorityFeePerGas: '0x1DCD6500',
		};
		// locked accounts will error
		await expect(zondPersonal.sendTransaction(tx, '')).rejects.toThrow();
	});

	it('unlock account', async () => {
		const { address } = await createTempAccount();
		const unlockedAccount = await zondPersonal.unlockAccount(address, '123456', 1000);
		expect(unlockedAccount).toBe(true);

		const tx = {
			from: address,
			to: '0x1337C75FdF978ABABaACC038A1dCd580FeC28ab2',
			value: `0`,
			gas: '21000',
			maxFeePerGas: '0x59682F00',
			maxPriorityFeePerGas: '0x1DCD6500',
		};
		const receipt = await zondPersonal.sendTransaction(tx, '123456');

		expect(isHexStrict(receipt)).toBe(true);
	});

	itIf(getSystemTestBackend() === 'geth')('sign', async () => {
		const password = '123456';
		const addr = (await createTempAccount({ password })).address;
		await zondPersonal.unlockAccount(addr, password, 100000);
		await zondPersonal.sign('0xdeadbeaf', addr, password);
		//const signature = await zondPersonal.sign('0xdeadbeaf', addr, password);
		//const address = await zondPersonal.ecRecover('0xdeadbeaf', signature);
		// eslint-disable-next-line jest/no-standalone-expect
		//expect(key).toBe(address);
	});

	it('getAccounts', async () => {
		const accountList = await zondPersonal.getAccounts();
		// create a new account
		await zondPersonal.newAccount('cde');
		const updatedAccountList = await zondPersonal.getAccounts();
		expect(updatedAccountList.length).toBeGreaterThan(accountList.length);
	});

	it('importRawKey', async () => {
		const { address, seed } = createAccount();
		const rawKey = getSystemTestBackend() === 'geth' ? seed.slice(2) : seed;
		const key = await zondPersonal.importRawKey(rawKey, '123456');
		expect(toChecksumAddress(key).toLowerCase()).toBe(address.toLowerCase());
	});

	it('sendTransaction', async () => {
		const from = (await createNewAccount({ unlock: true, refill: true })).address;

		const unlockedAccount = await zondPersonal.unlockAccount(from, '123456', 1000);
		expect(unlockedAccount).toBe(true);

		const tx = {
			from,
			to: '0x1337C75FdF978ABABaACC038A1dCd580FeC28ab2',
			value: `0`,
			gas: '21000',
			maxFeePerGas: '0x59682F00',
			maxPriorityFeePerGas: '0x1DCD6500',
			type: BigInt(2),
		};
		const receipt = await zondPersonal.sendTransaction(tx, '123456');

		expect(isHexStrict(receipt)).toBe(true);
	});
});
