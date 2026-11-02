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
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';
import { TransactionBlockTimeoutError } from '@theqrl/web3-errors';
import { QRLExecutionAPI } from '@theqrl/web3-types';
import { rejectIfBlockTimeout } from '../../../src/utils/reject_if_block_timeout';

jest.mock('@theqrl/web3-rpc-methods');

test('counts block timeout distances exactly above the safe integer limit', async () => {
	jest.useFakeTimers();
	const context = new Web3Context<QRLExecutionAPI>('http://127.0.0.1:8545');
	context.transactionPollingInterval = 10;
	context.transactionBlockTimeout = 2;
	(qrlRpcMethods.getBlockNumber as jest.Mock)
		.mockResolvedValueOnce('0x20000000000000')
		.mockResolvedValueOnce('0x20000000000001')
		.mockResolvedValueOnce('0x20000000000002');
	const [promise, cleaner] = await rejectIfBlockTimeout(context);
	const settled = jest.fn();
	const outcome = promise.catch((error: unknown) => {
		settled(error);
		return error;
	});
	try {
		await jest.advanceTimersByTimeAsync(10);
		expect(settled).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(10);
		expect(await outcome).toBeInstanceOf(TransactionBlockTimeoutError);
		expect(settled.mock.calls[0][0].message).toContain('9007199254740992');
		expect(settled.mock.calls[0][0].message).toContain('2 blocks');
	} finally {
		cleaner.clean();
		jest.useRealTimers();
	}
});
