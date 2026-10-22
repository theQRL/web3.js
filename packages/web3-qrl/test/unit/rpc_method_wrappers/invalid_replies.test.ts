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
import {
	InvalidMaxPriorityFeePerGasOrMaxFeePerGas,
	InvalidResponseError,
} from '@theqrl/web3-errors';
import { DEFAULT_RETURN_FORMAT, QRL_DATA_FORMAT, Web3QRLExecutionAPI } from '@theqrl/web3-types';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import Web3QRL from '../../../src/index';
import {
	getChainId,
	getLogs,
	getMaxPriorityFeePerGas,
	getPendingTransactions,
	getTransaction,
	getTransactionReceipt,
	signTransaction,
} from '../../../src/rpc_method_wrappers';
import { getTransactionGasPricing } from '../../../src/utils/get_transaction_gas_pricing';
import { mockRpcResponse as mockLogs } from './fixtures/get_logs';

jest.mock('@theqrl/web3-rpc-methods');

const Q_ADDRESS = `Q${'00'.repeat(64)}`;
const HASH = `0x${'11'.repeat(32)}`;
const BLOCK = { number: '0x10', hash: HASH, baseFeePerGas: '0x3b9aca00' };
// A `null` result is one of the reply shapes under test.
// eslint-disable-next-line no-null/no-null
const NULL_REPLY: unknown = null;

