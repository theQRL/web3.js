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

import { ContractMissingABIError, Web3ContractError } from '@theqrl/web3-errors';
import { encodeFunctionSignature } from '@theqrl/web3-qrl-abi';
import { ContractAbi } from '@theqrl/web3-types';
import { Web3ValidatorError } from '@theqrl/web3-validator';
import { Contract } from '../../src';
import { ADDR, FakeProvider, addrWord, boundMethod, uintWord } from '../fixtures/fake_provider';

const selector = (signature: string) => encodeFunctionSignature(signature);

const overloadedAbi: ContractAbi = [
	{ type: 'function', name: 'f', inputs: [{ type: 'uint256', name: 'a' }], outputs: [], stateMutability: 'nonpayable' },
	{ type: 'function', name: 'f', inputs: [{ type: 'int256', name: 'a' }], outputs: [], stateMutability: 'nonpayable' },
	{ type: 'function', name: 'f', inputs: [{ type: 'address', name: 'a' }], outputs: [], stateMutability: 'nonpayable' },
	{
		type: 'function',
		name: 'f',
		inputs: [
			{ type: 'uint256', name: 'a' },
			{ type: 'uint256', name: 'b' },
		],
		outputs: [],
		stateMutability: 'payable',
	},
];

const transferAbi: ContractAbi = [
	{
		type: 'function',
		name: 'transfer',
		inputs: [
			{ type: 'address', name: 'to' },
			{ type: 'uint256', name: 'v' },
		],
		outputs: [{ type: 'bool', name: '' }],
		stateMutability: 'nonpayable',
	},
];

