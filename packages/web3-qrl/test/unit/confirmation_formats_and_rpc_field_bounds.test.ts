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

/* eslint-disable no-null/no-null -- JSON-RPC null is the value under test */
import { Web3Context, Web3PromiEvent } from '@theqrl/web3-core';
import { FMT_NUMBER, FMT_BYTES, DataFormat, TransactionReceipt } from '@theqrl/web3-types';
import { InvalidGas, InvalidMaxPriorityFeePerGasOrMaxFeePerGas } from '@theqrl/web3-errors';
import { format, EventEmitter } from '@theqrl/web3-utils';
import { assertRpcResult } from '../../src/utils/invalid_response_error';
import {
	blockSchema,
	transactionInfoSchema,
	transactionReceiptSchema,
	logSchema,
} from '../../src/schemas';
import { validateFeeMarketGas } from '../../src/validation';
import { watchTransactionForConfirmations } from '../../src/utils/watch_transaction_for_confirmations';
import { SendTransactionEvents } from '../../src/types';

test.each(['blockHash', 'blockNumber', 'transactionIndex'])(
	'rejects a null %s in receipts and logs but permits pending transactions',
	key => {
		expect(() =>
			assertRpcResult('qrl_getTransactionReceipt', { [key]: null }, transactionReceiptSchema),
		).toThrow();
		expect(() => assertRpcResult('qrl_getLogs', { [key]: null }, logSchema)).toThrow();
		expect(() =>
			assertRpcResult('qrl_getTransactionByHash', { [key]: null }, transactionInfoSchema),
		).not.toThrow();
	},
);
test('allows creation receipt nulls and only a paired pending block hash/miner', () => {
	expect(() =>
		assertRpcResult(
			'qrl_getTransactionReceipt',
			{ to: null, contractAddress: null },
			transactionReceiptSchema,
		),
	).not.toThrow();
	expect(() =>
		assertRpcResult('qrl_getBlockByNumber', { hash: null, miner: null }, blockSchema),
	).not.toThrow();
	expect(() =>
		assertRpcResult(
			'qrl_getBlockByNumber',
			{ hash: null, miner: `Q${'ab'.repeat(64)}` },
			blockSchema,
		),
	).toThrow();
	expect(() =>
		assertRpcResult(
			'qrl_getBlockByNumber',
			{ hash: `0x${'ab'.repeat(32)}`, miner: null },
			blockSchema,
		),
	).toThrow();
});
test('rejects fee products and gas limits with typed errors', () => {
	expect(() =>
		validateFeeMarketGas({
			gas: '0x5208',
			maxFeePerGas: `0x${'ff'.repeat(31)}`,
			maxPriorityFeePerGas: '0x1',
		}),
	).toThrow(InvalidMaxPriorityFeePerGasOrMaxFeePerGas);
	expect(() =>
		validateFeeMarketGas({
			gas: '0x10000000000000000',
			maxFeePerGas: '0x1',
			maxPriorityFeePerGas: '0x1',
		}),
	).toThrow(InvalidGas);
	expect(() =>
		validateFeeMarketGas({
			gas: '0xffffffffffffffff',
			maxFeePerGas: '0x1',
			maxPriorityFeePerGas: '0x1',
		}),
	).not.toThrow();
});
test.each([FMT_BYTES.HEX, FMT_BYTES.UINT8ARRAY])(
	'confirms decimal-string receipts through the polling watcher (%s)',
	async bytes => {
		jest.useFakeTimers();
		const returnFormat: DataFormat = { number: FMT_NUMBER.STR, bytes };
		const receipt = {
			transactionIndex: '0x0',
			from: `Q${'ab'.repeat(64)}`,
			to: `Q${'cd'.repeat(64)}`,
			cumulativeGasUsed: '0x5208',
			gasUsed: '0x5208',
			logs: [],
			logsBloom: '0x',
			effectiveGasPrice: '0x1',
			type: '0x2',
			blockNumber: '0x11',
			blockHash: `0x${'ab'.repeat(32)}`,
			transactionHash: `0x${'cd'.repeat(32)}`,
			status: '0x1',
		};
		const request = jest
			.fn()
			.mockImplementation(
				async ({ method }: { method: string }) =>
					await Promise.resolve(
						method === 'qrl_getTransactionReceipt'
							? receipt
							: { hash: `0x${'ef'.repeat(32)}` },
					),
			);
		const context = new Web3Context({ request, supportsSubscriptions: () => false } as never);
		context.transactionReceiptPollingInterval = 10;
		context.transactionConfirmationBlocks = 3;
		const event = new Web3PromiEvent<TransactionReceipt, SendTransactionEvents<DataFormat>>(
			() => undefined,
		);
		const confirmations: unknown[] = [];
		const errors = jest.fn();
		event.on('error', errors);
		event.on('confirmation', confirmation => {
			confirmations.push(confirmation.confirmations);
		});
		try {
			watchTransactionForConfirmations(
				context,
				event,
				format(transactionReceiptSchema, receipt, returnFormat),
				receipt.transactionHash,
				returnFormat,
			);
			await jest.advanceTimersByTimeAsync(100);
			expect(confirmations).toEqual(['1', '2', '3']);
			expect(errors).not.toHaveBeenCalled();
			expect(jest.getTimerCount()).toBe(0);
		} finally {
			jest.clearAllTimers();
			jest.useRealTimers();
		}
	},
);

