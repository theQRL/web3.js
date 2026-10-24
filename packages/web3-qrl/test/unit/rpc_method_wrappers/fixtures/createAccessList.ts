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
import {
	BlockNumberOrTag,
	BlockTags,
	DataFormat,
	DEFAULT_RETURN_FORMAT,
	TransactionForAccessList,
} from '@theqrl/web3-types';

export const mockRpcResponse = {
	accessList: [
		{
			address:
				'QE5A56080716c3E4d0E1965dD1Af6012ecc96a0bA89811854D099547372eb4eE56F92761cfc57202EF56e39b724A6Ec6698737E5D92052A698933aef847B73295',
			storageKeys: ['0x0000000000000000000000000000000000000000000000000000000000000000'],
		},
	],
	gasUsed: '0x7671',
};

const transaction: TransactionForAccessList = {
	from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
	to: 'Q9c94d2a70E998E1741b4C32d89d33EaD11365EbEca7035d0bb66dD34b33c05168bb6776321f0e68EEB5d50ef85AB643b7D6040ee9566E5539A659D5E4f7131AE',
	value: '0x0',
	gas: '0x5208',
	maxFeePerGas: '0x4a817c800',
	maxPriorityFeePerGas: '0x0',
	data: '0x9a67c8b100000000000000000000000000000000000000000000000000000000000004d0',
};

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - transaction
 *     - blocknumberortag
 * - mockRpcResponse
 */
type TestData = [string, [TransactionForAccessList, BlockNumberOrTag | undefined, DataFormat]];
export const testData: TestData[] = [
	// blockNumber = BlockTag
	[
		`${JSON.stringify(transaction)}\nblockNumber = BlockTags.LATEST`,
		[transaction, BlockTags.LATEST, DEFAULT_RETURN_FORMAT],
	],
	[
		`${JSON.stringify(transaction)}\nblockNumber = BlockTags.EARLIEST`,
		[transaction, BlockTags.EARLIEST, DEFAULT_RETURN_FORMAT],
	],
	[
		`${JSON.stringify(transaction)}\nblockNumber = BlockTags.PENDING`,
		[transaction, BlockTags.PENDING, DEFAULT_RETURN_FORMAT],
	],
	[
		`${JSON.stringify(transaction)}\nblockNumber = BlockTags.SAFE`,
		[transaction, BlockTags.SAFE, DEFAULT_RETURN_FORMAT],
	],
	[
		`${JSON.stringify(transaction)}\nblockNumber = BlockTags.FINALIZED`,
		[transaction, BlockTags.FINALIZED, DEFAULT_RETURN_FORMAT],
	],
	// blockNumber = Numbers
	[
		`${JSON.stringify(transaction)}\nblockNumber = "0x4b7"`,
		[transaction, '0x4b7', DEFAULT_RETURN_FORMAT],
	],
	[
		`${JSON.stringify(transaction)}\nblockNumber = 1207`,
		[transaction, 1207, DEFAULT_RETURN_FORMAT],
	],
	[
		`${JSON.stringify(transaction)}\nblockNumber = "1207"`,
		[transaction, '1207', DEFAULT_RETURN_FORMAT],
	],
	[
		`${JSON.stringify(transaction)}\nblockNumber = BigInt("0x4b7")`,
		[transaction, BigInt('0x4b7'), DEFAULT_RETURN_FORMAT],
	],
	[
		`${JSON.stringify(transaction)}\nblockNumber = undefined`,
		[transaction, BlockTags.LATEST, DEFAULT_RETURN_FORMAT],
	],
];
