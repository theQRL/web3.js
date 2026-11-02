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

import { SupportedProviders } from '@theqrl/web3-types';
import { InvalidProviderError, ProviderError } from '@theqrl/web3-errors';
import { Web3ConfigEvent } from '../../src/web3_config';
import { Web3Context, Web3PluginBase } from '../../src/web3_context';
import { Web3RequestManagerEvent } from '../../src/web3_request_manager';

class Context1 extends Web3Context {}
class Context2 extends Web3Context {}

const provider = {
		// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
	request: async () => undefined,
} as unknown as SupportedProviders;

describe('Web3Context lifecycle', () => {
	describe('constructor input (I-14)', () => {
		it.each(['', '   '])('rejects the blank provider URL %p with an InvalidProviderError (I-14)', url => {
			expect(() => new Web3Context(url)).toThrow(InvalidProviderError);
		});

		it.each([true, 0, 5])(
			'rejects the non-object value %p with a ProviderError instead of a TypeError (I-14)',
			value => {
				expect(() => new Web3Context(value as never)).toThrow(ProviderError);
				expect(() => new Web3Context(value as never)).not.toThrow(TypeError);
			},
		);
	});

	describe('link() (L-36)', () => {
		it('adopts the parent request manager without setting the provider again (L-36)', () => {
			const parent = new Context1(provider);
			const child = new Context2(provider);
			const setProvider = jest.spyOn(parent.requestManager, 'setProvider');
			const changed = jest.fn();
			parent.requestManager.on(Web3RequestManagerEvent.PROVIDER_CHANGED, changed);

			child.link(parent);

			expect(child.requestManager).toBe(parent.requestManager);
			expect(child.provider).toBe(parent.provider);
			expect(setProvider).not.toHaveBeenCalled();
			expect(changed).not.toHaveBeenCalled();
		});

		it('registerPlugin() does not set the provider again on the shared request manager (L-36)', () => {
			class Plugin extends Web3PluginBase {
				public pluginNamespace = 'plugin';
			}
			const context = new Context1(provider);
			const setProvider = jest.spyOn(context.requestManager, 'setProvider');

			context.registerPlugin(new Plugin());

			expect(setProvider).not.toHaveBeenCalled();
		});
	});

	describe('setConfig() propagation (L-39)', () => {
		it('reaches the contexts created with use() and attached with link() (L-39)', () => {
			const parent = new Context1(provider);
			const used = parent.use(Context2);
			const linked = new Context2(provider);
			linked.link(parent);

			parent.setConfig({
				defaultBlock: 'pending',
				handleRevert: true,
				transactionConfirmationBlocks: 1,
				defaultCommon: {
					customChain: { name: 'x', networkId: 77, chainId: 77 },
					baseChain: 'mainnet',
					hardfork: 'zond',
				},
			});

			for (const context of [parent, used, linked]) {
				expect(context.defaultBlock).toBe('pending');
				expect(context.handleRevert).toBe(true);
				expect(context.transactionConfirmationBlocks).toBe(1);
				expect(context.defaultCommon?.customChain.chainId).toBe(77);
			}
		});
	});

	describe('dispose() (L-37)', () => {
		it('removes the CONFIG_CHANGE forwarder a use() child registered on its parent (L-37)', () => {
			const parent = new Context1(provider);
			const child = parent.use(Context2);
			expect(parent.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(1);

			child.dispose();

			expect(parent.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(0);
			parent.defaultBlock = 'pending';
			expect(child.defaultBlock).toBe('latest');
		});

		it('removes the CONFIG_CHANGE forwarder a linked context registered on its parent (L-37)', () => {
			const parent = new Context1(provider);
			const child = new Context2(provider);
			child.link(parent);
			expect(parent.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(1);

			child.dispose();

			expect(parent.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(0);
		});

		it('disposes the subscription manager it created but not a shared one (L-37)', () => {
			const parent = new Context1(provider);
			const { requestManager } = parent;
			expect(requestManager.listenerCount(Web3RequestManagerEvent.PROVIDER_CHANGED)).toBe(1);

			// Shares the parent's managers: disposing it must leave them alone.
			const child = parent.use(Context2);
			child.dispose();
			expect(requestManager.listenerCount(Web3RequestManagerEvent.PROVIDER_CHANGED)).toBe(1);

			// Owns a manager on the shared request manager: disposing it releases the listeners.
			const sibling = new Context2({ provider, requestManager });
			expect(requestManager.listenerCount(Web3RequestManagerEvent.PROVIDER_CHANGED)).toBe(2);
			sibling.dispose();
			expect(requestManager.listenerCount(Web3RequestManagerEvent.PROVIDER_CHANGED)).toBe(1);

			parent.dispose();
			expect(requestManager.listenerCount(Web3RequestManagerEvent.PROVIDER_CHANGED)).toBe(0);
			expect(requestManager.listenerCount(Web3RequestManagerEvent.BEFORE_PROVIDER_CHANGE)).toBe(0);
		});

		it('removes the listeners registered on the context itself (L-37)', () => {
			const parent = new Context1(provider);
			parent.use(Context2);
			parent.on(Web3ConfigEvent.CONFIG_CHANGE, () => undefined);
			expect(parent.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(2);

			parent.dispose();

			expect(parent.listenerCount(Web3ConfigEvent.CONFIG_CHANGE)).toBe(0);
		});
	});
});
