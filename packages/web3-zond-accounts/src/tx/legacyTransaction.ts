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
import { RLP } from '@ethereumjs/rlp';
import { keccak256 } from 'ethereum-cryptography/keccak.js';
import { bytesToHex } from '@theqrl/web3-utils';
import { validateNoLeadingZeroes } from '@theqrl/web3-validator';
import {
	bigIntToHex,
	bigIntToUnpaddedUint8Array,
	toUint8Array,
	uint8ArrayToBigInt,
	unpadUint8Array,
} from '../common/utils.js';
import { MAX_INTEGER } from './constants.js';

import { BaseTransaction } from './baseTransaction.js';

import type { Common } from '../common/common.js';
import type { JsonTx, TxData, TxOptions, TxValuesArray } from './types.js';
import { Capability } from './types.js';

const TRANSACTION_TYPE = 0;

/**
 * An Ethereum non-typed (legacy) transaction
 */
// eslint-disable-next-line no-use-before-define
export class Transaction extends BaseTransaction<Transaction> {
	public readonly gasPrice: bigint;

	public readonly common: Common;

	/**
	 * Instantiate a transaction from a data dictionary.
	 *
	 * Format: { nonce, gasPrice, gasLimit, to, value, data, signature, publicKey }
	 *
	 * Notes:
	 * - All parameters are optional and have some basic default values
	 */
	public static fromTxData(txData: TxData, opts: TxOptions = {}) {
		return new Transaction(txData, opts);
	}

	/**
	 * Instantiate a transaction from the serialized tx.
	 *
	 * Format: `rlp([nonce, gasPrice, gasLimit, to, value, data, signature, publicKey])`
	 */
	public static fromSerializedTx(serialized: Uint8Array, opts: TxOptions = {}) {
		const values = RLP.decode(serialized);

		if (!Array.isArray(values)) {
			throw new Error('Invalid serialized tx input. Must be array');
		}

		return this.fromValuesArray(values as Uint8Array[], opts);
	}

	/**
	 * Create a transaction from a values array.
	 *
	 * Format: `[nonce, gasPrice, gasLimit, to, value, data, signature, publicKey]`
	 */
	public static fromValuesArray(values: TxValuesArray, opts: TxOptions = {}) {
		// If length is not 6, it has length 8. If signature/publicKey are empty Uint8Array, it is still an unsigned transaction
		// This happens if you get the RLP data from `raw()`
		if (values.length !== 6 && values.length !== 8) {
			throw new Error(
				'Invalid transaction. Only expecting 6 values (for unsigned tx) or 8 values (for signed tx).',
			);
		}

		const [nonce, gasPrice, gasLimit, to, value, data, publicKey, signature ] = values;

		validateNoLeadingZeroes({ nonce, gasPrice, gasLimit, value, publicKey, signature });

		return new Transaction(
			{
				nonce,
				gasPrice,
				gasLimit,
				to,
				value,
				data,
				publicKey,
				signature,
			},
			opts,
		);
	}

