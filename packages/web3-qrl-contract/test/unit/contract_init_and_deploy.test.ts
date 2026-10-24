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

import { InvalidAddressError } from '@theqrl/web3-errors';
import { ContractAbi } from '@theqrl/web3-types';
import { Contract } from '../../src';
import { isContractInitOptions } from '../../src/utils';
import { ADDR, ADDR2, FROM, FakeProvider, RECEIPT } from '../fixtures/fake_provider';

// Declared `as const` so that `deploy({arguments})` is typed.
const constructorAbi = [
	{
		type: 'constructor',
		inputs: [{ type: 'uint256', name: 'x' }],
		stateMutability: 'nonpayable',
	},
] as const;
const eventAbi: ContractAbi = [
	{
		type: 'event',
		name: 'Transfer',
		inputs: [{ type: 'uint256', name: 'value', indexed: false }],
		anonymous: false,
	},
];

describe('deploy bytecode source (P4-L-27)', () => {
	/** Answers the deployment pipeline with a receipt that carries the new address. */
	const deployProvider = () =>
		new FakeProvider(method =>
			method === 'qrl_getTransactionReceipt'
				? { ...RECEIPT, contractAddress: ADDR2 }
				: undefined,
		);
	const sentTx = (provider: FakeProvider, method: string) =>
		provider.lastCall(method)?.params[0] as { input?: string; data?: string };
	const sendOptions = { gas: '0x5208', maxFeePerGas: '0x10', maxPriorityFeePerGas: '0x1' };

	it('uses deploy({input}) alone although options.data is set: send, estimateGas and encodeABI agree (P4-L-27)', async () => {
		const provider = deployProvider();
		const contract = new Contract(constructorAbi, {
			provider: provider.asProvider(),
			data: '0x6080aa',
			from: FROM,
		});
		const deployment = contract.deploy({ input: '0x6080bb', arguments: [1] });

		expect(deployment.encodeABI().startsWith('0x6080bb')).toBe(true);

		await expect(deployment.estimateGas()).resolves.toBe(BigInt(0x5208));
		expect(sentTx(provider, 'qrl_estimateGas').input?.startsWith('0x6080bb')).toBe(true);
		expect(sentTx(provider, 'qrl_estimateGas').data).toBeUndefined();

		const deployed = await deployment.send(sendOptions);
		expect(deployed.options.address).toBe(ADDR2);
		expect(sentTx(provider, 'qrl_sendTransaction').input?.startsWith('0x6080bb')).toBe(true);
		expect(sentTx(provider, 'qrl_sendTransaction').data).toBeUndefined();
	});

	it('uses deploy({data}) alone although options.input is set (P4-L-27)', async () => {
		const provider = deployProvider();
		const contract = new Contract(constructorAbi, {
			provider: provider.asProvider(),
			input: '0x6080aa',
			from: FROM,
		});
		const deployment = contract.deploy({ data: '0x6080bb', arguments: [1] });

		expect(deployment.encodeABI().startsWith('0x6080bb')).toBe(true);
		await expect(deployment.estimateGas()).resolves.toBe(BigInt(0x5208));
		const tx = sentTx(provider, 'qrl_estimateGas');
		expect((tx.input ?? tx.data)?.startsWith('0x6080bb')).toBe(true);
		expect(tx.input === undefined || tx.data === undefined).toBe(true);
		await expect(deployment.send(sendOptions)).resolves.toBeInstanceOf(Contract);
	});

	it('ignores data when input is given to deploy(), as documented (P4-L-27)', async () => {
		const provider = deployProvider();
		const contract = new Contract(constructorAbi, {
			provider: provider.asProvider(),
			from: FROM,
		});
		const deployment = contract.deploy({ input: '0x6080bb', data: '0x6080aa', arguments: [1] });

		expect(deployment.encodeABI().startsWith('0x6080bb')).toBe(true);
		await expect(deployment.estimateGas()).resolves.toBe(BigInt(0x5208));
		expect(sentTx(provider, 'qrl_estimateGas').input?.startsWith('0x6080bb')).toBe(true);
	});

	it('falls back to the contract options when deploy() gives no bytecode (P4-L-27)', () => {
		const contract = new Contract(constructorAbi, {
			provider: deployProvider().asProvider(),
			data: '0x6080aa',
			from: FROM,
		});
		expect(
			contract
				.deploy({ arguments: [1] })
				.encodeABI()
				.startsWith('0x6080aa'),
		).toBe(true);

		const bare = new Contract(constructorAbi, { provider: deployProvider().asProvider() });
		expect(() => bare.deploy({ arguments: [1] })).toThrow(
			'contract creation without any data provided.',
		);
	});
});

describe('address as an init option (P4-L-28)', () => {
	it('honours options.address when no positional address is given (P4-L-28)', () => {
		const options = { address: ADDR, from: FROM, provider: new FakeProvider().asProvider() };
		const contract = new Contract(eventAbi, options);

		expect(contract.options.address).toBe(ADDR);
		expect(contract.options.from).toBe(FROM);
	});

	it('honours options.address given as the third argument (P4-L-28)', () => {
		const options = { address: ADDR, provider: new FakeProvider().asProvider() };
		const contract = new Contract(eventAbi, undefined, options);

		expect(contract.options.address).toBe(ADDR);
	});

	it('lets a positional address win over options.address (P4-L-28)', () => {
		const options = { address: ADDR2, provider: new FakeProvider().asProvider() };
		const contract = new Contract(eventAbi, ADDR, options);

		expect(contract.options.address).toBe(ADDR);
	});

	it('validates options.address like the positional address (P4-L-28)', () => {
		const invalid = { address: 'nope', provider: new FakeProvider().asProvider() };
		expect(() => new Contract(eventAbi, invalid)).toThrow(InvalidAddressError);

		const empty = { address: '', provider: new FakeProvider().asProvider() };
		expect(new Contract(eventAbi, empty).options.address).toBeUndefined();
	});

	it('no longer lists jsonInterface among the init-option keys (P4-L-28)', () => {
		expect(isContractInitOptions({ jsonInterface: eventAbi })).toBe(false);
		expect(isContractInitOptions({ address: ADDR })).toBe(true);
		expect(isContractInitOptions({ from: FROM })).toBe(true);
	});
});
