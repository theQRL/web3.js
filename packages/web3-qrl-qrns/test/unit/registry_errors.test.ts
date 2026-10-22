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
import {
	AbiError,
	ContractExecutionError,
	TransactionRevertInstructionError,
	Web3ContractError,
} from '@theqrl/web3-errors';
import { NonPayableMethodObject } from '@theqrl/web3-qrl-contract';
import { Registry } from '../../src/registry';
import { CUSTOM_REGISTRY } from '../fixtures/fake_provider';

describe('registry error mapping (L-26)', () => {
	let object: Web3ContextObject;
	let registry: Registry;
	const QRNS_NAME = 'web3js.qrl';

	const mockCall = (method: 'owner' | 'resolver', call: () => Promise<unknown>) =>
		jest.spyOn(registry['contract'].methods, method).mockReturnValue({
			call,
		} as unknown as NonPayableMethodObject<any, any>);

	beforeAll(() => {
		object = new Web3Context('http://127.0.0.1:8545').getContextObject();
		registry = new Registry(object);
	});

	it('passes an ABI decoding failure through instead of reporting a revert (L-26)', async () => {
		const decodeFailure = new AbiError('Parameter decoding error: data out-of-bounds');
		mockCall('resolver', async () => Promise.reject(decodeFailure));

		await expect(registry.getResolver(QRNS_NAME)).rejects.toBe(decodeFailure);
	});

	it('maps a revert reported by the node to TransactionRevertInstructionError', async () => {
		const revert = new ContractExecutionError({ code: 3, message: 'execution reverted', data: '0x' });
		mockCall('owner', async () => Promise.reject(revert));

		await expect(registry.getOwner(QRNS_NAME)).rejects.toThrow(TransactionRevertInstructionError);
		await expect(registry.getOwner(QRNS_NAME)).rejects.toMatchObject({ innerError: revert });
	});

	it('wraps a non-web3 error in a typed error that keeps the cause', async () => {
		const underlying = new Error('socket hang up');
		mockCall('owner', async () => Promise.reject(underlying));

		await expect(registry.getOwner(QRNS_NAME)).rejects.toThrow(Web3ContractError);
		await expect(registry.getOwner(QRNS_NAME)).rejects.toMatchObject({ innerError: underlying });
	});

	it('reports a zero, invalid or non-string resolver address with a typed error (L-26)', async () => {
		mockCall('resolver', async () => Promise.resolve(`Q${'0'.repeat(128)}`));
		await expect(registry.getResolver(QRNS_NAME)).rejects.toThrow(Web3ContractError);
		await expect(registry.getResolver(QRNS_NAME)).rejects.toThrow(
			'QRNS registry returned zero resolver address',
		);

		mockCall('resolver', async () => Promise.resolve('0x1234'));
		await expect(registry.getResolver(QRNS_NAME)).rejects.toThrow(Web3ContractError);

		mockCall('resolver', async () => Promise.resolve(5));
		await expect(registry.getResolver(QRNS_NAME)).rejects.toThrow(Web3ContractError);
	});

	it('exposes and repoints the registry contract address (L-62)', () => {
		expect(registry.address).toBeDefined();
		registry.address = CUSTOM_REGISTRY;
		expect(registry.address).toBe(CUSTOM_REGISTRY);
		expect(registry['contract'].options.address).toBe(CUSTOM_REGISTRY);
	});
});
