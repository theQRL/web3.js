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

import { hexZeroPad } from '@ethersproject/bytes';
import { hexToAddress, addressToHex, toChecksumAddress } from '@theqrl/web3-utils';

import { Coder, Reader, Writer } from './abstract-coder.js';

// Q + 128 hex chars; addressToHex returns "0x" + 128 hex chars.
const ADDRESS_BYTES = 64;
const ADDRESS_HEX_LENGTH = 2 + ADDRESS_BYTES * 2;

export class AddressCoder extends Coder {
	constructor(localName: string) {
		super('address', 'address', localName, false);
	}

	defaultValue(): string {
		return `Q${'0'.repeat(ADDRESS_BYTES * 2)}`;
	}

	encode(writer: Writer, value: string): number {
		// addressToHex validates that `value` is a well-formed 64-byte Q-prefixed
		// address and returns the same bytes as a 0x-prefixed hex string. We
		// deliberately do NOT route through `@ethersproject/address.getAddress`:
		// ethers' validator hard-codes the 20-byte ETH layout and rejects 64-byte
		// post-quantum addresses with "invalid address (version=address/5.7.0)".
		let hex: string;
		try {
			hex = addressToHex(value);
		} catch (error: any) {
			this._throwError(error.message, value);
			throw error; // unreachable; satisfies the type checker
		}
		// Defensive post-condition, not the primary validator: `addressToHex` above already
		// guarantees a 64-byte (130-char `0x`) result
		// Kept to catch any future loosening of `addressToHex`'s
		// contract before a wrong-length value reached the word writer.
		if (hex.length !== ADDRESS_HEX_LENGTH) {
			this._throwError(`invalid 64-byte address (got ${(hex.length - 2) / 2} bytes)`, value);
		}
		// A 64-byte QRL address fills one full VM word.
		return writer.writeValue(hex);
	}

	decode(reader: Reader): any {
		return toChecksumAddress(
			hexToAddress(hexZeroPad(reader.readValue().toHexString(), ADDRESS_BYTES)),
		);
	}
}
