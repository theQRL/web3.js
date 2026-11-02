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

import { JsonRpcRequest, SupportedProviders } from '@theqrl/web3-types';
import { InvalidProviderError, ProviderError } from '@theqrl/web3-errors';
import { Wallet, create } from '@theqrl/web3-qrl-accounts';
import { Web3 } from '../../src/web3';

const SYMBOL = Symbol.for('web3/base-provider');
const abi = [
	{
		type: 'function',
		name: 'get',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint256' }],
	},
] as const;
const address = `Q${'11'.repeat(64)}`;

// A web3 provider that answers every call with `result`; `calls` records the methods sent.
const makeProvider = (result: string, calls: string[] = []) =>
	({
		[SYMBOL]: true,
		calls,
		// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks a provider's request
		request: async (payload: JsonRpcRequest) => {
			calls.push(payload.method);
			return { jsonrpc: '2.0', id: payload.id, result };
		},
	}) as unknown as SupportedProviders & { calls: string[] };

describe('Web3 umbrella context sharing', () => {
	describe('contracts created with web3.qrl.Contract (M-6)', () => {
		const forms: [string, (web3: Web3) => InstanceType<Web3['qrl']['Contract']>][] = [
			['(abi, address)', web3 => new web3.qrl.Contract(abi, address)],
			['(abi, address, {})', web3 => new web3.qrl.Contract(abi, address, {})],
			['(abi, address, { gas })', web3 => new web3.qrl.Contract(abi, address, { gas: '0x5208' })],
			['(abi)', web3 => new web3.qrl.Contract(abi)],
		];

		it.each(forms)(
			'new web3.qrl.Contract%s shares the request manager, wallet, account provider, subscription manager and config with web3 (M-6)',
			(_, make) => {
				const web3 = new Web3(makeProvider('0x1'));
				web3.transactionConfirmationBlocks = 0;
				web3.defaultBlock = 'pending';
				web3.handleRevert = true;

				const contract = make(web3);

				expect(contract.requestManager).toBe(web3.requestManager);
				expect(contract.wallet).toBe(web3.wallet);
				expect(contract.accountProvider).toBe(web3.accountProvider);
				expect(contract.subscriptionManager).toBe(web3.subscriptionManager);
				expect(contract.defaultBlock).toBe('pending');
				expect(contract.handleRevert).toBe(true);
				expect(contract.transactionConfirmationBlocks).toBe(0);
			},
		);

		it('keeps the explicit options of the (abi, address, options) form (M-6)', () => {
			const web3 = new Web3(makeProvider('0x1'));
			const contract = new web3.qrl.Contract(abi, address, { gas: '0x5208', from: address });
			expect(contract.options.gas).toBe('0x5208');
			expect(contract.options.from).toBe(address);
			expect(contract.requestManager).toBe(web3.requestManager);
		});

		it('web3.setProvider() reaches a contract created with (abi, address) (M-6)', async () => {
			const first = makeProvider(`0x${'00'.repeat(63)}2a`);
			const second = makeProvider(`0x${'00'.repeat(63)}2b`);
			const web3 = new Web3(first);
			const contract = new web3.qrl.Contract(abi, address);
			const withOptions = new web3.qrl.Contract(abi, address, {});

			web3.setProvider(second);

			expect(web3.provider).toBe(second);
			expect(contract.provider).toBe(second);
			expect(withOptions.provider).toBe(second);
			await expect(contract.methods.get().call()).resolves.toBe(BigInt(43));
			expect(second.calls).toContain('qrl_call');
			expect(first.calls).not.toContain('qrl_call');
		});

		it('a wallet account added to web3 is visible to a contract created with (abi, address) (M-6)', () => {
			const web3 = new Web3(makeProvider('0x1'));
			const account = web3.qrl.accounts.wallet.add(web3.qrl.accounts.create()).get(0);
			const contract = new web3.qrl.Contract(abi, address);
			expect(contract.wallet?.get(account?.address as string)).toBe(account);
		});
	});

	describe('wallet and account provider supplied through the init options (L-41)', () => {
		it('keeps the supplied wallet as web3.wallet and web3.qrl.accounts.wallet (L-41)', () => {
			const wallet = new Wallet({
				create,
				seedToAccount: () => {
					throw new Error('unused');
				},
				decrypt: () => {
					throw new Error('unused');
				},
			});
			const [account] = wallet.create(1);
			const web3 = new Web3({ provider: makeProvider('0x1'), wallet });

			expect(web3.wallet).toBe(wallet);
			expect(web3.qrl.accounts.wallet).toBe(wallet);
			expect(web3.wallet?.length).toBe(1);
			expect(web3.wallet?.get(account.address)).toBe(account);
			expect(web3.qrl.wallet).toBe(wallet);
			expect(new web3.qrl.Contract(abi, address).wallet).toBe(wallet);
		});

		it('keeps a supplied account provider (L-41)', () => {
			const accountProvider = {
				create: () => {
					throw new Error('unused');
				},
				seedToAccount: () => {
					throw new Error('unused');
				},
				decrypt: () => {
					throw new Error('unused');
				},
			};
			const web3 = new Web3({ provider: makeProvider('0x1'), accountProvider });
			expect(web3.accountProvider).toBe(accountProvider);
			expect(web3.qrl.accountProvider).toBe(accountProvider);
		});

		it('creates an empty wallet and uses the accounts helper as provider when nothing is supplied (L-41)', () => {
			const web3 = new Web3({ provider: makeProvider('0x1') });
			expect(web3.wallet).toBe(web3.qrl.accounts.wallet);
			expect(web3.wallet?.length).toBe(0);
			expect(web3.accountProvider).toBe(web3.qrl.accounts);
		});
	});

	describe('constructor input (I-14)', () => {
		it.each(['', '   '])('rejects the blank URL %p with an InvalidProviderError (I-14)', url => {
			expect(() => new Web3(url)).toThrow(InvalidProviderError);
		});

		it.each([true, 0, 5])(
			'rejects the non-object value %p with a ProviderError instead of a TypeError (I-14)',
			value => {
				expect(() => new Web3(value as never)).toThrow(ProviderError);
				expect(() => new Web3(value as never)).not.toThrow(TypeError);
			},
		);

		it('setProvider("") throws an InvalidProviderError and keeps the provider (I-14)', () => {
			const provider = makeProvider('0x1');
			const web3 = new Web3(provider);
			expect(() => web3.setProvider('')).toThrow(InvalidProviderError);
			expect(web3.provider).toBe(provider);
		});

		it('warns, and does not throw, for an options object without a provider', () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
			try {
				const web3 = new Web3({});
				expect(web3.provider).toBeUndefined();
				expect(warn).toHaveBeenCalledTimes(1);
			} finally {
				warn.mockRestore();
			}
		});
	});
});
