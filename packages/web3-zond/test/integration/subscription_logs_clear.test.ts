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
import { Web3Zond } from '../../src';
import {
	closeOpenConnection,
	describeIf,
	getSystemTestProvider,
	isSocket,
} from '../fixtures/system_test_utils';
import { LogsSubscription } from '../../src/web3_subscriptions';

describeIf(isSocket)('subscription', () => {
	let web3Zond: Web3Zond;
	beforeAll(() => {
		web3Zond = new Web3Zond(getSystemTestProvider());
	});
	afterAll(async () => {
		await closeOpenConnection(web3Zond);
	});

	describe('logs', () => {
		it(`clear`, async () => {
			const sub: LogsSubscription = await web3Zond.subscribe('logs');
			expect(sub.id).toBeDefined();
			await web3Zond.clearSubscriptions();
			expect(sub.id).toBeUndefined();
		});
	});
});
