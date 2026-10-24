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

import { arrayify } from '@ethersproject/bytes';
import { bytesToUtf8 } from '@theqrl/qrl-cryptography/utils.js';

import { Coder, Reader, Writer } from './abstract-coder.js';

// Diff vs ethers v5 (M-9): ethers' `hexlify` appends two characters per byte, which builds a
// rope of one heap object per byte that the decoded result keeps alive; a large `bytes` value
// (or many values sharing one payload, see the Reader's read budget) then spends seconds in the
// garbage collector. Emitting the hex digits as ASCII bytes and decoding them once yields a flat
// string at a small fraction of the cost. Same output: `0x` followed by lowercase hex.
const HEX_DIGIT_CODES = new Uint8Array(16);
for (let i = 0; i < 16; i++) {
	HEX_DIGIT_CODES[i] = '0123456789abcdef'.charCodeAt(i);
}

export function bytesToHexString(bytes: Uint8Array): string {
	const digits = new Uint8Array(bytes.length * 2);
	for (let i = 0; i < bytes.length; i++) {
		const byte = bytes[i];
		digits[2 * i] = HEX_DIGIT_CODES[byte >> 4];
		digits[2 * i + 1] = HEX_DIGIT_CODES[byte & 0x0f];
	}
	return `0x${bytesToUtf8(digits, { fatal: true })}`;
}

export class DynamicBytesCoder extends Coder {
	constructor(type: string, localName: string) {
		super(type, type, localName, true);
	}

	defaultValue(): string {
		return '0x';
	}

	encode(writer: Writer, value: any): number {
		value = arrayify(value);
		let length = writer.writeValue(value.length);
		length += writer.writeBytes(value);
		return length;
	}

	decode(reader: Reader): any {
		return reader.readBytes(reader.readValue().toNumber(), true);
	}
}

export class BytesCoder extends DynamicBytesCoder {
	constructor(localName: string) {
		super('bytes', localName);
	}

	decode(reader: Reader): any {
		return reader.coerce(this.name, bytesToHexString(super.decode(reader)));
	}
}
