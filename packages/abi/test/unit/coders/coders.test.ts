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

import { BigNumber } from '@ethersproject/bignumber';

import { Coder, Reader, Writer } from '../../../src/coders/abstract-coder.js';
import { AnonymousCoder } from '../../../src/coders/anonymous.js';
import { ArrayCoder } from '../../../src/coders/array.js';
import { BooleanCoder, booleanToBit } from '../../../src/coders/boolean.js';
import { BytesCoder, DynamicBytesCoder, bytesToHexString } from '../../../src/coders/bytes.js';
import { FixedBytesCoder } from '../../../src/coders/fixed-bytes.js';
import { FunctionCoder } from '../../../src/coders/function.js';
import { NullCoder } from '../../../src/coders/null.js';
import { NumberCoder } from '../../../src/coders/number.js';
import { StringCoder } from '../../../src/coders/string.js';
import { TupleCoder } from '../../../src/coders/tuple.js';

const WORD = 64;

const word = (n: number | string) => {
	const hex = typeof n === 'number' ? n.toString(16) : n;
	const body = hex.length % 2 ? `0${hex}` : hex;
	return `${'0'.repeat(WORD * 2 - body.length)}${body}`;
};
const bytesWord = (hex: string) => `${hex}${'0'.repeat(WORD * 2 - hex.length)}`;

const write = (coder: Coder, value: unknown) => {
	const writer = new Writer(WORD);
	coder.encode(writer, value);
	return writer.data;
};
const read = (coder: Coder, data: string) => coder.decode(new Reader(data, WORD));

describe('NumberCoder', () => {
	it('names itself uint/int with the bit width', () => {
		expect(new NumberCoder(32, false, 'a').name).toBe('uint256');
		expect(new NumberCoder(64, false, 'a').name).toBe('uint512');
		expect(new NumberCoder(64, true, 'a').name).toBe('int512');
		expect(new NumberCoder(1, true, 'a').name).toBe('int8');
		expect(new NumberCoder(32, false, 'a').dynamic).toBe(false);
	});

	it('has a default value of 0', () => {
		expect(new NumberCoder(32, false, 'a').defaultValue()).toBe(0);
	});

	it('encodes a small unsigned value right-aligned in one 64-byte word', () => {
		expect(write(new NumberCoder(32, false, 'a'), 1)).toBe(`0x${word(1)}`);
	});

	it('encodes uint8 max', () => {
		expect(write(new NumberCoder(1, false, 'a'), 255)).toBe(`0x${word(0xff)}`);
	});

	it('encodes uint256 max as 32 significant bytes right-aligned in a 64-byte word', () => {
		// 2^256-1 occupies the LAST 32 bytes; the first 32 bytes are zero padding.
		const max = BigNumber.from(`0x${'ff'.repeat(32)}`);
		expect(write(new NumberCoder(32, false, 'a'), max)).toBe(
			`0x${'00'.repeat(32)}${'ff'.repeat(32)}`,
		);
	});

	it('encodes uint512 max as a full word with no padding', () => {
		const max = BigNumber.from(`0x${'ff'.repeat(WORD)}`);
		expect(write(new NumberCoder(WORD, false, 'a'), max)).toBe(`0x${'ff'.repeat(WORD)}`);
	});

	it('sign-extends a negative int8 across the whole 64-byte word', () => {
		// -1 as int8 is 0xff, sign-extended to 64 bytes is all-ones.
		expect(write(new NumberCoder(1, true, 'a'), -1)).toBe(`0x${'ff'.repeat(WORD)}`);
	});

	it('encodes int8 min (-128) sign-extended', () => {
		expect(write(new NumberCoder(1, true, 'a'), -128)).toBe(`0x${'ff'.repeat(63)}80`);
	});

	it('encodes int512 extremes across the exact word', () => {
		expect(write(new NumberCoder(WORD, true, 'a'), -1)).toBe(`0x${'ff'.repeat(WORD)}`);
		const min = BigNumber.from(`0x80${'00'.repeat(WORD - 1)}`).mul(-1);
		expect(write(new NumberCoder(WORD, true, 'a'), min)).toBe(`0x80${'00'.repeat(WORD - 1)}`);
	});

	it('encodes a positive signed value the same as an unsigned one', () => {
		expect(write(new NumberCoder(1, true, 'a'), 127)).toBe(`0x${word(0x7f)}`);
	});

	it.each([
		[1, false, 256],
		[1, false, -1],
		[1, true, 128],
		[1, true, -129],
		[2, false, 65536],
		[2, true, 32768],
		[2, true, -32769],
	])('rejects out-of-bounds value %#', (size, signed, value) => {
		expect(() => write(new NumberCoder(size as number, signed as boolean, 'a'), value)).toThrow(
			/out-of-bounds/,
		);
	});

	it.each([
		[1, false, 0],
		[1, false, 255],
		[1, true, 127],
		[1, true, -128],
		[2, false, 65535],
		[2, true, 32767],
		[2, true, -32768],
	])('accepts boundary value %#', (size, signed, value) => {
		expect(() =>
			write(new NumberCoder(size as number, signed as boolean, 'a'), value),
		).not.toThrow();
	});

	it('decodes an unsigned value', () => {
		expect(read(new NumberCoder(1, false, 'a'), `0x${word(0xff)}`)).toBe(255);
	});

	it('decodes a sign-extended negative value', () => {
		expect(read(new NumberCoder(1, true, 'a'), `0x${'ff'.repeat(WORD)}`)).toBe(-1);
	});

	it('coerces widths <= 48 bits to a JS number and wider ones to BigNumber', () => {
		expect(typeof read(new NumberCoder(6, false, 'a'), `0x${word(1)}`)).toBe('number');
		expect(BigNumber.isBigNumber(read(new NumberCoder(7, false, 'a'), `0x${word(1)}`))).toBe(
			true,
		);
	});

	it.each([
		[1, false, 0],
		[1, false, 255],
		[1, true, -128],
		[4, false, 4294967295],
		[6, true, -1],
	])('round-trips %#', (size, signed, value) => {
		const coder = new NumberCoder(size as number, signed as boolean, 'a');
		expect(read(coder, write(coder, value))).toBe(value);
	});

	it('rejects a word with bits above its own width when decoding', () => {
		// uint8 reading a word whose value is 0x0100 is not a canonical uint8 encoding; the
		// on-chain decoder rejects it, and so must this one rather than quietly seeing 0.
		expect(() => {
			read(new NumberCoder(1, false, 'a'), `0x${word(0x100)}`);
		}).toThrow(/out-of-bounds/);
		// A signed value must be sign-extended across the whole word.
		expect(() => {
			read(new NumberCoder(1, true, 'a'), `0x${word(0xff)}`);
		}).toThrow(/out-of-bounds/);
		expect(read(new NumberCoder(1, true, 'a'), `0x${'ff'.repeat(WORD)}`)).toBe(-1);
	});
});

