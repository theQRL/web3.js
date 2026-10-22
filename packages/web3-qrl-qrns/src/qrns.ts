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
import {
	InvalidAddressError,
	QRNSNetworkNotSyncedError,
	QRNSUnsupportedNetworkError,
	RevertInstructionError,
} from '@theqrl/web3-errors';
import { isSyncing } from '@theqrl/web3-qrl';
import { Contract } from '@theqrl/web3-qrl-contract';
import { getId } from '@theqrl/web3-net';
import {
	Address,
	DEFAULT_RETURN_FORMAT,
	QRLExecutionAPI,
	FMT_NUMBER,
	PayableCallOptions,
	SupportedProviders,
	TransactionReceipt,
	Web3NetAPI,
} from '@theqrl/web3-types';
import { isNullish } from '@theqrl/web3-utils';
import { isAddressString } from '@theqrl/web3-validator';
import { PublicResolverAbi } from './abi/qrns/PublicResolver.js';
import { networkIds, registryAddresses } from './config.js';
import { Registry } from './registry.js';
import { Resolver } from './resolver.js';

/**
 * This class is designed to interact with the QRNS system on the QRL blockchain.
 *
 */
export class QRNS extends Web3Context<QRLExecutionAPI & Web3NetAPI> {
	private _registryAddress?: string;
	private readonly _registry: Registry;
	private readonly _resolver: Resolver;
	private _detectedAddress?: string;
	/** The provider {@link _detectedAddress} and {@link _lastSyncCheck} were established against. */
	private _detectedProvider?: unknown;
	private _lastSyncCheck?: number;

	/**
	 * Use to create an instance of QRNS
	 * @param registryAddr - (Optional) The address of the QRNS registry (default: mainnet registry address)
	 * @param provider - (Optional) The provider to use for the QRNS instance
	 * @example
	 * ```ts
	 * const qrns = new QRNS(
	 * 	"Q33380cd8b47eed92b0dcd1ccca2ee84efd0c8b87a4fe6ee4a918969cdd454c0b04ac9f03ffaafa765af0cbeab572d8c9dd514044aa94adee50fa5d361a3e4629",
	 * 	"http://localhost:8545"
	 * );
	 *
	 * console.log(qrns.defaultChain);
	 * > mainnet
	 * ```
	 */
	public constructor(
		registryAddr?: string,
		provider?:
			| SupportedProviders<QRLExecutionAPI & Web3NetAPI>
			| Web3ContextObject<QRLExecutionAPI & Web3NetAPI>
			| string,
	) {
		super(provider);
		if (!isNullish(registryAddr)) {
			this.registryAddress = registryAddr;
		}
		this._registry = new Registry(this.getContextObject(), registryAddr);
		this._resolver = new Resolver(this._registry);
	}

	/**
	 * The address of the QRNS registry every query goes to. An address set here (or given to
	 * the constructor) always wins; otherwise the address {@link QRNS.checkNetwork} detected
	 * for the current provider is used, and the mainnet registry address as the last resort.
	 * Use it to define a custom registry address when you are connected to an unknown chain.
	 * The registry contract is repointed lazily, before the next query (L-62).
	 */
	public get registryAddress(): string {
		return this._registryAddress ?? this._detectedAddressFor(this.provider) ?? registryAddresses.main;
	}

	public set registryAddress(value: string) {
		if (!isAddressString(value)) {
			throw new InvalidAddressError(value);
		}
		this._registryAddress = value;
	}

	/**
	 * Returns the Resolver by the given address
	 * @param name - The name of the QRNS domain
	 * @returns - An contract instance of the resolver
	 *
	 * @example
	 * ```ts
	 * const resolver = await qrns.getResolver('resolver');
	 *
	 * console.log(resolver.options.address);
	 * > 'Qd5812F6Cf4a0f645aa620cd57319a0Ed649dd8f5519A9dde7770ae5b0E49e547985f35eB972A2a07041561aa39c65A3991478f9B1e6749e05277dcf58A9A8B72'
	 * ```
	 */
	public async getResolver(name: string): Promise<Contract<typeof PublicResolverAbi>> {
		return this.registry.getResolver(name);
	}

