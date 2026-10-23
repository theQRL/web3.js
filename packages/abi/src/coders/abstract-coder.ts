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

import { arrayify, BytesLike, concat, hexConcat, hexlify } from '@ethersproject/bytes';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { defineReadOnly } from '@ethersproject/properties';

import { Logger } from '@ethersproject/logger';
import { version } from '../_version.js';

const logger = new Logger(version);

export interface Result extends ReadonlyArray<any> {
	readonly [key: string]: any;
}

export function checkResultErrors(
	result: Result,
): Array<{ path: Array<string | number>; error: Error }> {
	// Find the first error (if any)
	const errors: Array<{ path: Array<string | number>; error: Error }> = [];

	const checkErrors = function (path: Array<string | number>, object: any): void {
		if (!Array.isArray(object)) {
			return;
		}
		for (const key in object) {
			const childPath = path.slice();
			childPath.push(key);

			try {
				checkErrors(childPath, object[key]);
			} catch (error: any) {
				errors.push({ path: childPath, error });
			}
		}
	};
	checkErrors([], result);

	return errors;
}

export type CoerceFunc = (type: string, value: any) => any;

export abstract class Coder {
	// The coder name:
	//   - address, uint512, tuple, array, etc.
	readonly name: string;

	// The fully expanded type, including composite types:
	//   - address, uint512, tuple(address,bytes), uint512[3][4][],  etc.
	readonly type: string;

	// The localName bound in the signature, in this example it is "baz":
	//   - tuple(address foo, uint bar) baz
	readonly localName: string;

	// Whether this type is dynamic:
	//  - Dynamic: bytes, string, address[], tuple(boolean[]), etc.
	//  - Not Dynamic: address, uint512, boolean[3], tuple(address, uint8)
	readonly dynamic: boolean;

	constructor(name: string, type: string, localName: string, dynamic: boolean) {
		// @TODO: defineReadOnly these
		this.name = name;
		this.type = type;
		this.localName = localName;
		this.dynamic = dynamic;
	}

	_throwError(message: string, value: any): never {
		return logger.throwArgumentError(message, this.localName, value);
	}

	abstract encode(writer: Writer, value: any): number;
	abstract decode(reader: Reader): any;

	abstract defaultValue(): any;
}

export class Writer {
	readonly wordSize: number;

	_data: Array<Uint8Array>;
	_dataLength: number;
	_padding: Uint8Array;

	constructor(wordSize?: number) {
		defineReadOnly(this, 'wordSize', wordSize || 64);
		this._data = [];
		this._dataLength = 0;
		this._padding = new Uint8Array(this.wordSize);
	}

	get data(): string {
		return hexConcat(this._data);
	}
	get length(): number {
		return this._dataLength;
	}

	_writeData(data: Uint8Array): number {
		this._data.push(data);
		this._dataLength += data.length;
		return data.length;
	}

	appendWriter(writer: Writer): number {
		return this._writeData(concat(writer._data));
	}

	// Arrayish items; padded on the right to wordSize
	writeBytes(value: BytesLike): number {
		let bytes = arrayify(value);
		const paddingOffset = bytes.length % this.wordSize;
		if (paddingOffset) {
			bytes = concat([bytes, this._padding.slice(paddingOffset)]);
		}
		return this._writeData(bytes);
	}

	_getValue(value: BigNumberish): Uint8Array {
		let bytes = arrayify(BigNumber.from(value));
		if (bytes.length > this.wordSize) {
			logger.throwError('value out-of-bounds', Logger.errors.BUFFER_OVERRUN, {
				length: this.wordSize,
				offset: bytes.length,
			});
		}
		if (bytes.length % this.wordSize) {
			bytes = concat([this._padding.slice(bytes.length % this.wordSize), bytes]);
		}
		return bytes;
	}

	// BigNumberish items; padded on the left to wordSize
	writeValue(value: BigNumberish): number {
		return this._writeData(this._getValue(value));
	}

	writeUpdatableValue(): (value: BigNumberish) => void {
		const offset = this._data.length;
		this._data.push(this._padding);
		this._dataLength += this.wordSize;
		return (value: BigNumberish) => {
			this._data[offset] = this._getValue(value);
		};
	}
}

// Diff vs ethers v5 (M-9): node-supplied data can make every element of a dynamic array point
// at the same bytes, so the number of bytes the coders read is not bounded by the input length.
// Like ethers v6 (`maxInflation`), a decode may read at most this many times the input length
// before it is rejected. Canonical encodings read every byte once, so legitimate results stay
// far below the limit however large they are.
export const MAX_INFLATION = 16;
// Floor of the array-element budget, so that a one-word input can still hold a few elements.
export const MIN_ELEMENT_BUDGET = 256;

export class Reader {
	readonly wordSize: number;
	readonly allowLoose: boolean;

	readonly _data: Uint8Array;
	readonly _coerceFunc: CoerceFunc;

	_offset: number;

