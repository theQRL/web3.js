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

/* eslint-disable jest/no-conditional-expect */

import { Address, Transaction, TransactionCall } from '@theqrl/web3-types';

import Web3QRL from '../../src';
import { getRevertReason } from '../../src/utils/get_revert_reason';
import { SimpleRevertAbi, SimpleRevertBytecode } from '../shared_fixtures/build/SimpleRevert';
import {
	createTempAccount,
	getSystemTestBackend,
	getSystemTestProvider,
} from '../fixtures/system_test_utils';

describe('Web3QRL.getRevertReason', () => {
	let tempAccount: { address: string; seed: string };
	let web3QRL: Web3QRL;
	let simpleRevertContractAddress: Address;

	beforeAll(async () => {
		tempAccount = await createTempAccount();
		web3QRL = new Web3QRL(getSystemTestProvider());

		const simpleRevertDeployTransaction: Transaction = {
			from: tempAccount.address,
			data: SimpleRevertBytecode,
			type: BigInt(2),
		};
		simpleRevertDeployTransaction.gas = await web3QRL.estimateGas(
			simpleRevertDeployTransaction,
		);
		simpleRevertContractAddress = (await web3QRL.sendTransaction(simpleRevertDeployTransaction))
			.contractAddress as Address;
	});

	it('should return reason for a contract call', async () => {
		const transaction: TransactionCall = {
			from: tempAccount.address,
			to: simpleRevertContractAddress,
			data: '0xf38fb65b',
			type: BigInt(2),
		};

		const response = await getRevertReason(web3QRL, transaction);

		switch (getSystemTestBackend()) {
			case 'gqrl':
				expect(response).toMatchObject({
					reason: 'execution reverted: This is a call revert',
					signature: '0x08c379a0',
					data: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000155468697320697320612063616c6c2072657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				});
				break;
			default:
				throw new Error(
					`Unable to finish test, unknown backend: ${getSystemTestBackend()}`,
				);
		}
	});

	it('should return reason for a contract send', async () => {
		const transaction: TransactionCall = {
			from: tempAccount.address,
			to: simpleRevertContractAddress,
			data: '0xba57a511000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000672657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
		};

		const response = await getRevertReason(web3QRL, transaction);

		switch (getSystemTestBackend()) {
			case 'gqrl':
				expect(response).toMatchObject({
					reason: 'execution reverted: This is a send revert',
					signature: '0x08c379a0',
					data: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000155468697320697320612073656e642072657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				});
				break;
			default:
				throw new Error(
					`Unable to finish test, unknown backend: ${getSystemTestBackend()}`,
				);
		}
	});

	it('should propagate intrinsic gas errors without classifying them as reverts', async () => {
		const transaction: TransactionCall = {
			from: tempAccount.address,
			to: simpleRevertContractAddress,
			type: BigInt(2),
			gas: '0x0',
			data: '0xba57a511000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000672657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
		};

		await expect(getRevertReason(web3QRL, transaction)).rejects.toMatchObject({
			name: 'InvalidResponseError',
			innerError: {
				code: -32000,
				message: 'err: intrinsic gas too low: have 0, want 21928 (supplied gas 0)',
			},
		});
	});

	it('should revert with custom error with no params', async () => {
		const transaction: TransactionCall = {
			from: tempAccount.address,
			to: simpleRevertContractAddress,
			data: '0x3ebf4d9c',
			type: BigInt(2),
		};

		const response = await getRevertReason(web3QRL, transaction, SimpleRevertAbi);
		switch (getSystemTestBackend()) {
			case 'gqrl':
				expect(response).toMatchObject({
					data: '',
					reason: 'execution reverted',
					signature: '0x72090e4d',
					customErrorName: 'ErrorWithNoParams',
					customErrorDecodedSignature: 'ErrorWithNoParams()',
					customErrorArguments: {},
				});
				break;
			default:
				throw new Error(
					`Unable to finish test, unknown backend: ${getSystemTestBackend()}`,
				);
		}
	});

	it('should revert with custom error with params', async () => {
		const transaction: TransactionCall = {
			from: tempAccount.address,
			to: simpleRevertContractAddress,
			data: '0x819f48fe',
			type: BigInt(2),
		};

		const response = await getRevertReason(web3QRL, transaction, SimpleRevertAbi);
		switch (getSystemTestBackend()) {
			case 'gqrl':
				expect(response).toMatchObject({
					data: '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c5468697320697320616e206572726f72207769746820706172616d73000000000000000000000000000000000000000000000000000000000000000000000000',
					reason: 'execution reverted',
					signature: '0xc85bda60',
					customErrorName: 'ErrorWithParams',
					customErrorDecodedSignature: 'ErrorWithParams(uint256,string)',
					customErrorArguments: {
						code: BigInt(42),
						message: 'This is an error with params',
					},
				});
				break;
			default:
				throw new Error(
					`Unable to finish test, unknown backend: ${getSystemTestBackend()}`,
				);
		}
	});

	it("shouldn't return a revert reason", async () => {
		const transaction: TransactionCall = {
			from: tempAccount.address,
			to: simpleRevertContractAddress,
			data: '0xba57a5110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
			type: BigInt(2),
		};

		const response = await getRevertReason(web3QRL, transaction);
		expect(response).toBeUndefined();
	});
});
