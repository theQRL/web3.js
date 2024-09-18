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
import type { HexString, Numbers } from '@theqrl/web3-types';

import type { Common } from '../common/common.js';
// eslint-disable-next-line require-extensions/require-extensions
import type { Uint8ArrayLike, PrefixedHexString } from '../common/types';
import { Address } from './address.js';

/**
 * The options for initializing a {@link Transaction}.
 */
export interface TxOptions {
	/**
	 * A {@link Common} object defining the chain and hardfork for the transaction.
	 *
	 * Object will be internally copied so that tx behavior don't incidentally
	 * change on future HF changes.
	 *
	 * Default: {@link Common} object set to `mainnet` and the default hardfork as defined in the {@link Common} class.
	 *
	 * Current default hardfork: `istanbul`
	 */
	common?: Common;
	/**
	 * A transaction object by default gets frozen along initialization. This gives you
	 * strong additional security guarantees on the consistency of the tx parameters.
	 * It also enables tx hash caching when the `hash()` method is called multiple times.
	 *
	 * If you need to deactivate the tx freeze - e.g. because you want to subclass tx and
	 * add additional properties - it is strongly encouraged that you do the freeze yourself
	 * within your code instead.
	 *
	 * Default: true
	 */
	freeze?: boolean;

	/**
	 * Allows unlimited contract code-size init while debugging. This (partially) disables EIP-3860.
	 * Gas cost for initcode size analysis will still be charged. Use with caution.
	 */
	allowUnlimitedInitCodeSize?: boolean;
}

/*
 * Access List types
 */

export type AccessListItem = {
	address: PrefixedHexString;
	storageKeys: PrefixedHexString[];
};

/*
 * An Access List as a tuple of [address: Uint8Array, storageKeys: Uint8Array[]]
 */
export type AccessListUint8ArrayItem = [Uint8Array, Uint8Array[]];
export type AccessListUint8Array = AccessListUint8ArrayItem[];
export type AccessList = AccessListItem[];

export function isAccessListUint8Array(
	input: AccessListUint8Array | AccessList,
): input is AccessListUint8Array {
	if (input.length === 0) {
		return true;
	}
	const firstItem = input[0];
	if (Array.isArray(firstItem)) {
		return true;
	}
	return false;
}

export function isAccessList(input: AccessListUint8Array | AccessList): input is AccessList {
	return !isAccessListUint8Array(input); // This is exactly the same method, except the output is negated.
}

/**
 * Legacy {@link Transaction} Data
 */
export type TxData = {
	/**
	 * The transaction's nonce.
	 */
	nonce?: Numbers | Uint8Array;

	/**
	 * The transaction's gas limit.
	 */
	gasLimit?: Numbers | Uint8Array;

	/**
	 * The transaction's the address is sent to.
	 */
	to?: Address | Uint8Array | HexString;

	/**
	 * The amount of Ether sent.
	 */
	value?: Numbers | Uint8Array;

	/**
	 * This will contain the data of the message or the init of a contract.
	 */
	data?: Uint8ArrayLike;

	/**
	 * Dilithium5 signature.
	 */
	signature?: Numbers | Uint8Array;

	/**
	 * Dilithium5 public key.
	 */
	publicKey?: Numbers | Uint8Array;

	/**
	 * The transaction type
	 */

	type?: Numbers;
};

/**
 * {@link FeeMarketEIP1559Transaction} data.
 */
export interface FeeMarketEIP1559TxData extends TxData {
	/**
	 * The transaction's chain ID
	 */
	chainId?: Numbers;

	/**
	 * The access list which contains the addresses/storage slots which the transaction wishes to access
	 */
	// eslint-disable-next-line @typescript-eslint/ban-types
	accessList?: AccessListUint8Array | AccessList | null;

	/**
	 * The maximum inclusion fee per gas (this fee is given to the miner)
	 */
	maxPriorityFeePerGas?: Numbers | Uint8Array;

	/**
	 * The maximum total fee
	 */
	maxFeePerGas?: Numbers | Uint8Array;
}

/**
 * Uint8Array values array for a {@link FeeMarketEIP1559Transaction}
 */
export type FeeMarketEIP1559ValuesArray = [
	Uint8Array,
	Uint8Array,
	Uint8Array,
	Uint8Array,
	Uint8Array,
	Uint8Array,
	Uint8Array,
	Uint8Array,
	AccessListUint8Array,
	Uint8Array?,
	Uint8Array?,
];

type JsonAccessListItem = { address: string; storageKeys: string[] };

/**
 * Generic interface for all tx types with a
 * JSON representation of a transaction.
 *
 * Note that all values are marked as optional
 * and not all the values are present on all tx types
 */
export interface JsonTx {
	nonce?: string;
	gasLimit?: string;
	to?: string;
	data?: string;
	signature?: string;
	publicKey?: string;
	value?: string;
	chainId?: string;
	accessList?: JsonAccessListItem[];
	type?: string;
	maxPriorityFeePerGas?: string;
	maxFeePerGas?: string;
}
