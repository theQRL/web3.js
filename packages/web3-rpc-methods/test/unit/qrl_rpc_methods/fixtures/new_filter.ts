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

import { Filter } from '@theqrl/web3-types';

const validTopic =
	'0xd5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72';
const secondValidTopic =
	'0xbe95a82d87a6cb9c7ff4c64e0c15bb1dff20b1d77e6b571b28ad4736f2a2a3e5857e8c225d6d61399b15beef3b196936e490ed6e234374c4887cbbe86c13b1ba';

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - filter
 */
type TestData = [string, [Filter]];
export const testData: TestData[] = [
	[
		'filter = fromBlock',
		[
			{
				fromBlock: '0xc0ff3',
			},
		],
	],
	[
		'filter = toBlock',
		[
			{
				toBlock: '0xc0ff3',
			},
		],
	],
	[
		'filter = address',
		[
			{
				address: 'Qaf735890e34c942307E3e559DD74740978864aAF7C4A19435567491e174c0EdccD743d86987B551cb546d96fb9a3127861cbf990c6906c74082ad223FF714c7b',
			},
		],
	],
	[
		'filter = address[]',
		[
			{
				address: [
					'Qaf735890e34c942307E3e559DD74740978864aAF7C4A19435567491e174c0EdccD743d86987B551cb546d96fb9a3127861cbf990c6906c74082ad223FF714c7b',
					'Q5a59252c050B745c77d7EA85b7F64DF2c541A0e74Ec0cbC238cC32F133BB9203D4e913b961dab63df97aEd7E30C1Fb3629b382CbDdbE66b50d4eb27CdBB55879',
				],
			},
		],
	],
	[
		'filter = topics[]',
		[
			{
				topics: [
					validTopic,
					// Using "null" value intentionally for validation
					// eslint-disable-next-line no-null/no-null
					null,
					[validTopic, secondValidTopic],
				],
			},
		],
	],
	[
		'filter = fromBlock, toBlock, address[], topics[]',
		[
			{
				fromBlock: '0xc0ff3',
				toBlock: '0xc0ff3',
				address: [
					'Qaf735890e34c942307E3e559DD74740978864aAF7C4A19435567491e174c0EdccD743d86987B551cb546d96fb9a3127861cbf990c6906c74082ad223FF714c7b',
					'Q5a59252c050B745c77d7EA85b7F64DF2c541A0e74Ec0cbC238cC32F133BB9203D4e913b961dab63df97aEd7E30C1Fb3629b382CbDdbE66b50d4eb27CdBB55879',
				],
				topics: [
					validTopic,
					// Using "null" value intentionally for validation
					// eslint-disable-next-line no-null/no-null
					null,
					[validTopic, secondValidTopic],
				],
			},
		],
	],
];
