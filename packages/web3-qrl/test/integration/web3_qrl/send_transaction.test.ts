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
	Transaction,
	TransactionWithFromLocalWalletIndex,
	TransactionWithToLocalWalletIndex,
	TransactionWithFromAndToLocalWalletIndex,
	Address,
	DEFAULT_RETURN_FORMAT,
} from '@theqrl/web3-types';
import { Wallet } from '@theqrl/web3-qrl-accounts';
import { isHexStrict } from '@theqrl/web3-validator';

import { encodeParameter } from '@theqrl/web3-qrl-abi';
import Web3QRL from '../../../src';
import {
	closeOpenConnection,
	createAccountProvider,
	createTempAccount,
	getSystemTestBackend,
	getSystemTestProvider,
} from '../../fixtures/system_test_utils';
import { SimpleRevertAbi, SimpleRevertBytecode } from '../../shared_fixtures/build/SimpleRevert';
import { GreeterBytecode } from '../../shared_fixtures/build/Greeter';

describe('Web3QRL.sendTransaction', () => {
	let web3QRL: Web3QRL;
	let tempAcc: { address: string; seed: string };

	beforeAll(async () => {
		web3QRL = new Web3QRL(getSystemTestProvider());
		tempAcc = await createTempAccount();
	});

	afterAll(async () => {
		await closeOpenConnection(web3QRL);
	});

	it('should make a simple value transfer', async () => {
		const transaction: Transaction = {
			from: tempAcc.address,
			to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
			value: BigInt(1),
			type: BigInt(2),
		};
		const response = await web3QRL.sendTransaction(transaction);
		expect(response.status).toBe(BigInt(1));

		const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
		expect(minedTransactionData).toMatchObject(transaction);
	});

	it('should make a simple value transfer - with local wallet indexed sender', async () => {
		const web3EthWithWallet = new Web3QRL(getSystemTestProvider());
		const accountProvider = createAccountProvider(web3QRL);
		const wallet = new Wallet(accountProvider);

		web3EthWithWallet['_accountProvider'] = accountProvider;
		web3EthWithWallet['_wallet'] = wallet;

		web3EthWithWallet.wallet?.add(tempAcc.seed);

		const transaction: TransactionWithFromLocalWalletIndex = {
			from: 0,
			to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
			type: BigInt(2),
			value: BigInt(1),
		};
		const response = await web3EthWithWallet.sendTransaction(transaction);
		expect(response.status).toBe(BigInt(1));

		const minedTransactionData = await web3EthWithWallet.getTransaction(
			response.transactionHash,
		);

		expect(minedTransactionData).toMatchObject({
			from: tempAcc.address,
			to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
			value: BigInt(1),
		});
	});

	it('should make a simple value transfer - with local wallet indexed receiver', async () => {
		const web3EthWithWallet = new Web3QRL(getSystemTestProvider());
		const accountProvider = createAccountProvider(web3QRL);
		const wallet = new Wallet(accountProvider);

		web3EthWithWallet['_accountProvider'] = accountProvider;
		web3EthWithWallet['_wallet'] = wallet;

		web3EthWithWallet.wallet?.add(tempAcc.seed);

		const transaction: TransactionWithToLocalWalletIndex = {
			from: tempAcc.address,
			to: 0,
			type: BigInt(2),
			value: BigInt(1),
		};
		const response = await web3EthWithWallet.sendTransaction(transaction);
		expect(response.status).toBe(BigInt(1));

		const minedTransactionData = await web3EthWithWallet.getTransaction(
			response.transactionHash,
		);

		const acc = wallet.get(0);
		expect(minedTransactionData).toMatchObject({
			from: tempAcc.address,
			to: acc?.address,
			value: BigInt(1),
		});
	});

	it('should make a simple value transfer - with local wallet indexed sender and receiver', async () => {
		const web3EthWithWallet = new Web3QRL(getSystemTestProvider());
		const accountProvider = createAccountProvider(web3QRL);
		const wallet = new Wallet(accountProvider);

		web3EthWithWallet['_accountProvider'] = accountProvider;
		web3EthWithWallet['_wallet'] = wallet;

		const tempAcc2 = await createTempAccount();

		web3EthWithWallet.wallet?.add(tempAcc.seed);

		web3EthWithWallet.wallet?.add(tempAcc2.seed);

		const transaction: TransactionWithFromAndToLocalWalletIndex = {
			from: 0,
			to: 1,
			type: BigInt(2),
			value: BigInt(1),
		};
		const response = await web3EthWithWallet.sendTransaction(transaction);
		expect(response.status).toBe(BigInt(1));

		const minedTransactionData = await web3EthWithWallet.getTransaction(
			response.transactionHash,
		);

		const acc = wallet.get(1);
		expect(minedTransactionData).toMatchObject({
			from: tempAcc.address,
			to: acc?.address,
			value: BigInt(1),
		});
	});
	it('should make a transaction with no value transfer', async () => {
		const transaction: Transaction = {
			from: tempAcc.address,
			to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
			value: BigInt(0),
			type: BigInt(2),
		};
		const response = await web3QRL.sendTransaction(transaction);
		expect(response.status).toBe(BigInt(1));

		const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
		expect(minedTransactionData).toMatchObject(transaction);
	});
	it('should send a transaction with data', async () => {
		const transaction: Transaction = {
			from: tempAcc.address,
			to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
			data: '0x64edfbf0e2c706ba4a09595315c45355a341a576cc17f3a19f43ac1c02f814ee',
			value: BigInt(0),
			type: BigInt(2),
		};
		const response = await web3QRL.sendTransaction(transaction);
		expect(response.status).toBe(BigInt(1));

		const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
		expect(minedTransactionData).toMatchObject(transaction);
	});

	describe('Deploy and interact with contract', () => {
		let greeterContractAddress: string;

		it('should deploy a contract', async () => {
			const greeterContractDeploymentData =
				GreeterBytecode + encodeParameter('string', 'solyent green is people').slice(2);
			const deploymentGas = BigInt(1000000);
			const transaction: Transaction = {
				from: tempAcc.address,
				data: greeterContractDeploymentData,
				input: greeterContractDeploymentData,
				gas: deploymentGas,
				type: BigInt(2),
			};
			const response = await web3QRL.sendTransaction(transaction);
			expect(response.status).toBe(BigInt(1));
			expect(response.contractAddress).toBeDefined();

			const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
			expect(minedTransactionData).toMatchObject({
				from: tempAcc.address,
				input: greeterContractDeploymentData,
				gas: deploymentGas,
				type: BigInt(2),
			});

			greeterContractAddress = response.contractAddress as string;
		});

		it('should update greet in contract', async () => {
			// setGreeting('42'): selector + VM64-encoded string argument
			const contractFunctionCall = `0xa4136862${encodeParameter('string', '42').slice(2)}`;
			const transaction: Transaction = {
				from: tempAcc.address,
				to: greeterContractAddress,
				data: contractFunctionCall,
				input: contractFunctionCall,
				type: BigInt(2),
			};
			const response = await web3QRL.sendTransaction(transaction);
			expect(response.status).toBe(BigInt(1));

			const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
			expect(minedTransactionData).toMatchObject({
				from: tempAcc.address,
				to: greeterContractAddress,
				input: contractFunctionCall,
			});
		});
	});

	describe('Transaction Types', () => {
		it('should send a successful type 0x2 transaction', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
				value: BigInt(1),
				type: BigInt(2),
			};
			const response = await web3QRL.sendTransaction(transaction);
			expect(response.type).toBe(BigInt(2));
			expect(response.status).toBe(BigInt(1));

			const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
			expect(minedTransactionData).toMatchObject(transaction);
		});

		it('should send a successful type 0x2 transaction (fee per gas from: calculateFeeData)', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
				value: BigInt(1),
				type: BigInt(2),
			};

			const feeData = await web3QRL.calculateFeeData();
			transaction.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
			transaction.maxFeePerGas = feeData.maxFeePerGas;

			const response = await web3QRL.sendTransaction(transaction);
			expect(response.type).toBe(BigInt(2));
			expect(response.status).toBe(BigInt(1));

			const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
			expect(minedTransactionData).toMatchObject(transaction);
		});

		it('should send a successful type 0x2 transaction with data', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
				data: '0x64edfbf0e2c706ba4a09595315c45355a341a576cc17f3a19f43ac1c02f814ee',
				value: BigInt(1),
				type: BigInt(2),
			};
			const response = await web3QRL.sendTransaction(transaction, DEFAULT_RETURN_FORMAT);
			expect(response.type).toBe(BigInt(2));
			expect(response.status).toBe(BigInt(1));
			const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
			expect(minedTransactionData).toMatchObject(transaction);
		});
	});
	it('should autofill a successful type 0x2 transaction with only maxFeePerGas passed', async () => {
		const transaction: Transaction = {
			from: tempAcc.address,
			to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
			value: BigInt(1),
			maxFeePerGas: BigInt(2500000016),
		};
		const response = await web3QRL.sendTransaction(transaction);
		expect(response.type).toBe(BigInt(2));
		expect(response.status).toBe(BigInt(1));
		const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
		expect(minedTransactionData).toMatchObject(transaction);
	});

	it('should autofill a successful type 0x2 transaction with only maxPriorityFeePerGas passed', async () => {
		const transaction: Transaction = {
			from: tempAcc.address,
			to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
			value: BigInt(1),
			maxPriorityFeePerGas: BigInt(100),
		};
		const response = await web3QRL.sendTransaction(transaction);
		expect(response.type).toBe(BigInt(2));
		expect(response.status).toBe(BigInt(1));
		const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
		expect(minedTransactionData).toMatchObject(transaction);
	});

	it('should send type 0x2 transaction with maxPriorityFeePerGas got from await web3QRL.getMaxPriorityFeePerGas()', async () => {
		const transaction: Transaction = {
			from: tempAcc.address,
			to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
			value: BigInt(1),
			maxPriorityFeePerGas: await web3QRL.getMaxPriorityFeePerGas(),
		};
		const response = await web3QRL.sendTransaction(transaction);

		expect(response.type).toBe(BigInt(2));
		expect(response.status).toBe(BigInt(1));
		const minedTransactionData = await web3QRL.getTransaction(response.transactionHash);
		expect(minedTransactionData).toMatchObject(transaction);
	});

	describe('Transaction PromiEvents', () => {
		let transaction: Transaction;

		beforeEach(async () => {
			tempAcc = await createTempAccount();
			transaction = {
				from: tempAcc.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
				value: '0x1',
				type: '0x2',
			};
		});

		it('should listen to the sending event', async () => {
			await web3QRL.sendTransaction(transaction).on('sending', data => {
				expect(data).toMatchObject(transaction);
			});
			expect.assertions(1);
		});

		it('should listen to the sent event', async () => {
			await web3QRL.sendTransaction(transaction).on('sent', data => {
				expect(data).toMatchObject(transaction);
			});
			expect.assertions(1);
		});

		it('should listen to the transactionHash event', async () => {
			await web3QRL.sendTransaction(transaction).on('transactionHash', data => {
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
			await web3QRL.sendTransaction(transaction).on('receipt', data => {
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

			const sent = web3QRL.sendTransaction(transaction);
			const confirmation = new Promise<unknown>((resolve, reject) => {
				sent.once('confirmation', resolve);
				sent.once('error', reject);
			});
			await sent;
			expect(await confirmation).toEqual(
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

		it('Should throw InvalidResponseError because gas too low', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
				value: BigInt(1),
				gas: 1,
				type: BigInt(2),
			};

			const expectedThrownError = {
				name: 'InvalidResponseError',
				code: 101,
				innerError: {
					code: -32000,
					message: 'err: intrinsic gas too low: have 1, want 21000 (supplied gas 1)',
				},
			};

			await expect(
				web3QRL
					.sendTransaction(transaction)
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});

		it('Should throw InvalidResponseError because insufficient funds', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
				value: BigInt('999999999999999999999999999999999999999999999999999999999'),
				type: BigInt(2),
			};

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
					.sendTransaction(transaction)
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});

		it('Should throw TransactionRevertInstructionError because of contract revert and return revert reason', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: simpleRevertContractAddress,
				data: '0xba57a511000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000672657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				type: BigInt(2),
			};

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
					.sendTransaction(transaction)
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});

		it('Should throw TransactionRevertWithCustomError because of contract revert and return custom error ErrorWithNoParams', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: simpleRevertContractAddress,
				data: '0x3ebf4d9c',
				type: BigInt(2),
			};

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
					.sendTransaction(transaction, undefined, { contractAbi: SimpleRevertAbi })
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});

		it('Should throw TransactionRevertWithCustomError because of contract revert and return custom error ErrorWithParams', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: simpleRevertContractAddress,
				data: '0x819f48fe',
				type: BigInt(2),
			};

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
					.sendTransaction(transaction, undefined, { contractAbi: SimpleRevertAbi })
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});

		it('Should throw TransactionRevertInstructionError because of contract revert', async () => {
			const transaction: Transaction = {
				from: tempAcc.address,
				to: simpleRevertContractAddress,
				data: '0xba57a511000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000672657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
				type: BigInt(2),
			};

			web3QRL.handleRevert = false;

			const expectedThrownError = {
				name: 'TransactionRevertInstructionError',
				code: 402,
				reason:
					getSystemTestBackend() === 'gqrl'
						? 'execution reverted: This is a send revert'
						: 'VM Exception while processing transaction: revert This is a send revert',
				signature: '0x08c379a0',
				data: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000155468697320697320612073656e642072657665727400000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
			};

			await expect(
				web3QRL
					.sendTransaction(transaction)
					.on('error', error => expect(error).toMatchObject(expectedThrownError)),
			).rejects.toMatchObject(expectedThrownError);
		});
	});
});
