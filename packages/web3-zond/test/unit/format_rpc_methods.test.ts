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
import { DEFAULT_RETURN_FORMAT } from '@theqrl/web3-types';
import { numberToHex, isNullish } from '@theqrl/web3-utils';
import * as rpcMethodWrappers from '../../src/rpc_method_wrappers';
import { getPastLogsValidFormatData } from '../fixtures/web3_zond_methods_with_parameters';
import Web3Zond from '../../src/index';

jest.mock('@theqrl/web3-rpc-methods');
describe('web3_zond_methods formatting', () => {
	let web3Zond: Web3Zond;

	beforeAll(() => {
		web3Zond = new Web3Zond('http://127.0.0.1:8545');
	});

	describe('getPastLogs makes sure data is prepared properly', () => {
		it.each(getPastLogsValidFormatData)('input: %s\nrpcMethodParameters: %s', async filter => {
			jest.spyOn(zondRpcMethods, 'getLogs').mockResolvedValue(['']);
			await rpcMethodWrappers.getLogs(web3Zond, filter, DEFAULT_RETURN_FORMAT);
			let { fromBlock, toBlock } = filter;
			if (
				!isNullish(filter.fromBlock) &&
				(typeof filter.fromBlock === 'bigint' || typeof filter.fromBlock === 'number')
			)
				fromBlock = numberToHex(filter.fromBlock);
			if (
				!isNullish(filter.toBlock) &&
				(typeof filter.toBlock === 'bigint' || typeof filter.toBlock === 'number')
			)
				toBlock = numberToHex(filter.toBlock);
			expect(zondRpcMethods.getLogs).toHaveBeenCalledWith(web3Zond.requestManager, {
				...filter,
				toBlock,
				fromBlock,
			});
		});
	});
});
