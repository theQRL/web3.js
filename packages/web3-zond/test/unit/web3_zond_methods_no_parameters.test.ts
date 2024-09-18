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
import { zondRpcMethods } from '@theqrl/web3-rpc-methods';

import Web3Zond from '../../src/index';

jest.mock('@theqrl/web3-rpc-methods');

describe('web3_zond_methods_no_parameters', () => {
	let web3Zond: Web3Zond;

	beforeAll(() => {
		web3Zond = new Web3Zond('http://127.0.0.1:8545');
	});

	describe('should call RPC method with only request manager parameter', () => {
		it('getProtocolVersion', async () => {
			await web3Zond.getProtocolVersion();
			expect(zondRpcMethods.getProtocolVersion).toHaveBeenCalledWith(web3Zond.requestManager);
		});

		it('isSyncing', async () => {
			await web3Zond.isSyncing();
			expect(zondRpcMethods.getSyncing).toHaveBeenCalledWith(web3Zond.requestManager);
		});

		it('getAccounts', async () => {
			await web3Zond.getAccounts();
			expect(zondRpcMethods.getAccounts).toHaveBeenCalledWith(web3Zond.requestManager);
		});

		it('getPendingTransactions', async () => {
			(zondRpcMethods.getPendingTransactions as jest.Mock).mockResolvedValueOnce([]);

			await web3Zond.getPendingTransactions();
			expect(zondRpcMethods.getPendingTransactions).toHaveBeenCalledWith(
				web3Zond.requestManager,
			);
		});

		it('requestAccounts', async () => {
			await web3Zond.requestAccounts();
			expect(zondRpcMethods.requestAccounts).toHaveBeenCalledWith(web3Zond.requestManager);
		});

		it('getNodeInfo', async () => {
			await web3Zond.getNodeInfo();
			expect(zondRpcMethods.getNodeInfo).toHaveBeenCalledWith(web3Zond.requestManager);
		});

		it('getMaxPriorityFeePerGas', async () => {
			await web3Zond.getMaxPriorityFeePerGas();
			expect(zondRpcMethods.getMaxPriorityFeePerGas).toHaveBeenCalledWith(web3Zond.requestManager);
		});
	});
});
