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
import { Address, HexString32Bytes, Uint } from '@theqrl/web3-types';

const address = 'Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3';

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - address
 *     - storageKey
 *     - blockNumber
 */
type TestData = [string, [Address, HexString32Bytes[], Uint]];
export const testData: TestData[] = [
	[
		'address = "Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3", storageKeys = ["0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b"], blockNumber = "0x88"',
		[address, ['0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b'], '0x88'],
	],
];
