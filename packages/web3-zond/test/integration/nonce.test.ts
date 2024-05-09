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
import { TransactionPollingTimeoutError, TransactionSendTimeoutError } from '@theqrl/web3-errors';
// eslint-disable-next-line import/no-extraneous-dependencies
import { SupportedProviders, Web3 } from '@theqrl/web3';
import { Web3Account } from '@theqrl/web3-zond-accounts';
import { Web3Zond } from '../../src';

import {
	closeOpenConnection,
	createAccount,
	createLocalAccount,
	getSystemTestProvider,
} from '../fixtures/system_test_utils';

//const gas = 30000;

describe('defaults', () => {
	let web3Zond: Web3Zond;
	let clientUrl: string | SupportedProviders;
	let tempAcc: Web3Account;
	beforeEach(async () => {
		clientUrl = getSystemTestProvider();
		const web3 = new Web3(clientUrl);
		tempAcc = await createLocalAccount(web3);
		web3Zond = web3.zond as unknown as Web3Zond;
	});

	afterEach(async () => {
		await closeOpenConnection(web3Zond);
	});

	describe('defaults', () => {
		it('should fail if Zond Node did not respond because of a high nonce', async () => {
			// Make the test run faster by causing the timeout to happen after 0.2 second
			web3Zond.transactionSendTimeout = 200;
			web3Zond.transactionPollingTimeout = 200;

			const from = tempAcc.address;
			const to = createAccount().address;
			const value = `0x1`;
			const type = BigInt(2);

			try {
				// Setting a high `nonce` when sending a transaction, to cause the RPC call to stuck at the Node
				await web3Zond.sendTransaction({
					to,
					value,
					from,
					//gas,
					// Give a high nonce so the transaction stuck forever.
					// However, make this random to be able to run the test many times without receiving an error that indicate submitting the same transaction twice.
					nonce: Number.MAX_SAFE_INTEGER,
					type,
				});
				expect(true).toBe(false); // the test should fail if there is no exception
			} catch (error) {
				// Some providers would not respond to the RPC request when sending a transaction (like Ganache v7.4.0)
				if (error instanceof TransactionSendTimeoutError) {
					// eslint-disable-next-line jest/no-conditional-expect
					expect(error.message).toContain(
						`connected Zond Node did not respond within ${
							web3Zond.transactionSendTimeout / 1000
						} seconds`,
					);
				}
				// Some other providers would not respond when trying to get the transaction receipt (like Gzond v1.10.22-unstable)
				else if (error instanceof TransactionPollingTimeoutError) {
					// eslint-disable-next-line jest/no-conditional-expect
					expect(error.message).toContain(
						`Transaction was not mined within ${
							web3Zond.transactionPollingTimeout / 1000
						} seconds`,
					);
				} else {
					throw error;
				}
			}
		});
	});
});