describe('BooleanCoder', () => {
	it('is a static coder named bool', () => {
		const coder = new BooleanCoder('flag');
		expect(coder.name).toBe('bool');
		expect(coder.type).toBe('bool');
		expect(coder.dynamic).toBe(false);
	});

	it('defaults to false', () => {
		expect(new BooleanCoder('flag').defaultValue()).toBe(false);
	});

	it('encodes true as a right-aligned 1 and false as a zero word', () => {
		expect(write(new BooleanCoder('flag'), true)).toBe(`0x${word(1)}`);
		expect(write(new BooleanCoder('flag'), false)).toBe(`0x${word(0)}`);
	});

	it('decodes zero as false and one as true, and rejects any other word', () => {
		expect(read(new BooleanCoder('flag'), `0x${word(0)}`)).toBe(false);
		expect(read(new BooleanCoder('flag'), `0x${word(1)}`)).toBe(true);
		expect(() => {
			read(new BooleanCoder('flag'), `0x${word(2)}`);
		}).toThrow(/invalid boolean value/);
		expect(() => {
			read(new BooleanCoder('flag'), `0x${'ff'.repeat(WORD)}`);
		}).toThrow(/invalid boolean value/);
	});

	it('round-trips', () => {
		const coder = new BooleanCoder('flag');
		expect(read(coder, write(coder, true))).toBe(true);
		expect(read(coder, write(coder, false))).toBe(false);
	});

	// The explicit forms are exactly the ones web3-validator's `bool` format accepts.
	it.each([
		[true, 1],
		[1, 1],
		[BigInt(1), 1],
		['1', 1],
		['0x1', 1],
		[false, 0],
		[0, 0],
		[BigInt(0), 0],
		['0', 0],
		['0x0', 0],
	])('encodes the explicit form %p by value as %i (H-3)', (value, bit) => {
		expect(booleanToBit(value)).toBe(bit);
		expect(write(new BooleanCoder('flag'), value)).toBe(`0x${word(bit)}`);
		expect(read(new BooleanCoder('flag'), write(new BooleanCoder('flag'), value))).toBe(
			bit === 1,
		);
	});

	it.each([
		'false',
		'true',
		'False',
		'',
		' ',
		'00',
		'0x00',
		'0x01',
		'0X0',
		'2',
		2,
		-1,
		1.5,
		NaN,
		BigInt(2),
		undefined,
		{},
		[],
		[1],
		new Boolean(true),
	])('rejects %p, which is not an encoding of a boolean (H-3)', value => {
		expect(booleanToBit(value)).toBeUndefined();
		expect(() => write(new BooleanCoder('flag'), value)).toThrow(/invalid boolean value/);
	});
});