	/**
	 * Returns true if the record exists
	 * @param name - The QRNS name
	 * @returns - Returns `true` if node exists in this QRNS registry. This will return `false` for records that are in the legacy QRNS registry but have not yet been migrated to the new one.
	 * @example
	 * ```ts
	 * const exists = await web3.qrl.qrns.recordExists('qrl.qrns');
	 * ```
	 */
	public async recordExists(name: string): Promise<unknown> {
		return this.registry.recordExists(name);
	}

	/**
	 * Returns the caching TTL (time-to-live) of a QRNS name.
	 * @param name - The QRNS name
	 * @returns - Returns the caching TTL (time-to-live) of a name.
	 * @example
	 * ```ts
	 * const owner = await web3.qrl.qrns.getTTL('qrl.qrns');
	 * ```
	 */
	public async getTTL(name: string): Promise<unknown> {
		return this.registry.getTTL(name);
	}

	/**
	 * Returns the owner by the given name and current configured or detected Registry
	 * @param name - The QRNS name
	 * @returns - Returns the address of the owner of the name.
	 * @example
	 * ```ts
	 * const owner = await web3.qrl.qrns.getOwner('qrl.qrns');
	 * ```
	 */
	public async getOwner(name: string): Promise<unknown> {
		return this.registry.getOwner(name);
	}

	/**
	 * Resolves a QRNS name to an address.
	 * @param QRNSName - The QRNS name to resolve
	 * @param coinType - (Optional) The coin type, defaults to 60 (QRL)
	 * @returns - For coin type 60 the checksummed QRL address of the name (`addr(bytes32)`; the zero address when unset); for any other coin type the raw address bytes as hex (`addr(bytes32,uint256)`).
	 * ```ts
	 * const address = await web3.qrl.qrns.getAddress('qrl.qrns');
	 * console.log(address);
	 * > 'Q693ba851060efb980daca536c4a1ef74585e1f14657dea79e1f8f4655b543046e11c577ad9a2445443e9e3092aeee55ecf99325f4add93be6c23a2431f6065b9'
	 * ```
	 */
	public async getAddress(QRNSName: string, coinType = 60) {
		return this.resolver.getAddress(QRNSName, coinType);
	}

	/**
	 * ERC-634 - Returns the text content stored in the resolver for the specified key.
	 * @param QRNSNameOrAddr - The QRNS name to resolve, or a QRL address for reverse resolution
	 * @param key - The key to resolve https://github.com/ethereum/ercs/blob/master/ERCS/erc-634.md#global-keys
	 * @returns - The value content stored in the resolver for the specified key
	 */
	public async getText(QRNSNameOrAddr: string, key: string): Promise<string> {
		if (isAddressString(QRNSNameOrAddr))
			return this.resolver.getText(await this.resolver.getName(QRNSNameOrAddr, false), key);
		return this.resolver.getText(QRNSNameOrAddr, key);
	}

	/**
	 * Reverse-resolves an address to its name (`<address>.addr.reverse`).
	 * @param address - The QRL address to reverse-resolve
	 * @param checkInterfaceSupport - Whether to check that the resolver implements `name(bytes32)` first
	 * @returns - The name
	 */
	public async getName(address: string, checkInterfaceSupport = true): Promise<string> {
		return this.resolver.getName(address, checkInterfaceSupport);
	}

	/**
	 * Returns the ML-DSA-87 public key and descriptor associated with a QRNS node.
	 * @param QRNSName - The QRNS name
	 * @returns - `{ publicKey, descriptor }`
	 * @example
	 * ```ts
	 * const key = await web3.qrl.qrns.getPubkey('qrl.qrns');
	 * console.log(key);
	 * > {
	 * "0": "0x",
	 * "1": "0x",
	 * "publicKey": "0x",
	 * "descriptor": "0x"
	 * }
	 * ```
	 */
	public async getPubkey(QRNSName: string) {
		return this.resolver.getPubkey(QRNSName);
	}

	/**
	 * Returns the content hash object associated with a QRNS node.
	 * @param QRNSName - The QRNS name
	 * @returns - The content hash object associated with a QRNS node
	 * @example
	 * ```ts
	 * const hash = await web3.qrl.qrns.getContenthash('qrl.qrns');
	 * console.log(hash);
	 * > 'QmaEBknbGT4bTQiQoe2VNgBJbRfygQGktnaW5TbuKixjYL'
	 * ```
	 */
	public async getContenthash(QRNSName: string) {
		return this.resolver.getContenthash(QRNSName);
	}

