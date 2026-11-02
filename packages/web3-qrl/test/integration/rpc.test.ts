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
	AbiEventFragment,
	TransactionReceipt,
	TransactionInfo,
	SupportedProviders,
	FMT_BYTES,
	FMT_NUMBER,
} from '@theqrl/web3-types';
import { Contract, decodeEventABI } from '@theqrl/web3-qrl-contract';
import {
	hexToNumber,
	hexToString,
	numberToHex,
	getStorageSlotNumForLongString,
} from '@theqrl/web3-utils';
import { Web3QRL } from '../../src';

import {
	closeOpenConnection,
	getSystemTestBackend,
	getSystemTestProvider,
	createNewAccount,
	itIf,
	createTempAccount,
} from '../fixtures/system_test_utils';
import { BasicAbi, BasicBytecode } from '../shared_fixtures/build/Basic';
import {
	eventAbi,
	mapFormatToType,
	sendFewTxes,
	validateReceipt,
	validateTransaction,
} from './helper';

describe('rpc', () => {
	let web3QRL: Web3QRL;
	let clientUrl: string | SupportedProviders;
	let contractDeployed: Contract<typeof BasicAbi>;
	let contract: Contract<typeof BasicAbi>;
	let deployOptions: Record<string, unknown>;
	let sendOptions: Record<string, unknown>;
	let tempAcc: { address: string; seed: string };
	beforeAll(async () => {
		clientUrl = getSystemTestProvider();
		web3QRL = new Web3QRL({
			provider: clientUrl,
			config: {
				transactionPollingTimeout: 15000,
			},
		});
		contract = new Contract(BasicAbi, undefined, {
			provider: clientUrl,
		});

		deployOptions = {
			data: BasicBytecode,
			arguments: [10, 'string init value'],
		};
		tempAcc = await createTempAccount();
		sendOptions = { from: tempAcc.address /* gas: '1000000' */ };

		contractDeployed = await contract.deploy(deployOptions).send(sendOptions);
	});

	afterAll(async () => {
		await closeOpenConnection(web3QRL);
		await closeOpenConnection(contract);
	});

	describe('methods', () => {
		// TODO:in beta,  test qrl_syncing during sync mode with return obj having ( startingblock, currentBlock, heighestBlock )
		it('isSyncing', async () => {
			const isSyncing = await web3QRL.isSyncing();
			expect(isSyncing).toBe(false);
		});

		it('getAccounts', async () => {
			const account = await createTempAccount();
			const accList = await web3QRL.getAccounts();
			const accListLowerCase = accList.map((add: string) => add.toLowerCase());
			expect(accListLowerCase).toContain(account.address.toLowerCase());
		});

		it.each(Object.values(FMT_NUMBER))('getBlockNumber', async format => {
			const res = await web3QRL.getBlockNumber({
				number: format as FMT_NUMBER,
				bytes: FMT_BYTES.HEX,
			});
			expect(typeof res).toBe(mapFormatToType[format as string]);
			expect(parseInt(String(res), 16)).toBeGreaterThan(0);
		});

		it.each(Object.values(FMT_NUMBER))('getGasPrice', async format => {
			const res = await web3QRL.getGasPrice({
				number: format as FMT_NUMBER,
				bytes: FMT_BYTES.HEX,
			});
			expect(typeof res).toBe(mapFormatToType[format as string]);
			expect(parseInt(String(res), 16)).toBeGreaterThan(0);
		});

		it.each(Object.values(FMT_NUMBER))('getBalance', async format => {
			const value = '0xa';
			const newAccount = await createNewAccount();
			await web3QRL.sendTransaction({
				to: newAccount.address,
				value,
				from: tempAcc.address,
				type: BigInt(2),
			});
			const res = await web3QRL.getBalance(newAccount.address, undefined, {
				number: format as FMT_NUMBER,
				bytes: FMT_BYTES.HEX,
			});
			expect(typeof res).toBe(mapFormatToType[format as string]);

			expect(numberToHex(res)).toBe(value);
		});

		it('getStorageAt', async () => {
			const numberData = 10;
			const stringData = 'str';
			const boolData = true;
			await contractDeployed.methods
				?.setValues(numberData, stringData, boolData)
				.send(sendOptions);
			const resNumber = await web3QRL.getStorageAt(
				contractDeployed.options.address as string,
				'0x0',
				undefined,
			);
			const resString = await web3QRL.getStorageAt(
				contractDeployed.options.address as string,
				'0x1',
				undefined,
			);
			const resBool = await web3QRL.getStorageAt(
				contractDeployed.options.address as string,
				'0x2',
				undefined,
			);

			expect(Number(resNumber)).toBe(numberData);

			const rString = hexToString(resString.slice(0, resString.length / 2 + 1))
				.split('')
				.filter(d => d !== '\x00')
				.join('');

			expect(rString).toHaveLength(stringData.length);
			expect(rString).toEqual(stringData);
			expect(Boolean(hexToNumber(resBool))).toBe(boolData);

			// long string data test
			const stringDataLong =
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit. In in interdum nibh, in viverra diam. Morbi eleifend diam sed erat malesuada molestie. Donec ultricies, mi et porta viverra, est magna tempus lorem, sit amet tempus mauris sapien vitae lacus. Duis at est quis nisl dictum accumsan eget et libero. Phasellus semper nibh et varius accumsan. Cras fringilla egestas dui, vitae bibendum enim tincidunt id. Donec condimentum lacinia nulla, eget elementum tortor tristique vel. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Ut ac risus tellus. Etiam nec neque et erat efficitur laoreet. Maecenas fermentum feugiat diam, ut ultricies ipsum mollis at. In in velit turpis. Vestibulum urna ipsum, vestibulum ut cursus ut, ullamcorper quis est.';
			await contractDeployed.methods
				?.setValues(numberData, stringDataLong, boolData)
				.send(sendOptions);

			const resStringLong = await web3QRL.getStorageAt(
				contractDeployed.options.address as string,
				1,
				undefined,
				{
					number: FMT_NUMBER.STR,
					bytes: FMT_BYTES.HEX,
				},
			);

			const slotCount = Math.ceil((Number(hexToNumber(resStringLong)) - 1) / 64);
			const slotDataNum = getStorageSlotNumForLongString(1);
			const prs: Promise<string>[] = [];
			for (let i = 0; i < slotCount; i += 1) {
				prs.push(
					web3QRL.getStorageAt(
						contractDeployed.options.address as string,
						`0x${(
							BigInt(String(hexToNumber(slotDataNum as string))) + BigInt(i)
						).toString(16)}`,
					),
				);
			}
			const str = (await Promise.all(prs))
				.map(t => hexToString(t))
				.join('')
				.split('')
				.filter(d => d !== '\x00')
				.join('');
			expect(stringDataLong).toBe(str);
		});

		it.each(Object.values(FMT_NUMBER))('getCode', async format => {
			const code = await web3QRL.getCode(
				contractDeployed?.options?.address as string,
				undefined,
				{
					number: format as FMT_NUMBER,
					bytes: FMT_BYTES.HEX,
				},
			);
			expect(code).toBeDefined();
			expect(BasicBytecode.slice(-100)).toBe(code.slice(-100));
		});

		it('getTransaction', async () => {
			const [receipt] = await sendFewTxes({
				from: tempAcc.address,
				value: '0x1',
				times: 1,
			});

			const res = await web3QRL.getTransaction(receipt.transactionHash);
			// TODO: after alpha release add tests for matching following (first get nonce of account sending tx and validate nonce with tx is incremented)
			// TODO: after alpha release add tests for matching following (from and to addresses)
			// TODO: after alpha release add tests for matching following (value transferred)
			// TODO: after alpha release add tests for matching following (specify some random inputData in tx and validate in test with getTransaction)

			validateTransaction(res as TransactionInfo, { type: 2 });
			expect(res?.hash).toBe(receipt.transactionHash);
		});

		it('getTransactionReceipt', async () => {
			const [receipt] = await sendFewTxes({
				from: tempAcc.address,
				value: '0x1',
				times: 1,
			});
			const res: TransactionReceipt = (await web3QRL.getTransactionReceipt(
				// TODO: add more scenarios in future release with block number
				receipt.transactionHash as string,
			))!;
			validateReceipt(res);
			expect(res?.transactionHash).toBe(receipt.transactionHash);
		});

		it('getChainId', async () => {
			const res = await web3QRL.getChainId({
				number: FMT_NUMBER.NUMBER,
				bytes: FMT_BYTES.HEX,
			});
			// TODO: in next release validate chain ID , it should match with chain id of connected client
			expect(Number(res)).toBeGreaterThan(0);
		});

		it('getNodeInfo', async () => {
			const res = await web3QRL.getNodeInfo();
			// TODO: in next release, it should also be validated
			expect(res).toBeDefined();
		});

		itIf(!['gqrl'].includes(getSystemTestBackend()))('requestAccounts', () => {
			// const res = await web3QRL.requestAccounts();
			expect(true).toBe(true);
			// expect(res[0]).toEqual(tempAcc.address);
		});

		it('getPastLogs', async () => {
			const listOfStrings = ['t1', 't2', 't3'];
			const resTx: TransactionReceipt[] = [];
			for (const l of listOfStrings) {
				// eslint-disable-next-line  no-await-in-loop
				resTx.push(await contractDeployed.methods?.firesStringEvent(l).send(sendOptions));
			}

			// test type hexstring
			const res: Array<any> = await web3QRL.getPastLogs({
				address: contractDeployed.options.address as string,
				fromBlock: numberToHex(Math.min(...resTx.map(d => Number(d.blockNumber)))),
				toBlock: numberToHex(10000),
			});
			const results = res.map(
				r =>
					decodeEventABI(eventAbi as AbiEventFragment & { signature: string }, r, [])
						.returnValues[0],
			);

			// test type number
			const res2: Array<any> = await web3QRL.getPastLogs({
				address: contractDeployed.options.address as string,
				fromBlock: Math.min(...resTx.map(d => Number(d.blockNumber))),
				toBlock: 10000,
			});
			const results2 = res2.map(
				r =>
					decodeEventABI(eventAbi as AbiEventFragment & { signature: string }, r, [])
						.returnValues[0],
			);
			// test type BigInt
			const res3: Array<any> = await web3QRL.getPastLogs({
				address: contractDeployed.options.address as string,
				fromBlock: BigInt(Math.min(...resTx.map(d => Number(d.blockNumber)))),
				toBlock: BigInt(10000),
			});
			const results3 = res3.map(
				r =>
					decodeEventABI(eventAbi as AbiEventFragment & { signature: string }, r, [])
						.returnValues[0],
			);
			for (const l of listOfStrings) {
				expect(results).toContain(l);
				expect(results2).toContain(l);
				expect(results3).toContain(l);
			}
		});
	});
});
