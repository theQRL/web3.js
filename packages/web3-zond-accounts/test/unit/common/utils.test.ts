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
import { hexToBytes } from '@theqrl/web3-utils';
import { Common } from '../../../src/common/common';
import { Hardfork } from '../../../src/common';
import { parseGzondGenesis } from '../../../src/common/utils';
import invalidSpuriousDragon from '../../fixtures/common/invalid-spurious-dragon.json';
import posExecGenesis from '../../fixtures/common/pos-exec-genesis.json';
import noExtraData from '../../fixtures/common/no-extra-data.json';
import gzondGenesisKiln from '../../fixtures/common/gzond-genesis-kiln.json';

describe('[Utils/Parse]', () => {
	const kilnForkHashes: any = {
		shanghai: '0xbcadf543',
	};

	it('should throw with invalid Spurious Dragon blocks', async () => {
		expect(() => {
			parseGzondGenesis(invalidSpuriousDragon, 'bad_params');
		}).toThrow();
	});

	it('should import pos network params correctly', async () => {
		let params = parseGzondGenesis(posExecGenesis, 'pos');
		expect(params.genesis.baseFeePerGas).toBe('0x7');
		expect(params.consensus).toEqual({
			type: 'pos',
			algorithm: 'casper',
			casper: {},
		});
		posExecGenesis.baseFeePerGas = '0x8';
		params = parseGzondGenesis(posExecGenesis, 'pos');
		expect(params.genesis.baseFeePerGas).toBe('0x8');
		// NOTE(rgeraldes24): params.hardfork returns undefined which is expected when there is not fork in the genesis config
		// expect(params.hardfork).toEqual(Hardfork.Shanghai);
	});

	it('should generate expected hash with shanghai block zero and base fee per gas defined', async () => {
		const params = parseGzondGenesis(posExecGenesis, 'pos');
		expect(params.genesis.baseFeePerGas).toEqual(posExecGenesis.baseFeePerGas);
	});

	it('should successfully parse genesis file with no extraData', async () => {
		const params = parseGzondGenesis(noExtraData, 'noExtraData');
		expect(params.genesis.extraData).toBe('0x');
		expect(params.genesis.timestamp).toBe('0x10');
	});

	it('should successfully parse kiln genesis and set forkhash', async () => {
		const common = Common.fromGzondGenesis(gzondGenesisKiln, {
			chain: 'customChain',
			genesisHash: hexToBytes(
				'51c7fe41be669f69c45c33a56982cbde405313342d9e2b00d7c91a7b284dd4f8',
			),
		});
		expect(common.hardforks().map(hf => hf.name)).toEqual([
			'shanghai',
		]);
		for (const hf of common.hardforks()) {
			/* eslint-disable @typescript-eslint/no-use-before-define */
			expect(hf.forkHash).toEqual(kilnForkHashes[hf.name]);
		}

		expect(common.hardfork()).toEqual(Hardfork.Shanghai);

		// Ok lets schedule shanghai at block 0, this should force merge to be scheduled at just after
		// genesis if even mergeForkIdTransition is not confirmed to be post merge
		// This will also check if the forks are being correctly sorted based on block
		Object.assign(gzondGenesisKiln.config, { shanghaiTime: Math.floor(Date.now() / 1000) });
		const common1 = Common.fromGzondGenesis(gzondGenesisKiln, {
			chain: 'customChain',
		});
		// merge hardfork is now scheduled just after shanghai even if mergeForkIdTransition is not confirmed
		// to be post merge
		expect(common1.hardforks().map(hf => hf.name)).toEqual([
			'shanghai',
		]);

		expect(common1.hardfork()).toEqual(Hardfork.Shanghai);
	});

	it('should successfully parse genesis', async () => {
		const common = Common.fromGzondGenesis(posExecGenesis, {
			chain: 'customChain',
		});
		expect(common.hardforks().map(hf => hf.name)).toEqual([
			'shanghai',
		]);

		expect(common.getHardforkByBlockNumber(0)).toEqual(Hardfork.Shanghai);
		expect(common.getHardforkByBlockNumber(1, BigInt(2))).toEqual(Hardfork.Shanghai);
		// shanghai is at timestamp 8
		expect(common.getHardforkByBlockNumber(8)).toEqual(Hardfork.Shanghai);
		expect(common.getHardforkByBlockNumber(8, BigInt(2))).toEqual(Hardfork.Shanghai);
		expect(common.getHardforkByBlockNumber(8,  8)).toEqual(Hardfork.Shanghai);
		// should be post merge at shanghai
		expect(common.getHardforkByBlockNumber(8,  8)).toEqual(Hardfork.Shanghai);
		expect(common.hardfork()).toEqual(Hardfork.Shanghai);
	});
});