	/**
	 * This constructor takes the values, validates them, assigns them and freezes the object.
	 *
	 * It is not recommended to use this constructor directly. Instead use
	 * the static factory methods to assist in creating a Transaction object from
	 * varying data types.
	 */
	public constructor(txData: TxData, opts: TxOptions = {}) {
		super({ ...txData, type: TRANSACTION_TYPE }, opts);

		// TODO(rgeraldes24) - review chain id part
		// https://github.com/rgeraldes24/web3.js/blob/main/packages/web3-eth-accounts/src/tx/legacyTransaction.ts#L125
		this.common = this._getCommon(opts.common)

		this.gasPrice = uint8ArrayToBigInt(
			toUint8Array(txData.gasPrice === '' ? '0x' : txData.gasPrice),
		);

		if (this.gasPrice * this.gasLimit > MAX_INTEGER) {
			const msg = this._errorMsg('gas limit * gasPrice cannot exceed MAX_INTEGER (2^256-1)');
			throw new Error(msg);
		}
		this._validateCannotExceedMaxInteger({ gasPrice: this.gasPrice });
		BaseTransaction._validateNotArray(txData);

		if (this.common.gteHardfork('spuriousDragon')) {
			if (!this.isSigned()) {
				this.activeCapabilities.push(Capability.EIP155ReplayProtection);
			} else {
				// EIP155 spec:
				// If block.number >= 2,675,000 and v = CHAIN_ID * 2 + 35 or v = CHAIN_ID * 2 + 36
				// then when computing the hash of a transaction for purposes of signing or recovering
				// instead of hashing only the first six elements (i.e. nonce, gasprice, startgas, to, value, data)
				// hash nine elements, with v replaced by CHAIN_ID, r = 0 and s = 0.
				// v and chain ID meet EIP-155 conditions
				// eslint-disable-next-line no-lonely-if
				
				// TODO(rgeraldes): review
				// if (meetsEIP155(this.v!, this.common.chainId())) {
				// 	this.activeCapabilities.push(Capability.EIP155ReplayProtection);
				// }
			}
		}

		const freeze = opts?.freeze ?? true;
		if (freeze) {
			Object.freeze(this);
		}
	}

	/**
	 * Returns a Uint8Array Array of the raw Uint8Arrays of the legacy transaction, in order.
	 *
	 * Format: `[nonce, gasPrice, gasLimit, to, value, data, signature, publicKey]`
	 *
	 * For legacy txs this is also the correct format to add transactions
	 * to a block with {@link Block.fromValuesArray} (use the `serialize()` method
	 * for typed txs).
	 *
	 * For an unsigned tx this method returns the empty Uint8Array values
	 * for the signature parameters `v`, `r` and `s`. For an EIP-155 compliant
	 * representation have a look at {@link Transaction.getMessageToSign}.
	 */
	public raw(): TxValuesArray {
		return [
			bigIntToUnpaddedUint8Array(this.nonce),
			bigIntToUnpaddedUint8Array(this.gasPrice),
			bigIntToUnpaddedUint8Array(this.gasLimit),
			this.to !== undefined ? this.to.buf : Uint8Array.from([]),
			bigIntToUnpaddedUint8Array(this.value),
			this.data,
			this.publicKey !== undefined ? this.publicKey : Uint8Array.from([]),
			this.signature !== undefined ? this.signature : Uint8Array.from([]),
		];
	}

	/**
	 * Returns the serialized encoding of the legacy transaction.
	 *
	 * Format: `rlp([nonce, gasPrice, gasLimit, to, value, data, signature, publicKey])`
	 *
	 * For an unsigned tx this method uses the empty Uint8Array values for the
	 * signature parameters `v`, `r` and `s` for encoding. For an EIP-155 compliant
	 * representation for external signing use {@link Transaction.getMessageToSign}.
	 */
	public serialize(): Uint8Array {
		return RLP.encode(this.raw());
	}

	private _getMessageToSign() {
		const values = [
			bigIntToUnpaddedUint8Array(this.nonce),
			bigIntToUnpaddedUint8Array(this.gasPrice),
			bigIntToUnpaddedUint8Array(this.gasLimit),
			this.to !== undefined ? this.to.buf : Uint8Array.from([]),
			bigIntToUnpaddedUint8Array(this.value),
			this.data,
		];

		if (this.supports(Capability.EIP155ReplayProtection)) {
			values.push(toUint8Array(this.common.chainId()));
			// TODO (rgeraldes24): the following fields might be removed in the future
			values.push(unpadUint8Array(toUint8Array(0)));
			values.push(unpadUint8Array(toUint8Array(0)));
		}

		return values;
	}

	/**
	 * Returns the unsigned tx (hashed or raw), which can be used
	 * to sign the transaction (e.g. for sending to a hardware wallet).
	 *
	 * Note: the raw message message format for the legacy tx is not RLP encoded
	 * and you might need to do yourself with:
	 *
	 * ```javascript
	 * import { bufArrToArr } from '../util'
	 * import { RLP } from '../rlp'
	 * const message = tx.getMessageToSign(false)
	 * const serializedMessage = RLP.encode(message) // use this for the HW wallet input
	 * ```
	 *
	 * @param hashMessage - Return hashed message if set to true (default: true)
	 */
	public getMessageToSign(hashMessage: false): Uint8Array[];
	public getMessageToSign(hashMessage?: true): Uint8Array;
	public getMessageToSign(hashMessage = true) {
		const message = this._getMessageToSign();
		if (hashMessage) {
			return keccak256(RLP.encode(message));
		}
		return message;
	}

