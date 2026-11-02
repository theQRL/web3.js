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
import { TransactionReceipt, Bytes } from '@theqrl/web3-types';
import { hexToBytes } from '@theqrl/web3-utils';

export const mockRpcResponse: TransactionReceipt = {
	transactionHash: '0xe21194c9509beb01be7e90c2bcefff2804cd85836ae12134f22ad4acda0fc547',
	transactionIndex: '0x41',
	blockHash: '0x1d59ff54b1eb26b013ce3cb5fc9dab3705b415a67127a003c3e61eb445bb8df2',
	blockNumber: '0x5daf3b',
	from: 'QC69054B1dF3CFFddF5efB69E34489bDA0842F163689A4f208eAa538366524a3E6985678f038456539180B520D6e1aa86c0Ba8A5dCae3E53735c5a5Eada5650B1',
	to: 'QDd41F80c7261547983dB61532eF6bbCf319ebc94f840491af80709ce214De95a94eceE96615210fD3DE18eBAC3DBD6C369Ab815f1C0546087696AaA17d8CA106',
	cumulativeGasUsed: '0x33bc', // 13244
	gasUsed: '0x4dc', // 1244
	contractAddress: 'QD8F502CC8badCef9404bd264433E127071f782BDb9A6667CbE04e038578886D806C425E62d4Fcdf3819F4fA124c5C3F7e72b7A36558b030B9DD9ff48f2559825',
	logs: [],
	logsBloom: '0xe21194c9509beb01be7e90c2bcefff2804cd85836ae12134f22ad4acda0fc547',
	status: '0x1',
	effectiveGasPrice: '0x4dc4', // 19908
};

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - transactionHash
 *     - returnFormat
 * - mockRpcResponse
 */
type TestData = [string, [Bytes]];
export const testData: TestData[] = [
	// transactionHash = Bytes
	[
		'transactionHash = "0xd5677cf67b5aa051bb40496e68ad359eb97cfbf8"',
		['0xd5677cf67b5aa051bb40496e68ad359eb97cfbf8'],
	],
	[
		'transactionHash = hexToBytes("0xd5677cf67b5aa051bb40496e68ad359eb97cfbf8")',
		[hexToBytes('0xd5677cf67b5aa051bb40496e68ad359eb97cfbf8')],
	],
	[
		'transactionHash = hexToBytes("d5677cf67b5aa051bb40496e68ad359eb97cfbf8")',
		[
			new Uint8Array([
				213, 103, 124, 246, 123, 90, 160, 81, 187, 64, 73, 110, 104, 173, 53, 158, 185, 124,
				251, 248,
			]),
		],
	],
];
