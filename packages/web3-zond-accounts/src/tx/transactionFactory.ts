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
import { toUint8Array, uint8ArrayToBigInt } from '../common/utils.js';
import { FeeMarketEIP1559Transaction } from './eip1559Transaction.js';
import type { TypedTransaction } from '../types.js';

import type {
	FeeMarketEIP1559TxData,
	TxData,
	TxOptions,
} from './types.js';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class TransactionFactory {
	// It is not possible to instantiate a TransactionFactory object.
	// eslint-disable-next-line @typescript-eslint/no-empty-function, no-useless-constructor
	private constructor() {}

	/**
	 * Create a transaction from a `txData` object
	 *
	 * @param txData - The transaction data. The `type` field will determine which transaction type is returned (if undefined, creates a legacy transaction)
	 * @param txOptions - Options to pass on to the constructor of the transaction
	 */
	public static fromTxData(
		txData: TxData | TypedTransaction,
		txOptions: TxOptions = {},
	): TypedTransaction {
		const txType = Number(uint8ArrayToBigInt(toUint8Array(txData.type)));
		if (txType === 2) {
			return FeeMarketEIP1559Transaction.fromTxData(
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				<FeeMarketEIP1559TxData>txData,
				txOptions,
			);
		}
		throw new Error(`Tx instantiation with type ${txType} not supported`);
	}

	/**
	 * This method tries to decode serialized data.
	 *
	 * @param data - The data Uint8Array
	 * @param txOptions - The transaction options
	 */
	public static fromSerializedData(
		data: Uint8Array,
		txOptions: TxOptions = {},
	): TypedTransaction {
		// Determine the type.
		switch (data[0]) {
			case 2:
				return FeeMarketEIP1559Transaction.fromSerializedTx(data, txOptions);
			default:
				throw new Error(`TypedTransaction with ID ${data[0]} unknown`);
		}
	}

	/**
	 * When decoding a BlockBody, in the transactions field, a field is either:
	 * A Uint8Array (a TypedTransaction - encoded as TransactionType || rlp(TransactionPayload))
	 * This method returns the right transaction.
	 *
	 * @param data - A Uint8Array or Uint8Array[]
	 * @param txOptions - The transaction options
	 */
	public static fromBlockBodyData(data: Uint8Array | Uint8Array[], txOptions: TxOptions = {}) {
		if (data instanceof Uint8Array) {
			return this.fromSerializedData(data, txOptions);
		}
		throw new Error('Cannot decode transaction: unknown type input');
	}
}
