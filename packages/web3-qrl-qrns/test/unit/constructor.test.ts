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
import { QRNS } from '../../src/qrns';
import { CUSTOM_REGISTRY } from '../fixtures/fake_provider';

describe('qrns', () => {
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

		expect(resolver.setAddress).toBeDefined();
		expect(resolver.getAddress).toBeDefined();
		expect(resolver.checkInterfaceSupport).toBeDefined();
		expect(resolver.supportsInterface).toBeDefined();
		expect(resolver.getPubkey).toBeDefined();
		expect(resolver.getContenthash).toBeDefined();
		expect(resolver.getText).toBeDefined();
		expect(resolver.getName).toBeDefined();
	});

	it('should construct main qrns class with expected methods', () => {
		const qrns = new QRNS(CUSTOM_REGISTRY, 'http://127.0.0.1:8545');

		expect(qrns.getResolver).toBeDefined();
		expect(qrns.setAddress).toBeDefined();
		expect(qrns.recordExists).toBeDefined();
		expect(qrns.getTTL).toBeDefined();
		expect(qrns.getOwner).toBeDefined();
		expect(qrns.getAddress).toBeDefined();
		expect(qrns.getPubkey).toBeDefined();
		expect(qrns.getContenthash).toBeDefined();
		expect(qrns.getText).toBeDefined();
		expect(qrns.getName).toBeDefined();
		expect(qrns.checkNetwork).toBeDefined();
		expect(qrns.supportsInterface).toBeDefined();
	});
});
