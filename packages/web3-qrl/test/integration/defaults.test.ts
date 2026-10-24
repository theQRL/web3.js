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
import { Contract } from '@theqrl/web3-qrl-contract';
import { hexToNumber, numberToHex } from '@theqrl/web3-utils';
import { InvalidMethodParamsError } from '@theqrl/web3-errors';
import {
	TransactionBuilder,
	TransactionTypeParser,
	Web3Context,
	Web3PromiEvent,
} from '@theqrl/web3-core';
import {
	Hardfork,
	SupportedProviders,
	TransactionReceipt,
	ValidChains,
	Web3BaseProvider,
	DEFAULT_RETURN_FORMAT,
} from '@theqrl/web3-types';
import {
	detectTransactionType,
	SendTransactionEvents,
	transactionBuilder,
	Web3QRL,
} from '../../src';

import {
	closeOpenConnection,
	// createNewAccount,
	createTempAccount,
	getSystemTestProvider,
	isIpc,
	sendFewSampleTxs,
} from '../fixtures/system_test_utils';

import {
	defaultTransactionBuilder,
	getTransactionFromOrToAttr,
	getTransactionType,
} from '../../src/utils';
import { BasicAbi, BasicBytecode } from '../shared_fixtures/build/Basic';
import { MsgSenderAbi, MsgSenderBytecode } from '../shared_fixtures/build/MsgSender';
import { getTransactionGasPricing } from '../../src/utils/get_transaction_gas_pricing';
import { Resolve, sendFewTxes } from './helper';

