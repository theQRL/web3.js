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
import { BlockNumberOrTag, BlockTags, Bytes } from '@theqrl/web3-types';
import { hexToBytes } from '@theqrl/web3-utils';

export const mockRpcResponse = '0xb';

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - blockNumber
 */
type TestData = [string, [Bytes | BlockNumberOrTag | undefined]];
export const testData: TestData[] = [
	// Testing block cases
	// blockNumber = bytes
	[
		'blockNumber = "0xdc0818cf78f21a8e70579cb46a43643f78291264dda342ae31049421c82d21ae"',
		['0xdc0818cf78f21a8e70579cb46a43643f78291264dda342ae31049421c82d21ae'],
	],
	[
		'blockNumber = hexToBytes("0xdc0818cf78f21a8e70579cb46a43643f78291264dda342ae31049421c82d21ae")',
		[hexToBytes('0xdc0818cf78f21a8e70579cb46a43643f78291264dda342ae31049421c82d21ae')],
	],
	[
		'blockNumber = hexToBytes("dc0818cf78f21a8e70579cb46a43643f78291264dda342ae31049421c82d21ae")',
		[
			new Uint8Array([
				220, 8, 24, 207, 120, 242, 26, 142, 112, 87, 156, 180, 106, 67, 100, 63, 120, 41,
				18, 100, 221, 163, 66, 174, 49, 4, 148, 33, 200, 45, 33, 174,
			]),
		],
	],
	// blockNumber = BlockTag
	['blockNumber = BlockTags.LATEST', [BlockTags.LATEST]],
	['blockNumber = BlockTags.EARLIEST', [BlockTags.EARLIEST]],
	['blockNumber = BlockTags.PENDING', [BlockTags.PENDING]],
	['blockNumber = BlockTags.SAFE', [BlockTags.SAFE]],
	['blockNumber = BlockTags.FINALIZED', [BlockTags.FINALIZED]],
	// blockNumber = Numbers
	['blockNumber = "0x4b7"', ['0x4b7']],
	// Even-length hex strings shorter than 32 bytes are block numbers, not hashes (P4-L-11)
	['blockNumber = "0x10"', ['0x10']],
	[
		'blockNumber = "0xd5677cf67b5aa051bb40496e68ad359eb97cfbf8" (20 bytes)',
		['0xd5677cf67b5aa051bb40496e68ad359eb97cfbf8'],
	],
	['blockNumber = 1207', [1207]],
	['blockNumber = "1207"', ['1207']],
	['blockNumber = BigInt("0x4b7")', [BigInt('0x4b7')]],
	['blockNumber = undefined', [undefined]],
];