describe('malformed node replies are reported as InvalidResponseError (L-26)', () => {
	let web3Context: Web3Context<Web3QRLExecutionAPI>;

	beforeEach(() => {
		web3Context = new Web3Context('http://127.0.0.1:8545');
	});

	afterEach(() => jest.resetAllMocks());

	describe('qrl_chainId', () => {
		it.each([['0x'], ['abc'], ['-0x1'], [`0x1${'0'.repeat(64)}`], [NULL_REPLY], [undefined], [{}]])(
			'rejects %p',
			async reply => {
				(qrlRpcMethods.getChainId as jest.Mock).mockResolvedValueOnce(reply);
				await expect(getChainId(web3Context, DEFAULT_RETURN_FORMAT)).rejects.toThrow(
					InvalidResponseError,
				);
			},
		);

		it('accepts a hex quantity', async () => {
			(qrlRpcMethods.getChainId as jest.Mock).mockResolvedValueOnce('0x1');
			await expect(getChainId(web3Context, DEFAULT_RETURN_FORMAT)).resolves.toBe(BigInt(1));
		});
	});

	describe('qrl_maxPriorityFeePerGas', () => {
		it.each([['abc'], [NULL_REPLY], [{}], ['0x']])('rejects %p', async reply => {
			(qrlRpcMethods.getMaxPriorityFeePerGas as jest.Mock).mockResolvedValueOnce(reply);
			await expect(
				getMaxPriorityFeePerGas(web3Context, DEFAULT_RETURN_FORMAT),
			).rejects.toThrow(InvalidResponseError);
		});
	});

	describe('qrl_getLogs', () => {
		it('rejects a string reply', async () => {
			(qrlRpcMethods.getLogs as jest.Mock).mockResolvedValueOnce('str');
			await expect(getLogs(web3Context, {}, DEFAULT_RETURN_FORMAT)).rejects.toThrow(
				InvalidResponseError,
			);
		});

		it('rejects an entry that is neither a log object nor a string', async () => {
			// eslint-disable-next-line no-null/no-null
			(qrlRpcMethods.getLogs as jest.Mock).mockResolvedValueOnce([...mockLogs, null]);
			await expect(getLogs(web3Context, {}, DEFAULT_RETURN_FORMAT)).rejects.toThrow(
				InvalidResponseError,
			);
		});

		it('sends a decimal-string fromBlock as a hex quantity (I-12)', async () => {
			(qrlRpcMethods.getLogs as jest.Mock).mockResolvedValueOnce([]);
			await getLogs(web3Context, { fromBlock: '5', toBlock: 'latest' }, DEFAULT_RETURN_FORMAT);
			expect(qrlRpcMethods.getLogs).toHaveBeenCalledWith(web3Context.requestManager, {
				fromBlock: '0x5',
				toBlock: 'latest',
			});
		});
	});

	describe('qrl_pendingTransactions', () => {
		it.each([[NULL_REPLY], ['abc'], [{}]])('rejects %p', async reply => {
			(qrlRpcMethods.getPendingTransactions as jest.Mock).mockResolvedValueOnce(reply);
			await expect(getPendingTransactions(web3Context, DEFAULT_RETURN_FORMAT)).rejects.toThrow(
				InvalidResponseError,
			);
		});

		it('rejects a null entry', async () => {
			// eslint-disable-next-line no-null/no-null
			(qrlRpcMethods.getPendingTransactions as jest.Mock).mockResolvedValueOnce([null]);
			await expect(getPendingTransactions(web3Context, DEFAULT_RETURN_FORMAT)).rejects.toThrow(
				InvalidResponseError,
			);
		});
	});

	describe('qrl_signTransaction', () => {
		const transaction = {
			from: Q_ADDRESS,
			to: Q_ADDRESS,
			value: '0x1',
			gas: '0x5208',
			maxFeePerGas: '0x1',
			maxPriorityFeePerGas: '0x1',
		};

		it.each([[NULL_REPLY], ['zz'], [{ raw: '0x01', tx: NULL_REPLY }], [{ raw: 5, tx: 'x' }], [{}]])(
			'rejects %p',
			async reply => {
				(qrlRpcMethods.signTransaction as jest.Mock).mockResolvedValueOnce(reply);
				await expect(
					signTransaction(web3Context, transaction, DEFAULT_RETURN_FORMAT),
				).rejects.toThrow(InvalidResponseError);
			},
		);

		it('accepts a { raw, tx } reply', async () => {
			(qrlRpcMethods.signTransaction as jest.Mock).mockResolvedValueOnce({
				raw: '0x02c0',
				tx: { nonce: '0x1', value: '0x1' },
			});
			await expect(
				signTransaction(web3Context, transaction, DEFAULT_RETURN_FORMAT),
			).resolves.toStrictEqual({
				raw: '0x02c0',
				tx: { nonce: BigInt(1), value: BigInt(1) },
			});
		});
	});

	describe('qrl_getTransactionByHash / qrl_getTransactionReceipt', () => {
		it('rejects a transaction reply that is not an object and keeps null', async () => {
			(qrlRpcMethods.getTransactionByHash as jest.Mock).mockResolvedValueOnce('abc');
			await expect(getTransaction(web3Context, HASH, DEFAULT_RETURN_FORMAT)).rejects.toThrow(
				InvalidResponseError,
			);
			// eslint-disable-next-line no-null/no-null
			(qrlRpcMethods.getTransactionByHash as jest.Mock).mockResolvedValueOnce(null);
			await expect(getTransaction(web3Context, HASH, DEFAULT_RETURN_FORMAT)).resolves.toBeNull();
		});

		it('rejects a receipt reply that is not an object', async () => {
			(qrlRpcMethods.getTransactionReceipt as jest.Mock).mockResolvedValueOnce('abc');
			await expect(
				getTransactionReceipt(web3Context, HASH, DEFAULT_RETURN_FORMAT),
			).rejects.toThrow(InvalidResponseError);
		});
	});

	describe('Web3QRL.getAccounts', () => {
		it.each([[{}], ['abc'], [[NULL_REPLY]], [[42]]])('rejects %p', async reply => {
			const web3QRL = new Web3QRL('http://127.0.0.1:8545');
			(qrlRpcMethods.getAccounts as jest.Mock).mockResolvedValueOnce(reply);
			await expect(web3QRL.getAccounts()).rejects.toThrow(InvalidResponseError);
		});

		it('checksums an array of addresses', async () => {
			const web3QRL = new Web3QRL('http://127.0.0.1:8545');
			(qrlRpcMethods.getAccounts as jest.Mock).mockResolvedValueOnce([Q_ADDRESS]);
			await expect(web3QRL.getAccounts()).resolves.toStrictEqual([Q_ADDRESS]);
		});
	});

	describe('Web3QRL.calculateFeeData', () => {
		it('rejects a block whose baseFeePerGas is not a quantity', async () => {
			const web3QRL = new Web3QRL('http://127.0.0.1:8545');
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValueOnce({
				...BLOCK,
				baseFeePerGas: '0x',
			});
			(qrlRpcMethods.getMaxPriorityFeePerGas as jest.Mock).mockResolvedValueOnce('0x1');
			await expect(web3QRL.calculateFeeData()).rejects.toThrow(InvalidResponseError);
		});

		it('rejects a block reply that is not an object', async () => {
			const web3QRL = new Web3QRL('http://127.0.0.1:8545');
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValueOnce('str');
			(qrlRpcMethods.getMaxPriorityFeePerGas as jest.Mock).mockResolvedValueOnce('0x1');
			await expect(web3QRL.calculateFeeData()).rejects.toThrow(InvalidResponseError);
		});

		it('falls back to the alternative priority fee when qrl_maxPriorityFeePerGas is not a quantity', async () => {
			const web3QRL = new Web3QRL('http://127.0.0.1:8545');
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValueOnce(BLOCK);
			(qrlRpcMethods.getMaxPriorityFeePerGas as jest.Mock).mockResolvedValueOnce('abc');
			const alternative = BigInt(7);
			await expect(web3QRL.calculateFeeData(BigInt(2), alternative)).resolves.toStrictEqual({
				baseFeePerGas: BigInt(1000000000),
				maxPriorityFeePerGas: alternative,
				maxFeePerGas: BigInt(2000000000) + alternative,
			});
		});
	});

	describe('getTransactionGasPricing', () => {
		const transaction = { from: Q_ADDRESS, to: Q_ADDRESS, type: '0x2' };

		it.each([
			[NULL_REPLY],
			['str'],
			[{ ...BLOCK, baseFeePerGas: '0x' }],
			[{ ...BLOCK, baseFeePerGas: NULL_REPLY }],
		])(
			'rejects the block reply %p',
			async reply => {
				(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValueOnce(reply);
				await expect(
					getTransactionGasPricing(transaction, web3Context, QRL_DATA_FORMAT),
				).rejects.toThrow(InvalidResponseError);
			},
		);

		it('reports an unusable maxPriorityFeePerGas with the typed fee error', async () => {
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValueOnce(BLOCK);
			await expect(
				getTransactionGasPricing(
					{ ...transaction, maxPriorityFeePerGas: 'abc' },
					web3Context,
					QRL_DATA_FORMAT,
				),
			).rejects.toThrow(InvalidMaxPriorityFeePerGasOrMaxFeePerGas);
		});

		it('derives maxFeePerGas from a well-formed block', async () => {
			(qrlRpcMethods.getBlockByNumber as jest.Mock).mockResolvedValueOnce(BLOCK);
			await expect(
				getTransactionGasPricing(
					{ ...transaction, maxPriorityFeePerGas: '0x1' },
					web3Context,
					QRL_DATA_FORMAT,
				),
			).resolves.toStrictEqual({
				maxPriorityFeePerGas: '0x1',
				maxFeePerGas: '0x77359401',
			});
		});
	});
});
