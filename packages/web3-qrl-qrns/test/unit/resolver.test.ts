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

import { Web3Context, Web3ContextObject } from '@theqrl/web3-core';
import { ResolverMethodMissingError, Web3ContractError } from '@theqrl/web3-errors';
import { Contract, NonPayableMethodObject } from '@theqrl/web3-qrl-contract';
import { sha3, toChecksumAddress } from '@theqrl/web3-utils';
import { isAddressString } from '@theqrl/web3-validator';
import { PublicResolverAbi } from '../../src/abi/qrns/PublicResolver';
import { interfaceIds, methodsInInterface } from '../../src/config';
import { Registry } from '../../src/registry';
import { Resolver } from '../../src/resolver';
import { namehash } from '../../src/utils';

describe('resolver', () => {
	let object: Web3ContextObject;
	let registry: Registry;
	let resolver: Resolver;
	let contract: Contract<typeof PublicResolverAbi>;
	const mockAddress =
		'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
	const recordAddress = toChecksumAddress(`Q${'ab'.repeat(64)}`);
	const QRNS_NAME = 'web3js.qrl';

	beforeAll(() => {
		const context = new Web3Context('http://test.com');
		object = context.getContextObject();

		registry = new Registry(object);
		resolver = new Resolver(registry);
		contract = new Contract(PublicResolverAbi, mockAddress);
	});

	describe('checkInterfaceSupport', () => {
		it('isNullish interface', async () => {
			const methodName = 'nullish';
			await expect(resolver.checkInterfaceSupport(contract, methodName)).rejects.toThrow(
				new ResolverMethodMissingError(mockAddress, methodName),
			);
		});
		it('isNullish interface with no address', async () => {
			const methodName = 'nullish';
			const localContract = new Contract(PublicResolverAbi);
			await expect(resolver.checkInterfaceSupport(localContract, methodName)).rejects.toThrow(
				new ResolverMethodMissingError('', methodName),
			);
		});

		it('Doesn"t support interface', async () => {
			const methodName = methodsInInterface.setAddr; // Just a method to pass first check

			const supportsInterfaceMock = jest
				.spyOn(contract.methods, 'supportsInterface')
				.mockReturnValue({
					call: jest.fn().mockReturnValue(false),
				} as unknown as NonPayableMethodObject<any, any>);

			await expect(resolver.checkInterfaceSupport(contract, methodName)).rejects.toThrow(
				new ResolverMethodMissingError(mockAddress, methodName),
			);

			expect(supportsInterfaceMock).toHaveBeenCalledWith(interfaceIds[methodName]);
		});
		it('Doesn"t support interface with no address', async () => {
			const methodName = methodsInInterface.setAddr; // Just a method to pass first check
			const localContract = new Contract(PublicResolverAbi);
			const supportsInterfaceMock = jest
				.spyOn(localContract.methods, 'supportsInterface')
				.mockReturnValue({
					call: jest.fn().mockReturnValue(false),
				} as unknown as NonPayableMethodObject<any, any>);

			await expect(resolver.checkInterfaceSupport(localContract, methodName)).rejects.toThrow(
				new ResolverMethodMissingError('', methodName),
			);
			expect(supportsInterfaceMock).toHaveBeenCalledWith(interfaceIds[methodName]);
		});

		it.each(Object.values(methodsInInterface))(
			'supported interface for %s',
			async methodName => {
				const supportsInterfaceMock = jest
					.spyOn(contract.methods, 'supportsInterface')
					.mockReturnValue({
						call: jest.fn().mockReturnValue(true),
					} as unknown as NonPayableMethodObject<any, any>);

				await expect(
					resolver.checkInterfaceSupport(contract, methodName),
				).resolves.not.toThrow();

				expect(supportsInterfaceMock).toHaveBeenCalledWith(interfaceIds[methodName]);
			},
		);
	});
	describe('addr', () => {
		it('setAddr valid', async () => {
			const checkInteraface = jest.spyOn(resolver, 'checkInterfaceSupport');

			const setAddrMock = jest.spyOn(contract.methods, 'setAddr').mockReturnValue({
				send: jest.fn(),
			} as unknown as NonPayableMethodObject<any, any>);

			jest.spyOn(contract.methods, 'supportsInterface').mockReturnValue({
				call: jest.fn().mockReturnValue(true),
			} as unknown as NonPayableMethodObject<any, any>);

			// todo when moving this mock in beforeAll, jest calls the actual implementation, how to fix that
			// I use this in many places
			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			await resolver.setAddress(QRNS_NAME, mockAddress, { from: mockAddress });
			expect(checkInteraface).toHaveBeenCalled();
			expect(setAddrMock).toHaveBeenCalledWith(namehash(QRNS_NAME), mockAddress);
		});
		it('getAddress calls addr(bytes32) for coin type 60 and returns a checksummed address (L-63)', async () => {
			const supportsInterfaceMock = jest
				.spyOn(contract.methods, 'supportsInterface')
				.mockReturnValue({
					call: async () => Promise.resolve(true),
				} as unknown as NonPayableMethodObject<any, any>);

			const addrMock = jest.spyOn(contract.methods, 'addr').mockReturnValue({
				call: async () => Promise.resolve(recordAddress.toLowerCase()),
			} as unknown as NonPayableMethodObject<any, any>);

			// todo when moving this mock in beforeAll, jest calls the actual implementation, how to fix that
			// I use this in many places
			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			const address = await resolver.getAddress(QRNS_NAME);
			expect(supportsInterfaceMock).toHaveBeenCalledWith(
				interfaceIds[methodsInInterface.addr],
			);
			expect(supportsInterfaceMock).toHaveBeenCalledWith('0x3b3b57de');
			expect(addrMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(address).toBe(recordAddress);
			expect(isAddressString(address)).toBe(true);
		});

		it('getAddress checks addr(bytes32,uint256) support for other coin types and returns the raw bytes (L-63)', async () => {
			const supportsInterfaceMock = jest
				.spyOn(contract.methods, 'supportsInterface')
				.mockReturnValue({
					call: async () => Promise.resolve(true),
				} as unknown as NonPayableMethodObject<any, any>);

			const addrMock = jest.spyOn(contract.methods, 'addr').mockReturnValue({
				call: async () => Promise.resolve('0x00112233'),
			} as unknown as NonPayableMethodObject<any, any>);

			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			const bytes = await resolver.getAddress(QRNS_NAME, 0);
			expect(supportsInterfaceMock).toHaveBeenCalledWith('0xf1cb7e06');
			expect(supportsInterfaceMock).not.toHaveBeenCalledWith('0x3b3b57de');
			expect(addrMock).toHaveBeenCalledWith(namehash(QRNS_NAME), 0);
			expect(bytes).toBe('0x00112233');
		});

		it('getAddress rejects a resolver reply that is not an address (L-63)', async () => {
			jest.spyOn(contract.methods, 'supportsInterface').mockReturnValue({
				call: async () => Promise.resolve(true),
			} as unknown as NonPayableMethodObject<any, any>);
			jest.spyOn(contract.methods, 'addr').mockReturnValue({
				call: async () => Promise.resolve('0x'),
			} as unknown as NonPayableMethodObject<any, any>);
			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			await expect(resolver.getAddress(QRNS_NAME)).rejects.toThrow(Web3ContractError);
		});

		it('getAddress uses the multicoin interface for a non-60 coin type given as a string', async () => {
			const supportsInterfaceMock = jest
				.spyOn(contract.methods, 'supportsInterface')
				.mockReturnValue({
					call: async () => Promise.resolve(true),
				} as unknown as NonPayableMethodObject<any, any>);
			jest.spyOn(contract.methods, 'addr').mockReturnValue({
				call: async () => Promise.resolve('0x'),
			} as unknown as NonPayableMethodObject<any, any>);
			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			await resolver.getAddress(QRNS_NAME, '2' as unknown as number);
			expect(supportsInterfaceMock).toHaveBeenCalledWith('0xf1cb7e06');
		});
	});

	describe('pubkey', () => {
		it('getPubkey', async () => {
			const supportsInterfaceMock = jest
				.spyOn(contract.methods, 'supportsInterface')
				.mockReturnValue({
					call: async () => Promise.resolve(true),
				} as unknown as NonPayableMethodObject<any, any>);

			const pubkeyMock = jest.spyOn(contract.methods, 'pubkey').mockReturnValue({
				call: jest.fn(),
			} as unknown as NonPayableMethodObject<any, any>);

			// todo when moving this mock in beforeAll, jest calls the actual implementation, how to fix that
			// I use this in many places
			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			await resolver.getPubkey(QRNS_NAME);
			expect(supportsInterfaceMock).toHaveBeenCalledWith(
				interfaceIds[methodsInInterface.pubkey],
			);
			expect(pubkeyMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
		});
	});

	describe('Contenthash', () => {
		it('getContenthash', async () => {
			const supportsInterfaceMock = jest
				.spyOn(contract.methods, 'supportsInterface')
				.mockReturnValue({
					call: async () => Promise.resolve(true),
				} as unknown as NonPayableMethodObject<any, any>);

			const contenthashMock = jest.spyOn(contract.methods, 'contenthash').mockReturnValue({
				call: jest.fn(),
			} as unknown as NonPayableMethodObject<any, any>);

			// todo when moving this mock in beforeAll, jest calls the actual implementation, how to fix that
			// I use this in many places
			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			await resolver.getContenthash(QRNS_NAME);
			expect(supportsInterfaceMock).toHaveBeenCalledWith(
				interfaceIds[methodsInInterface.contenthash],
			);
			expect(contenthashMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
		});
	});

	describe('text', () => {
		it('getText', async () => {
			const supportsInterfaceMock = jest
				.spyOn(contract.methods, 'supportsInterface')
				.mockReturnValue({
					call: async () => Promise.resolve(true),
				} as unknown as NonPayableMethodObject<any, any>);

			const textMock = jest.spyOn(contract.methods, 'text').mockReturnValue({
				call: jest.fn(),
			} as unknown as NonPayableMethodObject<any, any>);

			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			await resolver.getText(QRNS_NAME, 'key');
			expect(supportsInterfaceMock).toHaveBeenCalledWith(
				interfaceIds[methodsInInterface.text],
			);
			expect(textMock).toHaveBeenCalledWith(namehash(QRNS_NAME), 'key');
		});
	});

	describe('name', () => {
		it('getName', async () => {
			const address =
				'Q33380cd8b47eed92b0dcd1ccca2ee84efd0c8b87a4fe6ee4a918969cdd454c0b04ac9f03ffaafa765af0cbeab572d8c9dd514044aa94adee50fa5d361a3e4629';

			const supportsInterfaceMock = jest
				.spyOn(contract.methods, 'supportsInterface')
				.mockReturnValue({
					call: async () => Promise.resolve(true),
				} as unknown as NonPayableMethodObject<any, any>);

			const nameMock = jest.spyOn(contract.methods, 'name').mockReturnValue({
				call: jest.fn(),
			} as unknown as NonPayableMethodObject<any, any>);

			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			await resolver.getName(address);
			expect(supportsInterfaceMock).toHaveBeenCalledWith(
				interfaceIds[methodsInInterface.name],
			);

			const reverseName = `${address.toLowerCase().substring(1)}.addr.reverse`;
			expect(nameMock).toHaveBeenCalledWith(namehash(reverseName));
		});
	});

	describe('supportsInterface', () => {
		it('check supportsInterface for non strict hex id', async () => {
			const interfaceId = 'setAddr';
			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const supportsInterfaceMock = jest
				.spyOn(contract.methods, 'supportsInterface')
				.mockReturnValue({
					call,
				} as unknown as NonPayableMethodObject<any, any>);

			await expect(resolver.supportsInterface(QRNS_NAME, interfaceId)).resolves.not.toThrow();

			// expect(setContenthashMock).toHaveBeenCalledWith(namehash(QRNS_NAME), hash);
			expect(supportsInterfaceMock).toHaveBeenCalledWith(sha3(interfaceId)?.substring(0, 10));
			expect(call).toHaveBeenCalled();
		});

		it('check supportsInterface for empty non strict hex id', async () => {
			const interfaceId = ''; // empty
			jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
				return new Promise(resolve => {
					resolve(contract);
				});
			});

			await expect(resolver.supportsInterface(QRNS_NAME, interfaceId)).rejects.toThrow(
				new Error('Invalid interface Id'),
			);
		});

		it.each(Object.values(interfaceIds))(
			'check supportsInterface for valid hex ids',
			async () => {
				const interfaceId = 'setAddr';
				jest.spyOn(registry, 'getResolver').mockImplementation(async () => {
					return new Promise(resolve => {
						resolve(contract);
					});
				});

				// eslint-disable-next-line @typescript-eslint/no-empty-function
				const call = jest.spyOn({ call: () => {} }, 'call');

				const supportsInterfaceMock = jest
					.spyOn(contract.methods, 'supportsInterface')
					.mockReturnValue({
						call,
					} as unknown as NonPayableMethodObject<any, any>);

				await expect(
					resolver.supportsInterface(QRNS_NAME, interfaceId),
				).resolves.not.toThrow();

				// expect(setContenthashMock).toHaveBeenCalledWith(namehash(QRNS_NAME), hash);
				expect(supportsInterfaceMock).toHaveBeenCalledWith(
					sha3(interfaceId)?.substring(0, 10),
				);
				expect(call).toHaveBeenCalled();
			},
		);
	});
});
