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

import { isHexStrict } from '@theqrl/web3-validator';

import { Web3Zond } from '../../../src';
import {
	closeOpenConnection,
	createTempAccount,
	getSystemTestProvider,
} from '../../fixtures/system_test_utils';

describe('Web3Zond.sign', () => {
	let web3Zond: Web3Zond;
	let tempAcc: { address: string; seed: string };

	beforeAll(async () => {
		web3Zond = new Web3Zond(getSystemTestProvider());
		tempAcc = await createTempAccount();
	});

	afterAll(async () => {
		await closeOpenConnection(web3Zond);
	});

	it('should sign message', async () => {
		const message = '0x736f796c656e7420677265656e2069732070656f706c65';
		const response = await web3Zond.sign(message, tempAcc.address);
		expect(isHexStrict(response as string)).toBe(true);
	});
});
