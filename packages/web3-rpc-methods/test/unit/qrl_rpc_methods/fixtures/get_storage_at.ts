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
import { BlockNumberOrTag, Address, BlockTags, Uint256 } from '@theqrl/web3-types';

export const mockRpcResponse = '0x033456732123ffff2342342dd12342434324234234fd234fd23fd4f23d4234';

const address = 'Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3';

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - address
 *     - storageSlot
 *     - blockNumber
 */
type TestData = [string, [Address, Uint256, BlockNumberOrTag]];
export const testData: TestData[] = [
	// Testing blockNumber cases
	['storageSlot = "0x4b7", blockNumber = BlockTags.LATEST', [address, '0x4b7', BlockTags.LATEST]],
	[
		'storageSlot = "0x4b7", blockNumber = BlockTags.EARLIEST',
		[address, '0x4b7', BlockTags.EARLIEST],
	],
	[
		'storageSlot = "0x4b7", blockNumber = BlockTags.PENDING',
		[address, '0x4b7', BlockTags.PENDING],
	],
	['storageSlot = "0x4b7", blockNumber = BlockTags.SAFE', [address, '0x4b7', BlockTags.SAFE]],
	[
		'storageSlot = "0x4b7", blockNumber = BlockTags.FINALIZED',
		[address, '0x4b7', BlockTags.FINALIZED],
	],
	['storageSlot = "0x4b7", blockNumber = "0x4b7"', [address, '0x4b7', '0x4b7']],
];
