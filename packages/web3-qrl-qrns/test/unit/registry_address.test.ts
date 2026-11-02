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

import {
	InvalidAddressError,
	QRNSUnsupportedNetworkError,
	Web3ContractError,
} from '@theqrl/web3-errors';
import { sha3Raw } from '@theqrl/web3-utils';
import { isAddressString } from '@theqrl/web3-validator';
import { registryAddresses } from '../../src/config';
import { QRNS } from '../../src/qrns';
import {
	CUSTOM_REGISTRY,
	FakeProvider,
	OWNER,
	RESOLVER,
	addrWord,
	boolWord,
	bytesReturn,
	calledContract,
	calledSelector,
	uintWord,
} from '../fixtures/fake_provider';

const sel = (signature: string) => sha3Raw(signature).slice(0, 10);

const networkProvider = (netVersion: string) =>
	new FakeProvider(method => {
		if (method === 'qrl_syncing') return false;
		if (method === 'net_version') return netVersion;
		if (method === 'qrl_call') return `0x${addrWord(OWNER)}`;
		return undefined;
	});

describe('QRNS registry address (L-62)', () => {
	afterEach(() => {
		delete registryAddresses.main;
	});

	it('rejects an unconfigured registry without calling the former placeholder', async () => {
		const provider = networkProvider('1');
		const qrns = new QRNS(undefined, provider.asProvider());

		expect(registryAddresses.main).toBeUndefined();
		expect(() => qrns.registryAddress).toThrow(/No verified QRNS registry/);
		await expect(qrns.getOwner('alice.qrl')).rejects.toThrow(Web3ContractError);
		await expect(qrns.getAddress('alice.qrl')).rejects.toThrow(Web3ContractError);
		expect(() => qrns.events).toThrow(Web3ContractError);
		expect(provider.callsTo('qrl_call')).toHaveLength(0);
	});

	it('reports an unsupported network until a deployment is registered', async () => {
		const qrns = new QRNS(undefined, networkProvider('1').asProvider());
		await expect(qrns.checkNetwork()).rejects.toThrow(QRNSUnsupportedNetworkError);
	});

	it('uses a verified network deployment after explicit detection', async () => {
		registryAddresses.main = CUSTOM_REGISTRY;
		const provider = networkProvider('1');
		const qrns = new QRNS(undefined, provider.asProvider());

		await expect(qrns.checkNetwork()).resolves.toBe(CUSTOM_REGISTRY);
		await qrns.getOwner('alice.qrl');
		expect(calledContract(provider.callsTo('qrl_call')[0])).toBe(CUSTOM_REGISTRY.toLowerCase());
	});

	it('repoints the registry when registryAddress is set, before and after checkNetwork() (L-62)', async () => {
		const provider = networkProvider('1');
		const qrns = new QRNS(undefined, provider.asProvider());

		qrns.registryAddress = CUSTOM_REGISTRY;
		await qrns.getOwner('alice.qrl');
		expect(calledContract(provider.callsTo('qrl_call')[0])).toBe(CUSTOM_REGISTRY.toLowerCase());

		await expect(qrns.checkNetwork()).resolves.toBe(CUSTOM_REGISTRY);
		await qrns.getOwner('alice.qrl');
		expect(calledContract(provider.callsTo('qrl_call')[1])).toBe(CUSTOM_REGISTRY.toLowerCase());
		expect(qrns.registryAddress).toBe(CUSTOM_REGISTRY);
	});

	it('uses the address given to the constructor (L-62)', async () => {
		const provider = networkProvider('1');
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		await qrns.getOwner('alice.qrl');
		expect(calledContract(provider.callsTo('qrl_call')[0])).toBe(CUSTOM_REGISTRY.toLowerCase());
	});

	it('rejects an invalid registry address with a typed error (L-62)', () => {
		const qrns = new QRNS(undefined, networkProvider('1').asProvider());

		expect(() => {
			qrns.registryAddress = '0x1234';
		}).toThrow(InvalidAddressError);
		expect(() => new QRNS('not-an-address', networkProvider('1').asProvider())).toThrow(
			InvalidAddressError,
		);
	});

	it('forgets the detected network when the provider changes (L-62)', async () => {
		registryAddresses.main = CUSTOM_REGISTRY;
		const p1 = networkProvider('1');
		const p2 = networkProvider('2');
		const qrns = new QRNS(undefined, p1.asProvider());

		await expect(qrns.checkNetwork()).resolves.toBe(registryAddresses.main);
		// Cached: no second net_version request on the same provider.
		await expect(qrns.checkNetwork()).resolves.toBe(registryAddresses.main);
		expect(p1.callsTo('net_version')).toHaveLength(1);

		qrns.setProvider(p2.asProvider());
		await expect(qrns.checkNetwork()).rejects.toThrow(QRNSUnsupportedNetworkError);
		expect(p2.callsTo('qrl_syncing')).toHaveLength(1);
		expect(p2.callsTo('net_version')).toHaveLength(1);
		expect(() => qrns.registryAddress).toThrow(/No verified QRNS registry/);
	});
});

