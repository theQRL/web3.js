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
	AbiError,
	InvalidAddressError,
	ResolverMethodMissingError,
	TransactionRevertInstructionError,
	Web3ContractError,
} from '@theqrl/web3-errors';
import { Contract } from '@theqrl/web3-qrl-contract';
import { Address, PayableCallOptions } from '@theqrl/web3-types';
import { isNullish, sha3, toChecksumAddress } from '@theqrl/web3-utils';
import { isAddressString, isHexStrict } from '@theqrl/web3-validator';
import { PublicResolverAbi } from './abi/qrns/PublicResolver.js';
import { interfaceIds, methodsInInterface } from './config.js';
import { Registry } from './registry.js';
import { namehash, normalize } from './utils.js';

//  Default public resolver
//  https://github.com/ensdomains/resolvers/blob/master/contracts/PublicResolver.sol

/** The SLIP-44 coin type of the QRL address record, served by `addr(bytes32)`. */
const QRL_COIN_TYPE = 60;

const isQrlCoinType = (coinType: unknown): boolean => {
	try {
		return BigInt(coinType as number) === BigInt(QRL_COIN_TYPE);
	} catch {
		return false;
	}
};

/**
 * Whether a failed forward resolution of a claimed name means that the name does not resolve
 * to a verifiable address (no resolver, a resolver without `addr`, a revert, undecodable return
 * data, a name the registry call rejected), as opposed to a transport failure or a malformed
 * reply, which is reported to the caller (P4-L-31).
 */
const isUnverifiableName = (error: unknown): boolean =>
	error instanceof Web3ContractError ||
	error instanceof ResolverMethodMissingError ||
	error instanceof TransactionRevertInstructionError ||
	error instanceof AbiError;

export class Resolver {
	private readonly registry: Registry;

	public constructor(registry: Registry) {
		this.registry = registry;
	}

	private async getResolverContractAdapter(QRNSName: string) {
		//  TODO : (Future 4.1.0 TDB) cache resolver contract if frequently queried same QRNS name, refresh cache based on TTL and usage, also limit cache size, optional cache with a flag
		return this.registry.getResolver(QRNSName);
	}

	//  https://eips.ethereum.org/EIPS/eip-165
	// eslint-disable-next-line class-methods-use-this
	public async checkInterfaceSupport(
		resolverContract: Contract<typeof PublicResolverAbi>,
		methodName: string,
	) {
		if (isNullish(interfaceIds[methodName]))
			throw new ResolverMethodMissingError(
				resolverContract.options.address ?? '',
				methodName,
			);

		const supported = await resolverContract.methods
			.supportsInterface(interfaceIds[methodName])
			.call();

		if (!supported)
			throw new ResolverMethodMissingError(
				resolverContract.options.address ?? '',
				methodName,
			);
	}

	public async supportsInterface(QRNSName: string, interfaceId: string) {
		const resolverContract = await this.getResolverContractAdapter(QRNSName);

		let interfaceIdParam = interfaceId;

		if (!isHexStrict(interfaceIdParam)) {
			if (interfaceId === '') throw new Web3ContractError('Invalid interface Id');

			interfaceIdParam = (sha3(interfaceId) ?? '').slice(0, 10);
		}

		return resolverContract.methods.supportsInterface(interfaceIdParam).call();
	}

	/**
	 * Resolves the address record of a name. Coin type 60 (the default) is the QRL address:
	 * the resolver must implement `addr(bytes32)` (interface `0x3b3b57de`) and a checksummed
	 * `Q` address is returned (the zero address when the record is unset). Any other coin type
	 * goes through `addr(bytes32,uint256)` (interface `0xf1cb7e06`) and returns the raw
	 * address bytes as hex (L-63).
	 */
	public async getAddress(QRNSName: string, coinType = QRL_COIN_TYPE): Promise<string> {
		const resolverContract = await this.getResolverContractAdapter(QRNSName);

		if (isQrlCoinType(coinType)) {
			await this.checkInterfaceSupport(resolverContract, methodsInInterface.addr);

			const address: unknown = await resolverContract.methods
				.addr(namehash(QRNSName))
				.call();
			if (typeof address !== 'string' || !isAddressString(address)) {
				throw new Web3ContractError('QRNS resolver returned an invalid address');
			}
			return toChecksumAddress(address);
		}

		await this.checkInterfaceSupport(resolverContract, methodsInInterface.multicoinAddr);

		// The ABI decoder returns `bytes` outputs as hex strings.
		return (await resolverContract.methods.addr(namehash(QRNSName), coinType).call()) as string;
	}