describe('overload resolution', () => {
	let contract: Contract<ContractAbi>;

	beforeEach(() => {
		contract = new Contract(overloadedAbi, ADDR, { provider: new FakeProvider().asProvider() });
	});

	it('binds the signature key to exactly that overload (H-4)', () => {
		expect(boundMethod(contract, 'f(int256)')(7).encodeABI().slice(0, 10)).toBe(
			selector('f(int256)'),
		);
		expect(boundMethod(contract, 'f(uint256)')(7).encodeABI().slice(0, 10)).toBe(
			selector('f(uint256)'),
		);
		expect(boundMethod(contract, 'f(uint256,uint256)')(1, 2).encodeABI().slice(0, 10)).toBe(
			selector('f(uint256,uint256)'),
		);
	});

	it('is callable with arguments through the signature key under a const ABI (H-4)', () => {
		const typed = new Contract(
			[
				{
					type: 'function',
					name: 'f',
					inputs: [{ type: 'uint256', name: 'a' }],
					outputs: [],
					stateMutability: 'nonpayable',
				},
				{
					type: 'function',
					name: 'f',
					inputs: [{ type: 'int256', name: 'a' }],
					outputs: [],
					stateMutability: 'nonpayable',
				},
			] as const,
			ADDR,
			{ provider: new FakeProvider().asProvider() },
		);

		// The signature key must type-check with arguments: it used to accept none.
		expect(typed.methods['f(int256)'](7).encodeABI().slice(0, 10)).toBe(selector('f(int256)'));
		expect(typed.methods[selector('f(uint256)')](7).encodeABI().slice(0, 10)).toBe(
			selector('f(uint256)'),
		);
	});

	it('binds the selector key to exactly that overload (H-4)', () => {
		expect(boundMethod(contract, selector('f(int256)'))(7).encodeABI().slice(0, 10)).toBe(
			selector('f(int256)'),
		);
	});

	it('validates the arguments of a signature key against that overload only (H-4)', () => {
		expect(() => boundMethod(contract, 'f(address)')(7)).toThrow(Web3ValidatorError);
		expect(() => boundMethod(contract, 'f(uint256)')(-7)).toThrow(Web3ValidatorError);
		expect(() => boundMethod(contract, 'f(uint256)')(1, 2)).toThrow(Web3ValidatorError);
	});

	it('refuses an ambiguous call by name instead of guessing (H-4)', () => {
		expect(() => boundMethod(contract, 'f')(7)).toThrow(Web3ContractError);
		expect(() => boundMethod(contract, 'f')(7)).toThrow(
			"contract.methods['f(uint256)']",
		);
		expect(() => boundMethod(contract, 'f')(7)).toThrow('f(uint256), f(int256)');
	});

	it('resolves a call by name when exactly one overload accepts the arguments (H-4)', () => {
		expect(boundMethod(contract, 'f')(-7).encodeABI().slice(0, 10)).toBe(selector('f(int256)'));
		expect(boundMethod(contract, 'f')(ADDR).encodeABI().slice(0, 10)).toBe(
			selector('f(address)'),
		);
		expect(boundMethod(contract, 'f')(1, 2).encodeABI().slice(0, 10)).toBe(
			selector('f(uint256,uint256)'),
		);
	});

	it('prefers the overload whose inputs are exact type matches (H-4)', () => {
		const abi: ContractAbi = [
			{ type: 'function', name: 'g', inputs: [{ type: 'bytes32', name: 'a' }], outputs: [], stateMutability: 'nonpayable' },
			{ type: 'function', name: 'g', inputs: [{ type: 'uint256', name: 'a' }], outputs: [], stateMutability: 'nonpayable' },
			{ type: 'function', name: 'h', inputs: [{ type: 'string', name: 'a' }], outputs: [], stateMutability: 'nonpayable' },
			{ type: 'function', name: 'h', inputs: [{ type: 'address', name: 'a' }], outputs: [], stateMutability: 'nonpayable' },
		];
		const exact = new Contract(abi, ADDR, { provider: new FakeProvider().asProvider() });

		// A 32-byte hex string is a bytes32; a number or a decimal string is a uint256.
		expect(boundMethod(exact, 'g')(`0x${'ab'.repeat(32)}`).encodeABI().slice(0, 10)).toBe(
			selector('g(bytes32)'),
		);
		expect(boundMethod(exact, 'g')(5).encodeABI().slice(0, 10)).toBe(selector('g(uint256)'));
		expect(boundMethod(exact, 'g')('5').encodeABI().slice(0, 10)).toBe(selector('g(uint256)'));
		expect(boundMethod(exact, 'g')(BigInt(5)).encodeABI().slice(0, 10)).toBe(
			selector('g(uint256)'),
		);
		// A string that is both an address and a string fits both overloads exactly.
		expect(() => boundMethod(exact, 'h')(ADDR)).toThrow(Web3ContractError);
		expect(boundMethod(exact, 'h')('hello').encodeABI().slice(0, 10)).toBe(
			selector('h(string)'),
		);
	});

	it('rejects more positional arguments than any overload takes (L-59)', () => {
		const transfer = new Contract(transferAbi, ADDR, { provider: new FakeProvider().asProvider() });

		expect(() => boundMethod(transfer, 'transfer')(ADDR, 5, 'EXTRA-ARG', { memo: 'x' })).toThrow(
			Web3ValidatorError,
		);
		expect(() => boundMethod(transfer, 'transfer')(ADDR, 5, 'EXTRA-ARG')).toThrow(
			'no overload of "transfer" takes 3 argument(s)',
		);
		expect(() => boundMethod(contract, 'f')(1, 2, 3)).toThrow(
			'no overload of "f" takes 3 argument(s); available: f(uint256), f(int256), f(address), f(uint256,uint256)',
		);
		expect(() => boundMethod(transfer, 'transfer(address,uint256)')(ADDR, 5, 6)).toThrow(
			Web3ValidatorError,
		);
	});

	it('still reports missing arguments through the validator (L-59)', () => {
		const transfer = new Contract(transferAbi, ADDR, { provider: new FakeProvider().asProvider() });

		expect(() => boundMethod(transfer, 'transfer')(ADDR)).toThrow(Web3ValidatorError);
		expect(() => boundMethod(transfer, 'transfer')(ADDR)).toThrow('value at "/1" is required');
		// Against overloads of three and four inputs, two arguments are missing ones too.
		expect(() => boundMethod(contract, 'f')()).toThrow(Web3ValidatorError);
	});
});

