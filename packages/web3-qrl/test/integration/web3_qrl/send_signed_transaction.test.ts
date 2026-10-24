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

import {
	Address,
	Bytes,
	SignedTransactionInfoAPI,
	Transaction,
	FMT_BYTES,
	FMT_NUMBER,
	DEFAULT_RETURN_FORMAT,
} from '@theqrl/web3-types';
import { format, hexToNumber } from '@theqrl/web3-utils';
import { isHexStrict } from '@theqrl/web3-validator';
import { Web3QRL, InternalTransaction, transactionSchema } from '../../../src';
import {
	closeOpenConnection,
	createTempAccount,
	getSystemTestBackend,
	getSystemTestProvider,
} from '../../fixtures/system_test_utils';
import { encodeParameter } from '@theqrl/web3-qrl-abi';
import { getTransactionGasPricing } from '../../../src/utils/get_transaction_gas_pricing';
import { SimpleRevertAbi, SimpleRevertBytecode } from '../../shared_fixtures/build/SimpleRevert';
import { GreeterBytecode } from '../../shared_fixtures/build/Greeter';

const HEX_NUMBER_DATA_FORMAT = { bytes: FMT_BYTES.HEX, number: FMT_NUMBER.HEX } as const;

describe('Web3QRL.sendSignedTransaction', () => {
	let web3QRL: Web3QRL;
	let tempAcc: { address: string; seed: string };

	beforeAll(async () => {
		web3QRL = new Web3QRL(getSystemTestProvider());
		tempAcc = await createTempAccount();
	});

	afterAll(async () => {
		await closeOpenConnection(web3QRL);
	});

	describe('Transaction Types', () => {
		it('should send a signed simple value transfer - type 0x2', async () => {
			const temp = await createTempAccount();
			const accountNonce = await web3QRL.getTransactionCount(
				temp.address,
				undefined,
				HEX_NUMBER_DATA_FORMAT,
			);
			const transaction: InternalTransaction = {
				nonce: accountNonce,
				from: temp.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
				value: '0x1',
				type: '0x2',
				gas: '0x5208',
			};
			const gasPricing = await getTransactionGasPricing(
				transaction,
				web3QRL,
				DEFAULT_RETURN_FORMAT,
			);
			const signedTransaction = await web3QRL.signTransaction({
				...transaction,
				...gasPricing,
			});
			const response = await web3QRL.sendSignedTransaction(signedTransaction.raw);
			expect(response.status).toBe(BigInt(1));

			const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
			expect(minedTransactionData).toMatchObject(
				format(transactionSchema, transaction, DEFAULT_RETURN_FORMAT),
			);
		});
	});

	it('should send a signed contract deployment', async () => {
		const greeterContractDeploymentData =
			GreeterBytecode + encodeParameter('string', 'solyent green is people').slice(2);
		const accountNonce = await web3QRL.getTransactionCount(
			tempAcc.address,
			undefined,
			HEX_NUMBER_DATA_FORMAT,
		);
		const deploymentGas = '0xf4240'; // 1,000,000
		const transaction: InternalTransaction = {
			nonce: accountNonce,
			from: tempAcc.address,
			data: greeterContractDeploymentData,
			type: '0x2',
			gas: deploymentGas,
		};
		const gasPricing = await getTransactionGasPricing(
			transaction,
			web3QRL,
			DEFAULT_RETURN_FORMAT,
		);
		const signedTransaction = await web3QRL.signTransaction({ ...transaction, ...gasPricing });
		const response = await web3QRL.sendSignedTransaction(signedTransaction.raw as Bytes);
		expect(response.status).toBe(BigInt(1));

		const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
		expect(minedTransactionData).toMatchObject({
			nonce: BigInt(hexToNumber(accountNonce)),
			from: tempAcc.address,
			input: greeterContractDeploymentData,
			type: BigInt(2),
			gas: BigInt(hexToNumber(deploymentGas)),
		});
	});

	describe('Transaction PromiEvents', () => {
		let transaction: Transaction;
		let signedTransaction: SignedTransactionInfoAPI;

		beforeEach(async () => {
			tempAcc = await createTempAccount();
			const accountNonce = await web3QRL.getTransactionCount(tempAcc.address);
			transaction = {
				nonce: accountNonce,
				from: tempAcc.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				value: '0x1',
				type: '0x2',
				gas: '0x5208',
			};
			const gasPricing = await getTransactionGasPricing(
				transaction as InternalTransaction,
				web3QRL,
				DEFAULT_RETURN_FORMAT,
			);
			signedTransaction = await web3QRL.signTransaction({ ...transaction, ...gasPricing });
		});

		it('should listen to the sending event', async () => {
			await web3QRL.sendSignedTransaction(signedTransaction.raw).on('sending', data => {
				expect(data).toBe(signedTransaction.raw);
			});
			expect.assertions(1);
		});

		it('should listen to the sent event', async () => {
			await web3QRL.sendSignedTransaction(signedTransaction.raw).on('sent', data => {
				expect(data).toBe(signedTransaction.raw);
			});
			expect.assertions(1);
		});

		it('should listen to the transactionHash event', async () => {
			await web3QRL
				.sendSignedTransaction(signedTransaction.raw)
				.on('transactionHash', data => {
					expect(isHexStrict(data)).toBe(true);
				});
			expect.assertions(1);
		});

		it('should listen to the receipt event', async () => {
			const expectedTransactionReceipt = {
				blockHash: expect.any(String),
				logs: [],
				logsBloom:
					'0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				from: transaction.from,
				to: transaction.to,
				transactionHash: expect.any(String),
			};

			await web3QRL.sendSignedTransaction(signedTransaction.raw).on('receipt', data => {
				expect(data).toEqual(expect.objectContaining(expectedTransactionReceipt));

				// To avoid issue with the `objectContaining` and `cypress` had to add
				// these expectations explicitly on each attribute
				expect(typeof data.blockNumber).toBe('bigint');
				expect(typeof data.cumulativeGasUsed).toBe('bigint');
				expect(typeof data.effectiveGasPrice).toBe('bigint');
				expect(typeof data.gasUsed).toBe('bigint');
				expect(typeof data.transactionIndex).toBe('bigint');
				expect(data.status).toBe(BigInt(1));
				expect(data.type).toBe(BigInt(2));
			});
			expect.assertions(8);
		});

		it('should listen to the confirmation event', async () => {
			const expectedTransactionConfirmation = {
				confirmations: BigInt(1),
				receipt: expect.objectContaining({
					blockHash: expect.any(String),
					blockNumber: expect.any(BigInt),
					cumulativeGasUsed: expect.any(BigInt),
					effectiveGasPrice: expect.any(BigInt),
					gasUsed: expect.any(BigInt),
					logs: [],
					logsBloom:
						'0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
					status: BigInt(1),
					from: transaction.from,
					to: transaction.to,
					transactionHash: expect.any(String),
					transactionIndex: BigInt(0),
					type: BigInt(2),
				}),
				latestBlockHash: expect.any(String),
			};

			const sent = web3QRL.sendSignedTransaction(signedTransaction.raw);
			const confirmation = new Promise<unknown>((resolve, reject) => {
				sent.once('confirmation', resolve);
				sent.once('error', reject);
			});
			const [, confirmationData] = await Promise.all([sent, confirmation]);
			expect(confirmationData).toEqual(
				expect.objectContaining(expectedTransactionConfirmation),
			);
		});
	});

	describe('Transaction Error Scenarios', () => {
		let simpleRevertContractAddress: Address;

		beforeAll(async () => {
			const simpleRevertDeployTransaction: Transaction = {
				from: tempAcc.address,
				data: SimpleRevertBytecode,
				type: BigInt(2),
				gas: BigInt(1000000),
			};
			simpleRevertContractAddress = (
				await web3QRL.sendTransaction(simpleRevertDeployTransaction)
			).contractAddress as Address;
		});
		it('Should throw InvalidResponseError because max fee is below the base fee', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
				value: BigInt(1),
				gas: 1,
				maxFeePerGas: 1,
				maxPriorityFeePerGas: 1,
				type: BigInt(2),
				nonce: await web3QRL.getTransactionCount(tempAcc.address),
			};
			const signedTransaction = await web3QRL.signTransaction(transaction, {
				number: FMT_NUMBER.BIGINT,
				bytes: FMT_BYTES.UINT8ARRAY,
			});

			const expectedThrownError = {
				name: 'InvalidResponseError',
				code: 101,
				innerError: {
					code: -32000,
					message: expect.stringContaining(
						'err: max fee per gas less than block base fee: address Q',
					),
				},
			};

			await expect(
				web3QRL
					.sendSignedTransaction(signedTransaction.raw)
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});
		it('Should throw InvalidResponseError because insufficient funds', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				value: BigInt('999999999999999999999999999999999999999999999999999999999'),
				nonce: await web3QRL.getTransactionCount(tempAcc.address),
				gas: 27000,
				maxFeePerGas: BigInt(108571383800),
				maxPriorityFeePerGas: BigInt(25415778028),
			};
			const signedTransaction = await web3QRL.signTransaction(transaction, {
				number: FMT_NUMBER.BIGINT,
				bytes: FMT_BYTES.UINT8ARRAY,
			});

			const expectedThrownError = {
				name: 'InvalidResponseError',
				code: 101,
				innerError: {
					code: -32000,
					message: expect.stringContaining(
						'err: insufficient funds for gas * price + value: address',
					),
				},
			};

			await expect(
				web3QRL
					.sendSignedTransaction(signedTransaction.raw)
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});

		it('Should throw TransactionRevertInstructionError because of contract revert and return revert reason', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: simpleRevertContractAddress,
				data: '0xba57a511000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000672657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				maxFeePerGas: BigInt(108571383800),
				maxPriorityFeePerGas: BigInt(25415778028),
				gas: 100000,
				type: BigInt(2),
				nonce: await web3QRL.getTransactionCount(tempAcc.address),
			};
			const signedTransaction = await web3QRL.signTransaction(transaction, {
				number: FMT_NUMBER.BIGINT,
				bytes: FMT_BYTES.UINT8ARRAY,
			});

			web3QRL.handleRevert = true;

			const expectedThrownError = {
				name: 'TransactionRevertInstructionError',
				code: 402,
				reason:
					getSystemTestBackend() === 'gqrl'
						? 'execution reverted: This is a send revert'
						: 'VM Exception while processing transaction: revert This is a send revert',
				signature: '0x08c379a0',
				data: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000155468697320697320612073656e642072657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				receipt: undefined,
			};

			await expect(
				web3QRL
					.sendSignedTransaction(signedTransaction.raw)
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});

		it('Should throw TransactionRevertWithCustomError because of contract revert and return custom error ErrorWithNoParams', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: simpleRevertContractAddress,
				data: '0x3ebf4d9c',
				type: BigInt(2),
				maxFeePerGas: BigInt(108571383800),
				maxPriorityFeePerGas: BigInt(25415778028),
				// Leave enough gas to execute the custom-error branch.
				gas: 100000,
				nonce: await web3QRL.getTransactionCount(tempAcc.address),
			};
			const signedTransaction = await web3QRL.signTransaction(transaction, {
				number: FMT_NUMBER.BIGINT,
				bytes: FMT_BYTES.UINT8ARRAY,
			});

			web3QRL.handleRevert = true;

			const expectedThrownError = {
				name: 'TransactionRevertWithCustomError',
				code: 438,
				reason:
					getSystemTestBackend() === 'gqrl'
						? 'execution reverted'
						: 'VM Exception while processing transaction: revert',
				signature: '0x72090e4d',
				customErrorName: 'ErrorWithNoParams',
				customErrorDecodedSignature: 'ErrorWithNoParams()',
				customErrorArguments: {},
				receipt: undefined,
			};

			await expect(
				web3QRL
					.sendSignedTransaction(signedTransaction.raw, undefined, {
						contractAbi: SimpleRevertAbi,
					})
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});

		it('Should throw TransactionRevertWithCustomError because of contract revert and return custom error ErrorWithParams', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: simpleRevertContractAddress,
				data: '0x819f48fe',
				maxFeePerGas: BigInt(108571383800),
				maxPriorityFeePerGas: BigInt(25415778028),
				gas: 21730,
				type: BigInt(2),
				nonce: await web3QRL.getTransactionCount(tempAcc.address),
			};
			const signedTransaction = await web3QRL.signTransaction(transaction, {
				number: FMT_NUMBER.BIGINT,
				bytes: FMT_BYTES.UINT8ARRAY,
			});

			web3QRL.handleRevert = true;

			const expectedThrownError = {
				name: 'TransactionRevertWithCustomError',
				code: 438,
				reason:
					getSystemTestBackend() === 'gqrl'
						? 'execution reverted'
						: 'VM Exception while processing transaction: revert',
				signature: '0xc85bda60',
				data: '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c5468697320697320616e206572726f72207769746820706172616d73000000000000000000000000000000000000000000000000000000000000000000000000',
				customErrorName: 'ErrorWithParams',
				customErrorDecodedSignature: 'ErrorWithParams(uint256,string)',
				customErrorArguments: {
					code: BigInt(42),
					message: 'This is an error with params',
				},
				receipt: undefined,
			};

			await expect(
				web3QRL
					.sendSignedTransaction(signedTransaction.raw, undefined, {
						contractAbi: SimpleRevertAbi,
					})
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});

		it('Should throw TransactionRevertInstructionError because of contract revert', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: simpleRevertContractAddress,
				data: '0xba57a511000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000672657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				maxFeePerGas: BigInt(108571383800),
				maxPriorityFeePerGas: BigInt(25415778028),
				gas: 100000,
				type: BigInt(2),
				nonce: await web3QRL.getTransactionCount(tempAcc.address),
			};
			const signedTransaction = await web3QRL.signTransaction(transaction, {
				number: FMT_NUMBER.BIGINT,
				bytes: FMT_BYTES.UINT8ARRAY,
			});

			web3QRL.handleRevert = false;

			const expectedThrownError = {
				name: 'TransactionRevertInstructionError',
				innerError: undefined,
				reason:
					getSystemTestBackend() === 'gqrl'
						? 'execution reverted: This is a send revert'
						: 'VM Exception while processing transaction: revert This is a send revert',
				signature: '0x08c379a0',
				receipt: undefined,
				data: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000155468697320697320612073656e642072657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				code: 402,
			};

			await expect(
				web3QRL
					.sendSignedTransaction(signedTransaction.raw)
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});
	});
});
