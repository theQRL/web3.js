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

/* eslint-disable @typescript-eslint/no-unused-vars */
import { getBlock } from '@theqrl/web3-zond';
import { Contract, PayableTxOptions } from '@theqrl/web3-zond-contract';
import { Address, Bytes, DEFAULT_RETURN_FORMAT } from '@theqrl/web3-types';
import { sha3, toChecksumAddress } from '@theqrl/web3-utils';
// eslint-disable-next-line import/no-extraneous-dependencies
import { IpcProvider } from '@theqrl/web3-providers-ipc';
import { ZNS } from '../../src';
import { namehash } from '../../src/utils';

import {
	closeOpenConnection,
	getSystemTestAccounts,
	getSystemTestProvider,
	getSystemTestProviderUrl,
	isIpc,
	isSocket,
	isWs,
} from '../fixtures/system_tests_utils';

import { PublicResolverAbi as PublicResolver } from '../../src/abi/zns/PublicResolver';
import { ZNSRegistryAbi } from '../fixtures/zns/abi/ZNSRegistry';
import { NameWrapperAbi } from '../fixtures/zns/abi/NameWrapper';
import { PublicResolverAbi } from '../fixtures/zns/abi/PublicResolver';
import { ZNSRegistryBytecode } from '../fixtures/zns/bytecode/ZNSRegistryBytecode';
import { NameWrapperBytecode } from '../fixtures/zns/bytecode/NameWrapperBytecode';
import { PublicResolverBytecode } from '../fixtures/zns/bytecode/PublicResolverBytecode';

describe('zns', () => {
	let registry: Contract<typeof ZNSRegistryAbi>;
	let resolver: Contract<typeof PublicResolverAbi>;
	let nameWrapper: Contract<typeof NameWrapperAbi>;

	type ResolverContract = Contract<typeof PublicResolverAbi>;

	let Resolver: ResolverContract;
	let getZnsResolver: Contract<typeof PublicResolver>;

	let sendOptions: PayableTxOptions;

	const domain = 'test';
	const node = namehash('resolver');
	const label = sha3('resolver') as string;

	const subdomain = 'subdomain';
	const fullDomain = `${subdomain}.${domain}`;
	const web3jsName = 'web3js.test';

	let accounts: string[];
	let zns: ZNS;
	let defaultAccount: string;
	let accountOne: string;

	const ZERO_NODE: Bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';
	const addressOne: Address = '0x0000000000000000000000000000000000000001';

	beforeAll(async () => {
		accounts = await getSystemTestAccounts();

		[defaultAccount, accountOne] = accounts;

		sendOptions = { from: defaultAccount, gas: '10000000', type: 2 };

		const Registry = new Contract(ZNSRegistryAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		const NameWrapper = new Contract(NameWrapperAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		Resolver = new Contract(PublicResolverAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		registry = await Registry.deploy({ data: ZNSRegistryBytecode }).send(sendOptions);

		nameWrapper = await NameWrapper.deploy({ data: NameWrapperBytecode }).send(sendOptions);

		resolver = await Resolver.deploy({
			data: PublicResolverBytecode,
			arguments: [
				registry.options.address as string,
				nameWrapper.options.address as string,
				accountOne,
				defaultAccount,
			],
		}).send(sendOptions);

		await registry.methods.setSubnodeOwner(ZERO_NODE, label, defaultAccount).send(sendOptions);
		await registry.methods
			.setResolver(node, resolver.options.address as string)
			.send(sendOptions);
		await resolver.methods.setAddr(node, addressOne).send(sendOptions);

		await registry.methods
			.setSubnodeOwner(ZERO_NODE, sha3(domain) as string, defaultAccount)
			.send(sendOptions);

		const clientUrl = getSystemTestProviderUrl();
		let provider;
		if (isIpc) provider = new IpcProvider(clientUrl);
		else if (isWs) provider = new ZNS.providers.WebsocketProvider(clientUrl);
		else provider = new ZNS.providers.HttpProvider(clientUrl);

		zns = new ZNS(registry.options.address, provider);

		const block = await getBlock(zns, 'latest', false, DEFAULT_RETURN_FORMAT);
		const gas = block.gasLimit.toString();

		// Increase gas for contract calls
		sendOptions = {
			...sendOptions,
			gas,
		};
	});

	afterAll(async () => {
		if (isSocket) {
			await closeOpenConnection(zns);
			// @ts-expect-error @typescript-eslint/ban-ts-comment
			await closeOpenConnection(zns?._registry?.contract);
			await closeOpenConnection(getZnsResolver);
			await closeOpenConnection(registry);
			await closeOpenConnection(resolver);
			await closeOpenConnection(nameWrapper);
		}
	});

	beforeEach(async () => {
		// set up subnode
		await registry.methods
			.setSubnodeOwner(namehash(domain), sha3('web3js') as string, defaultAccount)
			.send(sendOptions);
	});

	it('should return the subnode owner of "resolver"', async () => {
		const owner = await zns.getOwner('resolver');

		expect(owner).toEqual(toChecksumAddress(defaultAccount));
	});

	it('should return the registered resolver for the subnode "resolver"', async () => {
		getZnsResolver = await zns.getResolver('resolver');

		expect(getZnsResolver.options.address).toEqual(resolver.options.address);
	});

	it('should get the owner record for a name', async () => {
		const web3jsOwner = await zns.getOwner(web3jsName);

		expect(web3jsOwner).toEqual(toChecksumAddress(defaultAccount));
	});

	it('should get TTL', async () => {
		const TTL = await zns.getTTL(web3jsName);

		expect(TTL).toBe(BigInt(0));
	});

	it('shoud record exists', async () => {
		await registry.methods
			.setSubnodeOwner(namehash(domain), sha3(subdomain) as string, defaultAccount)
			.send(sendOptions);

		const exists = await zns.recordExists(fullDomain);

		expect(exists).toBeTruthy();
	});
});