const reorgFormats = [FMT_NUMBER.STR, FMT_NUMBER.BIGINT, FMT_NUMBER.NUMBER, FMT_NUMBER.HEX].flatMap(
	number =>
		[FMT_BYTES.HEX, FMT_BYTES.UINT8ARRAY].flatMap(bytes =>
			['polling', 'newHeads'].flatMap(mode =>
				['0x0', '0x1'].map(status => ({ number, bytes, mode, status })),
			),
		),
);

test.each(reorgFormats)(
	'rechecks reorg status with $number/$bytes via $mode (fresh status $status)',
	async ({ number, bytes, mode, status }) => {
		jest.useFakeTimers();
		const returnFormat: DataFormat = { number, bytes };
		const receipt = {
			blockNumber: '0x10',
			blockHash: `0x${'ab'.repeat(32)}`,
			transactionHash: `0x${'cd'.repeat(32)}`,
			status: '0x1',
		} as TransactionReceipt;
		const moved = {
			...receipt,
			blockNumber: '0x11',
			blockHash: `0x${'ef'.repeat(32)}`,
			status,
		};
		const request = jest
			.fn()
			.mockImplementation(
				async ({ method }: { method: string }) =>
					await Promise.resolve(
						method === 'qrl_getTransactionReceipt'
							? moved
							: { hash: `0x${'12'.repeat(32)}` },
					),
			);
		const context = new Web3Context({
			request,
			supportsSubscriptions: () => mode === 'newHeads',
		} as never);
		context.transactionReceiptPollingInterval = 10;
		context.transactionConfirmationBlocks = 3;
		const sub = Object.assign(new EventEmitter(), { id: '0x1' });
		const subscribe = jest
			.spyOn(context.subscriptionManager, 'subscribe')
			.mockResolvedValue(sub as never);
		const remove = jest
			.spyOn(context.subscriptionManager, 'removeSubscription')
			.mockResolvedValue('0x1');
		const event = new Web3PromiEvent<TransactionReceipt, SendTransactionEvents<DataFormat>>(
			() => undefined,
		);
		const confirmations: { count: bigint; status: bigint }[] = [];
		const errors = jest.fn<void, [Error]>();
		event.on('error', errors);
		event.on('confirmation', value => {
			confirmations.push({
				count: BigInt(value.confirmations),
				status: BigInt(value.receipt.status),
			});
		});
		try {
			watchTransactionForConfirmations(
				context,
				event,
				format(transactionReceiptSchema, receipt, returnFormat),
				receipt.transactionHash,
				returnFormat,
			);
			await jest.advanceTimersByTimeAsync(1);
			if (mode === 'newHeads') {
				for (const n of [18, 19]) {
					sub.emit('data', {
						number: `0x${n.toString(16)}`,
						hash: `0x${n.toString(16).padStart(64, '0')}`,
						parentHash: `0x${(n - 1).toString(16).padStart(64, '0')}`,
					});
					// eslint-disable-next-line no-await-in-loop -- process each header before the next
					await jest.advanceTimersByTimeAsync(1);
				}
			}
			await jest.advanceTimersByTimeAsync(100);
			const expectedCounts = status === '0x0' ? [1] : [1, 2, 3];
			expect(confirmations).toEqual(
				expectedCounts.map(count => ({ count: BigInt(count), status: BigInt(1) })),
			);
			expect(errors.mock.calls.map(([error]) => error.message)).toEqual(
				status === '0x0'
					? ['Transaction execution status changed after a chain reorganization']
					: [],
			);
			expect(remove).toHaveBeenCalledTimes(mode === 'newHeads' ? 1 : 0);
			expect(subscribe).toHaveBeenCalledTimes(mode === 'newHeads' ? 1 : 0);
			expect(jest.getTimerCount()).toBe(0);
		} finally {
			subscribe.mockRestore();
			remove.mockRestore();
			jest.clearAllTimers();
			jest.useRealTimers();
		}
	},
);
