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
// import { toBigInt } from '@theqrl/web3-utils';
import { /*Chain,*/ Common, Hardfork } from '../../../src/common';

import * as testnetMerge from '../../fixtures/common/merge/testnetMerge.json';
import * as testnetPOS from '../../fixtures/common/merge/testnetPOS.json';
import postMerge from '../../fixtures/common/post-merge.json';

describe('[Common]: Merge/POS specific logic', () => {
	it('getHardforkByBlockNumber()', () => {
		const customChains = [testnetMerge];
		const c = new Common({
			chain: 'testnetMerge',
			hardfork: Hardfork.Shanghai,
			customChains,
		});

		expect(c.getHardforkByBlockNumber(0)).toBe('shanghai');
		expect(c.getHardforkByBlockNumber(14)).toBe('shanghai');
		expect(c.getHardforkByBlockNumber(15, 5000)).toBe('shanghai');
		expect(c.getHardforkByBlockNumber(15, 5001)).toBe('shanghai');
		expect(c.getHardforkByBlockNumber(15, 4999)).toBe('shanghai');
		expect(c.getHardforkByBlockNumber(12, 4999)).toBe('shanghai');
	});

	it('getHardforkByBlockNumber()', () => {
		const testnetMergeWithBlockNumber = JSON.parse(JSON.stringify(testnetMerge));
		// Set Merge block to 15
		// testnetMergeWithBlockNumber['hardforks'][8]['block'] = 16;
		const customChains = [testnetMergeWithBlockNumber];
		const c = new Common({
			chain: 'testnetMerge',
			hardfork: Hardfork.Shanghai,
			customChains,
		});

		expect(c.getHardforkByBlockNumber(0)).toBe('shanghai');
		expect(c.getHardforkByBlockNumber(16)).toBe('shanghai');
		expect(c.getHardforkByBlockNumber(16, 5000)).toBe('shanghai');
		expect(c.getHardforkByBlockNumber(16, 5001)).toBe('shanghai');
		expect(c.getHardforkByBlockNumber(12, 4999)).toBe('shanghai');
	});

	it('getHardforkByBlockNumber()', () => {
		const testnetMergeWithBlockNumber = JSON.parse(JSON.stringify(testnetMerge));
		// Set Merge block to 15
		// testnetMergeWithBlockNumber['hardforks'][8]['block'] = 16;
		// Set Shanghai block to 18
		// testnetMergeWithBlockNumber['hardforks'][9]['block'] = 18;
		const customChains = [testnetMergeWithBlockNumber];
		const c = new Common({
			chain: 'testnetMerge',
			hardfork: Hardfork.Shanghai,
			customChains,
		});

		expect(c.getHardforkByBlockNumber(18, 5001)).toBe('shanghai');
	});

	it('setHardforkByBlockNumber()', () => {
		const customChains = [testnetMerge];
		const c = new Common({
			chain: 'testnetMerge',
			hardfork: Hardfork.Shanghai,
			customChains,
		});

		expect(c.setHardforkByBlockNumber(0)).toBe('shanghai');
		expect(c.setHardforkByBlockNumber(14)).toBe('shanghai');
		expect(c.setHardforkByBlockNumber(15, 5000)).toBe('shanghai');
		expect(c.setHardforkByBlockNumber(15, 5001)).toBe('shanghai');
		expect(c.setHardforkByBlockNumber(15, 4999)).toBe('shanghai');
		expect(c.setHardforkByBlockNumber(12, 4999)).toBe('shanghai');
	});

	it('setHardforkByBlockNumber()', () => {
		const testnetMergeWithBlockNumber = JSON.parse(JSON.stringify(testnetMerge));
		// Set Merge block to 15
		// testnetMergeWithBlockNumber['hardforks'][8]['block'] = 16;
		const customChains = [testnetMergeWithBlockNumber];
		const c = new Common({
			chain: 'testnetMerge',
			hardfork: Hardfork.Shanghai,
			customChains,
		});

		expect(c.setHardforkByBlockNumber(0)).toBe('shanghai');
		expect(c.setHardforkByBlockNumber(16)).toBe('shanghai');
		expect(c.setHardforkByBlockNumber(16, 5000)).toBe('shanghai');
		expect(c.setHardforkByBlockNumber(16, 5001)).toBe('shanghai');
		expect(c.setHardforkByBlockNumber(12, 4999)).toBe('shanghai');
	});

	it('setHardforkByBlockNumber()', () => {
		const testnetMergeWithBlockNumber = JSON.parse(JSON.stringify(testnetMerge));
		// Set Merge block to 15
		// testnetMergeWithBlockNumber['hardforks'][8]['block'] = 16;
		// Set Shanghai block to 18
		// testnetMergeWithBlockNumber['hardforks'][9]['block'] = 18;
		const customChains = [testnetMergeWithBlockNumber];
		const c = new Common({
			chain: 'testnetMerge',
			hardfork: Hardfork.Shanghai,
			customChains,
		});

		expect(c.setHardforkByBlockNumber(18, 5001)).toBe('shanghai');
	});

	it('Pure POS testnet', () => {
		const customChains = [testnetPOS];
		const c = new Common({ chain: 'testnetPOS', hardfork: Hardfork.Shanghai, customChains });

		expect(c.getHardforkByBlockNumber(5, 0)).toBe('shanghai');
	});
	
	it('Should fail setting invalid hardfork', () => {
		const customChains = [testnetPOS];
		expect(() => {
			// eslint-disable-next-line no-new
			new Common({ chain: 'testnetPOS', hardfork: 'invalid', customChains });
		}).toThrow(`Hardfork with name invalid not supported`);
	});

	it('should get the correct merge hardfork at genesis', async () => {
		const c = Common.fromGzondGenesis(postMerge, { chain: 'post-merge' });
		expect(c.getHardforkByBlockNumber(0)).toEqual(Hardfork.Shanghai);
		expect(c.getHardforkByBlockNumber(0, BigInt(0))).toEqual(Hardfork.Shanghai);
	});

	// NOTE(rgeraldes24): not valid atm
	/*
	it('test post merge hardforks using Sepolia with block null', () => {
		const c = new Common({ chain: Chain.Sepolia });

		expect(c.getHardforkByBlockNumber(0)).toEqual(Hardfork.London);
		// Make it null manually as config could be updated later
		// eslint-disable-next-line no-null/no-null
		const mergeHf = c.hardforks().filter(hf => hf.ttd !== undefined && hf.ttd !== null)[0];
		const prevMergeBlockVal = mergeHf.block;
		// eslint-disable-next-line no-null/no-null
		mergeHf.block = null;

		// should get Hardfork.London even though happened with 1450408 as terminal as config doesn't have that info
		expect(c.getHardforkByBlockNumber(1450409)).toEqual(Hardfork.London);
		// however with correct td in input it should select merge
		expect(c.getHardforkByBlockNumber(1450409, BigInt('17000000000000000'))).toEqual(
			Hardfork.Merge,
		);
		// should select MergeForkIdTransition even without td specified as the block is set for this hardfork
		expect(c.getHardforkByBlockNumber(1735371)).toEqual(Hardfork.MergeForkIdTransition);
		// also with td specified
		expect(c.getHardforkByBlockNumber(1735371, BigInt('17000000000000000'))).toEqual(
			Hardfork.MergeForkIdTransition,
		);

		// Check nextHardforkBlockOrTimestamp should be MergeForkIdTransition's block on london and merge both
		expect(c.nextHardforkBlockOrTimestamp(Hardfork.Berlin)).toEqual(toBigInt(1735371));
		expect(c.nextHardforkBlockOrTimestamp(Hardfork.London)).toEqual(toBigInt(1735371));
		expect(c.nextHardforkBlockOrTimestamp(Hardfork.Merge)).toEqual(toBigInt(1735371));

		expect(() => {
			c.getHardforkByBlockNumber(1735371, BigInt('15000000000000000'));
		}).toThrow('Maximum HF determined by total difficulty is lower than the block number HF');

		expect(c.setHardforkByBlockNumber(0)).toEqual(Hardfork.London);
		expect(c.setHardforkByBlockNumber(1450409)).toEqual(Hardfork.London);
		expect(c.setHardforkByBlockNumber(1450409, BigInt('17000000000000000'))).toEqual(
			Hardfork.Merge,
		);
		expect(c.setHardforkByBlockNumber(1735371)).toEqual(Hardfork.MergeForkIdTransition);
		expect(c.setHardforkByBlockNumber(1735371, BigInt('17000000000000000'))).toEqual(
			Hardfork.MergeForkIdTransition,
		);

		expect(() => {
			c.setHardforkByBlockNumber(1735371, BigInt('15000000000000000'));
		}).toThrow('Maximum HF determined by total difficulty is lower than the block number HF');
		// restore value
		mergeHf.block = prevMergeBlockVal;
	});

	it('should get correct merge and post merge hf with merge block specified', () => {
		const c = new Common({ chain: Chain.Sepolia });
		// eslint-disable-next-line no-null/no-null
		const mergeHf = c.hardforks().filter(hf => hf.ttd !== undefined && hf.ttd !== null)[0];
		const prevMergeBlockVal = mergeHf.block;
		// the terminal block on sepolia is 1450408
		mergeHf.block = 1450409;

		// should get merge even without td supplied as the merge hf now has the block specified
		expect(c.setHardforkByBlockNumber(1450409)).toEqual(Hardfork.Merge);
		expect(c.setHardforkByBlockNumber(1450409, BigInt('17000000000000000'))).toEqual(
			Hardfork.Merge,
		);
		expect(c.setHardforkByBlockNumber(1735371)).toEqual(Hardfork.MergeForkIdTransition);
		expect(c.setHardforkByBlockNumber(1735371, BigInt('17000000000000000'))).toEqual(
			Hardfork.MergeForkIdTransition,
		);

		// Check nextHardforkBlockOrTimestamp should be MergeForkIdTransition's block on london and merge both
		expect(c.nextHardforkBlockOrTimestamp(Hardfork.London)).toEqual(toBigInt(1735371));
		expect(c.nextHardforkBlockOrTimestamp(Hardfork.Merge)).toEqual(toBigInt(1735371));

		// restore value
		mergeHf.block = prevMergeBlockVal;
	});
	*/
});