describe('jsonInterface re-set (L-56)', () => {
	const v1: ContractAbi = [
		{ type: 'function', name: 'g', inputs: [{ type: 'uint256', name: 'a' }], outputs: [{ type: 'uint256', name: '' }], stateMutability: 'view' },
		{ type: 'function', name: 'old', inputs: [], outputs: [], stateMutability: 'nonpayable' },
	];
	const v2: ContractAbi = [
		{ type: 'function', name: 'g', inputs: [{ type: 'int256', name: 'a' }], outputs: [{ type: 'bool', name: '' }], stateMutability: 'view' },
	];

	it('forgets the overloads of the previous interface (L-56)', async () => {
		const provider = new FakeProvider(method =>
			method === 'qrl_call' ? `0x${uintWord(1)}` : undefined,
		);
		const contract = new Contract(v1, ADDR, { provider: provider.asProvider() });
		expect(boundMethod(contract, 'g')(1).encodeABI().slice(0, 10)).toBe(selector('g(uint256)'));

		contract.options.jsonInterface = v2;

		expect(boundMethod(contract, 'g')(1).encodeABI().slice(0, 10)).toBe(selector('g(int256)'));
		expect(contract.options.jsonInterface[0].signature).toBe(selector('g(int256)'));
		expect(contract.methods.old).toBeUndefined();
		expect(boundMethod(contract, 'g(uint256)')).toBeUndefined();
		// Decoded with the new outputs (bool), not the old ones (uint256).
		await expect(boundMethod(contract, 'g')(1).call()).resolves.toBe(true);
	});
});

