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
import { recheckReceipt } from '../../../src/utils/receipt_recheck';
import { expectedTransactionReceipt } from '../rpc_method_wrappers/fixtures/send_signed_transaction';
jest.mock('@theqrl/web3-rpc-methods');

test.each([{ logs: 'x' }, { from: 5 }, { logsBloom: 7 }, { logs: [[[[{}]]]] }])(
	'does not adopt malformed moved receipt %p',
	async fields => {
		(qrlRpcMethods.getTransactionReceipt as jest.Mock).mockResolvedValue({
			...expectedTransactionReceipt,
			blockHash: `0x${'ab'.repeat(32)}`,
			...fields,
		});
		return expect(
			recheckReceipt(new Web3Context(), expectedTransactionReceipt),
		).resolves.toEqual({ kind: 'unknown' });
	},
);
test('adopts a validated moved receipt', async () => {
	const fresh = { ...expectedTransactionReceipt, blockHash: `0x${'ab'.repeat(32)}` };
	(qrlRpcMethods.getTransactionReceipt as jest.Mock).mockResolvedValue(fresh);
	await expect(recheckReceipt(new Web3Context(), expectedTransactionReceipt)).resolves.toEqual({
		kind: 'moved',
		receipt: fresh,
	});
});

test.each([false, true])('does not adopt a foreign receipt (moved=%s)', async moved => {
	(qrlRpcMethods.getTransactionReceipt as jest.Mock).mockResolvedValue({
		...expectedTransactionReceipt,
		transactionHash: `0x${'ff'.repeat(32)}`,
		...(moved ? { blockHash: `0x${'ab'.repeat(32)}` } : {}),
	});
	await expect(recheckReceipt(new Web3Context(), expectedTransactionReceipt)).resolves.toEqual({
		kind: 'unknown',
	});
});