describe('NullCoder', () => {
	it('has an empty type and a null default', () => {
		const coder = new NullCoder('a');
		expect(coder.name).toBe('null');
		expect(coder.type).toBe('');
		expect(coder.dynamic).toBe(false);
		expect(coder.defaultValue()).toBeNull();
	});

	it('writes nothing', () => {
		const writer = new Writer(WORD);
		// eslint-disable-next-line no-null/no-null
		expect(new NullCoder('a').encode(writer, null)).toBe(0);
		expect(writer.length).toBe(0);
		expect(writer.data).toBe('0x');
	});

	it('accepts null and undefined', () => {
		// eslint-disable-next-line no-null/no-null
		expect(() => write(new NullCoder('a'), null)).not.toThrow();
		expect(() => write(new NullCoder('a'), undefined)).not.toThrow();
	});

	it('rejects a non-null value', () => {
		expect(() => write(new NullCoder('a'), 1)).toThrow(/not null/);
		expect(() => write(new NullCoder('a'), 0)).toThrow(/not null/);
	});

	it('consumes nothing and decodes to null', () => {
		const reader = new Reader('0x', WORD);
		expect(new NullCoder('a').decode(reader)).toBeNull();
		expect(reader.consumed).toBe(0);
	});
});

describe('FixedBytesCoder', () => {
	it('names itself bytesN and is static', () => {
		expect(new FixedBytesCoder(32, 'a').name).toBe('bytes32');
		expect(new FixedBytesCoder(64, 'a').name).toBe('bytes64');
		expect(new FixedBytesCoder(1, 'a').name).toBe('bytes1');
		expect(new FixedBytesCoder(32, 'a').dynamic).toBe(false);
	});

	it.each([1, 4, 16, 32, 64])('defaults bytes%i to that many zero bytes', size => {
		const value = new FixedBytesCoder(size, 'a').defaultValue();
		expect(value).toBe(`0x${'00'.repeat(size)}`);
	});

	it('encodes LEFT-aligned in a 64-byte word', () => {
		expect(write(new FixedBytesCoder(1, 'a'), '0xaa')).toBe(`0x${bytesWord('aa')}`);
		expect(write(new FixedBytesCoder(4, 'a'), '0xdeadbeef')).toBe(`0x${bytesWord('deadbeef')}`);
	});

	it('encodes bytes32 with 32 bytes of trailing padding', () => {
		expect(write(new FixedBytesCoder(32, 'a'), `0x${'ab'.repeat(32)}`)).toBe(
			`0x${'ab'.repeat(32)}${'00'.repeat(32)}`,
		);
	});

	it('encodes bytes64 filling the word with no padding', () => {
		expect(write(new FixedBytesCoder(WORD, 'a'), `0x${'ab'.repeat(WORD)}`)).toBe(
			`0x${'ab'.repeat(WORD)}`,
		);
	});

	it('rejects data of the wrong length', () => {
		expect(() => write(new FixedBytesCoder(4, 'a'), '0xdead')).toThrow(/incorrect data length/);
		expect(() => write(new FixedBytesCoder(4, 'a'), '0xdeadbeef00')).toThrow(
			/incorrect data length/,
		);
	});

	it('decodes only its own leading bytes and consumes a full word', () => {
		const reader = new Reader(`0x${bytesWord('deadbeef')}`, WORD);
		expect(new FixedBytesCoder(4, 'a').decode(reader)).toBe('0xdeadbeef');
		expect(reader.consumed).toBe(WORD);
	});

	it.each([1, 4, 32])('round-trips bytes%i', size => {
		const coder = new FixedBytesCoder(size, 'a');
		const value = `0x${'ab'.repeat(size)}`;
		expect(read(coder, write(coder, value))).toBe(value);
	});
});

