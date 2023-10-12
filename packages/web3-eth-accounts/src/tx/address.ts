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
import { bytesToHex, uint8ArrayEquals } from 'web3-utils';
import { assertIsUint8Array, zeros } from '../common/utils.js';
import { getDilithiumAddressFromPK } from '@theqrl/wallet.js'
import { CryptoPublicKeyBytes } from '@theqrl/dilithium5';

export class Address {
	public readonly buf: Uint8Array;

	public constructor(buf: Uint8Array) {
		if (buf.length !== 20) {
			throw new Error('Invalid address length');
		}
		this.buf = buf;
	}

	/**
	 * Returns the zero address.
	 */
	public static zero(): Address {
		return new Address(zeros(20));
	}

	/**
	 * Is address equal to another.
	 */
	public equals(address: Address): boolean {
		return uint8ArrayEquals(this.buf, address.buf);
	}

	/**
	 * Is address zero.
	 */
	public isZero(): boolean {
		return this.equals(Address.zero());
	}

	/**
	 * Returns hex encoding of address.
	 */
	public toString(): string {
		return bytesToHex(this.buf);
	}

	/**
	 * Returns Uint8Array representation of address.
	 */
	public toArray(): Uint8Array {
		return this.buf;
	}

	/**
	 * Returns the zond address of a given public key.
	 * Accepts "Dilithium5 public keys".
	 * @param pubKey The Dilithium5 public key
	 */
	public static publicToAddress(_pubKey: Uint8Array): Uint8Array {
		let pubKey = _pubKey;
		assertIsUint8Array(pubKey);

		if (pubKey.length !== CryptoPublicKeyBytes) {
			throw new Error('Expected pubKey to be of length 2592');
		}
		
		return getDilithiumAddressFromPK(pubKey)
	}
}
