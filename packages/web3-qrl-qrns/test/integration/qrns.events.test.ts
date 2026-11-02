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

import { Contract, PayableTxOptions } from '@theqrl/web3-qrl-contract';
import { sha3 } from '@theqrl/web3-utils';

import { Address, Bytes } from '@theqrl/web3-types';
import { IpcProvider } from '@theqrl/web3-providers-ipc';
import { QRNS } from '../../src';
import { namehash } from '../../src/utils';

import {
	getSystemTestAccounts,
	getSystemTestProvider,
	isWs,
	isIpc,
	closeOpenConnection,
	isSocket,
	describeIf,
	getSystemTestProviderUrl,
} from '../fixtures/system_tests_utils';

import { NameWrapperAbi, NameWrapperBytecode } from '../shared_fixtures/build/NameWrapper';
import { PublicResolverAbi, PublicResolverBytecode } from '../shared_fixtures/build/PublicResolver';
import { QRNSRegistryAbi, QRNSRegistryBytecode } from '../shared_fixtures/build/QRNSRegistry';

describeIf(isSocket)('qrns events', () => {
	let registry: Contract<typeof QRNSRegistryAbi>;
	let resolver: Contract<typeof PublicResolverAbi>;
	let nameWrapper: Contract<typeof NameWrapperAbi>;

	type ResolverContract = Contract<typeof PublicResolverAbi>;

	let Resolver: ResolverContract;
	let setQrnsResolver: ResolverContract;
	let getQrnsResolver: ResolverContract;

	let sendOptions: PayableTxOptions;

	const domain = 'test';
	const domainNode = namehash(domain);
	const node = namehash('resolver');
	const label = sha3('resolver') as string;

	let qrns: QRNS;
	let defaultAccount: string;
	let accountOne: string;

	const ZERO_NODE: Bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';
	const addressOne: Address =
		'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001';

	beforeAll(async () => {
		[defaultAccount, accountOne] = await getSystemTestAccounts();

		sendOptions = { from: defaultAccount, gas: '10000000' };

		const Registry = new Contract(QRNSRegistryAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		const NameWrapper = new Contract(NameWrapperAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		Resolver = new Contract(PublicResolverAbi, undefined, {
			provider: getSystemTestProvider(),
		});

		registry = await Registry.deploy({ data: QRNSRegistryBytecode }).send(sendOptions);

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
		else if (isWs) provider = new QRNS.providers.WebsocketProvider(clientUrl);
		else provider = new QRNS.providers.HttpProvider(clientUrl);

		qrns = new QRNS(registry.options.address, provider);
	});

	afterAll(async () => {
		await closeOpenConnection(qrns);
		// @ts-expect-error @typescript-eslint/ban-ts-comment
		await closeOpenConnection(qrns?._registry?.contract);
		await closeOpenConnection(getQrnsResolver);
		await closeOpenConnection(setQrnsResolver);
		await closeOpenConnection(registry);
		await closeOpenConnection(resolver);
		await closeOpenConnection(nameWrapper);
	});

	beforeEach(async () => {
		// set up subnode
		await registry.methods
			.setSubnodeOwner(namehash(domain), sha3('web3js') as string, defaultAccount)
			.send(sendOptions);
	});

	// eslint-disable-next-line jest/consistent-test-it
	it('NewResolver event', async () => {
		// eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
		await new Promise<void>(async resolve => {
			const event = qrns.events.NewResolver();

			event.on('data', () => {
				resolve();
			});

			await registry.methods
				.setResolver(domainNode, resolver.options.address as string)
				.send(sendOptions);
		});
	});
});
