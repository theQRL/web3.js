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
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import Web3QRL from '../../src/index';

jest.mock('@theqrl/web3-rpc-methods');

describe('web3_qrl_methods_no_parameters', () => {
	let web3QRL: Web3QRL;

	beforeAll(() => {
		web3QRL = new Web3QRL('http://127.0.0.1:8545');
	});

	describe('should call RPC method with only request manager parameter', () => {
		it('isSyncing', async () => {
			await web3QRL.isSyncing();
			expect(qrlRpcMethods.getSyncing).toHaveBeenCalledWith(web3QRL.requestManager);
		});

		it('getAccounts', async () => {
			await web3QRL.getAccounts();
			expect(qrlRpcMethods.getAccounts).toHaveBeenCalledWith(web3QRL.requestManager);
		});

		it('getPendingTransactions', async () => {
			(qrlRpcMethods.getPendingTransactions as jest.Mock).mockResolvedValueOnce([]);

			await web3QRL.getPendingTransactions();
			expect(qrlRpcMethods.getPendingTransactions).toHaveBeenCalledWith(
				web3QRL.requestManager,
			);
		});

		it('requestAccounts', async () => {
			await web3QRL.requestAccounts();
			expect(qrlRpcMethods.requestAccounts).toHaveBeenCalledWith(web3QRL.requestManager);
		});

		it('getNodeInfo', async () => {
			await web3QRL.getNodeInfo();
			expect(qrlRpcMethods.getNodeInfo).toHaveBeenCalledWith(web3QRL.requestManager);
		});

		it('getMaxPriorityFeePerGas', async () => {
			(qrlRpcMethods.getMaxPriorityFeePerGas as jest.Mock).mockResolvedValueOnce('0x1');
			await web3QRL.getMaxPriorityFeePerGas();
			expect(qrlRpcMethods.getMaxPriorityFeePerGas).toHaveBeenCalledWith(
				web3QRL.requestManager,
			);
		});
	});
});
