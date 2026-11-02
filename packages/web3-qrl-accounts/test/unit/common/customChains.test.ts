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
import { Chain, Common, ConsensusType, /* CustomChain, */ Hardfork } from '../../../src/common';
import type { ChainConfig } from '../../../src/common/types';

import * as testnet from '../../fixtures/common/testnet.json';
import * as testnet2 from '../../fixtures/common/testnet2.json';
import * as testnet3 from '../../fixtures/common/testnet3.json';

describe('[Common]: Custom chains', () => {
	it('chain -> object: should provide correct access to private network chain parameters', () => {
		const c = new Common({ chain: testnet, hardfork: Hardfork.Zond });
		expect(c.chainName()).toBe('testnet');
		expect(c.chainId()).toEqual(BigInt(12345));
		expect(c.networkId()).toEqual(BigInt(12345));
		// NOTE(rgeraldes24): custom chains tbd
		// expect(c.hardforks()[3]['block']).toBe(3);
		expect(c.hardforks()[0]['block']).toBe(0);
		expect(c.bootstrapNodes()![1].ip).toBe('10.0.0.2');
	});

	it('chain -> object: should handle custom chain parameters with missing field', () => {
		const chainParams = { ...testnet };
		delete (chainParams as any)['hardforks'];
		expect(() => {
			new Common({ chain: chainParams });
		}).toThrow('Missing required');
	});

	it('custom() -> base functionality', () => {
		const mainnetCommon = new Common({ chain: Chain.Mainnet });

		const customChainParams = { name: 'custom', chainId: 123, networkId: 678 };
		const customChainCommon = Common.custom(customChainParams, {
			hardfork: Hardfork.Zond,
		});

		// From custom chain params
		expect(customChainCommon.chainName()).toEqual(customChainParams.name);
		expect(customChainCommon.chainId()).toEqual(BigInt(customChainParams.chainId));
		expect(customChainCommon.networkId()).toEqual(BigInt(customChainParams.networkId));

		// Fallback params from mainnet
		expect(customChainCommon.genesis()).toEqual(mainnetCommon.genesis());
		expect(customChainCommon.bootstrapNodes()).toEqual(mainnetCommon.bootstrapNodes());
		expect(customChainCommon.hardforks()).toEqual(mainnetCommon.hardforks());

		// Set only to this Common
		expect(customChainCommon.hardfork()).toBe('zond');
	});

	// NOTE(rgeraldes24): custom chains tbd
	/*
	it('custom() -> behavior', () => {
		let common = Common.custom({ chainId: 123 });
		expect(common.networkId()).toEqual(BigInt(1));
		expect(common.chainName()).toBe('custom-chain');

		common = Common.custom(CustomChain.PolygonMumbai);
		expect(common.networkId()).toEqual(BigInt(80001));
		for (const customChain of Object.values(CustomChain)) {
			common = Common.custom(customChain);
			expect(common.chainName()).toEqual(customChain);
		}

		common = Common.custom(CustomChain.PolygonMumbai);
		expect(common.hardfork()).toEqual(common.DEFAULT_HARDFORK);

		common = Common.custom(CustomChain.CustomQRL, { hardfork: Hardfork.Byzantium });
		expect(common.hardfork()).toEqual(Hardfork.Byzantium);

		expect(() => {
			// @ts-expect-error TypeScript complains, nevertheless do the test for JS behavior
			Common.custom('this-chain-is-not-supported');
		}).toThrow('not supported');
	});
	*/

	it('customChains parameter: initialization exception', () => {
		expect(() => {
			new Common({ chain: testnet, customChains: [testnet] });
		}).toThrow(
			'Chain must be a string, number, or bigint when initialized with customChains passed in',
		);
	});

	it('customChains parameter: initialization', () => {
		let c = new Common({
			chain: Chain.Mainnet,
			hardfork: Hardfork.Zond,
			customChains: [testnet],
		});
		expect(c.chainName()).toBe('mainnet');
		// NOTE(rgeraldes24): custom chains tbd
		// expect(c.hardforkBlock()!).toEqual(BigInt(4370000));
		expect(c.hardforkBlock()!).toEqual(BigInt(0));

		c.setChain('testnet');
		expect(c.chainName()).toBe('testnet');
		// NOTE(rgeraldes24): custom chains tbd
		// expect(c.hardforkBlock()!).toEqual(BigInt(4));
		expect(c.hardforkBlock()!).toEqual(BigInt(0));

		c = new Common({
			chain: 'testnet',
			hardfork: Hardfork.Zond,
			customChains: [testnet],
		});
		expect(c.chainName()).toBe('testnet');
		// NOTE(rgeraldes24): custom chains tbd
		// expect(c.hardforkBlock()!).toEqual(BigInt(4));
		expect(c.hardforkBlock()!).toEqual(BigInt(0));

		const customChains = [testnet, testnet2, testnet3];
		c = new Common({
			chain: 'testnet2',
			hardfork: Hardfork.Zond,
			customChains,
		});
		expect(c.chainName()).toBe('testnet2');
		// NOTE(rgeraldes24): custom chains tbd
		// expect(c.hardforkBlock()!).toEqual(BigInt(10));
		expect(c.hardforkBlock()!).toEqual(BigInt(0));

		c.setChain('testnet');
		expect(c.chainName()).toBe('testnet');
		expect(c.consensusType()).toEqual(ConsensusType.ProofOfStake);
	});
});

