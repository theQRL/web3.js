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

import { Web3Context, Web3ContextObject } from '@theqrl/web3-core';
import { Registry } from '../../src/registry';
import { Resolver } from '../../src/resolver';
import { ZNS } from '../../src/zns';
import { registryAddresses } from '../../src/config';

describe('zns', () => {
	let object: Web3ContextObject;

	beforeAll(() => {
		const context = new Web3Context('http://test.com');
		object = context.getContextObject();
	});
	it('should construct registry with expected methods', () => {
		const registry = new Registry(object);

		expect(registry.getOwner).toBeDefined();
		expect(registry.getResolver).toBeDefined();
		expect(registry.getTTL).toBeDefined();
		expect(registry.recordExists).toBeDefined();
	});

	it('should construct resolver with expected methods', () => {
		const registry = new Registry(object);
		const resolver = new Resolver(registry);

		expect(resolver.getAddress).toBeDefined();
		expect(resolver.checkInterfaceSupport).toBeDefined();
		expect(resolver.supportsInterface).toBeDefined();
		expect(resolver.getPubkey).toBeDefined();
		expect(resolver.getContenthash).toBeDefined();
	});

	it('should construct main zns class with expected methods', () => {
		const zns = new ZNS(registryAddresses.main, 'http://127.0.0.1:8545');

		expect(zns.getResolver).toBeDefined();
		expect(zns.recordExists).toBeDefined();
		expect(zns.getTTL).toBeDefined();
		expect(zns.getOwner).toBeDefined();
		expect(zns.getAddress).toBeDefined();
		expect(zns.getPubkey).toBeDefined();
		expect(zns.getContenthash).toBeDefined();
		expect(zns.checkNetwork).toBeDefined();
		expect(zns.supportsInterface).toBeDefined();
	});
});
