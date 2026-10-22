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

import { Coder, Reader, Writer } from './abstract-coder.js';

/**
 * Maps a value to the bit a `bool` parameter encodes it as, or `undefined` when the value is
 * not an encoding of a boolean.
 *
 * Diff vs ethers v5 (H-3): ethers encoded JS truthiness, so `'0'`, `'0x0'`, `'false'`, `2` and
 * `{}` all became `true`. Only `true`/`false` and the explicit forms that the library's
 * validator (`web3-validator`'s `bool` format) accepts are encodings of a boolean, and they are
 * mapped by value: `0`/`1`, `0n`/`1n`, `'0'`/`'1'` and `'0x0'`/`'0x1'`.
 */
export function booleanToBit(value: unknown): 0 | 1 | undefined {
	if (value === true || value === 1 || value === BigInt(1) || value === '1' || value === '0x1') {
		return 1;
	}
	if (value === false || value === 0 || value === BigInt(0) || value === '0' || value === '0x0') {
		return 0;
	}
	return undefined;
}

export class BooleanCoder extends Coder {
	constructor(localName: string) {
		super('bool', 'bool', localName, false);
	}

	defaultValue(): boolean {
		return false;
	}

	encode(writer: Writer, value: unknown): number {
		const bit = booleanToBit(value);
		if (bit === undefined) {
			return this._throwError('invalid boolean value', value);
		}
		return writer.writeValue(bit);
	}

	decode(reader: Reader): any {
		const word = reader.readValue();
		// Only 0 and 1 encode a boolean; the on-chain decoder rejects anything else.
		if (!word.isZero() && !word.eq(1)) {
			this._throwError('invalid boolean value', word);
		}
		return reader.coerce(this.type, !word.isZero());
	}
}
