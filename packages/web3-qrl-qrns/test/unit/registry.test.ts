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
import { NonPayableMethodObject } from '@theqrl/web3-qrl-contract';
import { Registry } from '../../src/registry';
import { namehash } from '../../src/utils';

describe('registry', () => {
	let object: Web3ContextObject;
	let registry: Registry;
	const mockAddress = 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
	const nonZeroAddress = `Q${'0'.repeat(127)}1`;
	const zeroResolverAddress = `Q${'0'.repeat(128)}`;
	const QRNS_NAME = 'web3js.qrl';

	beforeAll(() => {
		const context = new Web3Context('http://test.com');
		object = context.getContextObject();

		registry = new Registry(object);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('constructor with custom address', async () => {
		const tempRegistry = new Registry(object, mockAddress);

		expect(tempRegistry).toBeInstanceOf(Registry);
	});

	describe('owner', () => {
		it('getOwner', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const getOwnerMock = jest.spyOn(registry['contract'].methods, 'owner').mockReturnValue({
				call,
			} as unknown as NonPayableMethodObject<any, any>);

			await registry.getOwner(QRNS_NAME);
			expect(getOwnerMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});
		it('getOwner throw (transaction reverted)', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call').mockImplementation(() => {
				throw new Error();
			});

			const getOwnerMock = jest
				.spyOn(registry['contract'].methods, 'owner')
				.mockReturnValue({ call } as unknown as NonPayableMethodObject<any, any>);

			await expect(async () => {
				await registry.getOwner(QRNS_NAME);
			}).rejects.toThrow();
			expect(getOwnerMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});
		it('getOwner surfaces a non-empty, cause-preserving error', async () => {
			const underlying = new Error('underlying call failure');
			const call = jest
				.spyOn({ call: async () => undefined }, 'call')
				.mockRejectedValue(underlying);

			jest.spyOn(registry['contract'].methods, 'owner').mockReturnValue({
				call,
			} as unknown as NonPayableMethodObject<any, any>);

			await expect(registry.getOwner(QRNS_NAME)).rejects.toMatchObject({
				message: expect.stringMatching(/.+/),
				innerError: underlying,
			});
		});
	});

	describe('ttl', () => {
		it('getTTL', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const getTTLMock = jest.spyOn(registry['contract'].methods, 'ttl').mockReturnValue({
				call,
			} as unknown as NonPayableMethodObject<any, any>);

			await registry.getTTL(QRNS_NAME);
			expect(getTTLMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});
		it('getTTL throw (transaction reverted)', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call').mockImplementation(() => {
				throw new Error();
			});

			const getTTLMock = jest
				.spyOn(registry['contract'].methods, 'ttl')
				.mockReturnValue({ call } as unknown as NonPayableMethodObject<any, any>);

			await expect(async () => {
				await registry.getTTL(QRNS_NAME);
			}).rejects.toThrow();
			expect(getTTLMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});
	});

	describe('record', () => {
		it('recordExists', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call');

			const setRecordMock = jest
				.spyOn(registry['contract'].methods, 'recordExists')
				.mockReturnValue({
					call,
				} as unknown as NonPayableMethodObject<any, any>);

			await registry.recordExists(QRNS_NAME);
			expect(setRecordMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});
		it('recordExists throw (transaction reverted)', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call').mockImplementation(() => {
				throw new Error();
			});

			const setRecordMock = jest
				.spyOn(registry['contract'].methods, 'recordExists')
				.mockReturnValue({
					call,
				} as unknown as NonPayableMethodObject<any, any>);

			await expect(async () => {
				await registry.recordExists(QRNS_NAME);
			}).rejects.toThrow();
			expect(setRecordMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});
	});

	describe('resolver', () => {
		it('resolver', async () => {
			const call = jest
				.spyOn(
					{
						call: async () => {
							return nonZeroAddress;
						},
					},
					'call',
				)
				.mockReturnValue(Promise.resolve(nonZeroAddress));

			const resolverMock = jest
				.spyOn(registry['contract'].methods, 'resolver')
				.mockReturnValue({
					call,
				} as unknown as NonPayableMethodObject<any, any>);

			await registry.getResolver(QRNS_NAME);
			expect(resolverMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});

		it('resolver (rejects a zero resolver address)', async () => {
			const call = jest
				.spyOn(
					{
						call: async () => {
							return zeroResolverAddress;
						},
					},
					'call',
				)
				.mockReturnValue(Promise.resolve(zeroResolverAddress));

			const resolverMock = jest
				.spyOn(registry['contract'].methods, 'resolver')
				.mockReturnValue({
					call,
				} as unknown as NonPayableMethodObject<any, any>);

			await expect(registry.getResolver(QRNS_NAME)).rejects.toThrow(
				'QRNS registry returned zero resolver address',
			);
			expect(resolverMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});

		it('resolver (return non string)', async () => {
			const call = jest
				.spyOn(
					{
						call: async () => {
							return 5; // something that is not string
						},
					},
					'call',
				)
				.mockReturnValue(Promise.resolve(5)); // something that is not string

			const resolverMock = jest
				.spyOn(registry['contract'].methods, 'resolver')
				.mockReturnValue({
					call,
				} as unknown as NonPayableMethodObject<any, any>);

			await expect(async () => {
				await registry.getResolver(QRNS_NAME);
			}).rejects.toThrow();
			expect(resolverMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});

		it('resolver throw (transaction reverted)', async () => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			const call = jest.spyOn({ call: () => {} }, 'call').mockImplementation(() => {
				throw new Error();
			});
			const resolverMock = jest
				.spyOn(registry['contract'].methods, 'resolver')
				.mockReturnValue({
					call,
				} as unknown as NonPayableMethodObject<any, any>);

			await expect(async () => {
				await registry.getResolver(QRNS_NAME);
			}).rejects.toThrow();
			expect(resolverMock).toHaveBeenCalledWith(namehash(QRNS_NAME));
			expect(call).toHaveBeenCalled();
		});
	});
});
