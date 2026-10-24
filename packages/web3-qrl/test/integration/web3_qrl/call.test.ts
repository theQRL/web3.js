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
import { TransactionCall, BlockTags, Transaction } from '@theqrl/web3-types';
import { decodeParameters, encodeParameter } from '@theqrl/web3-qrl-abi';
import { Web3QRL } from '../../../src';
import { GreeterBytecode } from '../../shared_fixtures/build/Greeter';
import {
	closeOpenConnection,
	createTempAccount,
	getSystemTestProvider,
} from '../../fixtures/system_test_utils';

describe('Web3QRL.call', () => {
	const expectedDecodedGreet = 'solyent green is people';
	const expectedEncodedGreet = encodeParameter('string', expectedDecodedGreet);
	const greetCallData = '0xcfae3217';
	const greeterAbiFragment = {
		inputs: [],
		name: 'greet',
		outputs: [
			{
				name: '',
				type: 'string',
			},
		],
		stateMutability: 'view',
		type: 'function',
	};

	let web3QRL: Web3QRL;
	let greeterContractAddress: string;
	let tempAcc: { address: string; seed: string };

	beforeAll(async () => {
		web3QRL = new Web3QRL(getSystemTestProvider());
		const greeterContractDeploymentData =
			GreeterBytecode + encodeParameter('string', expectedDecodedGreet).slice(2);
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

	it('should make a call to deployed Greeter contract', async () => {
		const transaction: TransactionCall = {
			from: tempAcc.address,
			to: greeterContractAddress,
			data: greetCallData,
			type: BigInt(2),
		};
		const response = await web3QRL.call(transaction);
		expect(response).toBe(expectedEncodedGreet);
		const decodedResult = decodeParameters([...greeterAbiFragment.outputs], response)[0];
		expect(decodedResult).toBe(expectedDecodedGreet);
	});

	describe('blockNumber parameter', () => {
		it('should return no data (0x) for call to deployed Greeter contract with blockNumber = EARLIEST', async () => {
			const transaction: TransactionCall = {
				from: tempAcc.address,
				to: greeterContractAddress,
				data: greetCallData,
				type: BigInt(2),
			};
			const response = await web3QRL.call(transaction, BlockTags.EARLIEST);
			expect(response).toBe('0x');
		});

		it('should return expectedDecodedGreet for call to deployed Greeter contract with blockNumber = LATEST', async () => {
			const transaction: TransactionCall = {
				from: tempAcc.address,
				to: greeterContractAddress,
				data: greetCallData,
				type: BigInt(2),
			};
			const response = await web3QRL.call(transaction, BlockTags.LATEST);
			expect(response).toBe(expectedEncodedGreet);
			const decodedResult = decodeParameters([...greeterAbiFragment.outputs], response)[0];
			expect(decodedResult).toBe(expectedDecodedGreet);
		});

		// TODO - Not sure if there is a better way to test PENDING BlockTag,
		// but interacting with a contract that hasn't been mined yet doesn't make sense
		it('should return expectedDecodedGreet for call to deployed Greeter contract with blockNumber = PENDING', async () => {
			const transaction: TransactionCall = {
				from: tempAcc.address,
				to: greeterContractAddress,
				data: greetCallData,
				type: BigInt(2),
			};
			const response = await web3QRL.call(transaction, BlockTags.PENDING);
			expect(response).toBe(expectedEncodedGreet);
			const decodedResult = decodeParameters([...greeterAbiFragment.outputs], response)[0];
			expect(decodedResult).toBe(expectedDecodedGreet);
		});

		it('should return no data (0x) for call to deployed Greeter contract with blockNumber = 0x0', async () => {
			const transaction: TransactionCall = {
				from: tempAcc.address,
				to: greeterContractAddress,
				data: greetCallData,
				type: BigInt(2),
			};
			const response = await web3QRL.call(transaction, '0x0');
			expect(response).toBe('0x');
		});

		it('should return no data (0x) for call to deployed Greeter contract with web3Context.defaultBlock = EARLIEST', async () => {
			web3QRL.defaultBlock = BlockTags.EARLIEST;

			const transaction: TransactionCall = {
				from: tempAcc.address,
				to: greeterContractAddress,
				data: greetCallData,
				type: BigInt(2),
			};
			const response = await web3QRL.call(transaction);
			expect(response).toBe('0x');
		});
	});
});
