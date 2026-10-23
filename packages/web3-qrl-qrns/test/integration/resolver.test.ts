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

import { getBlock } from '@theqrl/web3-qrl';
import { Contract, PayableTxOptions } from '@theqrl/web3-qrl-contract';
import { addressToHex, bytesToHex, sha3, toChecksumAddress } from '@theqrl/web3-utils';
import { newMLDSA87WalletFromExtendedSeed } from '../../../web3-qrl-accounts/src/qrl_wallet';

import { Address, Bytes, DEFAULT_RETURN_FORMAT } from '@theqrl/web3-types';
import { IpcProvider } from '@theqrl/web3-providers-ipc';
import { QRNS } from '../../src';
import { namehash } from '../../src/utils';

import {
	closeOpenConnection,
	createTempAccount,
	getSystemTestProvider,
	getSystemTestProviderUrl,
	isIpc,
	isSocket,
	isWs,
	itIf,
} from '../fixtures/system_tests_utils';

import { NameWrapperAbi, NameWrapperBytecode } from '../shared_fixtures/build/NameWrapper';
import { PublicResolverAbi, PublicResolverBytecode } from '../shared_fixtures/build/PublicResolver';
import { QRNSRegistryAbi, QRNSRegistryBytecode } from '../shared_fixtures/build/QRNSRegistry';

describe('qrns', () => {
	let registry: Contract<typeof QRNSRegistryAbi>;
	let resolver: Contract<typeof PublicResolverAbi>;
	let nameWrapper: Contract<typeof NameWrapperAbi>;

	let Resolver: Contract<typeof PublicResolverAbi>;

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

	const contentHash = '0x0000000000000000000000000000000000000000000000000000000000000001';

	const DEFAULT_COIN_TYPE = 60;

	beforeAll(async () => {
		const acc1 = await createTempAccount();
		defaultAccount = acc1.address;
		const acc2 = await createTempAccount();
		accountOne = acc2.address;

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

		const block = await getBlock(qrns, 'latest', false, DEFAULT_RETURN_FORMAT);
		sendOptions = {
			...sendOptions,
			gas: block.gasLimit.toString(),
		};
	});

	afterAll(async () => {
		if (isSocket) {
			await closeOpenConnection(qrns);
			// @ts-expect-error @typescript-eslint/ban-ts-comment
			await closeOpenConnection(qrns?._registry?.contract);
			await closeOpenConnection(registry);
			await closeOpenConnection(resolver);
			await closeOpenConnection(nameWrapper);
		}
	});
	beforeEach(async () => {
		// set up subnode
		await registry.methods
			.setSubnodeOwner(ZERO_NODE, sha3('eth') as string, defaultAccount)
			.send(sendOptions);
	});

	it('supports known interfaces', async () => {
		await expect(qrns.supportsInterface('resolver', '0x3b3b57de')).resolves.toBeTruthy(); // IAddrResolver
		await expect(qrns.supportsInterface('resolver', '0xf1cb7e06')).resolves.toBeTruthy(); // IAddressResolver
		await expect(qrns.supportsInterface('resolver', '0x691f3431')).resolves.toBeTruthy(); // INameResolver
		await expect(qrns.supportsInterface('resolver', '0x2203ab56')).resolves.toBeTruthy(); // IABIResolver
		await expect(qrns.supportsInterface('resolver', '0xc8690233')).resolves.toBeTruthy(); // IPubkeyResolver
		await expect(qrns.supportsInterface('resolver', '0x59d1d43c')).resolves.toBeTruthy(); // ITextResolver
		await expect(qrns.supportsInterface('resolver', '0xbc1c58d1')).resolves.toBeTruthy(); // IContentHashResolver
		await expect(qrns.supportsInterface('resolver', '0xa8fa5682')).resolves.toBeTruthy(); // IDNSRecordResolver
		await expect(qrns.supportsInterface('resolver', '0x5c98042b')).resolves.toBeTruthy(); // IDNSZoneResolver
		await expect(qrns.supportsInterface('resolver', '0x01ffc9a7')).resolves.toBeTruthy(); // IInterfaceResolver
	});

	it('does not support a random interface', async () => {
		await expect(qrns.supportsInterface('resolver', '0x3b3b57df')).resolves.toBeFalsy();
	});

	it('fetch pubkey', async () => {
		await registry.methods
			.setResolver(domainNode, resolver.options.address as string)
			.send(sendOptions);

		const res = await qrns.getPubkey(domain);
		expect(res.publicKey).toBe('0x');
		expect(res.descriptor).toBe('0x');
	});

	it('permits setting public key by owner', async () => {
		const acc = await createTempAccount();
		const wallet = newMLDSA87WalletFromExtendedSeed(acc.seed);
		const publicKey = bytesToHex(wallet.getPK());
		const descriptor = bytesToHex(wallet.getDescriptor().toBytes());

		await resolver.methods.setPubkey(domainNode, publicKey, descriptor).send(sendOptions);

		const result = await qrns.getPubkey(domain);

		expect(result.publicKey).toBe(publicKey);
		expect(result.descriptor).toBe(descriptor);
	});

	it('rejects a malformed public key', async () => {
		await expect(
			resolver.methods.setPubkey(domainNode, '0x01', '0x010000').send(sendOptions),
		).rejects.toMatchObject({ name: 'TransactionRevertedWithoutReasonError' });
	});

	it('sets contenthash', async () => {
		await resolver.methods.setContenthash(domainNode, contentHash).send(sendOptions);

		const res = await resolver.methods.contenthash(domainNode).call(sendOptions);
		expect(res).toBe(contentHash);
	});

	itIf(isSocket)('ContenthashChanged event', async () => {
		// eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
		await new Promise<void>(async resolve => {
			const resolver2 = await qrns.getResolver('resolver');
			const event = resolver2.events.ContenthashChanged();

			event.on('data', () => {
				resolve();
			});
			await resolver.methods.setContenthash(domainNode, contentHash).send(sendOptions);
		});
	});

	it('fetches contenthash', async () => {
		await resolver.methods.setContenthash(domainNode, contentHash).call(sendOptions);

		const res = await qrns.getContenthash(domain);
		expect(res).toBe(contentHash);
	});

	it('sets address', async () => {
		await registry.methods
			.setResolver(domainNode, resolver.options.address as string)
			.send(sendOptions);

		await resolver.methods.setAddr(domainNode, accountOne).send(sendOptions);

		const res = await resolver.methods.addr(domainNode, DEFAULT_COIN_TYPE).call(sendOptions);
		expect(res).toBe(addressToHex(accountOne));
	});

	it('fetches address', async () => {
		await registry.methods
			.setResolver(domainNode, resolver.options.address as string)
			.send(sendOptions);

		await resolver.methods.setAddr(domainNode, accountOne).send(sendOptions);

		const resultAddress = await qrns.getAddress(domain);
		expect(resultAddress).toBe(toChecksumAddress(accountOne));
	});
});
