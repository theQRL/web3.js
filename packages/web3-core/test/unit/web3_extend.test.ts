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
import { Web3Context } from './reexported_web3_context';

declare module './reexported_web3_context' {
	interface Web3Context {
		L2Module: {
			getL2Balance(address: Address, blockTag: BlockTag): Promise<bigint>;
		};

		getL0Balance(address: Address, blockTag: BlockTag): Promise<bigint>;
	}
}

describe('Web3Context extend tests', () => {
	const testAddress =
		'Q78802C1E641D04248953Fb6d81a1520e9BF82Bb87Aa298F298CDcb0EB5CbD6DE6f29047BaA010E6C776E1C6cfC2e58ed9A1294E1FD99621a3AC53b08D24D8f48';

	it('Web3Context extend should send correct rpc call', async () => {
		const web3 = new Web3Context('http://127.0.0.1:7545');

		const requestManagerSendSpy = jest.fn();
		web3.requestManager.send = requestManagerSendSpy;

		web3.extend({
			property: 'L2Module',
			methods: [
				{
					name: 'getL2Balance',
					call: 'qrl_getBalance',
				},
			],
		});

		await web3.L2Module.getL2Balance(testAddress, 'latest');

		expect(requestManagerSendSpy).toHaveBeenCalledWith({
			method: 'qrl_getBalance',
			params: [testAddress, 'latest'],
		});
	});

	it('Web3Context extend should send correct rpc call without property field defined', async () => {
		const web3 = new Web3Context('http://127.0.0.1:7545');

		const requestManagerSendSpy = jest.fn();
		web3.requestManager.send = requestManagerSendSpy;

		web3.extend({
			methods: [
				{
					name: 'getL0Balance',
					call: 'qrl_getBalance',
				},
			],
		});

		await web3.getL0Balance(testAddress, 'latest');

		expect(requestManagerSendSpy).toHaveBeenCalledWith({
			method: 'qrl_getBalance',
			params: [testAddress, 'latest'],
		});
	});
});