describe('defaults', () => {
	let web3QRL: Web3QRL;
	let qrl2: Web3QRL;
	let clientUrl: string | SupportedProviders;
	let contract: Contract<typeof BasicAbi>;
	let deployOptions: Record<string, unknown>;
	let sendOptions: Record<string, unknown>;
	let tempAcc: { address: string; seed: string };

	beforeEach(async () => {
		clientUrl = getSystemTestProvider();
		web3QRL = new Web3QRL(clientUrl);
		tempAcc = await createTempAccount();
		contract = new Contract(BasicAbi, web3QRL.getContextObject() as any);
		deployOptions = {
			data: BasicBytecode,
			arguments: [10, 'string init value'],
		};
		sendOptions = { from: tempAcc.address /* gas: '1000000' */ };
	});

	afterEach(async () => {
		await closeOpenConnection(web3QRL);
		await closeOpenConnection(qrl2);
	});

	describe('defaults', () => {
		it('defaultAccount', async () => {
			const tempAcc2 = await createTempAccount();
			const tempAcc3 = await createTempAccount();
			const contractMsgFrom = await new Contract(
				MsgSenderAbi,
				web3QRL.getContextObject() as any,
			)
				.deploy({
					data: MsgSenderBytecode,
					arguments: ['test'],
				})
				.send({ from: tempAcc2.address /* gas: '2700000', */ });
			// default
			expect(web3QRL.defaultAccount).toBeUndefined();

			// after set
			web3QRL.setConfig({
				defaultAccount: tempAcc.address,
			});
			expect(web3QRL.defaultAccount).toBe(tempAcc.address);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					defaultAccount: tempAcc3.address,
				},
			});
			expect(qrl2.defaultAccount).toBe(tempAcc3.address);

			// check utils
			expect(getTransactionFromOrToAttr('from', qrl2)).toBe(tempAcc3.address);
			// TODO: after handleRevert implementation https://github.com/theqrl/web3.js/issues/5069 add following tests in future release
			//  set handleRevert true and test following functions with invalid input tx data and see revert reason present in error details:
			contractMsgFrom.setConfig({
				defaultAccount: tempAcc.address,
			});

			const tx = await contractMsgFrom.methods.setTestString('test2').send();
			// .send({ gas: '1000000' });
			const txSend = await web3QRL.sendTransaction({
				to: tempAcc2.address,
				value: '0x1',
				type: BigInt(2),
			});
			expect(tx.from).toBe(tempAcc.address);
			expect(txSend.from).toBe(tempAcc.address);

			const tx2 = await contractMsgFrom.methods.setTestString('test3').send({
				from: tempAcc2.address,
			});
			const tx2Send = await web3QRL.sendTransaction({
				to: tempAcc.address,
				value: '0x1',
				from: tempAcc2.address,
			});
			expect(tx2.from).toBe(tempAcc2.address);
			expect(tx2Send.from).toBe(tempAcc2.address);

			const fromDefault = await contractMsgFrom.methods?.from().call();
			const fromPass = await contractMsgFrom.methods?.from().call({ from: tempAcc.address });
			const fromPass2 = await contractMsgFrom.methods
				?.from()
				.call({ from: tempAcc2.address });
			expect((fromDefault as unknown as string).toLowerCase()).toBe(
				tempAcc.address.toLowerCase(),
			);
			expect((fromPass as unknown as string).toLowerCase()).toBe(
				tempAcc.address.toLowerCase(),
			);
			expect((fromPass2 as unknown as string).toLowerCase()).toBe(
				tempAcc2.address.toLowerCase(),
			);
		});
		it('handleRevert', () => {
			/*
            //TO DO: after handleRevert implementation https://github.com/theqrl/web3.js/issues/5069 add following tests in future release
            /* set handleRevert true and test following functions with invalid input tx data and see revert reason present in error details:

            web3.qrl.call()
            web3.qrl.sendTransaction()
            contract.methods.myMethod(…).send(…)
            contract.methods.myMethod(…).call(…)

            */
			// default
			expect(web3QRL.handleRevert).toBe(false);

			// after set
			web3QRL.setConfig({
				handleRevert: true,
			});
			expect(web3QRL.handleRevert).toBe(true);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					handleRevert: true,
				},
			});
			expect(qrl2.handleRevert).toBe(true);
		});
		it('defaultBlock', async () => {
			const contractDeployed = await contract.deploy(deployOptions).send(sendOptions);
			// default
			expect(web3QRL.defaultBlock).toBe('latest');

			web3QRL.setConfig({
				defaultBlock: 'safe',
			});
			expect(web3QRL.defaultBlock).toBe('safe');

			web3QRL.setConfig({
				defaultBlock: 'finalized',
			});
			expect(web3QRL.defaultBlock).toBe('finalized');

			// after set
			web3QRL.setConfig({
				defaultBlock: 'earliest',
			});
			expect(web3QRL.defaultBlock).toBe('earliest');

			// set by create new instance
			qrl2 = new Web3QRL({
				provider: web3QRL.provider,
				config: {
					defaultBlock: 'earliest',
				},
			});
			expect(qrl2.defaultBlock).toBe('earliest');

			// check implementation
			// const acc = await createNewAccount({ refill: true });
			const acc = await createTempAccount();

			await sendFewTxes({
				from: acc.address,
				times: 1,
				value: '0x1',
			});
			// const balance = await qrl2.getBalance(acc.address);
			const code = await qrl2.getCode(contractDeployed?.options?.address as string);
			const storage = await qrl2.getStorageAt(
				contractDeployed?.options?.address as string,
				0,
			);
			const transactionCount = await qrl2.getTransactionCount(acc.address);
			expect(storage === '0x' ? 0 : Number(hexToNumber(storage))).toBe(0);
			expect(code).toBe('0x');
			// expect(balance).toBe(BigInt(0));
			expect(transactionCount).toBe(BigInt(0));

			// pass blockNumber to rewrite defaultBlockNumber
			const balanceWithBlockNumber = await qrl2.getBalance(acc.address, 'latest');
			// const transactionCountWithBlockNumber = await qrl2.getTransactionCount(
			// 	acc.address,
			// 	'latest',
			// );
			const codeWithBlockNumber = await qrl2.getCode(
				contractDeployed?.options?.address as string,
				'latest',
			);
			const storageWithBlockNumber = await qrl2.getStorageAt(
				contractDeployed?.options?.address as string,
				0,
				'latest',
			);
			expect(Number(hexToNumber(storageWithBlockNumber))).toBe(10);
			// expect(transactionCountWithBlockNumber).toBe(BigInt(1));
			expect(Number(balanceWithBlockNumber)).toBeGreaterThan(0);
			expect(codeWithBlockNumber.startsWith(BasicBytecode.slice(0, 10))).toBe(true);

			// set new default block to config
			qrl2.setConfig({
				defaultBlock: 'latest',
			});
			const balanceLatest = await qrl2.getBalance(acc.address);
			const codeLatest = await qrl2.getCode(contractDeployed?.options?.address as string);
			const storageLatest = await qrl2.getStorageAt(
				contractDeployed?.options?.address as string,
				0,
			);
			// const transactionCountLatest = await qrl2.getTransactionCount(acc.address);
			expect(codeLatest.startsWith(BasicBytecode.slice(0, 10))).toBe(true);
			expect(Number(hexToNumber(storageLatest))).toBe(10);
			// expect(transactionCountLatest).toBe(BigInt(1));
			expect(Number(balanceLatest)).toBeGreaterThan(0);
		});
		it('transactionSendTimeout', () => {
			// default
			expect(web3QRL.transactionSendTimeout).toBe(750 * 1000);

			// after set
			web3QRL.setConfig({
				transactionSendTimeout: 1,
			});
			expect(web3QRL.transactionSendTimeout).toBe(1);

			// set by create new instance
			qrl2 = new Web3QRL({
				provider: web3QRL.provider,
				config: {
					transactionSendTimeout: 120,
				},
			});
			expect(qrl2.transactionSendTimeout).toBe(120);
		});
		it('transactionBlockTimeout', () => {
			// default
			expect(web3QRL.transactionBlockTimeout).toBe(50);

			// after set
			web3QRL.setConfig({
				transactionBlockTimeout: 1,
			});
			expect(web3QRL.transactionBlockTimeout).toBe(1);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					transactionBlockTimeout: 120,
				},
			});
			expect(qrl2.transactionBlockTimeout).toBe(120);
		});
		it('transactionConfirmationBlocks', () => {
			// default
			expect(web3QRL.transactionConfirmationBlocks).toBe(24);

			// after set
			web3QRL.setConfig({
				transactionConfirmationBlocks: 3,
			});
			expect(web3QRL.transactionConfirmationBlocks).toBe(3);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					transactionConfirmationBlocks: 4,
				},
			});
			expect(qrl2.transactionConfirmationBlocks).toBe(4);
		});
		it('transactionConfirmationBlocks implementation', async () => {
			const tempAcc2 = await createTempAccount();
			const waitConfirmations = 1;
			const qrl = new Web3QRL(web3QRL.provider);
			qrl.setConfig({ transactionConfirmationBlocks: waitConfirmations });

			const from = tempAcc.address;
			const to = tempAcc2.address;
			const value = `0x1`;
			const sentTx: Web3PromiEvent<
				TransactionReceipt,
				SendTransactionEvents<typeof DEFAULT_RETURN_FORMAT>
			> = qrl.sendTransaction({
				to,
				value,
				from,
				type: BigInt(2),
			});

			const receiptPromise = new Promise((resolve: Resolve) => {
				// Tx promise is handled separately
				void sentTx.on('receipt', (params: TransactionReceipt) => {
					expect(Number(params.status)).toBe(1);
					resolve();
				});
			});
			let shouldBe = 1;
			const confirmationPromise = new Promise((resolve: Resolve) => {
				// Tx promise is handled separately
				void sentTx.on('confirmation', ({ confirmations }) => {
					expect(Number(confirmations)).toBeGreaterThanOrEqual(shouldBe);
					shouldBe += 1;
					if (shouldBe > waitConfirmations) {
						resolve();
					}
				});
			});
			await sentTx;
			await receiptPromise;
			await sendFewSampleTxs(isIpc ? 2 * waitConfirmations : waitConfirmations);
			await confirmationPromise;
			await closeOpenConnection(qrl);
		});
		it('transactionPollingInterval and transactionPollingTimeout', () => {
			// default
			expect(web3QRL.transactionPollingInterval).toBe(1000);
			expect(web3QRL.transactionPollingTimeout).toBe(750 * 1000);

			// after set
			web3QRL.setConfig({
				transactionPollingInterval: 3,
				transactionPollingTimeout: 10,
			});
			expect(web3QRL.transactionPollingInterval).toBe(3);
			expect(web3QRL.transactionPollingTimeout).toBe(10);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					transactionPollingInterval: 400,
					transactionPollingTimeout: 10,
				},
			});
			expect(qrl2.transactionPollingInterval).toBe(400);
			expect(qrl2.transactionPollingTimeout).toBe(10);
		});
		// todo will work with not instance mining
		// itIf(isHttp)('transactionReceiptPollingInterval and transactionConfirmationPollingInterval implementation', async () => {
		//     qrl2 = new Web3QRL({
		//         provider: web3QRL.provider,
		//         config: {
		//             transactionPollingInterval: 400,
		//             transactionPollingTimeout: 10,
		//         },
		//     });
		//
		//     const sentTx: Web3PromiEvent<TransactionReceipt, SendTransactionEvents> = qrl2.sendTransaction({
		//         to: tempAcc2.address,
		//         value: '0x1',
		//         from: tempAcc.address,
		//     });
		//
		//     const res = await Promise.race([
		//         new Promise((resolve) => setTimeout(resolve, 410)),
		//         new Promise((resolve: Resolve) => {
		//             sentTx.on('receipt', (params: TransactionReceipt) => {
		//                 expect(params.status).toBe(BigInt(1));
		//                 resolve(params);
		//             });
		//         }),
		//     ]);
		//     expect((res as TransactionReceipt).status).toBe(BigInt(1));
		//
		//     const sentTx2: Web3PromiEvent<TransactionReceipt, SendTransactionEvents> = qrl2.sendTransaction({
		//         to: tempAcc2.address,
		//         value: '0x1',
		//         from: tempAcc.address,
		//     });
		//     const res2 = await Promise.race([
		//         new Promise((resolve) => setTimeout(()=>resolve(false), 300)),
		//         new Promise((resolve: Resolve) => {
		//             sentTx2.on('receipt', (params: TransactionReceipt) => {
		//                 expect(params.status).toBe(BigInt(1));
		//                 resolve(params);
		//             });
		//         }),
		//     ]);
		//     expect((res2 as boolean)).toBe(false);
		//
		//
		// });
		it('transactionReceiptPollingInterval and transactionConfirmationPollingInterval', () => {
			// default
			expect(web3QRL.transactionReceiptPollingInterval).toBeUndefined();
			expect(web3QRL.transactionConfirmationPollingInterval).toBeUndefined();

			// after set
			web3QRL.setConfig({
				transactionReceiptPollingInterval: 3,
				transactionConfirmationPollingInterval: 10,
			});
			expect(web3QRL.transactionReceiptPollingInterval).toBe(3);
			expect(web3QRL.transactionConfirmationPollingInterval).toBe(10);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					transactionReceiptPollingInterval: 400,
					transactionConfirmationPollingInterval: 10,
				},
			});
			expect(qrl2.transactionReceiptPollingInterval).toBe(400);
			expect(qrl2.transactionConfirmationPollingInterval).toBe(10);
		});
		it('blockHeaderTimeout', () => {
			// default
			expect(web3QRL.blockHeaderTimeout).toBe(10);

			// after set
			web3QRL.setConfig({
				blockHeaderTimeout: 3,
			});
			expect(web3QRL.blockHeaderTimeout).toBe(3);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					blockHeaderTimeout: 4,
				},
			});
			expect(qrl2.blockHeaderTimeout).toBe(4);
		});

		it('enableExperimentalFeatures useSubscriptionWhenCheckingBlockTimeout', () => {
			// default
			expect(web3QRL.enableExperimentalFeatures.useSubscriptionWhenCheckingBlockTimeout).toBe(
				false,
			);

			// after set
			web3QRL.setConfig({
				enableExperimentalFeatures: {
					useSubscriptionWhenCheckingBlockTimeout: true,
					useRpcCallSpecification: false,
				},
			});
			expect(web3QRL.enableExperimentalFeatures.useSubscriptionWhenCheckingBlockTimeout).toBe(
				true,
			);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					enableExperimentalFeatures: {
						useSubscriptionWhenCheckingBlockTimeout: true,
						useRpcCallSpecification: false,
					},
				},
			});
			expect(qrl2.enableExperimentalFeatures.useSubscriptionWhenCheckingBlockTimeout).toBe(
				true,
			);
		});

		it('enableExperimentalFeatures useRpcCallSpecification', () => {
			// default
			expect(web3QRL.enableExperimentalFeatures.useRpcCallSpecification).toBe(false);

			// after set
			web3QRL.setConfig({
				enableExperimentalFeatures: {
					useSubscriptionWhenCheckingBlockTimeout: false,
					useRpcCallSpecification: true,
				},
			});
			expect(web3QRL.enableExperimentalFeatures.useRpcCallSpecification).toBe(true);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					enableExperimentalFeatures: {
						useSubscriptionWhenCheckingBlockTimeout: false,
						useRpcCallSpecification: true,
					},
				},
			});
			expect(qrl2.enableExperimentalFeatures.useRpcCallSpecification).toBe(true);
		});

		it('should fallback to polling if provider support `on` but `newBlockHeaders` does not arrive in `blockHeaderTimeout` seconds', async () => {
			const tempAcc2 = await createTempAccount();

			const tempQRL: Web3QRL = new Web3QRL(clientUrl);
			// Ensure the provider supports subscriptions to simulate the test scenario
			// It will cause providers that does not support subscriptions (like http) to throw exception when subscribing.
			// This case is tested to ensure that even if an error happen at subscription,
			//	polling will still get the data from next blocks.
			(tempQRL.provider as Web3BaseProvider).supportsSubscriptions = () => true;

			// Cause the events to take a long time (more than blockHeaderTimeout),
			//	to ensure that polling of new blocks works in such cases.
			// This will cause the providers that supports subscription (like WebSocket)
			// 	to never return data through listening to new events

			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			(tempQRL.provider as Web3BaseProvider).on = async () => {
				await new Promise(res => {
					setTimeout(res, 1000000);
				});
			};

			// Make the test run faster by casing the polling to start after 1 second
			tempQRL.blockHeaderTimeout = 1;
			const from = tempAcc2.address;
			const to = tempAcc.address;
			const value = `0x1`;

			const sentTx: Web3PromiEvent<
				TransactionReceipt,
				SendTransactionEvents<typeof DEFAULT_RETURN_FORMAT>
			> = tempQRL.sendTransaction({
				from,
				to,
				value,
				type: BigInt(2),
			});

			const confirmationPromise = new Promise((resolve: (status: bigint) => void) => {
				// Tx promise is handled separately
				void sentTx.on(
					'confirmation',
					async ({
						confirmations,
						receipt: { status },
					}: {
						confirmations: bigint;
						receipt: { status: bigint };
					}) => {
						// Being able to get 2 confirmations means the pooling for new blocks works
						if (confirmations >= 2) {
							sentTx.removeAllListeners();
							resolve(status);
						} else {
							// Send a transaction to cause dev providers creating new blocks to fire the 'confirmation' event again.
							await tempQRL.sendTransaction({
								from,
								to,
								value,
								type: BigInt(2),
							});
						}
					},
				);
			});
			await sentTx;

			// Ensure the promise the get the confirmations resolves with no error
			const status = await confirmationPromise;
			expect(status).toBe(BigInt(1));
			await closeOpenConnection(tempQRL);
		});
		it('maxListenersWarningThreshold test default config', () => {
			// default
			expect(web3QRL.maxListenersWarningThreshold).toBe(100);
		});
		it('maxListenersWarningThreshold set maxListeners through variable', () => {
			qrl2 = new Web3QRL({});
			qrl2.maxListenersWarningThreshold = 3;
			expect(qrl2.maxListenersWarningThreshold).toBe(3);
			expect(qrl2.getMaxListeners()).toBe(3);
		});
		it('maxListenersWarningThreshold set config', () => {
			const qrl = new Web3QRL({});
			qrl.setConfig({
				maxListenersWarningThreshold: 3,
			});
			expect(qrl2.maxListenersWarningThreshold).toBe(3);
			expect(qrl2.getMaxListeners()).toBe(3);
		});
		it('defaultNetworkId', async () => {
			// default
			expect(web3QRL.defaultNetworkId).toBeUndefined();

			// after set
			web3QRL.setConfig({
				defaultNetworkId: 3,
			});
			expect(web3QRL.defaultNetworkId).toBe(3);

			// set by create new instance
			qrl2 = new Web3QRL({
				provider: web3QRL.provider,
				config: {
					defaultNetworkId: 4,
				},
			});
			expect(qrl2.defaultNetworkId).toBe(4);
			const res = await defaultTransactionBuilder({
				transaction: {
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
				},
				web3Context: qrl2 as Web3Context,
			});
			expect(res.networkId).toBe(4);

			// pass network id
			const resWithPassNetworkId = await defaultTransactionBuilder({
				transaction: {
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					networkId: 5,
				},
				web3Context: qrl2 as Web3Context,
			});

			expect(resWithPassNetworkId.networkId).toBe(BigInt(5));
		});
		it('defaultChain', async () => {
			// default
			expect(web3QRL.defaultChain).toBe('mainnet');

			// after set
			expect(() => web3QRL.setConfig({ defaultChain: 'ropsten' })).toThrow(
				InvalidMethodParamsError,
			);
			expect(web3QRL.defaultChain).toBe('mainnet');

			// set by create new instance
			qrl2 = new Web3QRL({
				provider: web3QRL.provider,
				config: {
					defaultChain: 'mainnet',
				},
			});
			expect(qrl2.defaultChain).toBe('mainnet');
			const res = await defaultTransactionBuilder({
				transaction: {
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
				},
				web3Context: qrl2 as Web3Context,
			});
			expect(res.chain).toBe('mainnet');
		});
		it('defaultHardfork rejects unsupported forks at configuration time', () => {
			// default
			expect(web3QRL.defaultHardfork).toBe('zond');

			// after set
			expect(() => web3QRL.setConfig({ defaultHardfork: 'dao' })).toThrow(
				InvalidMethodParamsError,
			);
			expect(web3QRL.defaultHardfork).toBe('zond');

			// set by create new instance
			expect(
				() =>
					new Web3QRL({
						provider: web3QRL.provider,
						config: { defaultHardfork: 'istanbul' },
					}),
			).toThrow(InvalidMethodParamsError);
		});
		it('defaultCommon', () => {
			// default
			expect(web3QRL.defaultCommon).toBeUndefined();
			const baseChain: ValidChains = 'mainnet';
			const hardfork: Hardfork = 'zond';
			const common = {
				customChain: {
					name: 'test',
					networkId: 123,
					chainId: 1234,
				},
				baseChain,
				hardfork,
			};
			// after set
			web3QRL.setConfig({
				defaultCommon: common,
			});
			expect(web3QRL.defaultCommon).toEqual(common);
			expect(web3QRL.defaultCommon).not.toBe(common);
			expect(Object.isFrozen(web3QRL.defaultCommon?.customChain)).toBe(true);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					defaultCommon: common,
				},
			});
			expect(qrl2.defaultCommon).toEqual(common);
			expect(qrl2.defaultCommon).not.toBe(common);
		});
		it('defaultTransactionType', () => {
			// default
			expect(web3QRL.defaultTransactionType).toBe('0x2');
			// after set
			web3QRL.setConfig({
				defaultTransactionType: '0x3',
			});
			expect(web3QRL.defaultTransactionType).toBe('0x3');

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					defaultTransactionType: '0x4444',
				},
			});
			expect(qrl2.defaultTransactionType).toBe('0x4444');

			const res = getTransactionType(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
				},
				qrl2,
			);
			expect(res).toBe('0x4444');

			const maxFeePerGasOverride = getTransactionType(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					maxFeePerGas: '0x32',
				},
				qrl2,
			);
			expect(maxFeePerGasOverride).toBe('0x2');
			const maxPriorityFeePerGasOverride = getTransactionType(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					maxPriorityFeePerGas: '0x32',
				},
				qrl2,
			);
			expect(maxPriorityFeePerGasOverride).toBe('0x2');
			const hardforkOverride = getTransactionType(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					hardfork: 'zond',
				},
				qrl2,
			);
			expect(hardforkOverride).toBe('0x2');
			const commonOverride = getTransactionType(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					common: {
						customChain: { name: 'ropsten', networkId: '2', chainId: '0x1' },
						hardfork: 'zond',
					},
				},
				qrl2,
			);
			expect(commonOverride).toBe('0x2');

			const accessListOverride = getTransactionType(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					maxPriorityFeePerGas: '',
					maxFeePerGas: '0x4a817c800',
					accessList: [
						{
							address:
								'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
							storageKeys: ['0x3535353535353535353535353535353535353535'],
						},
					],
				},
				qrl2,
			);
			expect(accessListOverride).toBe('0x2');

			const hardforkBerlinOverride = getTransactionType(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					hardfork: 'zond',
				},
				qrl2,
			);
			expect(hardforkBerlinOverride).toBe('0x2');

			const commonBerlinOverride = getTransactionType(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					common: {
						customChain: { name: 'ropsten', networkId: '2', chainId: '0x1' },
						hardfork: 'zond',
					},
				},
				qrl2,
			);
			expect(commonBerlinOverride).toBe('0x2');
		});
		it('defaultMaxPriorityFeePerGas', async () => {
			// default
			expect(web3QRL.defaultMaxPriorityFeePerGas).toBe(numberToHex(2500000000));
			// after set
			web3QRL.setConfig({
				defaultMaxPriorityFeePerGas: numberToHex(2100000000),
			});
			expect(web3QRL.defaultMaxPriorityFeePerGas).toBe(numberToHex(2100000000));

			// set by create new instance
			qrl2 = new Web3QRL({
				provider: web3QRL.provider,
				config: {
					defaultMaxPriorityFeePerGas: numberToHex(1200000000),
				},
			});
			expect(qrl2.defaultMaxPriorityFeePerGas).toBe(numberToHex(1200000000));

			const res = await getTransactionGasPricing(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					type: '0x2',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
				},
				qrl2,
				DEFAULT_RETURN_FORMAT,
			);
			expect(res?.maxPriorityFeePerGas).toBe(BigInt(1200000000));

			// override test
			const resOverride = await getTransactionGasPricing(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					type: '0x2',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					maxPriorityFeePerGas: '0x123123123',
				},
				qrl2,
				DEFAULT_RETURN_FORMAT,
			);
			expect(resOverride?.maxPriorityFeePerGas).toBe(BigInt('4883362083'));
		});
		it('transactionBuilder', async () => {
			// default
			expect(web3QRL.transactionBuilder).toBeUndefined();

			// default
			expect(web3QRL.transactionBuilder).toBeUndefined();

			const newBuilderMock = jest.fn() as unknown as TransactionBuilder;

			web3QRL.setConfig({
				transactionBuilder: newBuilderMock,
			});
			expect(web3QRL.transactionBuilder).toBe(newBuilderMock);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					transactionBuilder: newBuilderMock,
				},
			});
			expect(qrl2.transactionBuilder).toBe(newBuilderMock);

			await transactionBuilder({
				transaction: {
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					maxFeePerGas: '0x4a817c800',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
				},
				web3Context: qrl2,
			});
			expect(newBuilderMock).toHaveBeenCalled();
		});
		it('transactionTypeParser', () => {
			// default
			expect(web3QRL.transactionTypeParser).toBeUndefined();

			const newParserMock = jest.fn() as unknown as TransactionTypeParser;

			web3QRL.setConfig({
				transactionTypeParser: newParserMock,
			});
			expect(web3QRL.transactionTypeParser).toBe(newParserMock);

			// set by create new instance
			qrl2 = new Web3QRL({
				config: {
					transactionTypeParser: newParserMock,
				},
			});
			expect(qrl2.transactionTypeParser).toBe(newParserMock);
			detectTransactionType(
				{
					from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
					to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
					value: '0x174876e800',
					gas: '0x5208',
					maxFeePerGas: '0x4a817c800',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
				},
				qrl2,
			);
			expect(newParserMock).toHaveBeenCalled();
		});
	});
});
