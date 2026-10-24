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
import { parseGqrlGenesis } from '../../../src/common/utils';
import invalidSpuriousDragon from '../../fixtures/common/invalid-spurious-dragon.json';
import posExecGenesis from '../../fixtures/common/pos-exec-genesis.json';
import noExtraData from '../../fixtures/common/no-extra-data.json';
import gqrlGenesisKiln from '../../fixtures/common/gqrl-genesis-kiln.json';

describe('[Utils/Parse]', () => {
	const kilnForkHashes: any = {
		zond: '0xbcadf543',
	};

	it('should throw with invalid Spurious Dragon blocks', async () => {
		expect(() => {
			parseGqrlGenesis(invalidSpuriousDragon, 'bad_params');
		}).toThrow();
	});

	it('should import pos network params correctly', async () => {
		let params = parseGqrlGenesis(posExecGenesis, 'pos');
		expect(params.genesis.baseFeePerGas).toBe('0x7');
		expect(params.consensus).toEqual({
			type: 'pos',
			algorithm: 'casper',
			casper: {},
		});
		posExecGenesis.baseFeePerGas = '0x8';
		params = parseGqrlGenesis(posExecGenesis, 'pos');
		expect(params.genesis.baseFeePerGas).toBe('0x8');
		// NOTE(rgeraldes24): params.hardfork returns undefined which is expected when there is not fork in the genesis config
		// expect(params.hardfork).toEqual(Hardfork.Zond);
	});

	it('should generate expected hash with zond block zero and base fee per gas defined', async () => {
		const params = parseGqrlGenesis(posExecGenesis, 'pos');
		expect(params.genesis.baseFeePerGas).toEqual(posExecGenesis.baseFeePerGas);
	});

	it('should successfully parse genesis file with no extraData', async () => {
		const params = parseGqrlGenesis(noExtraData, 'noExtraData');
		expect(params.genesis.extraData).toBe('0x');
		expect(params.genesis.timestamp).toBe('0x10');
	});

	it('should successfully parse kiln genesis and set forkhash', async () => {
		const common = Common.fromGqrlGenesis(gqrlGenesisKiln, {
			chain: 'customChain',
			genesisHash: hexToBytes(
				'51c7fe41be669f69c45c33a56982cbde405313342d9e2b00d7c91a7b284dd4f8',
			),
		});
		expect(common.hardforks().map(hf => hf.name)).toEqual(['zond']);
		for (const hf of common.hardforks()) {
			expect(hf.forkHash).toEqual(kilnForkHashes[hf.name]);
		}

		expect(common.hardfork()).toEqual(Hardfork.Zond);

		// Ok lets schedule zond at block 0, this should force merge to be scheduled at just after
		// genesis if even mergeForkIdTransition is not confirmed to be post merge
		// This will also check if the forks are being correctly sorted based on block
		Object.assign(gqrlGenesisKiln.config, { zondTime: Math.floor(Date.now() / 1000) });
		const common1 = Common.fromGqrlGenesis(gqrlGenesisKiln, {
			chain: 'customChain',
		});
		// merge hardfork is now scheduled just after zond even if mergeForkIdTransition is not confirmed
		// to be post merge
		expect(common1.hardforks().map(hf => hf.name)).toEqual(['zond']);

		expect(common1.hardfork()).toEqual(Hardfork.Zond);
	});

	it('should successfully parse genesis', async () => {
		const common = Common.fromGqrlGenesis(posExecGenesis, {
			chain: 'customChain',
		});
		expect(common.hardforks().map(hf => hf.name)).toEqual(['zond']);

		expect(common.getHardforkByBlockNumber(0)).toEqual(Hardfork.Zond);
		expect(common.getHardforkByBlockNumber(1, BigInt(2))).toEqual(Hardfork.Zond);
		// zond is at timestamp 8
		expect(common.getHardforkByBlockNumber(8)).toEqual(Hardfork.Zond);
		expect(common.getHardforkByBlockNumber(8, BigInt(2))).toEqual(Hardfork.Zond);
		expect(common.getHardforkByBlockNumber(8, 8)).toEqual(Hardfork.Zond);
		// should be post merge at zond
		expect(common.getHardforkByBlockNumber(8, 8)).toEqual(Hardfork.Zond);
		expect(common.hardfork()).toEqual(Hardfork.Zond);
	});
});
