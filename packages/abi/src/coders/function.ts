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

import { arrayify, BytesLike, hexConcat, hexlify } from '@ethersproject/bytes';
import { Coder, Reader, Writer } from './abstract-coder.js';

const ADDRESS_BYTES = 64;
const SELECTOR_BYTES = 4;

export class FunctionCoder extends Coder {
	constructor(localName: string) {
		super('function', 'function', localName, false);
	}

	defaultValue(): string {
		return hexlify(new Uint8Array(ADDRESS_BYTES + SELECTOR_BYTES));
	}

	encode(writer: Writer, value: BytesLike): number {
		const data = arrayify(value);
		if (data.length !== ADDRESS_BYTES + SELECTOR_BYTES) {
			this._throwError('incorrect function value length', value);
		}
		// Hyperion encodes the selector as uint32 in a separate VM word.
		return (
			writer.writeBytes(data.slice(0, ADDRESS_BYTES)) +
			writer.writeValue(data.slice(ADDRESS_BYTES))
		);
	}

	decode(reader: Reader): string {
		const address = reader.readBytes(ADDRESS_BYTES);
		const selector = reader.readBytes(reader.wordSize);
		return reader.coerce(
			this.name,
			hexConcat([address, selector.slice(-SELECTOR_BYTES)]),
		) as string;
	}
}
