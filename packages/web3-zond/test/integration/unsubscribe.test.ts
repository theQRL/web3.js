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
/* eslint-disable  import/no-extraneous-dependencies */
import { IpcProvider } from '@theqrl/web3-providers-ipc';
import Web3Zond from '../../src/index';
import { NewHeadsSubscription, SyncingSubscription } from '../../src/web3_subscriptions';
import {
	getSystemTestProviderUrl,
	describeIf,
	isWs,
	isSocket,
	closeOpenConnection,
	waitForOpenConnection,
} from '../fixtures/system_test_utils';

describeIf(isSocket)('unsubscribe', () => {
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

	describe('unsubscribe from', () => {
		it('should clearSubscriptions', async () => {
			web3Zond = new Web3Zond(provider as Web3BaseProvider);
			await web3Zond.subscribe('newHeads');
			const subs = web3Zond?.subscriptionManager?.subscriptions;
			const inst = subs?.get(Array.from(subs.keys())[0]);
			expect(inst).toBeInstanceOf(NewHeadsSubscription);
			await waitForOpenConnection(web3Zond);
			await web3Zond.clearSubscriptions();
			expect(web3Zond?.subscriptionManager?.subscriptions?.size).toBe(0);
		});

		it('subscribe to all and clear all except syncing', async () => {
			web3Zond = new Web3Zond(provider as Web3BaseProvider);
			await web3Zond.subscribe('newHeads');
			await web3Zond.subscribe('newPendingTransactions');
			await web3Zond.subscribe('syncing');
			await web3Zond.subscribe('logs', {
				address: 'Z8320fe7702b96808f7bbc0d4a888ed1468216cfd',
				topics: ['0xd78a0cb8bb633d06981248b816e7bd33c2a35a6089241d099fa519e361cab902'],
			});
			expect(web3Zond?.subscriptionManager?.subscriptions.size).toBe(4);

			await waitForOpenConnection(web3Zond);

			await web3Zond.clearSubscriptions(true);

			const subs = web3Zond?.subscriptionManager?.subscriptions;
			const inst = subs?.get(Array.from(subs.keys())[0]);
			expect(inst).toBeInstanceOf(SyncingSubscription);
			expect(web3Zond?.subscriptionManager?.subscriptions.size).toBe(1);
		});
	});
});
