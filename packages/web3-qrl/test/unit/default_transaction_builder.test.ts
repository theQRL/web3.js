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
	QRLExecutionAPI,
	PopulatedUnsignedEip1559Transaction,
	Transaction,
	ValidChains,
	Hardfork,
} from '@theqrl/web3-types';
import { Web3Context } from '@theqrl/web3-core';
import HttpProvider from '@theqrl/web3-providers-http';
import { isNullish } from '@theqrl/web3-validator';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import {
	InvalidNumberError,
	InvalidPropertiesForTransactionTypeError,
	TransactionDataAndInputError,
	UnableToPopulateNonceError,
	UnsupportedTransactionTypeError,
} from '@theqrl/web3-errors';
import { getId } from '@theqrl/web3-net';
import { defaultTransactionBuilder } from '../../src/utils/transaction_builder';

jest.mock('@theqrl/web3-rpc-methods');

const expectedNetworkId = '0x4';
jest.mock('@theqrl/web3-net', () => ({
	getId: jest.fn().mockImplementation(() => expectedNetworkId),
}));

describe('defaultTransactionBuilder', () => {
	const expectedFrom = 'Q6E66597715136A50F44A01EcC6f15e6F611c13477413826bb6F94466f6165d4745d35CE0Da0c81d7d1e6eA928187d34281D493258Cd3Ec9beAd728851C6E0E51';
	const expectedNonce = '0x42';
	const expectedGas = BigInt(21000);
	const expectedGasLimit = expectedGas;
	const expectedGasPrice = '0x4a817c800';
	const expectedBaseFeePerGas = '0x13afe8b904';
	const expectedMaxPriorityFeePerGas = '0x9502f900';
	const expectedMaxFeePerGas = '0x27f4d46b08';
	const expectedChainId = '0x1';
	const defaultTransactionType = '0x2';
	const transaction: Transaction = {
		from: expectedFrom,
		to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
		value: '0x174876e800',
		gas: expectedGas,
		gasLimit: expectedGasLimit,
		type: '0x2',
		maxFeePerGas: expectedMaxFeePerGas,
		maxPriorityFeePerGas: expectedMaxPriorityFeePerGas,
		data: '0x',
		nonce: expectedNonce,
		chain: 'mainnet',
		hardfork: 'zond',
		chainId: expectedChainId,
		networkId: expectedNetworkId,
		common: {
			customChain: {
				name: 'foo',
				networkId: expectedNetworkId,
				chainId: expectedChainId,
			},
			baseChain: 'mainnet',
			hardfork: 'zond',
		},
	};
	const mockBlockData = {
		parentHash: '0xe99e022112df268087ea7eafaf4790497fd21dbeeb6bd7a1721df161a6657a54',
		miner: 'Q3268305Ca04D8742fEEe646e4cC5936463E12197162f086D72b85f8F2DAFea881B291ce929E87d9D518D7664Db23989d42c355B6A4590BAA9f571c4614fFa232',
		stateRoot: '0xddc8b0234c2e0cad087c8b389aa7ef01f7d79b2570bccb77ce48648aa61c904d',
		transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
		receiptsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
		logsBloom:
			'0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
		number: '0x1b4',
		gasLimit: '0x1388',
		gasUsed: '0x1c96e73',
		timestamp: '0x55ba467c',
		extraData: '0x476574682f4c5649562f76312e302e302f6c696e75782f676f312e342e32',
		prevRandao: '0x4fffe9ae21f1c9e15207b1f472d5bbdd68c9595d461666602f2be20daf5e7843',
		size: '0x220',
		transactions: [
			'0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b',
			'0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b',
			'0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b',
		],
		hash: '0xdc0818cf78f21a8e70579cb46a43643f78291264dda342ae31049421c82d21ae',
		baseFeePerGas: expectedBaseFeePerGas,
	};
	let web3Context: Web3Context<QRLExecutionAPI>;
	let getTransactionCountSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.spyOn(qrlRpcMethods, 'getBlockByNumber').mockResolvedValue(mockBlockData);
		getTransactionCountSpy = jest
			.spyOn(qrlRpcMethods, 'getTransactionCount')
			.mockResolvedValue(expectedNonce);
		jest.spyOn(qrlRpcMethods, 'getGasPrice').mockResolvedValue(expectedGasPrice);
		jest.spyOn(qrlRpcMethods, 'getChainId').mockResolvedValue(expectedChainId);

		web3Context = new Web3Context<QRLExecutionAPI>(new HttpProvider('http://127.0.0.1'));
	});

	it.skip('should call override method', async () => {
		const overrideFunction = jest.fn();
		const input = { ...transaction };
		await defaultTransactionBuilder({
			transaction: input,
			web3Context,
			// VALID_QRL_BASE_TYPES.HexString,
			// '0x32c89a84a46859934c42dec330511fd3642e98f00575e74a44c486c8d112dbf19d7129cd61d3e6bd72c4f2f66e5556f3',
			// overrideFunction,
			fillGasPrice: true,
		});
		expect(overrideFunction).toHaveBeenCalledWith(input);
	});

	describe('should populate from', () => {
		it('should use seed to populate', async () => {
			const input = { ...transaction };
			delete input.from;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				seed: '0x01000071e121bdd81cdae8da5a9733bb6c1cd5a43feb8a2cc754a4aeb797cbc2054626e77c05ddad0182ef962233ca6c5906c6',
				fillGasPrice: true,
			});
			expect(result.from).toBe(expectedFrom);
		});

		it('should use web3Context.defaultAccount to populate', async () => {
			web3Context = new Web3Context<QRLExecutionAPI>({
				provider: new HttpProvider('http://127.0.0.1'),
				config: {
					defaultAccount: expectedFrom,
				},
			});

			const input = { ...transaction };
			delete input.from;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.from).toBe(expectedFrom);
		});
	});

	describe('should populate nonce', () => {
		it('should throw UnableToPopulateNonceError', async () => {
			const input = { ...transaction };
			delete input.from;
			delete input.nonce;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			await expect(
				defaultTransactionBuilder({ transaction: input, web3Context, fillGasPrice: true }),
			).rejects.toThrow(new UnableToPopulateNonceError());
		});

		it('should use web3QRL.getTransactionCount to populate nonce', async () => {
			const input = { ...transaction };
			delete input.nonce;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.nonce).toBe(expectedNonce);
			expect(getTransactionCountSpy).toHaveBeenCalledWith(
				web3Context.requestManager,
				expectedFrom,
				web3Context.defaultBlock,
			);
		});

		it('should use web3QRL.getTransactionCount to populate nonce without gas fill', async () => {
			const input = { ...transaction };
			delete input.nonce;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: false,
			});
			expect(result.nonce).toBe(expectedNonce);
			expect(getTransactionCountSpy).toHaveBeenCalledWith(
				web3Context.requestManager,
				expectedFrom,
				web3Context.defaultBlock,
			);
		});
	});

	describe('should populate value', () => {
		it('should populate with 0x', async () => {
			const input = { ...transaction };
			delete input.value;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.value).toBe('0x');
		});
	});

	describe('should populate input/data', () => {
		it('should populate input with 0x', async () => {
			const input = { ...transaction };
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;
			delete input.data;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.input).toBe('0x');
			expect(result.data).toBeUndefined();
		});

		it('should prefix input with 0x', async () => {
			const input = { ...transaction };
			input.input = '123';
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;
			delete input.data;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.input).toBe('0x123');
			expect(result.data).toBeUndefined();
		});

		it('should prefix data with 0x', async () => {
			const input = { ...transaction };
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;
			input.data = '123';

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.input).toBeUndefined();
			expect(result.data).toBe('0x123');
		});

		it('should throw TransactionDataAndInputError', async () => {
			const input = { ...transaction };
			input.data = '0x3211';
			input.input = '0x1233';

			await expect(
				defaultTransactionBuilder({
					transaction: input,
					web3Context,
				}),
			).rejects.toThrow(TransactionDataAndInputError);
		});
	});

	describe('should populate chain', () => {
		it('should populate with mainnet', async () => {
			const input = { ...transaction };
			delete input.chain;
			delete input.common;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.chain).toBe('mainnet');
		});

		it('should use web3Context.defaultChain to populate', async () => {
			web3Context = new Web3Context<QRLExecutionAPI>(new HttpProvider('http://127.0.0.1'));

			const input = { ...transaction };
			delete input.chain;
			delete input.common;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.chain).toBe(web3Context.defaultChain);
		});
	});

	describe('should populate hardfork', () => {
		it('should populate with zond', async () => {
			const input = { ...transaction };
			delete input.hardfork;
			delete input.common;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.hardfork).toBe('zond');
		});

		it('should use web3Context.defaultHardfork to populate', async () => {
			web3Context = new Web3Context<QRLExecutionAPI>(new HttpProvider('http://127.0.0.1'));

			const input = { ...transaction };
			delete input.hardfork;
			delete input.common;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.hardfork).toBe(web3Context.defaultHardfork);
		});

		it('should use web3Context.defaultCommon to populate', async () => {
			const baseChain: ValidChains = 'mainnet';
			const hardfork: Hardfork = 'zond';
			const customCommon = {
				customChain: {
					name: 'custom',
					networkId: '0x3',
					chainId: '0x1',
				},
				baseChain,
				hardfork,
			};

			web3Context = new Web3Context<QRLExecutionAPI>({
				provider: new HttpProvider('http://127.0.0.1'),
				config: {
					defaultCommon: customCommon,
				},
			});

			const input = { ...transaction };
			delete input.common;
			delete input.chain;
			delete input.hardfork;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.common).toStrictEqual(customCommon);
			// `common` and the chain/hardfork pair are mutually exclusive signing options: the
			// context defaults for the pair must not be filled in next to the adopted common.
			expect(result.chain).toBeUndefined();
			expect(result.hardfork).toBeUndefined();
		});

		it('should take chainId from web3Context.defaultCommon instead of asking the node', async () => {
			web3Context = new Web3Context<QRLExecutionAPI>({
				provider: new HttpProvider('http://127.0.0.1'),
				config: {
					defaultCommon: {
						customChain: { name: 'custom', networkId: '0x3', chainId: '0x7' },
						baseChain: 'mainnet',
						hardfork: 'zond',
					},
				},
			});

			const input = { ...transaction };
			delete input.common;
			delete input.chain;
			delete input.hardfork;
			delete input.chainId;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.chainId).toBe('0x7');
			expect(qrlRpcMethods.getChainId).not.toHaveBeenCalled();
		});

		it('should prefer an explicit chain/hardfork pair over web3Context.defaultCommon', async () => {
			web3Context = new Web3Context<QRLExecutionAPI>({
				provider: new HttpProvider('http://127.0.0.1'),
				config: {
					defaultCommon: {
						customChain: { name: 'custom', networkId: '0x3', chainId: '0x1' },
						baseChain: 'mainnet',
						hardfork: 'zond',
					},
				},
			});

			const input = { ...transaction };
			delete input.common;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.common).toBeUndefined();
			expect(result.chain).toBe('mainnet');
			expect(result.hardfork).toBe('zond');
		});
	});

	describe('should populate chainId', () => {
		it('should populate with web3QRL.getChainId', async () => {
			const input = { ...transaction };
			delete input.chainId;
			delete input.common;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.chainId).toBe(expectedChainId);
		});
	});

	describe('should populate networkId', () => {
		it('should populate with web3Net.getId when neither the transaction nor its common names it', async () => {
			(getId as jest.Mock).mockClear();
			const input = { ...transaction };
			delete input.networkId;
			delete input.common;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.networkId).toBe(expectedNetworkId);
			expect(getId).toHaveBeenCalledTimes(1);
		});

		it('takes networkId from common.customChain without asking the node (I-12)', async () => {
			(getId as jest.Mock).mockClear();
			const input = { ...transaction };
			delete input.networkId;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.networkId).toBe(transaction.common?.customChain.networkId);
			expect(getId).not.toHaveBeenCalled();
		});
	});

	describe('input checks (L-50, L-55, L-26)', () => {
		it('rejects a legacy gasPrice before populating anything (L-50)', async () => {
			await expect(
				defaultTransactionBuilder({
					transaction: { ...transaction, gasPrice: '0x1' } as never,
					web3Context,
				}),
			).rejects.toThrow(InvalidPropertiesForTransactionTypeError);
		});

		it('rejects a value above Number.MAX_SAFE_INTEGER given as a number (L-55)', async () => {
			await expect(
				defaultTransactionBuilder({
					transaction: { ...transaction, value: 2 ** 53 + 1 },
					web3Context,
				}),
			).rejects.toThrow(InvalidNumberError);
		});

		it('tolerates a common without customChain and asks the node for the chain id (L-26)', async () => {
			const input = { ...transaction, common: {} as never };
			delete input.chainId;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.chainId).toBe(expectedChainId);
		});
	});

	describe('should populate gasLimit', () => {
		it('should populate with gas', async () => {
			const input = { ...transaction };
			delete input.gasLimit;
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.gasLimit).toBe(expectedGasLimit);
		});
	});

	describe('should populate type', () => {
		it('should throw UnsupportedTransactionTypeError', async () => {
			const input = { ...transaction };
			input.type = '0x8'; // // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-2718.md#transactions

			await expect(
				defaultTransactionBuilder({ transaction: input, web3Context, fillGasPrice: true }),
			).rejects.toThrow(new UnsupportedTransactionTypeError(input.type));
		});

		it('should use web3Context.defaultTransactionType to populate', async () => {
			web3Context = new Web3Context<QRLExecutionAPI>({
				provider: new HttpProvider('http://127.0.0.1'),
				config: {
					defaultTransactionType,
				},
			});

			const input = { ...transaction };
			delete input.gas;
			delete input.gasLimit;
			delete input.maxFeePerGas;
			delete input.maxPriorityFeePerGas;
			delete input.accessList;
			delete input.type;

			input.hardfork = 'zond';
			if (!isNullish(input.common)) input.common.hardfork = 'zond';

			const result = await defaultTransactionBuilder({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.type).toBe(web3Context.defaultTransactionType);
		});
	});

	describe('should populate accessList', () => {
		it('should populate with [] (tx.type 0x2)', async () => {
			const input = { ...transaction };
			delete input.accessList;
			input.type = '0x2';

			const result = await defaultTransactionBuilder<PopulatedUnsignedEip1559Transaction>({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.accessList).toStrictEqual([]);
		});
	});

	describe('should populate maxPriorityFeePerGas and maxFeePerGas', () => {
		it('should populate with maxPriorityFeePerGas and maxFeePerGas', async () => {
			const input = { ...transaction };
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;
			input.type = '0x2';

			const result = await defaultTransactionBuilder<PopulatedUnsignedEip1559Transaction>({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});

			expect(result.maxFeePerGas).toBeDefined();
			expect(result.maxPriorityFeePerGas).toBeDefined();
		});

		it('should populate with default maxPriorityFeePerGas and calculated maxFeePerGas (no maxPriorityFeePerGas and maxFeePerGas)', async () => {
			const input = { ...transaction };
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;
			input.type = '0x2';

			const result = await defaultTransactionBuilder<PopulatedUnsignedEip1559Transaction>({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.maxPriorityFeePerGas).toBe(expectedMaxPriorityFeePerGas); // 2.5 shor, hardcoded in defaultTransactionBuilder;
			expect(result.maxFeePerGas).toBe(expectedMaxFeePerGas);
		});

		it('should populate with default maxPriorityFeePerGas and calculated maxFeePerGas (no maxFeePerGas)', async () => {
			const input = { ...transaction };
			delete input.maxFeePerGas;
			input.type = '0x2';

			const result = await defaultTransactionBuilder<PopulatedUnsignedEip1559Transaction>({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.maxPriorityFeePerGas).toBe(expectedMaxPriorityFeePerGas); // 2.5 shor, hardcoded in defaultTransactionBuilder;
			expect(result.maxFeePerGas).toBe(expectedMaxFeePerGas);
		});

		it('should populate with default maxPriorityFeePerGas and calculated maxFeePerGas (no maxPriorityFeePerGas)', async () => {
			const input = { ...transaction };
			delete input.maxPriorityFeePerGas;
			input.type = '0x2';

			const result = await defaultTransactionBuilder<PopulatedUnsignedEip1559Transaction>({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.maxPriorityFeePerGas).toBe(expectedMaxPriorityFeePerGas); // 2.5 shor, hardcoded in defaultTransactionBuilder;
			expect(result.maxFeePerGas).toBe(expectedMaxFeePerGas);
		});

		it('should populate with web3Context.defaultMaxPriorityFeePerGas and calculated maxFeePerGas (no maxPriorityFeePerGas and maxFeePerGas)', async () => {
			const input = { ...transaction };
			delete input.maxPriorityFeePerGas;
			delete input.maxFeePerGas;
			input.type = '0x2';

			web3Context = new Web3Context<QRLExecutionAPI>({
				provider: new HttpProvider('http://127.0.0.1'),
				config: {
					defaultMaxPriorityFeePerGas: expectedMaxPriorityFeePerGas,
				},
			});

			const result = await defaultTransactionBuilder<PopulatedUnsignedEip1559Transaction>({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.maxPriorityFeePerGas).toBe(web3Context.defaultMaxPriorityFeePerGas); // 2.5 shor, hardcoded in defaultTransactionBuilder;
			expect(result.maxFeePerGas).toBe(expectedMaxFeePerGas);
		});

		it('should populate with web3Context.defaultMaxPriorityFeePerGas and calculated maxFeePerGas (no maxFeePerGas)', async () => {
			const input = { ...transaction };
			delete input.maxFeePerGas;
			input.type = '0x2';

			web3Context = new Web3Context<QRLExecutionAPI>({
				provider: new HttpProvider('http://127.0.0.1'),
				config: {
					defaultMaxPriorityFeePerGas: expectedMaxPriorityFeePerGas,
				},
			});

			const result = await defaultTransactionBuilder<PopulatedUnsignedEip1559Transaction>({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.maxPriorityFeePerGas).toBe(web3Context.defaultMaxPriorityFeePerGas); // 2.5 shor, hardcoded in defaultTransactionBuilder;
			expect(result.maxFeePerGas).toBe(expectedMaxFeePerGas);
		});

		it('should populate with web3Context.defaultMaxPriorityFeePerGas and calculated maxFeePerGas (no maxPriorityFeePerGas)', async () => {
			const input = { ...transaction };
			delete input.maxPriorityFeePerGas;
			input.type = '0x2';

			web3Context = new Web3Context<QRLExecutionAPI>({
				provider: new HttpProvider('http://127.0.0.1'),
				config: {
					defaultMaxPriorityFeePerGas: expectedMaxPriorityFeePerGas,
				},
			});

			const result = await defaultTransactionBuilder<PopulatedUnsignedEip1559Transaction>({
				transaction: input,
				web3Context,
				fillGasPrice: true,
			});
			expect(result.maxPriorityFeePerGas).toBe(web3Context.defaultMaxPriorityFeePerGas); // 2.5 shor, hardcoded in defaultTransactionBuilder;
			expect(result.maxFeePerGas).toBe(expectedMaxFeePerGas);
		});
	});
});
