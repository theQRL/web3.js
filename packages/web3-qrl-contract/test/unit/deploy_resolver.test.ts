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

import * as qrl from '@theqrl/web3-qrl';
import { NoContractAddressFoundError, Web3ContractError } from '@theqrl/web3-errors';
import { TransactionReceipt } from '@theqrl/web3-types';
import { Contract } from '../../src';
import { GreeterAbi, GreeterBytecode } from '../shared_fixtures/build/Greeter';

// Keep the real helpers (the deploy resolver uses `isTransactionStatusSuccessful`) and only
// replace `sendTransaction`, which the tests spy on to capture the resolver.
jest.mock('@theqrl/web3-qrl', () => ({
	...jest.requireActual('@theqrl/web3-qrl'),
	sendTransaction: jest.fn(),
}));

type SendOptions = { transactionResolver?: (receipt: TransactionReceipt) => unknown };
type Captured = { options?: SendOptions };

describe('deploy().send() receipt resolution (I-13)', () => {
	const from = `Q${'11'.repeat(64)}`;
	const deployedAddr = `Q${'ab'.repeat(64)}`;

	const captureResolver = (contract: Contract<typeof GreeterAbi>): Captured => {
		const captured: Captured = {};
		jest.spyOn(qrl, 'sendTransaction').mockImplementation(
			(_context, _transaction, _format, options) => {
				captured.options = options as SendOptions;
				return Promise.resolve(contract) as never;
			},
		);
		return captured;
	};

	it('rejects a successful receipt without a contract address (I-13)', async () => {
		const contract = new Contract(GreeterAbi);
		const captured = captureResolver(contract);

		await contract.deploy({ data: GreeterBytecode, arguments: ['Hi'] }).send({ from });

		expect(captured.options?.transactionResolver).toBeDefined();
		expect(() =>
			captured.options?.transactionResolver?.({
				status: BigInt(1),
				// eslint-disable-next-line no-null/no-null
				contractAddress: null,
			} as unknown as TransactionReceipt),
		).toThrow(NoContractAddressFoundError);
	});

	it('rejects a receipt whose status is not 1 (I-13)', async () => {
		const contract = new Contract(GreeterAbi);
		const captured = captureResolver(contract);

		await contract.deploy({ data: GreeterBytecode, arguments: ['Hi'] }).send({ from });

		expect(() =>
			captured.options?.transactionResolver?.({
				status: BigInt(0),
				contractAddress: deployedAddr,
			} as unknown as TransactionReceipt),
		).toThrow(Web3ContractError);
	});

	it('resolves with a clone pointing at the new address', async () => {
		const contract = new Contract(GreeterAbi);
		const captured = captureResolver(contract);

		await contract.deploy({ data: GreeterBytecode, arguments: ['Hi'] }).send({ from });

		const deployed = captured.options?.transactionResolver?.({
			status: BigInt(1),
			contractAddress: deployedAddr,
		} as unknown as TransactionReceipt) as Contract<typeof GreeterAbi>;
		expect(deployed.options.address?.toLowerCase()).toBe(deployedAddr.toLowerCase());
	});
});
