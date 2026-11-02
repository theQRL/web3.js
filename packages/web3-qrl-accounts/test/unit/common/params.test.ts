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
import { Chain, Common, Hardfork } from '../../../src/common';

describe('[Common]: Parameter access for param(), paramByHardfork()', () => {
	it('Basic usage', () => {
		const c = new Common({ chain: Chain.Mainnet, qips: [] });
		expect(c.paramByHardfork('gasPrices', 'depositroot', 'zond')).toEqual(BigInt(18000));
		expect(c.paramByHardfork('gasPrices', 'mldsa87Verify', 'zond')).toEqual(BigInt(125000));

		// NOTE(rgeraldes24): there are no param updates yet
		expect(c.param('gasPrices', 'depositroot')).toEqual(BigInt(18000));
		expect(c.param('gasPrices', 'mldsa87Verify')).toEqual(BigInt(125000));

		expect(c.param('gasPrices', 'notexistingvalue')).toEqual(BigInt(0));
		expect(c.paramByHardfork('gasPrices', 'notexistingvalue', 'zond')).toEqual(BigInt(0));
	});

	it('Error cases for param(), paramByHardfork()', () => {
		const c = new Common({ chain: Chain.Mainnet });

		expect(() => {
			c.paramByHardfork('gasPrizes', 'depositroot', 'byzantium');
		}).toThrow('Topic gasPrizes not defined');

		c.setHardfork(Hardfork.Zond);
		expect(c.param('gasPrices', 'depositroot')).toEqual(BigInt(18000));
	});

	// NOTE(rgeraldes24): there are no param updates yet
	it('Parameter updates', () => {
		const c = new Common({ chain: Chain.Mainnet });

		expect(c.paramByHardfork('gasPrices', 'depositroot', 'zond')).toEqual(BigInt(18000));

		// expect(c.paramByHardfork('pow', 'minerReward', 'byzantium')).toEqual(
		// 	BigInt(3000000000000000000),
		// );

		// NOTE(rgeraldes24): removed along EIP-1283
		// expect(c.paramByHardfork('gasPrices', 'netSstoreNoopGas', 'constantinople')).toEqual(
		// 	BigInt(200),
		// );

		// NOTE(rgeraldes24): removed along EIP-1283
		// expect(c.paramByHardfork('gasPrices', 'netSstoreNoopGas', 'petersburg')).toEqual(BigInt(0));
	});

	// NOTE(rgeraldes24): there are no param updates yet
	it('Access by block number, paramByBlock()', () => {
		const c = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Zond });
		expect(c.paramByBlock('gasPrices', 'depositroot', 4370000)).toEqual(BigInt(18000));
		expect(c.paramByBlock('gasPrices', 'depositroot', 4369999)).toEqual(BigInt(18000));

		/*
		const c = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Zond });
		expect(c.paramByBlock('pow', 'minerReward', 4370000)).toEqual(BigInt(3000000000000000000));
		expect(c.paramByBlock('pow', 'minerReward', 4369999)).toEqual(BigInt(5000000000000000000));

		const td = BigInt('1196768507891266117779');
		expect(c.paramByBlock('pow', 'minerReward', 4370000, td)).toEqual(
			BigInt(3000000000000000000),
		);
		*/
	});

	// NOTE(rgeraldes): unused: no qips available(merged)
	it.skip('QIP param access, paramByQIP()', () => {
		const c = new Common({ chain: Chain.Mainnet });

		expect(c.paramByQIP('gasPrices', 'notexistingvalue', 2537)).toBeUndefined();

		const UNSUPPORTED_QIP = 1000000;
		expect(() => {
			c.paramByQIP('gasPrices', 'Bls12381G1AddGas', UNSUPPORTED_QIP);
		}).toThrow('not supported');

		expect(() => {
			c.paramByQIP('notExistingTopic', 'Bls12381G1AddGas', 2537);
		}).toThrow('not defined');

		expect(c.paramByQIP('gasPrices', 'Bls12381G1AddGas', 2537)).toEqual(BigInt(600));
	});
});
