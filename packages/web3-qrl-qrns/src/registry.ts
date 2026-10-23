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

import { Web3ContextObject } from '@theqrl/web3-core';
import {
	BaseWeb3Error,
	ContractExecutionError,
	TransactionRevertInstructionError,
	Web3ContractError,
} from '@theqrl/web3-errors';
import { Contract } from '@theqrl/web3-qrl-contract';
import { Address } from '@theqrl/web3-types';
import { isAddressString } from '@theqrl/web3-validator';
import { QRNSRegistryAbi } from './abi/qrns/QRNSRegistry.js';
import { PublicResolverAbi } from './abi/qrns/PublicResolver.js';
import { QRL_ZERO_ADDRESS } from './config.js';
import { namehash } from './utils.js';

/**
 * Maps a failed registry call to a typed error: a revert reported by the node becomes a
 * `TransactionRevertInstructionError`, any other web3 error (an ABI decoding failure, a
 * malformed reply, a connection error) is passed through unchanged, and anything else is
 * wrapped in a `Web3ContractError` that keeps the cause as `innerError` (L-26).
 */
const wrapContractCallError = (error: unknown): Error => {
	if (error instanceof ContractExecutionError) {
		const revertError = new TransactionRevertInstructionError(
			error.innerError?.message ?? error.message,
		);
		revertError.innerError = error;
		return revertError;
	}
	if (error instanceof BaseWeb3Error) {
		return error;
	}
	const cause = error instanceof Error ? error : new Error(String(error));
	const wrapped = new Web3ContractError(`QRNS registry call failed: ${cause.message}`);
	wrapped.innerError = cause;
	return wrapped;
};

export class Registry {
	private readonly contract: Contract<typeof QRNSRegistryAbi>;
	private readonly context: Web3ContextObject;

	public constructor(context: Web3ContextObject, customRegistryAddress?: Address) {
		this.contract = new Contract(QRNSRegistryAbi, customRegistryAddress, context);

		this.context = context;
	}

	/**
	 * The address of the registry contract the queries are sent to. Settable, so that the
	 * owning {@link QRNS} can repoint the registry at the address it resolved (L-62).
	 */
	public get address(): Address | undefined {
		return this.contract.options.address;
	}

	public set address(value: Address | undefined) {
		this.contract.options.address = value;
	}

	public async getOwner(name: string) {
		try {
			return await this.contract.methods.owner(namehash(name)).call();
		} catch (error) {
			throw wrapContractCallError(error);
		}
	}

	public async getTTL(name: string) {
		try {
			return await this.contract.methods.ttl(namehash(name)).call();
		} catch (error) {
			throw wrapContractCallError(error);
		}
	}

	public async recordExists(name: string) {
		try {
			return await this.contract.methods.recordExists(namehash(name)).call();
		} catch (error) {
			throw wrapContractCallError(error);
		}
	}

	public async getResolver(name: string) {
		let address: unknown;
		try {
			address = await this.contract.methods.resolver(namehash(name)).call();
		} catch (error) {
			throw wrapContractCallError(error);
		}

		if (typeof address !== 'string') {
			throw new Web3ContractError('QRNS registry returned non-string resolver address');
		}
		if (!isAddressString(address)) {
			throw new Web3ContractError(
				`QRNS registry returned invalid resolver address: ${address}`,
			);
		}
		if (address.toLowerCase() === QRL_ZERO_ADDRESS.toLowerCase()) {
			throw new Web3ContractError('QRNS registry returned zero resolver address');
		}
		return new Contract(PublicResolverAbi, address, this.context);
	}

	public get events() {
		return this.contract.events;
	}
}