	/**
	 * The amount of gas paid for the data in this tx
	 */
	public getDataFee(): bigint {
		if (this.cache.dataFee && this.cache.dataFee.hardfork === this.common.hardfork()) {
			return this.cache.dataFee.value;
		}

		if (Object.isFrozen(this)) {
			this.cache.dataFee = {
				value: super.getDataFee(),
				hardfork: this.common.hardfork(),
			};
		}

		return super.getDataFee();
	}

	/**
	 * The up front amount that an account must have for this transaction to be valid
	 */
	public getUpfrontCost(): bigint {
		return this.gasLimit * this.gasPrice + this.value;
	}

	/**
	 * Computes a sha3-256 hash of the serialized tx.
	 *
	 * This method can only be used for signed txs (it throws otherwise).
	 * Use {@link Transaction.getMessageToSign} to get a tx hash for the purpose of signing.
	 */
	public hash(): Uint8Array {
		if (!this.isSigned()) {
			const msg = this._errorMsg('Cannot call hash method if transaction is not signed');
			throw new Error(msg);
		}

		if (Object.isFrozen(this)) {
			if (!this.cache.hash) {
				this.cache.hash = keccak256(RLP.encode(this.raw()));
			}
			return this.cache.hash;
		}

		return keccak256(RLP.encode(this.raw()));
	}

	/**
	 * Computes a sha3-256 hash which can be used to verify the signature
	 */
	public getMessageToVerifySignature() {
		if (!this.isSigned()) {
			const msg = this._errorMsg('This transaction is not signed');
			throw new Error(msg);
		}
		const message = this._getMessageToSign();
		return keccak256(RLP.encode(message));
	}

	/**
	 * Returns the public key of the sender
	 */
	public getSenderPublicKey(): Uint8Array {
		if (!this.isSigned()) {
			const msg = this._errorMsg('Cannot call this method if transaction is not signed');
			throw new Error(msg);
		}

		return this.publicKey!;
	}

	/**
	 * Process the signature and public key values from the `sign` method of the base transaction.
	 */
	protected _processSignatureAndPublicKey(signature: Uint8Array, publicKey: Uint8Array) {
		const opts = { ...this.txOptions, common: this.common };

		return Transaction.fromTxData(
			{
				nonce: this.nonce,
				gasPrice: this.gasPrice,
				gasLimit: this.gasLimit,
				to: this.to,
				value: this.value,
				data: this.data,
				publicKey: publicKey,
				signature: signature,
			},
			opts,
		);
	}

	/**
	 * Returns an object with the JSON representation of the transaction.
	 */
	public toJSON(): JsonTx {
		return {
			nonce: bigIntToHex(this.nonce),
			gasPrice: bigIntToHex(this.gasPrice),
			gasLimit: bigIntToHex(this.gasLimit),
			to: this.to !== undefined ? this.to.toString() : undefined,
			value: bigIntToHex(this.value),
			data: bytesToHex(this.data),
			publicKey: this.publicKey !== undefined ? bytesToHex(this.publicKey) : undefined,
			signature: this.signature !== undefined ? bytesToHex(this.signature) : undefined,
		};
	}

	/**
	 * Return a compact error string representation of the object
	 */
	public errorStr() {
		let errorStr = this._getSharedErrorPostfix();
		errorStr += ` gasPrice=${this.gasPrice}`;
		return errorStr;
	}

	/**
	 * Internal helper function to create an annotated error message
	 *
	 * @param msg Base error message
	 * @hidden
	 */
	protected _errorMsg(msg: string) {
		return `${msg} (${this.errorStr()})`;
	}
}