	/**
	 * Checks if the current used network is synced and looks for QRNS support there.
	 * Throws an error if not. The result is cached per provider: switching the provider
	 * repeats the detection (L-62).
	 * @returns - The address of the QRNS registry if the network has been detected successfully
	 * @example
	 * ```ts
	 * console.log(await web3.qrl.qrns.checkNetwork());
	 * > 'Q33380cd8b47eed92b0dcd1ccca2ee84efd0c8b87a4fe6ee4a918969cdd454c0b04ac9f03ffaafa765af0cbeab572d8c9dd514044aa94adee50fa5d361a3e4629'
	 * ```
	 */
	public async checkNetwork() {
		this._forgetDetectionForOtherProvider();

		const now = Date.now() / 1000;
		if (!this._lastSyncCheck || now - this._lastSyncCheck > 3600) {
			const syncInfo = await isSyncing(this);

			if (!(typeof syncInfo === 'boolean' && !syncInfo)) {
				throw new QRNSNetworkNotSyncedError();
			}

			this._lastSyncCheck = now;
		}

		if (this._detectedAddress) {
			return this._detectedAddress;
		}
		const networkType = await getId(this, {
			...DEFAULT_RETURN_FORMAT,
			number: FMT_NUMBER.HEX,
		}); // get the network from provider
		const addr = registryAddresses[networkIds[networkType]];

		if (typeof addr === 'undefined') {
			throw new QRNSUnsupportedNetworkError(networkType);
		}

		this._detectedAddress = addr;
		return this._detectedAddress;
	}

	/**
	 * Returns true if the related Resolver does support the given signature or interfaceId.
	 * @param QRNSName - The QRNS name
	 * @param interfaceId - The signature of the function or the interfaceId as described in the QRNS documentation
	 * @returns - `true` if the related Resolver does support the given signature or interfaceId.
	 * @example
	 * ```ts
	 * const supports = await web3.qrl.qrns.supportsInterface('qrl.qrns', 'addr(bytes32');
	 * console.log(supports);
	 * > true
	 * ```
	 */
	public async supportsInterface(QRNSName: string, interfaceId: string) {
		return this.resolver.supportsInterface(QRNSName, interfaceId);
	}

	/**
	 * @returns - Returns all events that can be emitted by the QRNS registry.
	 */
	public get events() {
		return this.registry.events;
	}

	/**
	 * Sets the address of a QRNS name in his resolver.
	 * @param name - The QRNS name
	 * @param address - The address to set
	 * @param txConfig - (Optional) The transaction config
	 * @returns - The transaction receipt
	 * ```ts
	 * const receipt = await qrns.setAddress('web3js.qrl','Q33380cd8b47eed92b0dcd1ccca2ee84efd0c8b87a4fe6ee4a918969cdd454c0b04ac9f03ffaafa765af0cbeab572d8c9dd514044aa94adee50fa5d361a3e4629');
	 *```
	 */
	public async setAddress(
		name: string,
		address: Address,
		txConfig: PayableCallOptions,
	): Promise<TransactionReceipt | RevertInstructionError> {
		return this.resolver.setAddress(name, address, txConfig);
	}

	/** The registry, repointed at {@link QRNS.registryAddress} before every use. */
	private get registry(): Registry {
		this._registry.address = this.registryAddress;
		return this._registry;
	}

	/** The resolver, whose registry is repointed at {@link QRNS.registryAddress} before every use. */
	private get resolver(): Resolver {
		this._registry.address = this.registryAddress;
		return this._resolver;
	}

	private _detectedAddressFor(provider: unknown): string | undefined {
		return this._detectedProvider === provider ? this._detectedAddress : undefined;
	}

	/** A detection made against another provider says nothing about the current one. */
	private _forgetDetectionForOtherProvider(): void {
		const { provider } = this;
		if (this._detectedProvider !== provider) {
			this._detectedProvider = provider;
			this._detectedAddress = undefined;
			this._lastSyncCheck = undefined;
		}
	}
}
