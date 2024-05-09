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
import { ZNSNetworkNotSyncedError, ZNSUnsupportedNetworkError } from '@theqrl/web3-errors';
import { isSyncing } from '@theqrl/web3-zond';
import { Contract } from '@theqrl/web3-zond-contract';
import { getId } from '@theqrl/web3-net';
import {
	DEFAULT_RETURN_FORMAT,
	ZondExecutionAPI,
	FMT_NUMBER,
	SupportedProviders,
	Web3NetAPI,
} from '@theqrl/web3-types';
import { PublicResolverAbi } from './abi/zns/PublicResolver.js';
import { networkIds, registryAddresses } from './config.js';
import { Registry } from './registry.js';
import { Resolver } from './resolver.js';

/**
 * This class is designed to interact with the ZNS system on the Zond blockchain.
 *
 */
export class ZNS extends Web3Context<ZondExecutionAPI & Web3NetAPI> {
	/**
	 * The registryAddress property can be used to define a custom registry address when you are connected to an unknown chain. It defaults to the main registry address.
	 */
	public registryAddress: string;
	private readonly _registry: Registry;
	private readonly _resolver: Resolver;
	private _detectedAddress?: string;
	private _lastSyncCheck?: number;

	/**
	 * Use to create an instance of ZNS
	 * @param registryAddr - (Optional) The address of the ZNS registry (default: mainnet registry address)
	 * @param provider - (Optional) The provider to use for the ZNS instance
	 * @example
	 * ```ts
	 * const zns = new ZNS(
	 * 	"0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
	 * 	"http://localhost:8545"
	 * );
	 *
	 * console.log( zns.defaultChain);
	 * > mainnet
	 * ```
	 */
	public constructor(
		registryAddr?: string,
		provider?:
			| SupportedProviders<ZondExecutionAPI & Web3NetAPI>
			| Web3ContextObject<ZondExecutionAPI & Web3NetAPI>
			| string,
	) {
		super(provider ?? '');
		this.registryAddress = registryAddr ?? registryAddresses.main; // will default to main registry address
		this._registry = new Registry(this.getContextObject(), registryAddr);
		this._resolver = new Resolver(this._registry);
	}

	/**
	 * Returns the Resolver by the given address
	 * @param name - The name of the ZNS domain
	 * @returns - An contract instance of the resolver
	 *
	 * @example
	 * ```ts
	 * const resolver = await zns.getResolver('resolver');
	 *
	 * console.log(resolver.options.address);
	 * > '0x1234567890123456789012345678901234567890'
	 * ```
	 */
	public async getResolver(name: string): Promise<Contract<typeof PublicResolverAbi>> {
		return this._registry.getResolver(name);
	}

	/**
	 * Returns true if the record exists
	 * @param name - The ZNS name
	 * @returns - Returns `true` if node exists in this ZNS registry. This will return `false` for records that are in the legacy ZNS registry but have not yet been migrated to the new one.
	 * @example
	 * ```ts
	 * const exists = await web3.zond.zns.recordExists('zond.zns');
	 * ```
	 */
	public async recordExists(name: string): Promise<unknown> {
		return this._registry.recordExists(name);
	}

	/**
	 * Returns the caching TTL (time-to-live) of an ZNS name.
	 * @param name - The ZNS name
	 * @returns - Returns the caching TTL (time-to-live) of a name.
	 * @example
	 * ```ts
	 * const owner = await web3.zond.zns.getTTL('zond.zns');
	 * ```
	 */
	public async getTTL(name: string): Promise<unknown> {
		return this._registry.getTTL(name);
	}

	/**
	 * Returns the owner by the given name and current configured or detected Registry
	 * @param name - The ZNS name
	 * @returns - Returns the address of the owner of the name.
	 * @example
	 * ```ts
	 * const owner = await web3.zond.zns.getOwner('zond.zns');
	 * ```
	 */
	public async getOwner(name: string): Promise<unknown> {
		return this._registry.getOwner(name);
	}

	/**
	 * Resolves an ZNS name to an Zond address.
	 * @param ZNSName - The ZNS name to resolve
	 * @param coinType - (Optional) The coin type, defaults to 60 (ETH)
	 * @returns - The Zond address of the given name
	 * ```ts
	 * const address = await web3.zond.zns.getAddress('zond.zns');
	 * console.log(address);
	 * > '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
	 * ```
	 */
	public async getAddress(ZNSName: string, coinType = 60) {
		return this._resolver.getAddress(ZNSName, coinType);
	}

	/**
	 * Returns the X and Y coordinates of the curve point for the public key.
	 * @param ZNSName - The ZNS name
	 * @returns - The X and Y coordinates of the curve point for the public key
	 * @example
	 * ```ts
	 * const key = await web3.zond.zns.getPubkey('zond.zns');
	 * console.log(key);
	 * > {
	 * "0": "0x0000000000000000000000000000000000000000000000000000000000000000",
	 * "1": "0x0000000000000000000000000000000000000000000000000000000000000000",
	 * "x": "0x0000000000000000000000000000000000000000000000000000000000000000",
	 * "y": "0x0000000000000000000000000000000000000000000000000000000000000000"
	 * }
	 * ```
	 */
	public async getPubkey(ZNSName: string) {
		return this._resolver.getPubkey(ZNSName);
	}

	/**
	 * Returns the content hash object associated with an ZNS node.
	 * @param ZNSName - The ZNS name
	 * @returns - The content hash object associated with an ZNS node
	 * @example
	 * ```ts
	 * const hash = await web3.zond.zns.getContenthash('zond.zns');
	 * console.log(hash);
	 * > 'QmaEBknbGT4bTQiQoe2VNgBJbRfygQGktnaW5TbuKixjYL'
	 * ```
	 */
	public async getContenthash(ZNSName: string) {
		return this._resolver.getContenthash(ZNSName);
	}

	/**
	 * Checks if the current used network is synced and looks for ZNS support there.
	 * Throws an error if not.
	 * @returns - The address of the ZNS registry if the network has been detected successfully
	 * @example
	 * ```ts
	 * console.log(await web3.zond.zns.checkNetwork());
	 * > '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
	 * ```
	 */
	public async checkNetwork() {
		const now = Date.now() / 1000;
		if (!this._lastSyncCheck || now - this._lastSyncCheck > 3600) {
			const syncInfo = await isSyncing(this);

			if (!(typeof syncInfo === 'boolean' && !syncInfo)) {
				throw new ZNSNetworkNotSyncedError();
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
			throw new ZNSUnsupportedNetworkError(networkType);
		}

		this._detectedAddress = addr;
		return this._detectedAddress;
	}

	/**
	 * Returns true if the related Resolver does support the given signature or interfaceId.
	 * @param ZNSName - The ZNS name
	 * @param interfaceId - The signature of the function or the interfaceId as described in the ZNS documentation
	 * @returns - `true` if the related Resolver does support the given signature or interfaceId.
	 * @example
	 * ```ts
	 * const supports = await web3.zond.zns.supportsInterface('zond.zns', 'addr(bytes32');
	 * console.log(supports);
	 * > true
	 * ```
	 */
	public async supportsInterface(ZNSName: string, interfaceId: string) {
		return this._resolver.supportsInterface(ZNSName, interfaceId);
	}

	/**
	 * @returns - Returns all events that can be emitted by the ZNS registry.
	 */
	public get events() {
		return this._registry.events;
	}
}
