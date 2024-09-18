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
/* eslint-disable jest/no-conditional-expect */

import { Numbers, TransactionInfo } from '@theqrl/web3-types';

import Web3 from '../../src';
import { getSystemE2ETestProvider } from './e2e_utils';
import { closeOpenConnection, getSystemTestBackend } from '../shared_fixtures/system_tests_utils';
import { toAllVariants } from '../shared_fixtures/utils';
// import { sepoliaBlockData, sepoliaTransactionFromBlock } from './fixtures/sepolia';
import { mainnetBlockData, mainnetTransactionFromBlock } from './fixtures/mainnet';

describe(`${getSystemTestBackend()} tests - getTransactionFromBlock`, () => {
	const provider = getSystemE2ETestProvider();
	// const blockData = getSystemTestBackend() === 'sepolia' ? sepoliaBlockData : mainnetBlockData;
	const blockData = mainnetBlockData;

	let web3: Web3;

	beforeAll(() => {
		web3 = new Web3(provider);
	});

	afterAll(async () => {
		await closeOpenConnection(web3);
	});

	it.each(
		toAllVariants<{
			block:
				| 'earliest'
				| 'latest'
				| 'pending'
				| 'finalized'
				| 'safe'
				| 'blockHash'
				| 'blockNumber';
			transactionIndex: Numbers;
			format: string;
		}>({
			block: [
				'earliest',
				'latest',
				'pending',
				'safe',
				'finalized',
				'blockHash',
				'blockNumber',
			],
			transactionIndex: ['0x1', '1', 1, BigInt(1)],
		}),
	)('getTransactionFromBlock', async ({ block, transactionIndex }) => {
		const result = await web3.zond.getTransactionFromBlock(blockData[block], transactionIndex);

		if (blockData[block] === 'earliest') {
			// eslint-disable-next-line no-null/no-null
			expect(result).toBeNull();
		} else if (block === 'blockHash' || block === 'blockNumber') {
			// const expectedTransaction =
			// 	getSystemTestBackend() === 'sepolia'
			// 		? sepoliaTransactionFromBlock
			// 		: mainnetTransactionFromBlock;
			const expectedTransaction = mainnetTransactionFromBlock;
			expect(result).toStrictEqual(expectedTransaction);
		} else {
			expect(result).toMatchObject<TransactionInfo>({
				hash: expect.any(String),
				nonce: expect.any(BigInt),
				blockHash: expect.any(String),
				blockNumber: expect.any(BigInt),
				transactionIndex: expect.any(BigInt),
				from: expect.any(String),
				maxFeePerGas: expect.any(BigInt),
				maxPriorityFeePerGas: expect.any(BigInt),
				gas: expect.any(BigInt),
				input: expect.any(String),
				type: expect.any(BigInt),
				publicKey: expect.any(String),
				signature: expect.any(String),
				to: null,
				value: '0x0'
			});
		}
	});
});
