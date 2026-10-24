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

import { Address, BlockTag } from '@theqrl/web3-types';
import { Web3 } from '../../src/web3';

declare module '@theqrl/web3' {
	interface Web3Context {
		// for first test like web3.myModule.getL2Balance(...)
		myModule: {
			getBalance(address: Address, blockTag: BlockTag): Promise<bigint>;
			getL2Balance(address: Address, blockTag: BlockTag): Promise<bigint>;
		};

		// for second test, if user want to define these method types on web3 obj like web3.getBalance(...)
		getBalance(address: Address, blockTag: BlockTag): Promise<bigint>;
		getL2Balance(address: Address, blockTag: BlockTag): Promise<bigint>;
	}
}

describe('Web3 extend tests', () => {
	const testAddress =
		'Q33380cd8b47eed92b0dcd1ccca2ee84efd0c8b87a4fe6ee4a918969cdd454c0b04ac9f03ffaafa765af0cbeab572d8c9dd514044aa94adee50fa5d361a3e4629';

	it('web3 extend should send correct rpc call', async () => {
		const web3 = new Web3('http://127.0.0.1:7545');

		const requestManagerSendSpy = jest.fn();
		web3.requestManager.send = requestManagerSendSpy;

		web3.extend({
			property: 'myModule',
			methods: [
				{
					name: 'getBalance',
					call: 'qrl_getBalance',
				},
				{
					name: 'getL2Balance',
					call: 'qrl_getBalance',
				},
			],
		});

		await web3.myModule.getBalance(testAddress, 'latest');

		expect(requestManagerSendSpy).toHaveBeenCalledWith({
			method: 'qrl_getBalance',
			params: [testAddress, 'latest'],
		});

		await web3.myModule.getL2Balance(testAddress, 'latest');

		expect(requestManagerSendSpy).toHaveBeenCalledWith({
			method: 'qrl_getBalance',
			params: [testAddress, 'latest'],
		});
	});

	it('web3 extend should send correct rpc call without property field defined', async () => {
		const web3 = new Web3('http://127.0.0.1:7545');

		const requestManagerSendSpy = jest.fn();
		web3.requestManager.send = requestManagerSendSpy;

		web3.extend({
			methods: [
				{
					name: 'getBalance',
					call: 'qrl_getBalance',
				},
				{
					name: 'getL2Balance',
					call: 'qrl_getBalance',
				},
			],
		});

		await web3.getBalance(testAddress, 'latest');

		expect(requestManagerSendSpy).toHaveBeenCalledWith({
			method: 'qrl_getBalance',
			params: [testAddress, 'latest'],
		});

		await web3.getL2Balance(testAddress, 'latest');

		expect(requestManagerSendSpy).toHaveBeenCalledWith({
			method: 'qrl_getBalance',
			params: [testAddress, 'latest'],
		});
	});
});
