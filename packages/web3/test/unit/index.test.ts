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

import { Web3Zond } from '@theqrl/web3-zond';

import * as abi from '@theqrl/web3-zond-abi';
import * as accounts from '@theqrl/web3-zond-accounts';
import * as contract from '@theqrl/web3-zond-contract';
import * as zns from '@theqrl/web3-zond-zns';

import * as http from '@theqrl/web3-providers-http';
import * as ws from '@theqrl/web3-providers-ws';

import Web3Default, { Web3, providers, zond } from '../../src/index';

describe('exports of web3 package', () => {
	describe('zond exports', () => {
		it('`Web3` is the default exported class', () => {
			expect(Web3).toEqual(Web3Default);
		});

		it('`Web3Zond` is available under `zond`', () => {
			expect(zond.Web3Zond).toEqual(Web3Zond);
		});

		it('zond sub-namespaces are available under `zond`', () => {
			expect(zond.abi).toEqual(abi);
			expect(zond.accounts).toEqual(accounts);
			expect(zond.contract).toEqual(contract);
			expect(zond.zns).toEqual(zns);
		});
	});

	describe('providers exports', () => {
		it('providers main objects are available under `providers`', () => {
			expect(providers.Eip1193Provider).toBeTruthy();
			expect(providers.SocketProvider).toBeTruthy();
		});

		it('providers sub-namespaces are available under `providers`', () => {
			expect(providers.http).toEqual(http);
			expect(providers.ws).toEqual(ws);
		});
	});
});