describe('custom chain setup with hardforks', () => {
	const undefinedHardforks = [
		{
			name: 'chainstart',
			block: 0,
		},
		{ name: 'homestead' },
		// eslint-disable-next-line no-null/no-null
		{ name: 'byzantium', block: null },
		{ name: 'tangerineWhistle', block: 10 },
	];
	it('with undefined/null block numbers', () => {
		expect(
			// @ts-expect-error -- Disabling type check to verify that error is thrown
			() => Common.custom({ hardforks: undefinedHardforks }),
		).toThrow();

		const nullHardforks = [
			{
				name: 'chainstart',
				block: 0,
			},
			// eslint-disable-next-line no-null/no-null
			{ name: 'homestead', block: null },
			{ name: 'tangerineWhistle', block: 10 },
		];

		const common = Common.custom({ hardforks: nullHardforks });
		common.setHardforkByBlockNumber(10);
		expect('tangerineWhistle').toEqual(common.hardfork());
		common.setHardforkByBlockNumber(3);
		expect('chainstart').toEqual(common.hardfork());
	});
});

describe('[Common]: chain state isolation (L-16)', () => {
	it('copy() shares neither chain parameters, fork hashes nor listeners with the original', () => {
		const original = new Common({ chain: Chain.Mainnet });
		const listener = jest.fn();
		original.on('hardforkChanged', listener);

		const copy = original.copy();
		copy.setForkHashes(new Uint8Array(32));

		expect(copy.forkHash()).toMatch(/^0x[0-9a-f]{8}$/);
		expect(copy.hardforks()).not.toBe(original.hardforks());
		expect(copy.qips()).not.toBe(original.qips());
		expect(copy.listenerCount('hardforkChanged')).toBe(0);
		expect(original.listenerCount('hardforkChanged')).toBe(1);
		// The original and every other Common still have no fork hash.
		expect(() => original.forkHash()).toThrow('genesisHash required');
		expect(() => new Common({ chain: 1 }).forkHash()).toThrow('genesisHash required');
		expect(() => Common.custom({ chainId: 7 }).forkHash()).toThrow('genesisHash required');
	});

	it('does not hand out the module-level mainnet definition by reference', () => {
		const a = new Common({ chain: 'mainnet' });
		const b = new Common({ chain: 'mainnet' });
		expect(a.hardforks()).not.toBe(b.hardforks());
		expect(a.genesis()).not.toBe(b.genesis());

		a.setForkHashes(new Uint8Array(32));
		expect(() => b.forkHash()).toThrow('genesisHash required');
		expect(() => Common.custom({ chainId: 7 }).forkHash()).toThrow('genesisHash required');
		expect(Common.custom({ chainId: 7 }).hardforks()).not.toBe(a.hardforks());
	});

	it('setChain(object) keeps a private copy of the caller configuration', () => {
		const config = JSON.parse(JSON.stringify(testnet)) as ChainConfig;
		const c = new Common({ chain: config, hardfork: Hardfork.Zond });

		config.chainId = 99999;
		config.hardforks[0].block = 5;
		config.bootstrapNodes![0].ip = '0.0.0.0';

		expect(c.chainId()).toEqual(BigInt(12345));
		expect(c.hardforks()[0].block).toBe(0);
		expect(c.bootstrapNodes()![0].ip).not.toBe('0.0.0.0');
		// ...and the instance does not write into the caller's object either.
		c.setForkHashes(new Uint8Array(32));
		expect(config.hardforks[0].forkHash).toBeUndefined();
	});

	it('customChains are copied as well', () => {
		const custom = JSON.parse(JSON.stringify(testnet)) as ChainConfig;
		const c = new Common({ chain: 'testnet', customChains: [custom] });
		c.setForkHashes(new Uint8Array(32));
		expect(custom.hardforks[0].forkHash).toBeUndefined();
		expect(() => new Common({ chain: 'testnet', customChains: [custom] }).forkHash()).toThrow(
			'genesisHash required',
		);
	});
});
