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

import { Web3QRL } from '@theqrl/web3-qrl';

import * as abi from '@theqrl/web3-qrl-abi';
import * as accounts from '@theqrl/web3-qrl-accounts';
import * as contract from '@theqrl/web3-qrl-contract';
import * as qrns from '@theqrl/web3-qrl-qrns';

import * as http from '@theqrl/web3-providers-http';
import * as ws from '@theqrl/web3-providers-ws';

import Web3Default, { Web3, providers, qrl } from '../../src/index';

describe('exports of web3 package', () => {
	describe('qrl exports', () => {
		it('`Web3` is the default exported class', () => {
			expect(Web3).toEqual(Web3Default);
		});

		it('`Web3QRL` is available under `qrl`', () => {
			expect(qrl.Web3QRL).toEqual(Web3QRL);
		});

		it('qrl sub-namespaces are available under `qrl`', () => {
			expect(qrl.abi).toEqual(abi);
			expect(qrl.accounts).toEqual(accounts);
			expect(qrl.contract).toEqual(contract);
			expect(qrl.qrns).toEqual(qrns);
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
