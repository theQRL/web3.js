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
import WebSocketProvider from '@theqrl/web3-providers-ws';
import { Web3BaseProvider } from '@theqrl/web3-types';
/* eslint-disable import/no-named-as-default */
// eslint-disable-next-line import/no-extraneous-dependencies
import { IpcProvider } from '@theqrl/web3-providers-ipc';
import Web3Zond, {
	LogsSubscription,
	NewHeadsSubscription,
	NewPendingTransactionsSubscription,
	SyncingSubscription,
} from '../../src/index';
import {
	closeOpenConnection,
	createTempAccount,
	describeIf,
	getSystemTestProviderUrl,
	isSocket,
	isWs,
} from '../fixtures/system_test_utils';

describeIf(isSocket)('subscribe', () => {
	let web3Zond: Web3Zond;
	let provider: WebSocketProvider | IpcProvider;

	beforeAll(() => {
		provider = isWs
			? new WebSocketProvider(getSystemTestProviderUrl())
			: new IpcProvider(getSystemTestProviderUrl());
	});

	afterAll(async () => {
		await closeOpenConnection(web3Zond);
	});

	afterEach(async () => {
		await web3Zond.clearSubscriptions();
	});

	describe('subscribe to', () => {
		it('newHeads', async () => {
			web3Zond = new Web3Zond(provider as Web3BaseProvider);
			await web3Zond.subscribe('newHeads');
			const subs = web3Zond?.subscriptionManager?.subscriptions;
			const inst = subs?.get(Array.from(subs.keys())[0]);
			expect(inst).toBeInstanceOf(NewHeadsSubscription);
		});
		it('syncing', async () => {
			web3Zond = new Web3Zond(provider as Web3BaseProvider);
			await web3Zond.subscribe('syncing');
			const subs = web3Zond?.subscriptionManager?.subscriptions;
			const inst = subs?.get(Array.from(subs.keys())[0]);
			expect(inst).toBeInstanceOf(SyncingSubscription);
		});
		it('newPendingTransactions', async () => {
			web3Zond = new Web3Zond(provider as Web3BaseProvider);
			await web3Zond.subscribe('newPendingTransactions');
			const subs = web3Zond?.subscriptionManager?.subscriptions;
			const inst = subs?.get(Array.from(subs.keys())[0]);
			expect(inst).toBeInstanceOf(NewPendingTransactionsSubscription);
		});
		it('logs', async () => {
			const tempAcc = await createTempAccount();
			web3Zond = new Web3Zond(provider as Web3BaseProvider);
			await web3Zond.subscribe('logs', {
				address: tempAcc.address,
			});
			const subs = web3Zond?.subscriptionManager?.subscriptions;
			const inst = subs?.get(Array.from(subs.keys())[0]);
			expect(inst).toBeInstanceOf(LogsSubscription);
		});
	});
});
