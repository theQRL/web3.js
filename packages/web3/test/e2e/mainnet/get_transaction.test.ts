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
import { Bytes, TransactionInfo } from '@theqrl/web3-types';
import { bytesToUint8Array, hexToBytes } from '@theqrl/web3-utils';

import Web3 from '../../../src';
import { getSystemE2ETestProvider } from '../e2e_utils';
import {
	closeOpenConnection,
	getSystemTestBackend,
} from '../../shared_fixtures/system_tests_utils';
import { toAllVariants } from '../../shared_fixtures/utils';

describe(`${getSystemTestBackend()} tests - getTransaction`, () => {
	const provider = getSystemE2ETestProvider();

	let web3: Web3;

	beforeAll(() => {
		web3 = new Web3(provider);
	});

	afterAll(async () => {
		await closeOpenConnection(web3);
	});

	it.each(
		toAllVariants<{
			transactionHash: Bytes;
		}>({
			transactionHash: [
				'0x9a968248400868beb931ed96ee37517275794ff44e8d968c29f0f3430a504594',
				bytesToUint8Array(
					hexToBytes(
						'0x9a968248400868beb931ed96ee37517275794ff44e8d968c29f0f3430a504594',
					),
				),
				new Uint8Array(
					hexToBytes(
						'0x9a968248400868beb931ed96ee37517275794ff44e8d968c29f0f3430a504594',
					),
				),
			],
		}),
	)('getTransaction', async ({ transactionHash }) => {
		const result = await web3.zond.getTransaction(transactionHash);

		expect(result).toMatchObject<TransactionInfo>({
			hash: '0x9a968248400868beb931ed96ee37517275794ff44e8d968c29f0f3430a504594',
			nonce: BigInt(2264),
			blockHash: '0xabc81c29235c7962f5a0420644761627bdc064a560c7d1842cdf9517f7d7984e',
			blockNumber: BigInt(17030310),
			transactionIndex: BigInt(91),
			from: '0xd67da12dc33d9730d9341bbfa4f0b67d0688b28b',
			gasPrice: BigInt(19330338402),
			maxPriorityFeePerGas: BigInt(100000000),
			maxFeePerGas: BigInt(26848942133),
			gas: BigInt(300858),
			input: '0x6d78f47a000000000000000000000000a6e265667e1e18c28f2b5dc529f775c5f0d56d4a000000000000000000000000000000000000000000000001a055690d9db80000000000000000000000000000d67da12dc33d9730d9341bbfa4f0b67d0688b28b',
			chainId: BigInt(1),
			type: BigInt('0x2'),
			v: BigInt('0x0'),
			s: '0x72ca073bc16b35b3191b35fd8fb0eebdd536675ecb8459b110fcad2890a98ec9',
			r: '0x45496fc11c7bf9972cb732bdc579f5d9d01e4df276dd49626e75fc3b5f8b6ec4',
		});
	});
});
