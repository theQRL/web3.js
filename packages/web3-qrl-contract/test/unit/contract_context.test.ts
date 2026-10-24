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

import { Web3ConfigEvent, Web3Context } from '@theqrl/web3-core';
import { InvalidAddressError, Web3ContractError } from '@theqrl/web3-errors';
import { ContractAbi, SupportedProviders } from '@theqrl/web3-types';
import { Contract } from '../../src';
import { isWeb3ContractContext } from '../../src/utils';
import { ADDR, FROM, FakeProvider, boundMethod, uintWord } from '../fixtures/fake_provider';

const abi: ContractAbi = [
	{
		type: 'function',
		name: 'f',
		inputs: [{ type: 'uint256', name: 'a' }],
		outputs: [{ type: 'uint256', name: '' }],
		stateMutability: 'nonpayable',
	},
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

const callProvider = (tag: string) =>
	new FakeProvider(method => (method === 'qrl_call' ? `0x${uintWord(Number(tag))}` : undefined));

const asProvider = (provider: FakeProvider) => provider as unknown as SupportedProviders;

describe('contract context (M-6)', () => {
	it('does not take an empty object for a context', () => {
		expect(isWeb3ContractContext({})).toBe(false);
		expect(isWeb3ContractContext({ gas: '1' })).toBe(false);
		expect(isWeb3ContractContext({ provider: new FakeProvider().asProvider() })).toBe(false);
		expect(isWeb3ContractContext(new Web3Context().getContextObject())).toBe(true);
		expect(isWeb3ContractContext(new Web3Context())).toBe(true);
		// eslint-disable-next-line no-null/no-null
		expect(isWeb3ContractContext(null)).toBe(false);
	});

	it('shares the request manager, subscription manager and config of the context given after empty options (M-6)', async () => {
		const p1 = callProvider('1');
		const p2 = callProvider('2');
		const context = new Web3Context({
			provider: asProvider(p1),
			config: { handleRevert: true, transactionBlockTimeout: 7, defaultAccount: FROM },
		});

		const contract = new Contract(abi, ADDR, {}, context.getContextObject());

		expect(contract.requestManager).toBe(context.requestManager);
		expect(contract.subscriptionManager).toBe(context.subscriptionManager);
		expect(contract.handleRevert).toBe(true);
		expect(contract.transactionBlockTimeout).toBe(7);
		expect(contract.defaultAccount).toBe(FROM);

		await expect(boundMethod(contract, 'f')(1).call()).resolves.toBe(BigInt(1));
		context.setProvider(asProvider(p2));
		await expect(boundMethod(contract, 'f')(1).call()).resolves.toBe(BigInt(2));
		expect(p2.calls.map(call => call.method)).toEqual(['qrl_call']);
	});

	it('shares the request manager of a Web3Context instance given as the context (M-6)', () => {
		const context = new Web3Context({ provider: asProvider(callProvider('1')) });
		const contract = new Contract(abi, ADDR, context);

		expect(contract.requestManager).toBe(context.requestManager);
		expect(contract.provider).toBe(context.provider);
	});

	it('keeps a context given in the third position when the fourth one is a return format', () => {
		const context = new Web3Context({ provider: asProvider(callProvider('1')) });
		const contract = new Contract(abi, ADDR, context.getContextObject(), {
			number: 'NUMBER_BIGINT',
			bytes: 'BYTES_HEX',
		} as never);

		expect(contract.requestManager).toBe(context.requestManager);
	});
});

describe('syncWithContext listeners (L-37)', () => {
	it('removes its CONFIG_CHANGE listener on dispose and never adds a second one (L-37)', () => {
		const context = new Web3Context({ provider: asProvider(callProvider('1')) });
		const before = context.listenerCount(Web3ConfigEvent.CONFIG_CHANGE);

		const contract = new Contract(abi, ADDR, { syncWithContext: true }, context);
		expect(context.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(before + 1);

		context.handleRevert = true;
		expect(contract.handleRevert).toBe(true);

		// Attaching again replaces the listener instead of stacking one more.
		contract['subscribeToContextEvents'](context);
		expect(context.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(before + 1);

		const clone = contract.clone();
		expect(context.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(before + 2);
		clone.dispose();
		expect(context.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(before + 1);

		contract.dispose();
		expect(context.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(before);
		context.handleRevert = false;
		expect(contract.handleRevert).toBe(true);
	});

	it('does not register a listener without syncWithContext (L-37)', () => {
		const context = new Web3Context({ provider: asProvider(callProvider('1')) });
		const before = context.listenerCount(Web3ConfigEvent.CONFIG_CHANGE);

		const contract = new Contract(abi, ADDR, context);
		expect(context.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(before);
		contract.dispose();
		expect(context.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(before);
	});
});

describe('contract address checksum (L-57)', () => {
	const flipOne = (address: string): string => {
		const chars = address.split('');
		for (let i = 1; i < chars.length; i += 1) {
			if (/[a-f]/.test(chars[i])) {
				chars[i] = chars[i].toUpperCase();
				return chars.join('');
			}
			if (/[A-F]/.test(chars[i])) {
				chars[i] = chars[i].toLowerCase();
				return chars.join('');
			}
		}
		return address;
	};
	const bad = flipOne(ADDR);

	it('rejects a mixed-case address with a wrong checksum in the constructor (L-57)', () => {
		expect(bad).not.toBe(ADDR);
		expect(() => new Contract(abi, bad, { provider: new FakeProvider().asProvider() })).toThrow(
			InvalidAddressError,
		);
	});

	it('rejects a mixed-case address with a wrong checksum in the setter (L-57)', () => {
		const contract = new Contract(abi, ADDR, { provider: new FakeProvider().asProvider() });
		expect(() => {
			contract.options.address = bad;
		}).toThrow(InvalidAddressError);
		expect(contract.options.address).toBe(ADDR);
	});

	it('accepts the unchecksummed form and stores the checksummed address (L-57)', () => {
		// The prefix is a capital `Q` (P4-L-44); the body may be all lowercase.
		const unchecksummed = `Q${ADDR.slice(1).toLowerCase()}`;
		const contract = new Contract(abi, unchecksummed, {
			provider: new FakeProvider().asProvider(),
		});
		expect(contract.options.address).toBe(ADDR);

		const empty = new Contract(abi, '', { provider: new FakeProvider().asProvider() });
		expect(empty.options.address).toBeUndefined();
	});

	it('rejects an Ethereum address and a short body (L-57)', () => {
		expect(() => new Contract(abi, `0x${'ab'.repeat(20)}`)).toThrow(InvalidAddressError);
		expect(() => new Contract(abi, `Q${'ab'.repeat(63)}`)).toThrow(InvalidAddressError);
	});
});

describe('dataInputFill (L-58)', () => {
	const where = (provider: FakeProvider, method: string) => {
		const tx = provider.lastCall(method)?.params[0] as { data?: string; input?: string };
		return { data: tx.data?.slice(0, 10), input: tx.input?.slice(0, 10) };
	};
	const SELECTOR = '0xb3de648b';

	it.each(['data', 'input', 'both'] as const)(
		'honours the %s option for call, estimateGas, createAccessList and send (L-58)',
		async fill => {
			const provider = new FakeProvider(method => {
				if (method === 'qrl_call') return `0x${uintWord(1)}`;
				if (method === 'qrl_createAccessList') return { accessList: [], gasUsed: '0x1' };
				return undefined;
			});
			const contract = new Contract(abi, ADDR, {
				provider: asProvider(provider),
				from: FROM,
				dataInputFill: fill,
			});
			const expected = {
				data: fill === 'input' ? undefined : SELECTOR,
				input: fill === 'data' ? undefined : SELECTOR,
			};

			await boundMethod(contract, 'f')(1).call();
			expect(where(provider, 'qrl_call')).toEqual(expected);
			await boundMethod(contract, 'f')(1).estimateGas();
			expect(where(provider, 'qrl_estimateGas')).toEqual(expected);
			await boundMethod(contract, 'f')(1).createAccessList();
			expect(where(provider, 'qrl_createAccessList')).toEqual(expected);

			const sent = boundMethod(
				contract,
				'f',
			)(1).send({ gas: '0x5208', maxFeePerGas: '0x10', maxPriorityFeePerGas: '0x1' });
			sent.on('error', () => undefined);
			await Promise.race([
				sent.then(
					() => undefined,
					() => undefined,
				),
				new Promise(resolve => {
					setTimeout(resolve, 1500);
				}),
			]);
			expect(where(provider, 'qrl_sendTransaction')).toEqual(expected);
		},
	);

	it('rejects an unknown dataInputFill option with a typed error (L-58)', () => {
		expect(
			() =>
				new Contract(abi, ADDR, {
					provider: new FakeProvider().asProvider(),
					dataInputFill: 'bogus' as unknown as 'data',
				}),
		).toThrow(Web3ContractError);
	});

	it('lets a context config of both override the option (L-58)', async () => {
		const provider = new FakeProvider(method =>
			method === 'qrl_call' ? `0x${uintWord(1)}` : undefined,
		);
		const context = new Web3Context({
			provider: asProvider(provider),
			config: { contractDataInputFill: 'both' },
		});
		const contract = new Contract(
			abi,
			ADDR,
			{ dataInputFill: 'data' },
			context.getContextObject(),
		);

		await boundMethod(contract, 'f')(1).estimateGas();
		expect(where(provider, 'qrl_estimateGas')).toEqual({ data: SELECTOR, input: SELECTOR });
	});
});

describe('method calls without a contract address (I-13)', () => {
	const bytecode = `0x6080604052${'ab'.repeat(40)}`;

	it('refuses to send a method call as a contract creation when the contract has data but no address (I-13)', async () => {
		const provider = new FakeProvider();
		const contract = new Contract(abi, {
			provider: asProvider(provider),
			from: FROM,
			data: bytecode,
		});

		await expect(async () => {
			await boundMethod(contract, 'transfer')(ADDR, 5).send();
		}).rejects.toThrow(Web3ContractError);
		await expect(async () => {
			await boundMethod(contract, 'transfer')(ADDR, 5).send();
		}).rejects.toThrow('would be sent as a contract creation');
		expect(provider.lastCall('qrl_sendTransaction')).toBeUndefined();
	});

	it('refuses to estimate a method call without a to address (I-13)', async () => {
		const provider = new FakeProvider();
		const contract = new Contract(abi, { provider: asProvider(provider), from: FROM });

		await expect(boundMethod(contract, 'transfer')(ADDR, 5).estimateGas()).rejects.toThrow(
			Web3ContractError,
		);
		expect(provider.lastCall('qrl_estimateGas')).toBeUndefined();
	});
});