describe('DynamicBytesCoder / BytesCoder', () => {
	it('is dynamic and defaults to 0x', () => {
		const coder = new BytesCoder('a');
		expect(coder.name).toBe('bytes');
		expect(coder.dynamic).toBe(true);
		expect(coder.defaultValue()).toBe('0x');
	});

	it('encodes a right-aligned length word then LEFT-aligned data', () => {
		expect(write(new BytesCoder('a'), '0x1234')).toBe(`0x${word(2)}${bytesWord('1234')}`);
	});

	it('encodes empty bytes as a lone zero-length word', () => {
		expect(write(new BytesCoder('a'), '0x')).toBe(`0x${word(0)}`);
	});

	it('spills a 65-byte payload into a second data word', () => {
		const data = 'aa'.repeat(65);
		expect(write(new BytesCoder('a'), `0x${data}`)).toBe(
			`0x${word(65)}${data}${'00'.repeat(63)}`,
		);
	});

	it('decodes back to a hex string', () => {
		expect(read(new BytesCoder('a'), `0x${word(2)}${bytesWord('1234')}`)).toBe('0x1234');
	});

	it('decodes every byte value to the same lowercase hex as the encoder input (M-9)', () => {
		const all = `0x${Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0')).join(
			'',
		)}`;
		const coder = new BytesCoder('b');
		expect(read(coder, write(coder, all))).toBe(all);
		expect(bytesToHexString(new Uint8Array(0))).toBe('0x');
		expect(bytesToHexString(Uint8Array.from([0, 0x0f, 0xf0, 0xff]))).toBe('0x000ff0ff');
		// A large payload decodes to a flat string with the exact bytes.
		const big = `0x${'a5'.repeat(1 << 18)}`;
		expect(read(coder, write(coder, big))).toBe(big);
	});

	it('DynamicBytesCoder decodes to a Uint8Array', () => {
		const value = read(new DynamicBytesCoder('bytes', 'a'), `0x${word(2)}${bytesWord('1234')}`);
		expect(value).toBeInstanceOf(Uint8Array);
		expect(Array.from(value)).toEqual([0x12, 0x34]);
	});

	it.each(['0x', '0x00', '0xdeadbeef', `0x${'ab'.repeat(64)}`, `0x${'cd'.repeat(100)}`])(
		'round-trips %s',
		value => {
			const coder = new BytesCoder('a');
			expect(read(coder, write(coder, value))).toBe(value);
		},
	);
});

describe('StringCoder', () => {
	it('is dynamic and defaults to the empty string', () => {
		const coder = new StringCoder('a');
		expect(coder.name).toBe('string');
		expect(coder.dynamic).toBe(true);
		expect(coder.defaultValue()).toBe('');
	});

	it('encodes the UTF-8 byte length then the left-aligned UTF-8 bytes', () => {
		expect(write(new StringCoder('a'), 'abc')).toBe(`0x${word(3)}${bytesWord('616263')}`);
	});

	it('encodes the empty string as a lone zero-length word', () => {
		expect(write(new StringCoder('a'), '')).toBe(`0x${word(0)}`);
	});

	it('counts multi-byte characters by their UTF-8 byte length', () => {
		// U+20AC EURO SIGN is 3 bytes: e2 82 ac.
		expect(write(new StringCoder('a'), '€')).toBe(`0x${word(3)}${bytesWord('e282ac')}`);
	});

	it.each(['', 'a', 'hello world', 'café', '☃', '🚀🚀', 'a'.repeat(100)])(
		'round-trips %s',
		value => {
			const coder = new StringCoder('a');
			expect(read(coder, write(coder, value))).toBe(value);
		},
	);

	it('throws on invalid UTF-8 rather than silently substituting U+FFFD', () => {
		// 0xff is never a valid UTF-8 byte. Decoding must throw (fatal mode) so
		// that distinct invalid byte sequences cannot collapse to the same string.
		const coder = new StringCoder('a');
		const invalid = `0x${word(1)}${bytesWord('ff')}`;
		expect(() => read(coder, invalid)).toThrow();
		// Confirm the replacement character is not produced.
		let decoded: string | undefined;
		try {
			decoded = read(coder, invalid);
		} catch {
			decoded = undefined;
		}
		expect(decoded).not.toBe('�');
	});
});

