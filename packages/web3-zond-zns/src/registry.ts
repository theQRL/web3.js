﻿/*
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

import { Web3ContextObject } from '@theqrl/web3-core';
import { Contract } from '@theqrl/web3-zond-contract';
import { Address } from '@theqrl/web3-types';
import { ZNSRegistryAbi } from './abi/zns/ZNSRegistry.js';
import { PublicResolverAbi } from './abi/zns/PublicResolver.js';
import { registryAddresses } from './config.js';
import { namehash } from './utils.js';

export class Registry {
	private readonly contract: Contract<typeof ZNSRegistryAbi>;
	private readonly context: Web3ContextObject;

	public constructor(context: Web3ContextObject, customRegistryAddress?: Address) {
		this.contract = new Contract(
			ZNSRegistryAbi,
			customRegistryAddress ?? registryAddresses.main,
			context,
		);

		this.context = context;
	}

	public async getOwner(name: string) {
		try {
			const result = this.contract.methods.owner(namehash(name)).call();

			return result;
		} catch (error) {
			throw new Error(); // TODO: TransactionRevertInstructionError Needs to be added after web3-zond call method is implemented
		}
	}

	public async getTTL(name: string) {
		try {
			return this.contract.methods.ttl(namehash(name)).call();
		} catch (error) {
			throw new Error(); // TODO: TransactionRevertInstructionError Needs to be added after web3-zond call method is implemented
		}
	}

	public async recordExists(name: string) {
		try {
			const promise = this.contract.methods.recordExists(namehash(name)).call();

			return promise;
		} catch (error) {
			throw new Error(); // TODO: TransactionRevertInstructionError Needs to be added after web3-eth call method is implemented
		}
	}

	public async getResolver(name: string) {
		try {
			return this.contract.methods
				.resolver(namehash(name))
				.call()
				.then(address => {
					// address type is unknown, not sure why
					if (typeof address === 'string') {
						const contract = new Contract(PublicResolverAbi, address, this.context);
						// TODO: set contract provider needs to be added when zns current provider
						return contract;
					}
					throw new Error();
				});
		} catch (error) {
			throw new Error(); // TODO: TransactionRevertInstructionError Needs to be added after web3-zond call method is implemented
		}
	}

	public get events() {
		return this.contract.events;
	}
}