describe('reserved interface keys (L-64)', () => {
	const names = ['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'then'];
	const abi: ContractAbi = [
		...names.map(name => ({
			type: 'function',
			name,
			inputs: [{ type: 'uint256', name: 'x' }],
			outputs: [],
			stateMutability: 'nonpayable',
		})),
		...names.map(name => ({
			type: 'event',
			name,
			inputs: [{ type: 'uint256', name: 'x', indexed: false }],
			anonymous: false,
		})),
	];

	it('never publishes a `then` member, so the maps are not thenables (L-64)', async () => {
		const provider = new FakeProvider(() => undefined, true);
		const contract = new Contract(abi, ADDR, { provider: provider.asProvider() });

		expect(typeof contract.methods.then).toBe('undefined');
		expect(typeof contract.events.then).toBe('undefined');
		expect(typeof boundMethod(contract, 'then(uint256)')).toBe('function');
		expect(typeof boundMethod(contract, selector('then(uint256)'))).toBe('function');
		expect(boundMethod(contract, 'then(uint256)')(1).encodeABI().slice(0, 10)).toBe(
			selector('then(uint256)'),
		);

		await expect(Promise.resolve(contract.methods)).resolves.toBe(contract.methods);
		const resolved = await Promise.resolve().then(() => contract.events);
		expect(resolved).toBe(contract.events);
		expect(provider.calls).toHaveLength(0);
	});

	it('keeps ABI names off Object.prototype (L-64)', () => {
		const contract = new Contract(abi, ADDR, { provider: new FakeProvider().asProvider() });

		expect(Object.getPrototypeOf(contract.methods)).toBeNull();
		expect(Object.getPrototypeOf(contract.events)).toBeNull();
		expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
		expect(typeof boundMethod(contract, 'toString')).toBe('function');
		expect(boundMethod(contract, 'toString')(1).encodeABI().slice(0, 10)).toBe(
			selector('toString(uint256)'),
		);
	});
});

describe('JSON interface and address shape validation (L-26)', () => {
	it('rejects a JSON interface that is not an array with a typed error (L-26)', () => {
		expect(() => new Contract('not-an-array' as unknown as ContractAbi, ADDR)).toThrow(
			ContractMissingABIError,
		);
	});

	it('rejects a JSON interface item that is not an object with a typed error (L-26)', () => {
		// eslint-disable-next-line no-null/no-null
		expect(() => new Contract([null] as unknown as ContractAbi, ADDR)).toThrow(
			Web3ContractError,
		);
		expect(() => new Contract([5] as unknown as ContractAbi, ADDR)).toThrow(
			'Invalid JSON interface: the item at index 0 is not an ABI fragment object',
		);
	});

	it('treats a null address or null options as absent instead of throwing a TypeError (L-26)', () => {
		// eslint-disable-next-line no-null/no-null
		const withoutAddress = new Contract(transferAbi, null as unknown as undefined);
		expect(withoutAddress.options.address).toBeUndefined();

		// eslint-disable-next-line no-null/no-null
		const withNullOptions = new Contract(transferAbi, ADDR, null as unknown as undefined);
		expect(withNullOptions.options.address).toBe(ADDR);
	});
});

describe('duplicate identical fragments (P4-M-8)', () => {
	const owner = {
		type: 'function',
		name: 'owner',
		inputs: [],
		outputs: [{ type: 'address', name: '' }],
		stateMutability: 'view',
	};
	const transfer = transferAbi[0];
	const transferEvent = {
		type: 'event',
		name: 'Transfer',
		inputs: [
			{ type: 'address', name: 'from', indexed: true },
			{ type: 'uint256', name: 'value', indexed: false },
		],
		anonymous: false,
	};
	// A hand-merged proxy and implementation ABI: every fragment listed twice.
	const duplicatedAbi: ContractAbi = [owner, owner, transfer, transfer, transferEvent, transferEvent];

	it('registers an identical fragment once, so a call by name is not ambiguous (P4-M-8)', () => {
		const contract = new Contract(duplicatedAbi, ADDR, {
			provider: new FakeProvider().asProvider(),
		});

		expect(boundMethod(contract, 'owner')().encodeABI()).toBe(selector('owner()'));
		expect(boundMethod(contract, 'transfer')(ADDR, 5).encodeABI()).toBe(
			`${selector('transfer(address,uint256)')}${addrWord(ADDR)}${uintWord(5)}`,
		);
		// The signature and selector keys keep working.
		expect(boundMethod(contract, 'owner()')().encodeABI()).toBe(selector('owner()'));
		expect(
			boundMethod(contract, 'transfer(address,uint256)')(ADDR, 5).encodeABI().slice(0, 10),
		).toBe(selector('transfer(address,uint256)'));
		expect(
			boundMethod(contract, selector('transfer(address,uint256)'))(ADDR, 5)
				.encodeABI()
				.slice(0, 10),
		).toBe(selector('transfer(address,uint256)'));
		// The first occurrence is kept and the duplicate is not listed.
		expect(contract.options.jsonInterface).toHaveLength(3);
		expect(contract.options.jsonInterface.filter(item => item.type === 'event')).toHaveLength(1);
		expect(typeof contract.events.Transfer).toBe('function');
	});

	it('keeps genuine overloads apart (P4-M-8)', () => {
		const contract = new Contract(
			[
				...duplicatedAbi,
				{
					type: 'function',
					name: 'transfer',
					inputs: [{ type: 'address', name: 'to' }],
					outputs: [],
					stateMutability: 'nonpayable',
				},
			],
			ADDR,
			{ provider: new FakeProvider().asProvider() },
		);

		expect(boundMethod(contract, 'transfer')(ADDR).encodeABI().slice(0, 10)).toBe(
			selector('transfer(address)'),
		);
		expect(boundMethod(contract, 'transfer')(ADDR, 5).encodeABI().slice(0, 10)).toBe(
			selector('transfer(address,uint256)'),
		);
		expect(contract.options.jsonInterface).toHaveLength(4);
	});
});

describe('ABI inputs are private copies (I-13)', () => {
	it('is not affected by the caller mutating the ABI after construction (I-13)', () => {
		const shared = [
			{
				type: 'function',
				name: 'h',
				inputs: [{ type: 'uint256', name: 'a' }],
				outputs: [],
				stateMutability: 'nonpayable',
			},
		];
		const contract = new Contract(shared, ADDR, { provider: new FakeProvider().asProvider() });

		shared[0].inputs.push({ type: 'uint256', name: 'b' });

		expect(boundMethod(contract, 'h')(1).encodeABI()).toBe(
			`${selector('h(uint256)')}${uintWord(1)}`,
		);
		expect(() => boundMethod(contract, 'h')(1, 2)).toThrow(Web3ValidatorError);
		expect(contract.options.jsonInterface[0].inputs).toHaveLength(1);
	});
});
