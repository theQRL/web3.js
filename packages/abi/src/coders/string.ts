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

import { bytesToUtf8, utf8ToBytes } from '@theqrl/qrl-cryptography/utils.js';

import { Reader, Writer } from './abstract-coder.js';
import { DynamicBytesCoder } from './bytes.js';

// A high surrogate not followed by a low one, or a low surrogate not preceded by a high one.
const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export class StringCoder extends DynamicBytesCoder {
	constructor(localName: string) {
		super('string', localName);
	}

	defaultValue(): string {
		return '';
	}

	encode(writer: Writer, value: any): number {
		// Diff vs ethers v5: `toUtf8Bytes` threw for a non-string and for an unpaired surrogate;
		// `TextEncoder` would coerce the former and replace the latter with U+FFFD, encoding a
		// string the caller never wrote.
		if (typeof value !== 'string') {
			this._throwError('expected string value', value);
		}
		if (UNPAIRED_SURROGATE.test(value)) {
			this._throwError('invalid string value: unpaired surrogate', value);
		}
		return super.encode(writer, utf8ToBytes(value));
	}

	decode(reader: Reader): any {
		// `fatal: true` preserves ethers' `toUtf8String` throwing behaviour on
		// invalid UTF-8. Silent U+FFFD replacement would let two distinct invalid
		// byte sequences decode to the same string, a hash-collision hazard for a
		// decoder feeding a signing library.
		return bytesToUtf8(super.decode(reader), { fatal: true });
	}
}