	public async getPubkey(QRNSName: string) {
		const resolverContract = await this.getResolverContractAdapter(QRNSName);

		await this.checkInterfaceSupport(resolverContract, methodsInInterface.pubkey);

		return resolverContract.methods.pubkey(namehash(QRNSName)).call();
	}

	public async getContenthash(QRNSName: string) {
		const resolverContract = await this.getResolverContractAdapter(QRNSName);

		await this.checkInterfaceSupport(resolverContract, methodsInInterface.contenthash);

		return resolverContract.methods.contenthash(namehash(QRNSName)).call();
	}

	public async setAddress(QRNSName: string, address: Address, txConfig: PayableCallOptions) {
		const resolverContract = await this.getResolverContractAdapter(QRNSName);
		await this.checkInterfaceSupport(resolverContract, methodsInInterface.setAddr);

		return resolverContract.methods.setAddr(namehash(QRNSName), address).send(txConfig);
	}

	public async getText(QRNSName: string, key: string) {
		const resolverContract = await this.getResolverContractAdapter(QRNSName);
		await this.checkInterfaceSupport(resolverContract, methodsInInterface.text);

		return resolverContract.methods.text(namehash(QRNSName), key).call();
	}

	/**
	 * Reverse-resolves an address: reads `name(bytes32)` of `<address>.addr.reverse` and returns
	 * the name only when it forward-resolves (`addr(bytes32)`) to the queried address again. The
	 * owner of the reverse node can claim any name, so an unverified name is worthless (P4-L-31;
	 * ethers' `lookupAddress` applies the same check). `''` is returned when there is no reverse
	 * record, when the claimed name does not resolve to a verifiable address (no resolver, a
	 * resolver without `addr`, a revert, undecodable data, a name the normalizer rejects) and
	 * when the forward resolution yields another address; a transport failure or a malformed
	 * node reply is thrown.
	 *
	 * @param address - The QRL address to reverse-resolve.
	 * @param checkInterfaceSupport - Whether to check that the reverse resolver implements `name(bytes32)` first.
	 * @returns The verified name, or `''`.
	 * @throws InvalidAddressError - when `address` is not a QRL address.
	 */
	public async getName(address: string, checkInterfaceSupport = true): Promise<string> {
		// A non-address used to become a nonsense reverse name.
		if (typeof address !== 'string' || !isAddressString(address)) {
			throw new InvalidAddressError(address);
		}
		const reverseName = `${address.toLowerCase().substring(1)}.addr.reverse`;

		const resolverContract = await this.getResolverContractAdapter(reverseName);

		if (checkInterfaceSupport)
			await this.checkInterfaceSupport(resolverContract, methodsInInterface.name);

		const name: unknown = await resolverContract.methods.name(namehash(reverseName)).call();
		if (typeof name !== 'string') {
			throw new Web3ContractError('QRNS resolver returned an invalid name');
		}
		if (name === '') {
			return '';
		}
		// The claimed name is node supplied: one the normalizer rejects cannot be a QRNS name.
		try {
			normalize(name);
		} catch {
			return '';
		}

		let forwardAddress: string;
		try {
			forwardAddress = await this.getAddress(name);
		} catch (error) {
			if (isUnverifiableName(error)) {
				return '';
			}
			throw error;
		}
		return forwardAddress.toLowerCase() === address.toLowerCase() ? name : '';
	}
}
