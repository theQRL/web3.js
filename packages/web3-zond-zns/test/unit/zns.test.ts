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

import { Web3Context, Web3ContextObject, Web3PromiEvent } from '@theqrl/web3-core';
import { ZNSNetworkNotSyncedError, ZNSUnsupportedNetworkError } from '@theqrl/web3-errors';
import { Contract } from '@theqrl/web3-zond-contract';
import { PublicResolverAbi } from '../../src/abi/zns/PublicResolver';
import { registryAddresses } from '../../src/config';

import { ZNS } from '../../src/zns';

jest.useFakeTimers().setSystemTime(new Date('2020-01-01'));

jest.mock('@theqrl/web3-zond', () => ({
	__esModule: true,
	isSyncing: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { isSyncing } = require('@theqrl/web3-zond');

const expectedNetworkId = '0x1';
jest.mock('@theqrl/web3-net', () => ({
	getId: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { getId } = require('@theqrl/web3-net');

describe('zns', () => {
	let object: Web3ContextObject;
	let resolverContract: Contract<typeof PublicResolverAbi>;
	const mockAddress = '0x0000000000000000000000000000000000000000';
	const ZNS_NAME = 'web3js.zond';
	let zns: ZNS;

	beforeAll(() => {
		const context = new Web3Context('http://test.com');
		object = context.getContextObject();

		resolverContract = new Contract(PublicResolverAbi, mockAddress);
		zns = new ZNS(registryAddresses.main, object);
	});

	describe('Resolver', () => {
		it('getResolver', async () => {
			const getResolverMock = jest
				.spyOn(zns['_registry'], 'getResolver')
				.mockResolvedValue(resolverContract);

			await zns.getResolver(ZNS_NAME);

			expect(getResolverMock).toHaveBeenCalledWith(ZNS_NAME);
		});
	});

	describe('Record', () => {
		it('recordExists', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const recordExistsMock = jest.spyOn(zns['_registry'], 'recordExists').mockReturnValue({
				call,
			} as unknown as Web3PromiEvent<any, any>);
			await zns.recordExists(ZNS_NAME);

			expect(recordExistsMock).toHaveBeenCalledWith(ZNS_NAME);
		});
	});

	describe('ttl', () => {
		it('getTTL', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const getTTLMock = jest.spyOn(zns['_registry'], 'getTTL').mockReturnValue({
				call,
			} as unknown as Web3PromiEvent<any, any>);

			await zns.getTTL(ZNS_NAME);
			expect(getTTLMock).toHaveBeenCalledWith(ZNS_NAME);
		});
	});

	describe('owner', () => {
		it('getOwner', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const getOwnerMock = jest.spyOn(zns['_registry'], 'getOwner').mockReturnValue({
				call,
			} as unknown as Web3PromiEvent<any, any>);

			await zns.getOwner(ZNS_NAME);
			expect(getOwnerMock).toHaveBeenCalledWith(ZNS_NAME);
		});
	});

	describe('addr', () => {
		it('getAddress', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const addrMock = jest.spyOn(zns['_resolver'], 'getAddress').mockReturnValue({
				call,
			} as unknown as Web3PromiEvent<any, any>);

			await zns.getAddress(ZNS_NAME);

			expect(addrMock).toHaveBeenCalledWith(ZNS_NAME, 60);
		});
	});

	describe('events', () => {
		it('get events', async () => {
			const { events } = zns;
			expect(typeof events.NewOwner).toBe('function');
			expect(typeof events.allEvents).toBe('function');
			expect(typeof events.NewResolver).toBe('function');
			expect(typeof events.Transfer).toBe('function');
		});
	});

	describe('constructor', () => {
		it('default params', async () => {
			const localZns = new ZNS();
			expect(localZns.provider).toBeUndefined();
			expect(localZns.registryAddress).toBe(registryAddresses.main);
		});
		it('set params', async () => {
			const localZns = new ZNS(registryAddresses.main, 'http://127.0.0.1:8545');
			// @ts-expect-error check clientUrl field
			expect(localZns.provider?.clientUrl).toBe('http://127.0.0.1:8545');
			expect(localZns.registryAddress).toBe(registryAddresses.main);
		});
	});

	describe('pubkey', () => {
		it('getPubkey', async () => {
			const pubkeyMock = jest.spyOn(zns['_resolver'], 'getPubkey').mockReturnValue({
				call: jest.fn(),
			} as unknown as Web3PromiEvent<any, any>);

			await zns.getPubkey(ZNS_NAME);
			expect(pubkeyMock).toHaveBeenCalledWith(ZNS_NAME);
		});

		describe('Contenthash', () => {
			it('getContenthash', async () => {
				const contenthashMock = jest
					.spyOn(zns['_resolver'], 'getContenthash')
					.mockReturnValue({
						call: jest.fn(),
					} as unknown as Web3PromiEvent<any, any>);

				await zns.getContenthash(ZNS_NAME);

				expect(contenthashMock).toHaveBeenCalledWith(ZNS_NAME);
			});
		});
	});

	it('supportsInterface', async () => {
		const interfaceId = 'setAddr';
		const supportsInterfaceMock = jest
			.spyOn(zns['_resolver'], 'supportsInterface')
			.mockReturnValue({
				call: jest.fn(),
			} as unknown as Web3PromiEvent<any, any>);

		await zns.supportsInterface(ZNS_NAME, interfaceId);

		expect(supportsInterfaceMock).toHaveBeenCalledWith(ZNS_NAME, interfaceId);
	});

	describe('CheckNetwork', () => {
		beforeEach(() => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			getId.mockReset();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			isSyncing.mockReset();
		});
		it('Not last sync/ZNSNetworkNotSyncedError', async () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			getId.mockImplementation(() => expectedNetworkId);

			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			isSyncing.mockImplementation(() => {
				return {
					startingBlock: 100,
					currentBlock: 312,
					highestBlock: 51266,
				} as unknown;
			});
			await expect(zns.checkNetwork()).rejects.toThrow(new ZNSNetworkNotSyncedError());
		});

		it('Threshold exceeded from previous check/ZNSNetworkNotSyncedError', async () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			getId.mockImplementation(() => expectedNetworkId);

			// An initial check, in order to update `_lastSyncCheck`
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			isSyncing.mockImplementation(() => {
				return false;
			});
			// update `_lastSyncCheck`
			await zns.checkNetwork();

			// now - this._lastSyncCheck > 3600)
			jest.useFakeTimers().setSystemTime(new Date('2020-01-01').getTime() + 3601000); // (3600 + 1) * 1000
			await expect(zns.checkNetwork()).resolves.not.toThrow();
		});

		it('ZNSUnsupportedNetworkError', async () => {
			// reset from previous check
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			zns['_detectedAddress'] = undefined;

			const network = 'AnUnsupportedNetwork';

			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			getId.mockImplementation(() => network);

			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			isSyncing.mockImplementation(() => {
				return {
					startingBlock: 100,
					currentBlock: 312,
					highestBlock: 51266,
				} as unknown;
			});

			await expect(zns.checkNetwork()).rejects.toThrow(
				new ZNSUnsupportedNetworkError(network),
			);
		});
	});
});
