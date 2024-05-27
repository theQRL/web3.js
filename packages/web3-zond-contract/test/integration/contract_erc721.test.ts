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

import { toBigInt } from '@theqrl/web3-utils';
import { Contract } from '../../src';
import { ERC721TokenAbi, ERC721TokenBytecode } from '../shared_fixtures/build/ERC721Token';
import {
	getSystemTestProvider,
	describeIf,
	isWs,
	createTempAccount,
	signAndSendContractMethodEIP1559,
	// signAndSendContractMethodEIP2930, // TODO(rgeraldes24)
	createNewAccount,
	refillAccount,
} from '../fixtures/system_test_utils';
import { processAsync, toUpperCaseHex } from '../shared_fixtures/utils';

describe('contract', () => {
	describe('erc721', () => {
		let contract: Contract<typeof ERC721TokenAbi>;
		let contractDeployed: Contract<typeof ERC721TokenAbi>;
		let deployOptions: Record<string, unknown>;
		let sendOptions: Record<string, unknown>;

		beforeAll(async () => {
			contract = new Contract(ERC721TokenAbi, undefined, {
				provider: getSystemTestProvider(),
			});

			const acc = await createTempAccount();

			deployOptions = {
				data: ERC721TokenBytecode,
				arguments: [],
			};
			sendOptions = { from: acc.address, /*gas: '10000000'*/ type: 2 };
		});

		it('should deploy the contract', async () => {
			await expect(contract.deploy(deployOptions).send(sendOptions)).resolves.toBeDefined();
		});

		describe('contract instance', () => {
			let acc: { address: string; seed: string };
			let acc2: { address: string; seed: string };
			let pkAccount: { address: string; seed: string };
			beforeAll(async () => {
				acc = await createTempAccount();
				pkAccount = await createNewAccount();
				await refillAccount(acc.address, pkAccount.address, '20000000000000000');
			});
			beforeEach(async () => {
				acc2 = await createTempAccount();
				sendOptions = { from: acc.address, /*gas: '10000000'*/ type: 2 };
				contractDeployed = await contract.deploy(deployOptions).send(sendOptions);
			});

			describe('methods', () => {
				it('should return the name', async () => {
					expect(await contractDeployed.methods.name().call()).toBe('GameItem');
				});

				it('should return the symbol', async () => {
					expect(await contractDeployed.methods.symbol().call()).toBe('ITM');
				});

				it('should award item', async () => {
					const tempAccount = await createTempAccount();
					await contractDeployed.methods
						.awardItem(tempAccount.address, 'http://my-nft-uri')
						.send(sendOptions);

					const tokenId = toBigInt(0);
					expect(
						toUpperCaseHex(
							(await contractDeployed.methods
								.ownerOf(tokenId)
								.call()) as unknown as string,
						),
					).toBe(toUpperCaseHex(tempAccount.address));
				});
				// TODO(rgeraldes24)
				it.each([signAndSendContractMethodEIP1559/*, signAndSendContractMethodEIP2930*/])(
					'should award item with local wallet %p',
					async signAndSendContractMethod => {
						const tempAccount = await createTempAccount();
						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.awardItem(
								tempAccount.address,
								'http://my-nft-award',
							),
							pkAccount.seed,
						);
						const tokenId = toBigInt(0);
						expect(
							toUpperCaseHex(
								(await contractDeployed.methods
									.ownerOf(tokenId)
									.call()) as unknown as string,
							),
						).toBe(toUpperCaseHex(tempAccount.address));
					},
				);
				// TODO(rgeraldes24)
				it.each([signAndSendContractMethodEIP1559/*, signAndSendContractMethodEIP2930*/])(
					'should transferFrom item with local wallet %p',
					async signAndSendContractMethod => {
						const tempAccount = await createTempAccount();
						const tempAccountTo = await createTempAccount();
						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.awardItem(
								tempAccount.address,
								'http://my-nft-award',
							),
							pkAccount.seed,
						);

						const tokenId = toBigInt(0);
						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.transferFrom(
								tempAccount.address,
								tempAccountTo.address,
								tokenId,
							),
							tempAccount.seed,
						);

						expect(
							toUpperCaseHex(
								(await contractDeployed.methods
									.ownerOf(tokenId)
									.call()) as unknown as string,
							),
						).toBe(toUpperCaseHex(tempAccountTo.address));
					},
				);
				// TODO(rgeraldes24)
				it.each([signAndSendContractMethodEIP1559/*, signAndSendContractMethodEIP2930*/])(
					'should safeTransferFrom item with local wallet %p',
					async signAndSendContractMethod => {
						const tempAccount = await createTempAccount();
						const tempAccountTo = await createTempAccount();
						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.awardItem(
								tempAccount.address,
								'http://my-nft-award',
							),
							pkAccount.seed,
						);

						const tokenId = toBigInt(0);
						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.approve(tempAccountTo.address, tokenId),
							tempAccount.seed,
						);
						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.safeTransferFrom(
								tempAccount.address,
								tempAccountTo.address,
								tokenId,
							),
							tempAccount.seed,
						);

						expect(
							toUpperCaseHex(
								(await contractDeployed.methods
									.ownerOf(tokenId)
									.call()) as unknown as string,
							),
						).toBe(toUpperCaseHex(tempAccountTo.address));
					},
				);
				// TODO(rgeraldes24)
				it.each([signAndSendContractMethodEIP1559/*, signAndSendContractMethodEIP2930*/])(
					'should approve item with local wallet %p',
					async signAndSendContractMethod => {
						const tempAccount = await createTempAccount();
						const tempAccountTo = await createTempAccount();
						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.awardItem(
								tempAccount.address,
								'http://my-nft-award',
							),
							pkAccount.seed,
						);
						const tokenId = toBigInt(0);

						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.approve(tempAccountTo.address, tokenId),
							tempAccount.seed,
						);

						const res = await contractDeployed.methods.getApproved(tokenId).call();
						expect(res.toString().toUpperCase()).toBe(
							tempAccountTo.address.toUpperCase(),
						);
					},
				);
				// TODO(rgeraldes24)
				it.each([signAndSendContractMethodEIP1559/*, signAndSendContractMethodEIP2930*/])(
					'should set approve for all item with local wallet %p',
					async signAndSendContractMethod => {
						const tempAccount = await createTempAccount();
						const tempAccountTo = await createTempAccount();
						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.awardItem(
								tempAccount.address,
								'http://my-nft-award',
							),
							pkAccount.seed,
						);

						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.setApprovalForAll(tempAccountTo.address, true),
							tempAccount.seed,
						);

						expect(
							await contractDeployed.methods
								.isApprovedForAll(tempAccount.address, tempAccountTo.address)
								.call(),
						).toBe(true);

						await signAndSendContractMethod(
							contract.provider,
							contractDeployed.options.address as string,
							contractDeployed.methods.setApprovalForAll(
								tempAccountTo.address,
								false,
							),
							tempAccount.seed,
						);

						expect(
							await contractDeployed.methods
								.isApprovedForAll(tempAccount.address, tempAccountTo.address)
								.call(),
						).toBe(false);
					},
				);
			});

			describeIf(isWs)('events', () => {
				it('should emit transfer event', async () => {
					await expect(
						processAsync(async resolve => {
							const event = contractDeployed.events.Transfer();
							event.on('data', data => {
								resolve({
									from: toUpperCaseHex(data.returnValues.from as string),
									to: toUpperCaseHex(data.returnValues.to as string),
									tokenId: data.returnValues.tokenId,
								});
							});

							await contractDeployed.methods
								.awardItem(acc2.address, 'http://my-nft-uri')
								.send(sendOptions);
						}),
					).resolves.toEqual({
						from: '0x0000000000000000000000000000000000000000',
						to: toUpperCaseHex(acc2.address),
						tokenId: BigInt(0),
					});
				});
			});
		});
	});
});