describe('ArrayCoder', () => {
	it('derives its type and dynamism from the child and length', () => {
		const staticArray = new ArrayCoder(new NumberCoder(1, false, ''), 3, 'a');
		expect(staticArray.type).toBe('uint8[3]');
		expect(staticArray.dynamic).toBe(false);

		const dynamicLength = new ArrayCoder(new NumberCoder(1, false, ''), -1, 'a');
		expect(dynamicLength.type).toBe('uint8[]');
		expect(dynamicLength.dynamic).toBe(true);

		// A fixed-length array of a dynamic type is itself dynamic.
		const dynamicChild = new ArrayCoder(new StringCoder(''), 2, 'a');
		expect(dynamicChild.type).toBe('string[2]');
		expect(dynamicChild.dynamic).toBe(true);
	});

	it('defaults a fixed array to N copies of the child default', () => {
		expect(new ArrayCoder(new NumberCoder(1, false, ''), 3, 'a').defaultValue()).toEqual([
			0, 0, 0,
		]);
	});

	it('defaults a dynamic array to an empty array', () => {
		expect(new ArrayCoder(new NumberCoder(1, false, ''), -1, 'a').defaultValue()).toEqual([]);
	});

	it('encodes a fixed static array with no length prefix', () => {
		expect(write(new ArrayCoder(new NumberCoder(1, false, ''), 2, 'a'), [1, 2])).toBe(
			`0x${word(1)}${word(2)}`,
		);
	});

	it('encodes a dynamic array with a leading count', () => {
		expect(write(new ArrayCoder(new NumberCoder(1, false, ''), -1, 'a'), [1, 2])).toBe(
			`0x${word(2)}${word(1)}${word(2)}`,
		);
	});

	it('rejects a non-array value', () => {
		expect(() => write(new ArrayCoder(new NumberCoder(1, false, ''), 2, 'a'), 'x')).toThrow(
			/expected array/,
		);
	});

	it('rejects the wrong element count for a fixed array', () => {
		expect(() => write(new ArrayCoder(new NumberCoder(1, false, ''), 2, 'a'), [1])).toThrow();
		expect(() =>
			write(new ArrayCoder(new NumberCoder(1, false, ''), 2, 'a'), [1, 2, 3]),
		).toThrow();
	});

	it('refuses a count that could not possibly fit in the data', () => {
		const coder = new ArrayCoder(new NumberCoder(1, false, ''), -1, 'a');
		expect(() => read(coder, `0x${word(1000)}`)).toThrow(/insufficient data length/);
	});

	it('refuses a fixed length that could not possibly fit in the data before allocating anything (M-10)', () => {
		// 10^8 elements on one word of data used to allocate 10^8 coders and end in a V8 OOM.
		const coder = new ArrayCoder(new NumberCoder(1, false, ''), 100000000, 'a');
		expect(() => {
			read(coder, `0x${word(1)}`);
		}).toThrow(/insufficient data length/);
		// One word short.
		const three = new ArrayCoder(new NumberCoder(1, false, ''), 3, 'a');
		expect(() => {
			read(three, `0x${word(1)}${word(2)}`);
		}).toThrow(/insufficient data length/);
	});

	it('still decodes a fixed array that fits exactly (M-10)', () => {
		const coder = new ArrayCoder(new NumberCoder(1, false, ''), 3, 'a');
		expect(Array.from(read(coder, `0x${word(1)}${word(2)}${word(3)}`))).toEqual([1, 2, 3]);
		const empty = new ArrayCoder(new NumberCoder(1, false, ''), 0, 'a');
		expect(Array.from(read(empty, '0x'))).toEqual([]);
	});

	it('round-trips a fixed array', () => {
		const coder = new ArrayCoder(new NumberCoder(1, false, ''), 3, 'a');
		expect(Array.from(read(coder, write(coder, [1, 2, 3])))).toEqual([1, 2, 3]);
	});

	it('round-trips a dynamic array', () => {
		const coder = new ArrayCoder(new NumberCoder(1, false, ''), -1, 'a');
		expect(Array.from(read(coder, write(coder, [1, 2, 3])))).toEqual([1, 2, 3]);
	});
});