describe('QRNS.getAddress through the resolver (L-63)', () => {
	const resolverProvider = (coinTypeBytes: string) =>
		new FakeProvider((method, params) => {
			if (method === 'qrl_syncing') return false;
			if (method === 'net_version') return '1';
			if (method !== 'qrl_call') return undefined;
			const tx = params[0] as { input?: string; data?: string };
			const selector = (tx.input ?? tx.data ?? '').slice(0, 10);
			if (selector === sel('resolver(bytes32)')) return `0x${addrWord(RESOLVER)}`;
			if (selector === sel('supportsInterface(bytes4)')) return `0x${boolWord(true)}`;
			if (selector === sel('addr(bytes32)')) return `0x${addrWord(OWNER)}`;
			if (selector === sel('addr(bytes32,uint256)')) return bytesReturn(coinTypeBytes);
			return '0x';
		});

	it('returns a checksummed Q address for coin type 60 (L-63)', async () => {
		const provider = resolverProvider('');
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		const address = await qrns.getAddress('alice.qrl');

		expect(address).toBe(OWNER);
		expect(isAddressString(address)).toBe(true);
		const selectors = provider.callsTo('qrl_call').map(calledSelector);
		expect(selectors).toContain(sel('addr(bytes32)'));
		expect(selectors).not.toContain(sel('addr(bytes32,uint256)'));
		const interfaceCheck = provider
			.callsTo('qrl_call')
			.find(call => calledSelector(call) === sel('supportsInterface(bytes4)'));
		expect((interfaceCheck?.params[0] as { input: string }).input.slice(10, 18)).toBe(
			'3b3b57de',
		);
	});

	it('rejects the zero address for coin type 60: the name has no address record', async () => {
		const provider = new FakeProvider((method, params) => {
			if (method === 'qrl_syncing') return false;
			if (method === 'net_version') return '1';
			if (method !== 'qrl_call') return undefined;
			const tx = params[0] as { input?: string; data?: string };
			const selector = (tx.input ?? tx.data ?? '').slice(0, 10);
			if (selector === sel('resolver(bytes32)')) return `0x${addrWord(RESOLVER)}`;
			if (selector === sel('supportsInterface(bytes4)')) return `0x${boolWord(true)}`;
			if (selector === sel('addr(bytes32)')) return `0x${addrWord(`Q${'0'.repeat(128)}`)}`;
			return '0x';
		});
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		await expect(qrns.getAddress('alice.qrl')).rejects.toThrow(Web3ContractError);
		await expect(qrns.getAddress('alice.qrl')).rejects.toThrow(/zero address/);
	});

	it('returns the raw bytes for another coin type after checking 0xf1cb7e06 (L-63)', async () => {
		const provider = resolverProvider('ab'.repeat(20));
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		const bytes = await qrns.getAddress('alice.qrl', 0);

		expect(bytes).toBe(`0x${'ab'.repeat(20)}`);
		const interfaceCheck = provider
			.callsTo('qrl_call')
			.find(call => calledSelector(call) === sel('supportsInterface(bytes4)'));
		expect((interfaceCheck?.params[0] as { input: string }).input.slice(10, 18)).toBe(
			'f1cb7e06',
		);
		expect(provider.callsTo('qrl_call').map(calledSelector)).toContain(
			sel('addr(bytes32,uint256)'),
		);
	});

	it('rejects an unset coin type 60 record (zero address) instead of returning it (L-63)', async () => {
		const provider = new FakeProvider((method, params) => {
			if (method !== 'qrl_call') return undefined;
			const tx = params[0] as { input?: string };
			const selector = (tx.input ?? '').slice(0, 10);
			if (selector === sel('resolver(bytes32)')) return `0x${addrWord(RESOLVER)}`;
			if (selector === sel('supportsInterface(bytes4)')) return `0x${boolWord(true)}`;
			if (selector === sel('addr(bytes32)')) return `0x${uintWord(0)}`;
			return '0x';
		});
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		await expect(qrns.getAddress('nobody.qrl')).rejects.toThrow(
			'QRNS resolver returned the zero address: the name has no address record',
		);
	});
});
