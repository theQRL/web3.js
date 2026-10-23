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
import { QRNSNetworkNotSyncedError, QRNSUnsupportedNetworkError } from '@theqrl/web3-errors';
import { Contract } from '@theqrl/web3-qrl-contract';
import { PublicResolverAbi } from '../../src/abi/qrns/PublicResolver';
import { registryAddresses } from '../../src/config';

import { QRNS } from '../../src/qrns';

Object.defineProperty(global, 'performance', {
	writable: true,
});

jest.mock('@theqrl/web3-qrl', () => ({
	__esModule: true,
	isSyncing: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isSyncing } = require('@theqrl/web3-qrl');

const expectedNetworkId = '0x1';
jest.mock('@theqrl/web3-net', () => ({
	getId: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getId } = require('@theqrl/web3-net');

describe('qrns', () => {
	let object: Web3ContextObject;
	let resolverContract: Contract<typeof PublicResolverAbi>;
	const mockAddress = 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
	const QRNS_NAME = 'web3js.qrl';
	let qrns: QRNS;

	beforeAll(() => {
		const context = new Web3Context('http://test.com');
		object = context.getContextObject();

		resolverContract = new Contract(PublicResolverAbi, mockAddress);
		qrns = new QRNS(registryAddresses.main, object);
	});

	describe('Resolver', () => {
		it('getResolver', async () => {
			const getResolverMock = jest
				.spyOn(qrns['_registry'], 'getResolver')
				.mockResolvedValue(resolverContract);

			await qrns.getResolver(QRNS_NAME);

			expect(getResolverMock).toHaveBeenCalledWith(QRNS_NAME);
		});
	});

	describe('Record', () => {
		it('recordExists', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const recordExistsMock = jest.spyOn(qrns['_registry'], 'recordExists').mockReturnValue({
				call,
			} as unknown as Web3PromiEvent<any, any>);
			await qrns.recordExists(QRNS_NAME);

			expect(recordExistsMock).toHaveBeenCalledWith(QRNS_NAME);
		});
	});

	describe('ttl', () => {
		it('getTTL', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const getTTLMock = jest.spyOn(qrns['_registry'], 'getTTL').mockReturnValue({
				call,
			} as unknown as Web3PromiEvent<any, any>);

			await qrns.getTTL(QRNS_NAME);
			expect(getTTLMock).toHaveBeenCalledWith(QRNS_NAME);
		});
	});

	describe('owner', () => {
		it('getOwner', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const getOwnerMock = jest.spyOn(qrns['_registry'], 'getOwner').mockReturnValue({
				call,
			} as unknown as Web3PromiEvent<any, any>);

			await qrns.getOwner(QRNS_NAME);
			expect(getOwnerMock).toHaveBeenCalledWith(QRNS_NAME);
		});
	});

	describe('addr', () => {
		it('setAddr valid', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const send = jest.spyOn({ send: () => {} }, 'send');

			const setAddressMock = jest.spyOn(qrns['_resolver'], 'setAddress').mockReturnValue({
				send,
			} as unknown as Web3PromiEvent<any, any>);

			const sendOptions = { from: mockAddress };
			await qrns.setAddress(QRNS_NAME, mockAddress, sendOptions);
			expect(setAddressMock).toHaveBeenCalledWith(QRNS_NAME, mockAddress, sendOptions);
		});
		it('getAddress', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const addrMock = jest.spyOn(qrns['_resolver'], 'getAddress').mockReturnValue({
				call,
			} as unknown as Web3PromiEvent<any, any>);

			await qrns.getAddress(QRNS_NAME);

			expect(addrMock).toHaveBeenCalledWith(QRNS_NAME, 60);
		});
	});

	describe('events', () => {
		it('get events', async () => {
			const { events } = qrns;
			expect(typeof events.NewOwner).toBe('function');
			expect(typeof events.allEvents).toBe('function');
			expect(typeof events.NewResolver).toBe('function');
			expect(typeof events.Transfer).toBe('function');
		});
	});

	describe('constructor', () => {
		it('default params', async () => {
			const localQrns = new QRNS();
			expect(localQrns.provider).toBeUndefined();
			expect(localQrns.registryAddress).toBe(registryAddresses.main);
		});
		it('set params', async () => {
			const localQrns = new QRNS(registryAddresses.main, 'http://127.0.0.1:8545');
			// @ts-expect-error check clientUrl field
			expect(localQrns.provider?.clientUrl).toBe('http://127.0.0.1:8545');
			expect(localQrns.registryAddress).toBe(registryAddresses.main);
		});
	});

	describe('pubkey', () => {
		it('getPubkey', async () => {
			const pubkeyMock = jest.spyOn(qrns['_resolver'], 'getPubkey').mockReturnValue({
				call: jest.fn(),
			} as unknown as Web3PromiEvent<any, any>);

			await qrns.getPubkey(QRNS_NAME);
			expect(pubkeyMock).toHaveBeenCalledWith(QRNS_NAME);
		});

		describe('Contenthash', () => {
			it('getContenthash', async () => {
				const contenthashMock = jest
					.spyOn(qrns['_resolver'], 'getContenthash')
					.mockReturnValue({
						call: jest.fn(),
					} as unknown as Web3PromiEvent<any, any>);

				await qrns.getContenthash(QRNS_NAME);

				expect(contenthashMock).toHaveBeenCalledWith(QRNS_NAME);
			});
		});
	});

	describe('text', () => {
		it('getText', async () => {
			const getTextMock = jest.spyOn(qrns['_resolver'], 'getText').mockResolvedValue('value');

			await qrns.getText(QRNS_NAME, 'url');
			expect(getTextMock).toHaveBeenCalledWith(QRNS_NAME, 'url');
		});

		it('getText from address', async () => {
			const getNameMock = jest
				.spyOn(qrns['_resolver'], 'getName')
				.mockResolvedValue(QRNS_NAME);
			const getTextMock = jest.spyOn(qrns['_resolver'], 'getText').mockResolvedValue('value');

			await qrns.getText(mockAddress, 'url');
			expect(getNameMock).toHaveBeenCalledWith(mockAddress, false);
			expect(getTextMock).toHaveBeenCalledWith(QRNS_NAME, 'url');
		});

		it('getText from an address without a verified name is an empty string (P4-L-31)', async () => {
			jest.spyOn(qrns['_resolver'], 'getName').mockResolvedValue('');
			const getTextMock = jest.spyOn(qrns['_resolver'], 'getText').mockResolvedValue('value');

			await expect(qrns.getText(mockAddress, 'url')).resolves.toBe('');
			expect(getTextMock).not.toHaveBeenCalled();
		});
	});

	describe('name', () => {
		it('getName', async () => {
			const getNameMock = jest
				.spyOn(qrns['_resolver'], 'getName')
				.mockResolvedValue(QRNS_NAME);

			await qrns.getName(mockAddress);
			expect(getNameMock).toHaveBeenCalledWith(mockAddress, true);
		});
	});

	it('supportsInterface', async () => {
		const interfaceId = 'setAddr';
		const supportsInterfaceMock = jest
			.spyOn(qrns['_resolver'], 'supportsInterface')
			.mockReturnValue({
				call: jest.fn(),
			} as unknown as Web3PromiEvent<any, any>);

		await qrns.supportsInterface(QRNS_NAME, interfaceId);

		expect(supportsInterfaceMock).toHaveBeenCalledWith(QRNS_NAME, interfaceId);
	});

	describe('CheckNetwork', () => {
		beforeEach(() => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			getId.mockReset();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			isSyncing.mockReset();
		});
		it('Not last sync/QRNSNetworkNotSyncedError', async () => {
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
			await expect(qrns.checkNetwork()).rejects.toThrow(new QRNSNetworkNotSyncedError());
		});

		it('Threshold exceeded from previous check/QRNSNetworkNotSyncedError', async () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			getId.mockImplementation(() => expectedNetworkId);

			// An initial check, in order to update `_lastSyncCheck`
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			isSyncing.mockImplementation(() => {
				return false;
			});
			// update `_lastSyncCheck`
			await qrns.checkNetwork();

			// now - this._lastSyncCheck > 3600)
			// `doNotFake: ['performance']` works around a Jest 30 / @sinonjs/fake-timers
			// crash when faking the `performance` API in the node test environment.
			jest.useFakeTimers({ doNotFake: ['performance'] }).setSystemTime(
				new Date('2020-01-01').getTime() + 3601000,
			); // (3600 + 1) * 1000
			await expect(qrns.checkNetwork()).resolves.not.toThrow();
		});

		it('QRNSUnsupportedNetworkError', async () => {
			// reset from previous check
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			qrns['_detectedAddress'] = undefined;

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

			await expect(qrns.checkNetwork()).rejects.toThrow(
				new QRNSUnsupportedNetworkError(network),
			);
		});
	});
});
