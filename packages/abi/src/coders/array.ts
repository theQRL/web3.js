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

import { Logger } from '@ethersproject/logger';
import { version } from '../_version.js';

import { Coder, Reader, Result, Writer } from './abstract-coder.js';
import { AnonymousCoder } from './anonymous.js';

const logger = new Logger(version);

// Largest fixed array length `defaultValue()` materialises (M-10).
export const MAX_DEFAULT_ARRAY_LENGTH = 65536;

export function pack(
	writer: Writer,
	coders: ReadonlyArray<Coder>,
	values: Array<any> | { [name: string]: any },
): number {
	let arrayValues: Array<any> = null;

	if (Array.isArray(values)) {
		arrayValues = values;
	} else if (values && typeof values === 'object') {
		const unique: { [name: string]: boolean } = {};

		arrayValues = coders.map(coder => {
			const name = coder.localName;
			if (!name) {
				logger.throwError(
					'cannot encode object for signature with missing names',
					Logger.errors.INVALID_ARGUMENT,
					{
						argument: 'values',
						coder,
						value: values,
					},
				);
			}

			if (unique[name]) {
				logger.throwError(
					'cannot encode object for signature with duplicate names',
					Logger.errors.INVALID_ARGUMENT,
					{
						argument: 'values',
						coder,
						value: values,
					},
				);
			}

			unique[name] = true;

			return values[name];
		});
	} else {
		logger.throwArgumentError('invalid tuple value', 'tuple', values);
	}

	if (coders.length !== arrayValues.length) {
		logger.throwArgumentError('types/value length mismatch', 'tuple', values);
	}

	const staticWriter = new Writer(writer.wordSize);
	const dynamicWriter = new Writer(writer.wordSize);

	const updateFuncs: Array<(baseOffset: number) => void> = [];
	coders.forEach((coder, index) => {
		const value = arrayValues[index];

		if (coder.dynamic) {
			// Get current dynamic offset (for the future pointer)
			const dynamicOffset = dynamicWriter.length;

			// Encode the dynamic value into the dynamicWriter
			coder.encode(dynamicWriter, value);

			// Prepare to populate the correct offset once we are done
			const updateFunc = staticWriter.writeUpdatableValue();
			updateFuncs.push((baseOffset: number) => {
				updateFunc(baseOffset + dynamicOffset);
			});
		} else {
			coder.encode(staticWriter, value);
		}
	});

	// Backfill all the dynamic offsets, now that we know the static length
	updateFuncs.forEach(func => {
		func(staticWriter.length);
	});

	let length = writer.appendWriter(staticWriter);
	length += writer.appendWriter(dynamicWriter);
	return length;
}

export function unpack(reader: Reader, coders: Array<Coder>): Result {
	const values: any = [];

	// A reader anchored to this base
	const baseReader = reader.subReader(0);

	coders.forEach(coder => {
		let value: any = null;

		if (coder.dynamic) {
			const offset = reader.readValue();
			const offsetReader = baseReader.subReader(offset.toNumber());
			try {
				value = coder.decode(offsetReader);
			} catch (error: any) {
				// Cannot recover from this
				if (error.code === Logger.errors.BUFFER_OVERRUN) {
					throw error;
				}
				value = error;
				value.baseType = coder.name;
				value.name = coder.localName;
				value.type = coder.type;
			}
		} else {
			try {
				value = coder.decode(reader);
			} catch (error: any) {
				// Cannot recover from this
				if (error.code === Logger.errors.BUFFER_OVERRUN) {
					throw error;
				}
				value = error;
				value.baseType = coder.name;
				value.name = coder.localName;
				value.type = coder.type;
			}
		}

		if (value != undefined) {
			values.push(value);
		}
	});

	// We only output named properties for uniquely named coders
	const uniqueNames = coders.reduce<{ [name: string]: number }>((accum, coder) => {
		const name = coder.localName;
		if (name) {
			if (!accum[name]) {
				accum[name] = 0;
			}
			accum[name]++;
		}
		return accum;
	}, {});

	// Add any named parameters (i.e. tuples)
	coders.forEach((coder: Coder, index: number) => {
		let name = coder.localName;
		if (!name || uniqueNames[name] !== 1) {
			return;
		}

		if (name === 'length') {
			name = '_length';
		}

		if (values[name] != null) {
			return;
		}

		const value = values[index];

		if (value instanceof Error) {
			Object.defineProperty(values, name, {
				enumerable: true,
				get: () => {
					throw value;
				},
			});
		} else {
			values[name] = value;
		}
	});

	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		if (value instanceof Error) {
			Object.defineProperty(values, i, {
				enumerable: true,
				get: () => {
					throw value;
				},
			});
		}
	}

	return Object.freeze(values);
}

export class ArrayCoder extends Coder {
	readonly coder: Coder;
	readonly length: number;

	constructor(coder: Coder, length: number, localName: string) {
		const type = `${coder.type}[${length >= 0 ? length : ''}]`;
		const dynamic = length === -1 || coder.dynamic;
		super('array', type, localName, dynamic);

		this.coder = coder;
		this.length = length;
	}

	defaultValue(): Array<any> {
		// Verifies the child coder is valid (even if the array is dynamic or 0-length)
		const defaultChild = this.coder.defaultValue();

		// Diff vs ethers v5 (M-10): a fixed length comes from the (untrusted) ABI and sizes an
		// allocation that no data bounds, so it is capped here.
		if (this.length > MAX_DEFAULT_ARRAY_LENGTH) {
			logger.throwError('array length too large for a default value', Logger.errors.BUFFER_OVERRUN, {
				length: this.length,
				maximum: MAX_DEFAULT_ARRAY_LENGTH,
			});
		}

		const result: Array<any> = [];
		for (let i = 0; i < this.length; i++) {
			result.push(defaultChild);
		}
		return result;
	}

	encode(writer: Writer, value: Array<any>): number {
		if (!Array.isArray(value)) {
			this._throwError('expected array value', value);
		}

		let count = this.length;

		if (count === -1) {
			count = value.length;
			writer.writeValue(value.length);
		}

		logger.checkArgumentCount(
			value.length,
			count,
			`coder array${this.localName ? ` ${this.localName}` : ''}`,
		);

		const coders = [];
		for (let i = 0; i < value.length; i++) {
			coders.push(this.coder);
		}

		return pack(writer, coders, value);
	}

	decode(reader: Reader): any {
		let count = this.length;
		if (count === -1) {
			count = reader.readValue().toNumber();
		}

		// Check that there is *roughly* enough data to ensure
		// stray random data is not being read as a length. Each
		// slot requires at least one word for its value or as a link
		// to the data. This could use a much
		// tighter bound, but we are erroring on the side of safety.
		// Diff vs ethers v5 (M-10): the check also covers a fixed length, which comes from the
		// (untrusted) ABI and used to size an allocation before any data was read.
		if (count * reader.wordSize > reader._data.length) {
			logger.throwError('insufficient data length', Logger.errors.BUFFER_OVERRUN, {
				length: reader._data.length,
				count,
			});
		}

		// Diff vs ethers v5 (M-10): count the elements against the shared element budget, which
		// is what bounds nested arrays of zero-size elements (`tuple()[][]`): they pass the data
		// length check at every level while reading nothing.
		reader._incrementElementsDecoded(count);

		// Diff vs ethers v5 (M-10): one anonymous coder serves every element; the coders are
		// stateless, so there is no need for an instance per element.
		const coders: Array<Coder> = new Array<Coder>(count).fill(new AnonymousCoder(this.coder));

		return reader.coerce(this.name, unpack(reader, coders));
	}
}
