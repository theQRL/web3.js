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

import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { NegativeOne, One, Zero } from '@ethersproject/constants';

import { Coder, Reader, Writer } from './abstract-coder.js';

const MaxUint512 = BigNumber.from(2).pow(512).sub(One);

export class NumberCoder extends Coder {
	readonly size: number;
	readonly signed: boolean;

	constructor(size: number, signed: boolean, localName: string) {
		const name = (signed ? 'int' : 'uint') + size * 8;
		super(name, name, localName, false);

		this.size = size;
		this.signed = signed;
	}

	defaultValue(): number {
		return 0;
	}

	encode(writer: Writer, value: BigNumberish): number {
		let v = BigNumber.from(value);

		// Check bounds are safe for encoding
		const maxUintValue = MaxUint512.mask(writer.wordSize * 8);
		if (this.signed) {
			const bounds = maxUintValue.mask(this.size * 8 - 1);
			if (v.gt(bounds) || v.lt(bounds.add(One).mul(NegativeOne))) {
				this._throwError('value out-of-bounds', value);
			}
		} else if (v.lt(Zero) || v.gt(maxUintValue.mask(this.size * 8))) {
			this._throwError('value out-of-bounds', value);
		}

		v = v.toTwos(this.size * 8).mask(this.size * 8);

		if (this.signed) {
			v = v.fromTwos(this.size * 8).toTwos(8 * writer.wordSize);
		}

		return writer.writeValue(v);
	}

	decode(reader: Reader): any {
		const word = reader.readValue();
		let value = word.mask(this.size * 8);

		if (this.signed) {
			value = value.fromTwos(this.size * 8);
		}

		// A canonical word carries the value zero-extended (unsigned) or sign-extended
		// (signed) to the full word, which is also what the on-chain decoder validates.
		// Any other word is not an encoding of this type and must not decode silently.
		const canonical = this.signed ? value.toTwos(reader.wordSize * 8) : value;
		if (!canonical.eq(word)) {
			this._throwError('value out-of-bounds', word);
		}

		return reader.coerce(this.name, value);
	}
}
