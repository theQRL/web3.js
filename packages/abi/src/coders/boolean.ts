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

export class BooleanCoder extends Coder {
	constructor(localName: string) {
		super('bool', 'bool', localName, false);
	}

	defaultValue(): boolean {
		return false;
	}

	encode(writer: Writer, value: boolean): number {
		return writer.writeValue(value ? 1 : 0);
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
