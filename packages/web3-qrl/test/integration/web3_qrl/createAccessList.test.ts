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

import { AccessListResult, Transaction, TransactionForAccessList } from '@theqrl/web3-types';
import { encodeParameter, encodeFunctionCall } from '@theqrl/web3-qrl-abi';
import { getStorageSlotNumForLongString } from '@theqrl/web3-utils';
import { Web3QRL } from '../../../src';
import { GreeterBytecode } from '../../shared_fixtures/build/Greeter';
import {
	closeOpenConnection,
	createTempAccount,
	describeIf,
	getSystemTestBackend,
	getSystemTestProvider,
} from '../../fixtures/system_test_utils';

describeIf(getSystemTestBackend() === 'gqrl')('Web3QRL.createAccessList', () => {
	let web3QRL: Web3QRL;
	let greeterContractAddress: string;
	let tempAcc: { address: string; seed: string };

	beforeAll(async () => {
		web3QRL = new Web3QRL(getSystemTestProvider());
		const greeterContractDeploymentData =
			GreeterBytecode + encodeParameter('string', 'solyent green is people').slice(2);
		tempAcc = await createTempAccount();
		const transaction: Transaction = {
			from: tempAcc.address,
			data: greeterContractDeploymentData,
			type: BigInt(2),
		};
		const response = await web3QRL.sendTransaction(transaction);
		greeterContractAddress = response.contractAddress as string;
	});

	afterAll(async () => {
		await closeOpenConnection(web3QRL);
	});

	test('should return access list for provided transaction', async () => {
		const transaction: TransactionForAccessList = {
			from: tempAcc.address,
			to: greeterContractAddress,
			data: '0xcfae3217', // greet function call data encoded
		};

		const response = await web3QRL.createAccessList(transaction);

		const expectedResponse: AccessListResult = {
			accessList: [
				{
					address: greeterContractAddress,
					storageKeys: [
						'0x0000000000000000000000000000000000000000000000000000000000000001',
					],
				},
			],
			// Hyperion 0.2.0 fixture on go-qrl 0.3.3.
			gasUsed: '0x71fe',
		};

		expect(response).toStrictEqual(expectedResponse);
	});

	test('accepts the node-generated 32-byte keys for a long string in VM64 storage', async () => {
		const transaction: TransactionForAccessList = {
			from: tempAcc.address,
			to: greeterContractAddress,
			data: encodeFunctionCall(
				{
					type: 'function',
					name: 'setGreeting',
					inputs: [{ name: 'greeting', type: 'string' }],
				},
				['x'.repeat(130)],
			),
		};
		const result = await web3QRL.createAccessList(transaction);
		expect(result.accessList).toBeDefined();
		const keys = result.accessList!.flatMap(entry => entry.storageKeys);
		expect(keys).toContain(getStorageSlotNumForLongString(1));
		for (const key of keys) expect(key).toMatch(/^0x[0-9a-f]{64}$/i);
		const receipt = await web3QRL.sendTransaction({
			...transaction,
			type: 2,
			accessList: result.accessList,
			gas: result.gasUsed,
		});
		expect(receipt.status).toBe(BigInt(1));
	});
});
