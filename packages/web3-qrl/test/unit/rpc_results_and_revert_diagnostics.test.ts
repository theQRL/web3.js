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

/* eslint-disable no-null/no-null -- exercise malformed JSON-RPC replies */
import { Web3Context } from '@theqrl/web3-core';
import { DEFAULT_RETURN_FORMAT as fmt, QRLExecutionAPI } from '@theqrl/web3-types';
import {
	ContractExecutionError,
	InvalidResponseError,
	InvalidMaxPriorityFeePerGasOrMaxFeePerGas,
} from '@theqrl/web3-errors';
import * as rpc from '../../src/rpc_method_wrappers';
import { getTransactionGasPricing } from '../../src/utils/get_transaction_gas_pricing';
import { getRevertReason } from '../../src/utils/get_revert_reason';
import { getTransactionError } from '../../src/utils/get_transaction_error';
import { validateFeeMarketGas } from '../../src/validation';
const address = `Q${'11'.repeat(64)}`;
const hash = `0x${'22'.repeat(32)}`;
const context = (request: jest.Mock) => new Web3Context<QRLExecutionAPI>({ provider: { request } });
describe('RPC results, fees and revert diagnostics (pass-5 audit)', () => {
	it.each([
		[
			'fee history shape',
			null,
			async (c: Web3Context<QRLExecutionAPI>) => rpc.getFeeHistory(c, 1, 'latest', [], fmt),
		],
		[
			'fee history quantity',
			{ oldestBlock: 'abc' },
			async (c: Web3Context<QRLExecutionAPI>) => rpc.getFeeHistory(c, 1, 'latest', [], fmt),
		],
		[
			'fee history ratio',
			{ gasUsedRatio: ['bad'] },
			async (c: Web3Context<QRLExecutionAPI>) => rpc.getFeeHistory(c, 1, 'latest', [], fmt),
		],
		[
			'block number',
			{ number: 'abc' },
			async (c: Web3Context<QRLExecutionAPI>) => rpc.getBlock(c, 'latest', false, fmt),
		],
		[
			'receipt status',
			{ status: 'abc' },
			async (c: Web3Context<QRLExecutionAPI>) => rpc.getTransactionReceipt(c, hash, fmt),
		],
		[
			'transaction nonce',
			{ nonce: 'abc' },
			async (c: Web3Context<QRLExecutionAPI>) => rpc.getTransaction(c, hash, fmt),
		],
		[
			'pending transaction',
			[{ blockNumber: 'abc' }],
			async (c: Web3Context<QRLExecutionAPI>) => rpc.getPendingTransactions(c, fmt),
		],
		[
			'call data',
			null,
			async (c: Web3Context<QRLExecutionAPI>) => rpc.call(c, { to: address }, 'latest', fmt),
		],
		[
			'access list',
			{ accessList: 'bad', gasUsed: {} },
			async (c: Web3Context<QRLExecutionAPI>) =>
				rpc.createAccessList(c, { from: address, to: address }, 'latest', fmt),
		],
		[
			'access list error',
			{ accessList: [], gasUsed: '0x1', error: 42 },
			async (c: Web3Context<QRLExecutionAPI>) =>
				rpc.createAccessList(c, { from: address, to: address }, 'latest', fmt),
		],
		[
			'signed bytes',
			'0x1234',
			async (c: Web3Context<QRLExecutionAPI>) =>
				rpc.signTransaction(c, { from: address }, fmt),
		],
	] as const)(
		'rejects malformed %s replies with InvalidResponseError',
		async (_name, reply, read) => {
			await expect(read(context(jest.fn().mockResolvedValue(reply)))).rejects.toBeInstanceOf(
				InvalidResponseError,
			);
		},
	);
	it('preserves go-qrl pending-block null hashes and miners', async () => {
		const block = { hash: null, miner: null, number: '0x1', transactions: [] };
		await expect(
			rpc.getBlock(context(jest.fn().mockResolvedValue(block)), 'pending', false, fmt),
		).resolves.toMatchObject({ ...block, number: BigInt(1) });
	});
	it('rejects a null miner on a mined block', async () => {
		await expect(
			rpc.getBlock(
				context(jest.fn().mockResolvedValue({ hash, miner: null, number: '0x1' })),
				'latest',
				false,
				fmt,
			),
		).rejects.toBeInstanceOf(InvalidResponseError);
	});
	it('bounds generated fees, caps an omitted tip and rejects an explicit tip above the cap', async () => {
		const c = context(jest.fn().mockResolvedValue({ baseFeePerGas: '0x1' }));
		const fees = await getTransactionGasPricing({ type: '0x2', maxFeePerGas: '0x1' }, c, fmt);
		expect(fees).toEqual({ maxPriorityFeePerGas: BigInt(1), maxFeePerGas: BigInt(1) });
		expect(() =>
			validateFeeMarketGas({
				gas: '0x5208',
				maxPriorityFeePerGas: '0x2',
				maxFeePerGas: '0x1',
			}),
		).toThrow(InvalidMaxPriorityFeePerGasOrMaxFeePerGas);
		const overflowing = context(
			jest.fn().mockResolvedValue({ baseFeePerGas: `0x${'ff'.repeat(32)}` }),
		);
		await expect(
			getTransactionGasPricing({ type: '0x2' }, overflowing, fmt),
		).rejects.toBeInstanceOf(InvalidMaxPriorityFeePerGasOrMaxFeePerGas);
	});
	it('uses the preceding block as the diagnostic pre-state approximation', async () => {
		const request = jest
			.fn()
			.mockRejectedValue({ code: 3, message: 'execution reverted: preceding state' });
		const c = context(request);
		c.handleRevert = true;
		const error = await getTransactionError(c, { to: address }, {
			blockNumber: BigInt(17),
			status: BigInt(0),
		} as never);
		expect(error).toHaveProperty('reason', 'execution reverted: preceding state');
		expect(request).toHaveBeenCalledWith(
			expect.objectContaining({ method: 'qrl_call', params: [expect.any(Object), '0x10'] }),
			expect.any(Function),
		);
	});
	it.each([-32602, -32005])('does not fall back to latest for RPC error %s', async code => {
		const request = jest.fn().mockRejectedValue({ code, message: 'request rejected' });
		await expect(
			getRevertReason(context(request), { to: address }, undefined, fmt, '0x10'),
		).rejects.toThrow();
		expect(request).toHaveBeenCalledTimes(1);
	});
	it('decodes a broadcast rejection without issuing a second simulation or claiming a mined revert', async () => {
		const request = jest.fn();
		const c = context(request);
		c.handleRevert = true;
		const nodeError = new ContractExecutionError({
			code: 3,
			message: 'execution reverted: node reason',
			data: '0x12345678',
		});
		const error = await getTransactionError(c, { to: address }, undefined, nodeError);
		expect(error).toHaveProperty('reason', 'execution reverted: node reason');
		expect(error).toHaveProperty('signature', '0x12345678');
		expect(error.message).not.toContain('Transaction has been reverted');
		expect(request).not.toHaveBeenCalled();
	});
});
