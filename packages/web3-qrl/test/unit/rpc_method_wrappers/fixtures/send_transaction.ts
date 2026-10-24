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

import { Transaction, TransactionReceipt } from '@theqrl/web3-types';
import { SendTransactionOptions } from '../../../../src/types';

export const expectedTransactionHash =
	'0x0016bef3b2913cc883e2993a12f1a2859e7b627c9d71048115232c92fe4e5d2f';
export const expectedTransactionReceipt: TransactionReceipt = {
	transactionHash: '0x0016bef3b2913cc883e2993a12f1a2859e7b627c9d71048115232c92fe4e5d2f',
	transactionIndex: '0x41',
	blockHash: '0x1d59ff54b1eb26b013ce3cb5fc9dab3705b415a67127a003c3e61eb445bb8df2',
	blockNumber: '0x5daf3b',
	from: 'QE88f16C4370E976c3678FbC681C28d9cc32e8194060b13eF0da86bF3D825c3eF2b32E9E80aA5D6B2756Ce92627015E644E1f6F2f58814Add8C47C0F90060A46E',
	to: 'QDd41F80c7261547983dB61532eF6bbCf319ebc94f840491af80709ce214De95a94eceE96615210fD3DE18eBAC3DBD6C369Ab815f1C0546087696AaA17d8CA106',
	cumulativeGasUsed: '0x33bc', // 13244
	effectiveGasPrice: '0x13a21bc946', // 84324108614
	gasUsed: '0x4dc', // 1244
	contractAddress: 'QD8F502CC8badCef9404bd264433E127071f782BDb9A6667CbE04e038578886D806C425E62d4Fcdf3819F4fA124c5C3F7e72b7A36558b030B9DD9ff48f2559825',
	logs: [],
	logsBloom: '0x0016bef3b2913cc883e2993a12f1a2859e7b627c9d71048115232c92fe4e5d2f',
	status: '0x1',
	type: '0x2',
};

const inputTransaction = {
	from: 'QE88f16C4370E976c3678FbC681C28d9cc32e8194060b13eF0da86bF3D825c3eF2b32E9E80aA5D6B2756Ce92627015E644E1f6F2f58814Add8C47C0F90060A46E',
	gas: '0xc350',
	input: '0x68656c6c6f21',
	nonce: '0x15',
	to: 'QDd41F80c7261547983dB61532eF6bbCf319ebc94f840491af80709ce214De95a94eceE96615210fD3DE18eBAC3DBD6C369Ab815f1C0546087696AaA17d8CA106',
	value: '0xf3dbb76162000',
	type: '0x2',
	maxFeePerGas: '0x1475505aab',
	maxPriorityFeePerGas: '0x7f324180',
	chainId: '0x1',
};

/**
 * Array consists of:
 * - Test title
 * - Input transaction
 * - SendTransactionOptions
 * - Expected transaction hash
 * - Expected receipt info
 */
export const testData: [string, Transaction, SendTransactionOptions | undefined][] = [
	['Transaction with all hex string values', inputTransaction, undefined],
	[
		'Transaction with all hex string values and SendTransactionOptions.ignoreGasPricing = true',
		inputTransaction,
		{ ignoreGasPricing: true },
	],
	[
		'Transaction with all hex string values, inputTransaction.maxPriorityFeePerGas === undefined; inputTransaction.maxFeePerGas !== undefined',
		{
			...inputTransaction,
			maxPriorityFeePerGas: undefined,
		},
		{ ignoreGasPricing: true },
	],
	[
		'Transaction with all hex string values, inputTransaction.maxPriorityFeePerGas !== undefined; inputTransaction.maxFeePerGas === undefined',
		{
			...inputTransaction,
			maxFeePerGas: undefined,
		},
		{ ignoreGasPricing: true },
	],
	[
		'Transaction with all hex string values, inputTransaction.maxPriorityFeePerGas === undefined; inputTransaction.maxFeePerGas === undefined',
		{
			...inputTransaction,
			maxPriorityFeePerGas: undefined,
			maxFeePerGas: undefined,
		},
		{ ignoreGasPricing: true },
	],
];