	// Diff vs ethers v5 (M-9): the reader every sub-reader descends from. It owns the read
	// budget shared by the whole decode; `_bytesRead` is only maintained on the root.
	public readonly _root: Reader;
	public _bytesRead: number;
	// Diff vs ethers v5 (M-10): array elements decoded so far, shared like `_bytesRead`. A
	// zero-size element type (`tuple()`) consumes no bytes, so the byte budget alone cannot
	// bound the number of result objects a nested array can produce.
	public _elementsDecoded: number;

	constructor(
		data: BytesLike,
		wordSize?: number,
		coerceFunc?: CoerceFunc,
		allowLoose?: boolean,
		parent?: Reader,
	) {
		// A sub-reader is handed a view on its parent's buffer; `arrayify` would copy it.
		defineReadOnly(
			this,
			'_data',
			parent && data instanceof Uint8Array ? data : arrayify(data),
		);
		defineReadOnly(this, 'wordSize', wordSize || 64);
		defineReadOnly(this, '_coerceFunc', coerceFunc);
		defineReadOnly(this, 'allowLoose', allowLoose);
		// Not enumerable: the root reader refers to itself.
		Object.defineProperty(this, '_root', {
			enumerable: false,
			writable: false,
			value: parent ? parent._root : this,
		});

		this._offset = 0;
		this._bytesRead = 0;
		this._elementsDecoded = 0;
	}

	get data(): string {
		return hexlify(this._data);
	}
	get consumed(): number {
		return this._offset;
	}
	// Total bytes read through this reader and every sub-reader sharing its buffer (M-9).
	public get bytesRead(): number {
		return this._root._bytesRead;
	}

	public _incrementBytesRead(count: number): void {
		const root = this._root;
		root._bytesRead += count;
		if (root._bytesRead > MAX_INFLATION * root._data.length) {
			logger.throwError(
				`compressed ABI data exceeds inflation ratio of ${MAX_INFLATION}`,
				Logger.errors.BUFFER_OVERRUN,
				{
					length: root._data.length,
					offset: this._offset,
					bytesRead: root._bytesRead,
				},
			);
		}
	}

	// Every valid encoding spends at least one word per array element, so a decode may never
	// produce more elements than MAX_INFLATION times the number of words in the input (with a
	// small floor for tiny inputs). Zero-size element types are the only way past the byte
	// budget, and this bound closes it (M-10).
	public _incrementElementsDecoded(count: number): void {
		// A count that is not a non-negative safe integer (a negative or string array length
		// from a forged ParamType) would drive the budget negative or turn it into text (P4-M-2).
		if (!Number.isSafeInteger(count) || count < 0) {
			logger.throwError('invalid array element count', Logger.errors.BUFFER_OVERRUN, {
				count,
				offset: this._offset,
			});
		}
		const root = this._root;
		root._elementsDecoded += count;
		const budget = Math.max(
			MAX_INFLATION * Math.ceil(root._data.length / root.wordSize),
			MIN_ELEMENT_BUDGET,
		);
		if (root._elementsDecoded > budget) {
			logger.throwError(
				`decoded array elements exceed the budget of ${budget} for ${root._data.length} bytes of data`,
				Logger.errors.BUFFER_OVERRUN,
				{
					length: root._data.length,
					offset: this._offset,
					elementsDecoded: root._elementsDecoded,
				},
			);
		}
	}

	// The default Coerce function
	static coerce(name: string, value: any): any {
		const match = name.match('^u?int([0-9]+)$');
		if (match && parseInt(match[1]) <= 48) {
			value = value.toNumber();
		}
		return value;
	}

	coerce(name: string, value: any): any {
		if (this._coerceFunc) {
			return this._coerceFunc(name, value);
		}
		return Reader.coerce(name, value);
	}

	_peekBytes(offset: number, length: number, loose?: boolean): Uint8Array {
		let alignedLength = Math.ceil(length / this.wordSize) * this.wordSize;
		if (this._offset + alignedLength > this._data.length) {
			if (this.allowLoose && loose && this._offset + length <= this._data.length) {
				alignedLength = length;
			} else {
				logger.throwError('data out-of-bounds', Logger.errors.BUFFER_OVERRUN, {
					length: this._data.length,
					offset: this._offset + alignedLength,
				});
			}
		}
		return this._data.slice(this._offset, this._offset + alignedLength);
	}

	// Diff vs ethers v5 (M-9): the sub-reader shares this reader's buffer (`subarray`) instead
	// of copying the rest of it, so creating one is O(1) rather than O(remaining bytes).
	subReader(offset: number): Reader {
		return new Reader(
			this._data.subarray(this._offset + offset),
			this.wordSize,
			this._coerceFunc,
			this.allowLoose,
			this,
		);
	}

	readBytes(length: number, loose?: boolean): Uint8Array {
		const bytes = this._peekBytes(0, length, !!loose);
		this._incrementBytesRead(length);
		this._offset += bytes.length;
		// @TODO: Make sure the length..end bytes are all 0?
		return bytes.slice(0, length);
	}

	readValue(): BigNumber {
		return BigNumber.from(this.readBytes(this.wordSize));
	}
}
