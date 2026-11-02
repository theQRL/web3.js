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
import { LogsInput, Filter } from '@theqrl/web3-types';

export const mockRpcResponse: LogsInput[] = [
	{
		logIndex: '0x1',
		blockNumber: '0x1b4',
		blockHash: `0x${'82'.repeat(32)}`,
		transactionHash: `0x${'df'.repeat(32)}`,
		transactionIndex: '0x0',
		address:
			'Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3',
		data: '0x0000000000000000000000000000000000000000000000000000000000000000',
		topics: [
			'0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a94f5374fce5edbc8e2a8697c15331677e6ebf0b',
			`0x${'00'.repeat(64)}`,
			'0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a94f5374fce5edbc8e2a8697c15331677e6ebf0b',
		],
	},
];

const filter: Filter = {
	address:
		'Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3',
	topics: [
		'0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a94f5374fce5edbc8e2a8697c15331677e6ebf0b',
		// Using "null" value intentionally for validation
		// eslint-disable-next-line no-null/no-null
		null,
		[
			'0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a94f5374fce5edbc8e2a8697c15331677e6ebf0b',
			'0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000aff3454fce5edbc8cca8697c15331677e6ebccc',
		],
	],
};

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - filter
 */
type TestData = [string, [Filter]];
export const testData: TestData[] = [[JSON.stringify(filter), [filter]]];
