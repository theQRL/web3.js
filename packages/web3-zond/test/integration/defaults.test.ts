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
// eslint-disable-next-line import/no-extraneous-dependencies
import { Contract } from '@theqrl/web3-zond-contract';
import { hexToNumber, numberToHex } from '@theqrl/web3-utils';
import { TransactionBuilder, TransactionTypeParser, Web3Context, Web3PromiEvent } from '@theqrl/web3-core';
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
	prepareTransactionForSigning,
	SendTransactionEvents,
	transactionBuilder,
	Web3Zond,
} from '../../src';

import {
	closeOpenConnection,
	createNewAccount,
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
	let web3Zond: Web3Zond;
	let zond2: Web3Zond;
	let clientUrl: string | SupportedProviders;
	let contract: Contract<typeof BasicAbi>;
	let deployOptions: Record<string, unknown>;
	let sendOptions: Record<string, unknown>;
	let tempAcc: { address: string; seed: string };

	beforeEach(async () => {
		clientUrl = getSystemTestProvider();
		web3Zond = new Web3Zond(clientUrl);
		tempAcc = await createTempAccount();
		contract = new Contract(BasicAbi, web3Zond.getContextObject() as any);
		deployOptions = {
			data: BasicBytecode,
			arguments: [10, 'string init value'],
		};
		sendOptions = { from: tempAcc.address, /*gas: '1000000'*/ type: 2 };
	});

	afterEach(async () => {
		await closeOpenConnection(web3Zond);
		await closeOpenConnection(zond2);
	});

	describe('defaults', () => {
		it('defaultAccount', async () => {
			const tempAcc2 = await createTempAccount();
			const tempAcc3 = await createTempAccount();
			const contractMsgFrom = await new Contract(
				MsgSenderAbi,
				web3Zond.getContextObject() as any,
			)
				.deploy({
					data: MsgSenderBytecode,
					arguments: ['test'],
				})
				.send({ from: tempAcc2.address, /*gas: '2700000',*/ type: 2 });
			// default
			expect(web3Zond.defaultAccount).toBeUndefined();

			// after set
			web3Zond.setConfig({
				defaultAccount: tempAcc.address,
			});
			expect(web3Zond.defaultAccount).toBe(tempAcc.address);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					defaultAccount: tempAcc3.address,
				},
			});
			expect(zond2.defaultAccount).toBe(tempAcc3.address);

			// check utils
			expect(getTransactionFromOrToAttr('from', zond2)).toBe(tempAcc3.address);
			// TODO: after handleRevert implementation https://github.com/ChainSafe/web3.js/issues/5069 add following tests in future release
			//  set handleRevert true and test following functions with invalid input tx data and see revert reason present in error details:
			contractMsgFrom.setConfig({
				defaultAccount: tempAcc.address,
			});

			const tx = await contractMsgFrom.methods
				.setTestString('test2')
				.send({ type: 2 });
				//.send({ gas: '1000000' });
			const txSend = await web3Zond.sendTransaction({
				to: tempAcc2.address,
				value: '0x1',
				type: BigInt(2),
			});
			expect(tx.from).toBe(tempAcc.address.toLowerCase());
			expect(txSend.from).toBe(tempAcc.address.toLowerCase());

			const tx2 = await contractMsgFrom.methods.setTestString('test3').send({
				from: tempAcc2.address,
				type: 2,
			});
			const tx2Send = await web3Zond.sendTransaction({
				to: tempAcc.address,
				value: '0x1',
				from: tempAcc2.address,
				type: BigInt(2),
			});
			expect(tx2.from).toBe(tempAcc2.address.toLowerCase());
			expect(tx2Send.from).toBe(tempAcc2.address.toLowerCase());

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
            //TO DO: after handleRevert implementation https://github.com/ChainSafe/web3.js/issues/5069 add following tests in future release
            /* set handleRevert true and test following functions with invalid input tx data and see revert reason present in error details:

            web3.zond.call()
            web3.zond.sendTransaction()
            contract.methods.myMethod(…).send(…)
            contract.methods.myMethod(…).call(…)

            */
			// default
			expect(web3Zond.handleRevert).toBe(false);

			// after set
			web3Zond.setConfig({
				handleRevert: true,
			});
			expect(web3Zond.handleRevert).toBe(true);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					handleRevert: true,
				},
			});
			expect(zond2.handleRevert).toBe(true);
		});
		it('defaultBlock', async () => {
			const contractDeployed = await contract.deploy(deployOptions).send(sendOptions);
			// default
			expect(web3Zond.defaultBlock).toBe('latest');

			web3Zond.setConfig({
				defaultBlock: 'safe',
			});
			expect(web3Zond.defaultBlock).toBe('safe');

			web3Zond.setConfig({
				defaultBlock: 'finalized',
			});
			expect(web3Zond.defaultBlock).toBe('finalized');

			// after set
			web3Zond.setConfig({
				defaultBlock: 'earliest',
			});
			expect(web3Zond.defaultBlock).toBe('earliest');

			// set by create new instance
			zond2 = new Web3Zond({
				provider: web3Zond.provider,
				config: {
					defaultBlock: 'earliest',
				},
			});
			expect(zond2.defaultBlock).toBe('earliest');

			// check implementation
			const acc = await createNewAccount({ refill: true});

			await sendFewTxes({
				from: acc.address,
				times: 1,
				value: '0x1',
			});
			const balance = await zond2.getBalance(acc.address);
			const code = await zond2.getCode(contractDeployed?.options?.address as string);
			const storage = await zond2.getStorageAt(
				contractDeployed?.options?.address as string,
				0,
			);
			const transactionCount = await zond2.getTransactionCount(acc.address);
			expect(storage === '0x' ? 0 : Number(hexToNumber(storage))).toBe(0);
			expect(code).toBe('0x');
			expect(balance).toBe(BigInt(0));
			expect(transactionCount).toBe(BigInt(0));

			// pass blockNumber to rewrite defaultBlockNumber
			const balanceWithBlockNumber = await zond2.getBalance(acc.address, 'latest');
			const transactionCountWithBlockNumber = await zond2.getTransactionCount(
				acc.address,
				'latest',
			);
			const codeWithBlockNumber = await zond2.getCode(
				contractDeployed?.options?.address as string,
				'latest',
			);
			const storageWithBlockNumber = await zond2.getStorageAt(
				contractDeployed?.options?.address as string,
				0,
				'latest',
			);
			expect(Number(hexToNumber(storageWithBlockNumber))).toBe(10);
			expect(transactionCountWithBlockNumber).toBe(BigInt(1));
			expect(Number(balanceWithBlockNumber)).toBeGreaterThan(0);
			expect(codeWithBlockNumber.startsWith(BasicBytecode.slice(0, 10))).toBe(true);

			// set new default block to config
			zond2.setConfig({
				defaultBlock: 'latest',
			});
			const balanceLatest = await zond2.getBalance(acc.address);
			const codeLatest = await zond2.getCode(contractDeployed?.options?.address as string);
			const storageLatest = await zond2.getStorageAt(
				contractDeployed?.options?.address as string,
				0,
			);
			const transactionCountLatest = await zond2.getTransactionCount(acc.address);
			expect(codeLatest.startsWith(BasicBytecode.slice(0, 10))).toBe(true);
			expect(Number(hexToNumber(storageLatest))).toBe(10);
			expect(transactionCountLatest).toBe(BigInt(1));
			expect(Number(balanceLatest)).toBeGreaterThan(0);
		});
		it('transactionSendTimeout', () => {
			// default
			expect(web3Zond.transactionSendTimeout).toBe(750 * 1000);

			// after set
			web3Zond.setConfig({
				transactionSendTimeout: 1,
			});
			expect(web3Zond.transactionSendTimeout).toBe(1);

			// set by create new instance
			zond2 = new Web3Zond({
				provider: web3Zond.provider,
				config: {
					transactionSendTimeout: 120,
				},
			});
			expect(zond2.transactionSendTimeout).toBe(120);
		});
		it('transactionBlockTimeout', () => {
			// default
			expect(web3Zond.transactionBlockTimeout).toBe(50);

			// after set
			web3Zond.setConfig({
				transactionBlockTimeout: 1,
			});
			expect(web3Zond.transactionBlockTimeout).toBe(1);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					transactionBlockTimeout: 120,
				},
			});
			expect(zond2.transactionBlockTimeout).toBe(120);
		});
		it('transactionConfirmationBlocks', () => {
			// default
			// eslint-disable-next-line jest/no-standalone-expect
			expect(web3Zond.transactionConfirmationBlocks).toBe(24);

			// after set
			web3Zond.setConfig({
				transactionConfirmationBlocks: 3,
			});
			// eslint-disable-next-line jest/no-standalone-expect
			expect(web3Zond.transactionConfirmationBlocks).toBe(3);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					transactionConfirmationBlocks: 4,
				},
			});
			// eslint-disable-next-line jest/no-standalone-expect
			expect(zond2.transactionConfirmationBlocks).toBe(4);
		});
		it('transactionConfirmationBlocks implementation', async () => {
			const tempAcc2 = await createTempAccount();
			const waitConfirmations = 1;
			const zond = new Web3Zond(web3Zond.provider);
			zond.setConfig({ transactionConfirmationBlocks: waitConfirmations });

			const from = tempAcc.address;
			const to = tempAcc2.address;
			const value = `0x1`;
			const sentTx: Web3PromiEvent<
				TransactionReceipt,
				SendTransactionEvents<typeof DEFAULT_RETURN_FORMAT>
			> = zond.sendTransaction({
				to,
				value,
				from,
				type: BigInt(2),
			});

			const receiptPromise = new Promise((resolve: Resolve) => {
				// Tx promise is handled separately
				// eslint-disable-next-line no-void
				void sentTx.on('receipt', (params: TransactionReceipt) => {
					expect(Number(params.status)).toBe(1);
					resolve();
				});
			});
			let shouldBe = 1;
			const confirmationPromise = new Promise((resolve: Resolve) => {
				// Tx promise is handled separately
				// eslint-disable-next-line no-void
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
			await closeOpenConnection(zond);
		});
		it('transactionPollingInterval and transactionPollingTimeout', () => {
			// default
			expect(web3Zond.transactionPollingInterval).toBe(1000);
			expect(web3Zond.transactionPollingTimeout).toBe(750 * 1000);

			// after set
			web3Zond.setConfig({
				transactionPollingInterval: 3,
				transactionPollingTimeout: 10,
			});
			expect(web3Zond.transactionPollingInterval).toBe(3);
			expect(web3Zond.transactionPollingTimeout).toBe(10);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					transactionPollingInterval: 400,
					transactionPollingTimeout: 10,
				},
			});
			expect(zond2.transactionPollingInterval).toBe(400);
			expect(zond2.transactionPollingTimeout).toBe(10);
		});
		// todo will work with not instance mining
		// itIf(isHttp)('transactionReceiptPollingInterval and transactionConfirmationPollingInterval implementation', async () => {
		//     zond2 = new Web3Zond({
		//         provider: web3Zond.provider,
		//         config: {
		//             transactionPollingInterval: 400,
		//             transactionPollingTimeout: 10,
		//         },
		//     });
		//
		//     const sentTx: Web3PromiEvent<TransactionReceipt, SendTransactionEvents> = zond2.sendTransaction({
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
		//     const sentTx2: Web3PromiEvent<TransactionReceipt, SendTransactionEvents> = zond2.sendTransaction({
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
			expect(web3Zond.transactionReceiptPollingInterval).toBeUndefined();
			expect(web3Zond.transactionConfirmationPollingInterval).toBeUndefined();

			// after set
			web3Zond.setConfig({
				transactionReceiptPollingInterval: 3,
				transactionConfirmationPollingInterval: 10,
			});
			expect(web3Zond.transactionReceiptPollingInterval).toBe(3);
			expect(web3Zond.transactionConfirmationPollingInterval).toBe(10);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					transactionReceiptPollingInterval: 400,
					transactionConfirmationPollingInterval: 10,
				},
			});
			expect(zond2.transactionReceiptPollingInterval).toBe(400);
			expect(zond2.transactionConfirmationPollingInterval).toBe(10);
		});
		it('blockHeaderTimeout', () => {
			// default
			expect(web3Zond.blockHeaderTimeout).toBe(10);

			// after set
			web3Zond.setConfig({
				blockHeaderTimeout: 3,
			});
			expect(web3Zond.blockHeaderTimeout).toBe(3);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					blockHeaderTimeout: 4,
				},
			});
			expect(zond2.blockHeaderTimeout).toBe(4);
		});

		it('enableExperimentalFeatures useSubscriptionWhenCheckingBlockTimeout', () => {
			// default
			expect(web3Zond.enableExperimentalFeatures.useSubscriptionWhenCheckingBlockTimeout).toBe(
				false,
			);

			// after set
			web3Zond.setConfig({
				enableExperimentalFeatures: {
					useSubscriptionWhenCheckingBlockTimeout: true,
					useRpcCallSpecification: false,
				},
			});
			expect(web3Zond.enableExperimentalFeatures.useSubscriptionWhenCheckingBlockTimeout).toBe(
				true,
			);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					enableExperimentalFeatures: {
						useSubscriptionWhenCheckingBlockTimeout: true,
						useRpcCallSpecification: false,
					},
				},
			});
			expect(zond2.enableExperimentalFeatures.useSubscriptionWhenCheckingBlockTimeout).toBe(
				true,
			);
		});

		it('enableExperimentalFeatures useRpcCallSpecification', () => {
			// default
			expect(web3Zond.enableExperimentalFeatures.useRpcCallSpecification).toBe(false);

			// after set
			web3Zond.setConfig({
				enableExperimentalFeatures: {
					useSubscriptionWhenCheckingBlockTimeout: false,
					useRpcCallSpecification: true,
				},
			});
			expect(web3Zond.enableExperimentalFeatures.useRpcCallSpecification).toBe(true);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					enableExperimentalFeatures: {
						useSubscriptionWhenCheckingBlockTimeout: false,
						useRpcCallSpecification: true,
					},
				},
			});
			expect(zond2.enableExperimentalFeatures.useRpcCallSpecification).toBe(true);
		});

		it('should fallback to polling if provider support `on` but `newBlockHeaders` does not arrive in `blockHeaderTimeout` seconds', async () => {
			const tempAcc2 = await createTempAccount();

			const tempZond: Web3Zond = new Web3Zond(clientUrl);
			// Ensure the provider supports subscriptions to simulate the test scenario
			// It will cause providers that does not support subscriptions (like http) to throw exception when subscribing.
			// This case is tested to ensure that even if an error happen at subscription,
			//	polling will still get the data from next blocks.
			(tempZond.provider as Web3BaseProvider).supportsSubscriptions = () => true;

			// Cause the events to take a long time (more than blockHeaderTimeout),
			//	to ensure that polling of new blocks works in such cases.
			// This will cause the providers that supports subscription (like WebSocket)
			// 	to never return data through listening to new events

			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			(tempZond.provider as Web3BaseProvider).on = async () => {
				await new Promise(res => {
					setTimeout(res, 1000000);
				});
			};

			// Make the test run faster by casing the polling to start after 1 second
			tempZond.blockHeaderTimeout = 1;
			const from = tempAcc2.address;
			const to = tempAcc.address;
			const value = `0x1`;

			const sentTx: Web3PromiEvent<
				TransactionReceipt,
				SendTransactionEvents<typeof DEFAULT_RETURN_FORMAT>
			> = tempZond.sendTransaction({
				from,
				to,
				value,
				type: BigInt(2),
			});

			const confirmationPromise = new Promise((resolve: (status: bigint) => void) => {
				// Tx promise is handled separately
				// eslint-disable-next-line no-void
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
							await tempZond.sendTransaction({
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
			await closeOpenConnection(tempZond);
		});
		it('maxListenersWarningThreshold test default config', () => {
			// default
			expect(web3Zond.maxListenersWarningThreshold).toBe(100);
		});
		it('maxListenersWarningThreshold set maxListeners through variable', () => {
			zond2 = new Web3Zond({});
			zond2.maxListenersWarningThreshold = 3;
			expect(zond2.maxListenersWarningThreshold).toBe(3);
			expect(zond2.getMaxListeners()).toBe(3);
		});
		it('maxListenersWarningThreshold set config', () => {
			const zond = new Web3Zond({});
			zond.setConfig({
				maxListenersWarningThreshold: 3,
			});
			expect(zond2.maxListenersWarningThreshold).toBe(3);
			expect(zond2.getMaxListeners()).toBe(3);
		});
		it('defaultNetworkId', async () => {
			// default
			expect(web3Zond.defaultNetworkId).toBeUndefined();

			// after set
			web3Zond.setConfig({
				defaultNetworkId: 3,
			});
			expect(web3Zond.defaultNetworkId).toBe(3);

			// set by create new instance
			zond2 = new Web3Zond({
				provider: web3Zond.provider,
				config: {
					defaultNetworkId: 4,
				},
			});
			expect(zond2.defaultNetworkId).toBe(4);
			const res = await defaultTransactionBuilder({
				transaction: {
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
				},
				web3Context: zond2 as Web3Context,
			});
			expect(res.networkId).toBe(4);

			// pass network id
			const resWithPassNetworkId = await defaultTransactionBuilder({
				transaction: {
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					networkId: 5,
				},
				web3Context: zond2 as Web3Context,
			});

			expect(resWithPassNetworkId.networkId).toBe(BigInt(5));
		});
		it('defaultChain', async () => {
			// default
			expect(web3Zond.defaultChain).toBe('mainnet');

			// after set
			web3Zond.setConfig({
				defaultChain: 'ropsten',
			});
			expect(web3Zond.defaultChain).toBe('ropsten');

			// set by create new instance
			zond2 = new Web3Zond({
				provider: web3Zond.provider,
				config: {
					defaultChain: 'rinkeby',
				},
			});
			expect(zond2.defaultChain).toBe('rinkeby');
			const res = await defaultTransactionBuilder({
				transaction: {
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
				},
				web3Context: zond2 as Web3Context,
			});
			expect(res.chain).toBe('rinkeby');
		});
		it('defaultHardfork', async () => {
			// default
			expect(web3Zond.defaultHardfork).toBe('london');

			// after set
			web3Zond.setConfig({
				defaultHardfork: 'dao',
			});
			expect(web3Zond.defaultHardfork).toBe('dao');

			// set by create new instance
			zond2 = new Web3Zond({
				provider: web3Zond.provider,
				config: {
					defaultHardfork: 'istanbul',
				},
			});
			expect(zond2.defaultHardfork).toBe('istanbul');

			const res = await prepareTransactionForSigning(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					gasPrice: '0x4a817c800',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
				},
				zond2,
			);
			expect(res.common.hardfork()).toBe('istanbul');
		});
		it('defaultCommon', () => {
			// default
			expect(web3Zond.defaultCommon).toBeUndefined();
			const baseChain: ValidChains = 'mainnet';
			const hardfork: Hardfork = 'dao';
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
			web3Zond.setConfig({
				defaultCommon: common,
			});
			expect(web3Zond.defaultCommon).toBe(common);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					defaultCommon: common,
				},
			});
			expect(zond2.defaultCommon).toBe(common);
		});
		it('defaultTransactionType', () => {
			// default
			expect(web3Zond.defaultTransactionType).toBe('0x0');
			// after set
			web3Zond.setConfig({
				defaultTransactionType: '0x3',
			});
			expect(web3Zond.defaultTransactionType).toBe('0x3');

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					defaultTransactionType: '0x4444',
				},
			});
			expect(zond2.defaultTransactionType).toBe('0x4444');

			const res = getTransactionType(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
				},
				zond2,
			);
			expect(res).toBe('0x4444');

			// test override to 0x2 if:
			// tx.maxFeePerGas !== undefined ||
			// tx.maxPriorityFeePerGas !== undefined ||
			// tx.hardfork === 'london' ||
			// tx.common?.hardfork === 'london'
			const maxFeePerGasOverride = getTransactionType(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					maxFeePerGas: '0x32',
				},
				zond2,
			);
			expect(maxFeePerGasOverride).toBe('0x2');
			const maxPriorityFeePerGasOverride = getTransactionType(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					maxPriorityFeePerGas: '0x32',
				},
				zond2,
			);
			expect(maxPriorityFeePerGasOverride).toBe('0x2');
			const hardforkOverride = getTransactionType(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					hardfork: 'london',
				},
				zond2,
			);
			expect(hardforkOverride).toBe('0x2');
			const commonOverride = getTransactionType(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					common: {
						customChain: { name: 'ropsten', networkId: '2', chainId: '0x1' },
						hardfork: 'london',
					},
				},
				zond2,
			);
			expect(commonOverride).toBe('0x2');

			// override to 0x1 if:
			// tx.accessList !== undefined || tx.hardfork === 'berlin' || tx.common?.hardfork === 'berlin'

			const accessListOverride = getTransactionType(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					accessList: [
						{
							address: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
							storageKeys: ['0x3535353535353535353535353535353535353535'],
						},
					],
				},
				zond2,
			);
			expect(accessListOverride).toBe('0x1');

			const hardforkBerlinOverride = getTransactionType(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					hardfork: 'berlin',
				},
				zond2,
			);
			expect(hardforkBerlinOverride).toBe('0x0');

			const commonBerlinOverride = getTransactionType(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					common: {
						customChain: { name: 'ropsten', networkId: '2', chainId: '0x1' },
						hardfork: 'berlin',
					},
				},
				zond2,
			);
			expect(commonBerlinOverride).toBe('0x0');
		});
		it('defaultMaxPriorityFeePerGas', async () => {
			// default
			expect(web3Zond.defaultMaxPriorityFeePerGas).toBe(numberToHex(2500000000));
			// after set
			web3Zond.setConfig({
				defaultMaxPriorityFeePerGas: numberToHex(2100000000),
			});
			expect(web3Zond.defaultMaxPriorityFeePerGas).toBe(numberToHex(2100000000));

			// set by create new instance
			zond2 = new Web3Zond({
				provider: web3Zond.provider,
				config: {
					defaultMaxPriorityFeePerGas: numberToHex(1200000000),
				},
			});
			expect(zond2.defaultMaxPriorityFeePerGas).toBe(numberToHex(1200000000));

			const res = await getTransactionGasPricing(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					type: '0x2',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
				},
				zond2,
				DEFAULT_RETURN_FORMAT,
			);
			expect(res?.maxPriorityFeePerGas).toBe(BigInt(1200000000));

			// override test
			const resOverride = await getTransactionGasPricing(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					type: '0x2',
					gas: '0x5208',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
					maxPriorityFeePerGas: '0x123123123',
				},
				zond2,
				DEFAULT_RETURN_FORMAT,
			);
			expect(resOverride?.maxPriorityFeePerGas).toBe(BigInt('4883362083'));
		});
		it('transactionBuilder', async () => {
			// default
			expect(web3Zond.transactionBuilder).toBeUndefined();

			// default
			expect(web3Zond.transactionBuilder).toBeUndefined();

			const newBuilderMock = jest.fn() as unknown as TransactionBuilder;

			web3Zond.setConfig({
				transactionBuilder: newBuilderMock,
			});
			expect(web3Zond.transactionBuilder).toBe(newBuilderMock);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					transactionBuilder: newBuilderMock,
				},
			});
			expect(zond2.transactionBuilder).toBe(newBuilderMock);

			await transactionBuilder({
				transaction: {
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					gasPrice: '0x4a817c800',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
				},
				web3Context: zond2,
			});
			expect(newBuilderMock).toHaveBeenCalled();
		});
		it('transactionTypeParser', () => {
			// default
			expect(web3Zond.transactionTypeParser).toBeUndefined();

			const newParserMock = jest.fn() as unknown as TransactionTypeParser;

			web3Zond.setConfig({
				transactionTypeParser: newParserMock,
			});
			expect(web3Zond.transactionTypeParser).toBe(newParserMock);

			// set by create new instance
			zond2 = new Web3Zond({
				config: {
					transactionTypeParser: newParserMock,
				},
			});
			expect(zond2.transactionTypeParser).toBe(newParserMock);
			detectTransactionType(
				{
					from: '0xEB014f8c8B418Db6b45774c326A0E64C78914dC0',
					to: '0x3535353535353535353535353535353535353535',
					value: '0x174876e800',
					gas: '0x5208',
					gasPrice: '0x4a817c800',
					data: '0x0',
					nonce: '0x4',
					chainId: '0x1',
					gasLimit: '0x5208',
				},
				zond2,
			);
			expect(newParserMock).toHaveBeenCalled();
		});
	});
});
