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
import { Web3Context } from '@theqrl/web3-core';
import { Web3QRLExecutionAPI } from '@theqrl/web3-types';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import { isSyncing } from '../../../src/rpc_method_wrappers';

jest.mock('@theqrl/web3-rpc-methods');

describe('isSyncing', () => {
	let web3Context: Web3Context<Web3QRLExecutionAPI>;

	beforeAll(() => {
		web3Context = new Web3Context('http://127.0.0.1:8545');
	});

	it('should call rpcMethods.getSyncing with expected parameters', async () => {
		(qrlRpcMethods.getSyncing as jest.Mock).mockResolvedValue(false);
		await isSyncing(web3Context);
		expect(qrlRpcMethods.getSyncing).toHaveBeenCalledWith(web3Context.requestManager);
	});
});

/* eslint-disable no-null/no-null -- malformed RPC values */
test.each([
	{},
	{ startingBlock: '0x1' },
	{ currentBlock: '0x1', highestBlock: '0x2' },
	'abc',
	null,
	42,
	true,
	[1, 2],
	{ startingBlock: null },
	{ currentBlock: '-1' },
])('rejects invalid syncing RPC reply %p', async reply => {
	(qrlRpcMethods.getSyncing as jest.Mock).mockResolvedValue(reply);
	await expect(isSyncing(new Web3Context())).rejects.toThrow('Invalid JSON-RPC response');
});

test('validates and formats RPC sync quantities', async () => {
	(qrlRpcMethods.getSyncing as jest.Mock).mockResolvedValue({
		startingBlock: '0x0',
		currentBlock: '0x1a0',
		highestBlock: '0x3e8',
	});
	await expect(isSyncing(new Web3Context())).resolves.toEqual({
		startingBlock: BigInt(0),
		currentBlock: BigInt(416),
		highestBlock: BigInt(1000),
	});
});

test('normalizes a null return format before formatting syncing quantities', async () => {
	(qrlRpcMethods.getSyncing as jest.Mock).mockResolvedValue({
		startingBlock: '0x0',
		currentBlock: '0x1',
		highestBlock: '0x2',
	});
	await expect(isSyncing(new Web3Context(), null as never)).resolves.toEqual({
		startingBlock: BigInt(0),
		currentBlock: BigInt(1),
		highestBlock: BigInt(2),
	});
});
