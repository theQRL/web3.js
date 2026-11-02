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

import { Transaction } from '@theqrl/web3-types';
import { encodeParameter } from '@theqrl/web3-qrl-abi';
import { Web3QRL } from '../../../src';
import { GreeterBytecode } from '../../shared_fixtures/build/Greeter';
import {
	closeOpenConnection,
	createTempAccount,
	getSystemTestProvider,
} from '../../fixtures/system_test_utils';

describe('Web3QRL.estimateGas', () => {
	let web3QRL: Web3QRL;
	let tempAcc: { address: string; seed: string };

	beforeAll(async () => {
		web3QRL = new Web3QRL(getSystemTestProvider());
		tempAcc = await createTempAccount();
	});

	afterAll(async () => {
		await closeOpenConnection(web3QRL);
	});

	it('should estimate a simple value transfer', async () => {
		const transaction: Transaction = {
			from: tempAcc.address,
			to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
			value: '0x1',
			type: BigInt(2),
		};
		const response = await web3QRL.estimateGas(transaction);
		expect(response).toBe(BigInt(21000));
	});

	it('should estimate a contract deployment', async () => {
		const greeterContractDeploymentData =
			GreeterBytecode + encodeParameter('string', 'solyent green is people').slice(2);
		const transaction: Transaction = {
			from: tempAcc.address,
			data: greeterContractDeploymentData,
			gas: '0xf4240',
			type: BigInt(2),
		};
		const response = await web3QRL.estimateGas(transaction);

		// Verify that the estimate actually covers this compiler's deployment bytecode.
		expect(response).toBeGreaterThan(BigInt(21000));
		expect(response).toBeLessThanOrEqual(BigInt(transaction.gas!));
		const receipt = await web3QRL.sendTransaction({ ...transaction, gas: response });
		expect(receipt.status).toBe(BigInt(1));
		expect(receipt.gasUsed).toBeLessThanOrEqual(response);
		expect(receipt.contractAddress).toBeDefined();
	});
});