describe('TupleCoder', () => {
	it('derives its type from its children', () => {
		const coder = new TupleCoder(
			[new NumberCoder(1, false, 'x'), new BooleanCoder('y')],
			'point',
		);
		expect(coder.name).toBe('tuple');
		expect(coder.type).toBe('tuple(uint8,bool)');
		expect(coder.localName).toBe('point');
		expect(coder.dynamic).toBe(false);
	});

	it('is dynamic when any child is dynamic', () => {
		expect(
			new TupleCoder([new NumberCoder(1, false, 'x'), new StringCoder('y')], 't').dynamic,
		).toBe(true);
	});

	it('exposes uniquely named children on the default value', () => {
		const value = new TupleCoder(
			[new NumberCoder(1, false, 'x'), new BooleanCoder('y')],
			't',
		).defaultValue();
		expect(Array.from(value)).toEqual([0, false]);
		expect(value.x).toBe(0);
		expect(value.y).toBe(false);
		expect(Object.isFrozen(value)).toBe(true);
	});

	it('does not expose duplicated names', () => {
		const value = new TupleCoder(
			[new NumberCoder(1, false, 'x'), new BooleanCoder('x')],
			't',
		).defaultValue();
		expect(Array.from(value)).toEqual([0, false]);
		expect(value.x).toBeUndefined();
	});

	it('renames a child called "length" to "_length"', () => {
		const value = new TupleCoder([new NumberCoder(1, false, 'length')], 't').defaultValue();
		// `length` is the array's own length; the child is remapped.
		expect(value.length).toBe(1);
		expect(value._length).toBe(0);
	});

	it('encodes an empty tuple as nothing', () => {
		expect(write(new TupleCoder([], 't'), [])).toBe('0x');
	});

	it('round-trips a static tuple with named access', () => {
		const coder = new TupleCoder([new NumberCoder(1, false, 'x'), new BooleanCoder('y')], 't');
		const decoded = read(coder, write(coder, [5, true]));
		expect(Array.from(decoded)).toEqual([5, true]);
		expect(decoded.x).toBe(5);
		expect(decoded.y).toBe(true);
	});

	it('accepts an object when every child is named', () => {
		const coder = new TupleCoder([new NumberCoder(1, false, 'x'), new BooleanCoder('y')], 't');
		expect(write(coder, { x: 5, y: true })).toBe(write(coder, [5, true]));
	});

	it('rejects an object when a child is unnamed', () => {
		const coder = new TupleCoder([new NumberCoder(1, false, ''), new BooleanCoder('y')], 't');
		expect(() => write(coder, { y: true })).toThrow(/missing names/);
	});

	it('rejects an object when two children share a name', () => {
		const coder = new TupleCoder([new NumberCoder(1, false, 'x'), new BooleanCoder('x')], 't');
		expect(() => write(coder, { x: 1 })).toThrow(/duplicate names/);
	});

	it('rejects a scalar tuple value', () => {
		expect(() => write(new TupleCoder([new BooleanCoder('y')], 't'), 5)).toThrow(
			/invalid tuple value/,
		);
	});

	it('rejects a value/type count mismatch', () => {
		const coder = new TupleCoder([new NumberCoder(1, false, 'x')], 't');
		expect(() => write(coder, [1, 2])).toThrow(/length mismatch/);
	});
});

describe('AnonymousCoder', () => {
	it('mirrors the wrapped coder but drops the local name', () => {
		const inner = new BooleanCoder('flag');
		const coder = new AnonymousCoder(inner);
		expect(coder.name).toBe(inner.name);
		expect(coder.type).toBe(inner.type);
		expect(coder.dynamic).toBe(inner.dynamic);
		expect(coder.localName).toBeUndefined();
	});

	it('delegates defaultValue, encode and decode', () => {
		const coder = new AnonymousCoder(new BooleanCoder('flag'));
		expect(coder.defaultValue()).toBe(false);
		expect(write(coder, true)).toBe(`0x${word(1)}`);
		expect(read(coder, `0x${word(1)}`)).toBe(true);
	});
});

describe('FunctionCoder', () => {
	const address = 'aa'.repeat(64);
	const value = `0x${address}deadbeef`;

	it('is a static coder named function with a zero default', () => {
		const coder = new FunctionCoder('f');
		expect(coder.name).toBe('function');
		expect(coder.dynamic).toBe(false);
		expect(coder.defaultValue()).toBe(`0x${'00'.repeat(68)}`);
	});

	it('encodes the address word then the selector right-aligned in its own word', () => {
		expect(write(new FunctionCoder('f'), value)).toBe(`0x${address}${word('deadbeef')}`);
	});

	it('round-trips', () => {
		const coder = new FunctionCoder('f');
		expect(read(coder, write(coder, value))).toBe(value);
	});

	it('rejects a selector word with non-zero padding (I-10)', () => {
		expect(() => {
			read(new FunctionCoder('f'), `0x${address}${'ff'.repeat(60)}deadbeef`);
		}).toThrow(/non-zero padding in function selector/);
		expect(() => {
			read(new FunctionCoder('f'), `0x${address}${'00'.repeat(59)}01deadbeef`);
		}).toThrow(/non-zero padding in function selector/);
	});
});
