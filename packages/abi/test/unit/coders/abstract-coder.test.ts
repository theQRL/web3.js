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

import {
	MAX_INFLATION,
	Reader,
	Writer,
	checkResultErrors,
} from '../../../src/coders/abstract-coder.js';

// The normative QRL ABI word is 64 bytes for every type. Numbers, VM words and
// addresses are right-aligned within it; byte sequences and other string-like
// data are left-aligned. Everything below is derived from those two rules.
const WORD = 64;

const zeros = (n: number) => '00'.repeat(n);

/** Right-align `hex` (no 0x) in one 64-byte word. */
const rightAligned = (hex: string) => `0x${'0'.repeat(WORD * 2 - hex.length)}${hex}`;
/** Left-align `hex` (no 0x) in one 64-byte word. */
const leftAligned = (hex: string) => `0x${hex}${'0'.repeat(WORD * 2 - hex.length)}`;

describe('Writer', () => {
	describe('word size', () => {
		it('defaults to 64 bytes', () => {
			expect(new Writer().wordSize).toBe(64);
		});

		it('is 64 bytes when 64 is passed explicitly', () => {
			expect(new Writer(64).wordSize).toBe(64);
		});

		it('exposes wordSize as read-only', () => {
			const writer = new Writer();
			expect(() => {
				(writer as any).wordSize = 32;
			}).toThrow();
			expect(writer.wordSize).toBe(64);
		});

		it('falls back to 64 for falsy word sizes (the `wordSize || 64` branch)', () => {
			expect(new Writer(0).wordSize).toBe(64);
			expect(new Writer(undefined).wordSize).toBe(64);
			// eslint-disable-next-line no-null/no-null
			expect(new Writer(null as any).wordSize).toBe(64);
		});

		it('starts empty', () => {
			const writer = new Writer();
			expect(writer.length).toBe(0);
			expect(writer.data).toBe('0x');
		});
	});

	describe('writeValue (numeric: RIGHT-aligned)', () => {
		it('pads a one-byte value to 64 bytes on the LEFT', () => {
			const writer = new Writer(WORD);
			expect(writer.writeValue(1)).toBe(WORD);
			// 63 zero bytes then 0x01 -- the significant byte is the LAST byte.
			expect(writer.data).toBe(rightAligned('01'));
			expect(writer.data).toBe(`0x${zeros(63)}01`);
		});

		it('puts the significant byte at the end, not the start', () => {
			const writer = new Writer(WORD);
			writer.writeValue(0xff);
			expect(writer.data).toBe(rightAligned('ff'));
			expect(writer.data).not.toBe(leftAligned('ff'));
			expect(writer.data.slice(2, 4)).toBe('00');
			expect(writer.data.slice(-2)).toBe('ff');
		});

		it('encodes zero as a full word of zero bytes', () => {
			const writer = new Writer(WORD);
			expect(writer.writeValue(0)).toBe(WORD);
			expect(writer.data).toBe(`0x${zeros(WORD)}`);
			expect(writer.length).toBe(WORD);
		});

		it('encodes a multi-byte value right-aligned', () => {
			const writer = new Writer(WORD);
			writer.writeValue(0x1234);
			expect(writer.data).toBe(rightAligned('1234'));
		});

		it('encodes a value that exactly fills the word with no padding', () => {
			const full = 'ab'.repeat(WORD);
			const writer = new Writer(WORD);
			expect(writer.writeValue(`0x${full}`)).toBe(WORD);
			expect(writer.data).toBe(`0x${full}`);
		});

		it('encodes 2^512 - 1, the largest value a 64-byte word can hold', () => {
			const max = BigNumber.from(`0x${'ff'.repeat(WORD)}`);
			const writer = new Writer(WORD);
			expect(writer.writeValue(max)).toBe(WORD);
			expect(writer.data).toBe(`0x${'ff'.repeat(WORD)}`);
		});

		it('throws for a value wider than one 64-byte word', () => {
			// 65 bytes: 2^512 exactly.
			const writer = new Writer(WORD);
			expect(() => writer.writeValue(`0x01${zeros(WORD)}`)).toThrow(/out-of-bounds/);
		});

		it('accumulates length across writes', () => {
			const writer = new Writer(WORD);
			writer.writeValue(1);
			writer.writeValue(2);
			expect(writer.length).toBe(2 * WORD);
			expect(writer.data).toBe(`0x${zeros(63)}01${zeros(63)}02`);
		});
	});

	describe('writeBytes (byte sequences: LEFT-aligned)', () => {
		it('pads a one-byte sequence to 64 bytes on the RIGHT', () => {
			const writer = new Writer(WORD);
			expect(writer.writeBytes('0xaa')).toBe(WORD);
			expect(writer.data).toBe(leftAligned('aa'));
			expect(writer.data).toBe(`0xaa${zeros(63)}`);
		});

		it('puts the significant byte at the start, not the end', () => {
			const writer = new Writer(WORD);
			writer.writeBytes('0xff');
			expect(writer.data).not.toBe(rightAligned('ff'));
			expect(writer.data.slice(2, 4)).toBe('ff');
			expect(writer.data.slice(-2)).toBe('00');
		});

		it('aligns bytes and values in opposite directions for the same input', () => {
			const bytesWriter = new Writer(WORD);
			bytesWriter.writeBytes('0x01');
			const valueWriter = new Writer(WORD);
			valueWriter.writeValue('0x01');
			expect(bytesWriter.data).not.toBe(valueWriter.data);
			expect(bytesWriter.data).toBe(leftAligned('01'));
			expect(valueWriter.data).toBe(rightAligned('01'));
		});

		it('writes an empty sequence as nothing at all', () => {
			const writer = new Writer(WORD);
			expect(writer.writeBytes([])).toBe(0);
			expect(writer.length).toBe(0);
			expect(writer.data).toBe('0x');
		});

		it('adds no padding when the input exactly fills one word', () => {
			const full = 'cd'.repeat(WORD);
			const writer = new Writer(WORD);
			expect(writer.writeBytes(`0x${full}`)).toBe(WORD);
			expect(writer.data).toBe(`0x${full}`);
		});

		it('rounds 65 bytes up to two 64-byte words', () => {
			const writer = new Writer(WORD);
			expect(writer.writeBytes(`0x${'aa'.repeat(65)}`)).toBe(2 * WORD);
			expect(writer.data).toBe(`0x${'aa'.repeat(65)}${zeros(63)}`);
			expect(writer.length).toBe(128);
		});

		it('rounds 63 bytes up to exactly one word (never to 32 or 96)', () => {
			const writer = new Writer(WORD);
			expect(writer.writeBytes(`0x${'aa'.repeat(63)}`)).toBe(WORD);
			expect(writer.length).toBe(64);
		});

		it.each([1, 31, 32, 33, 63, 64, 65, 127, 128, 129])(
			'pads a %i-byte sequence up to a multiple of 64',
			n => {
				const writer = new Writer(WORD);
				const written = writer.writeBytes(`0x${'aa'.repeat(n)}`);
				expect(written).toBe(Math.ceil(n / WORD) * WORD);
				expect(written % WORD).toBe(0);
				expect(writer.length).toBe(written);
			},
		);
	});

	describe('writeUpdatableValue', () => {
		it('reserves exactly one 64-byte word up front', () => {
			const writer = new Writer(WORD);
			writer.writeUpdatableValue();
			expect(writer.length).toBe(WORD);
			expect(writer.data).toBe(`0x${zeros(WORD)}`);
		});

		it('backfills the reserved word right-aligned', () => {
			const writer = new Writer(WORD);
			const update = writer.writeUpdatableValue();
			update(0x40);
			expect(writer.data).toBe(rightAligned('40'));
			expect(writer.length).toBe(WORD);
		});

		it('backfills in place, leaving later words untouched', () => {
			const writer = new Writer(WORD);
			const update = writer.writeUpdatableValue();
			writer.writeValue(2);
			update(1);
			expect(writer.data).toBe(`0x${zeros(63)}01${zeros(63)}02`);
		});

		it('leaves a zero word when never updated', () => {
			const writer = new Writer(WORD);
			writer.writeUpdatableValue();
			expect(writer.data).toBe(`0x${zeros(WORD)}`);
		});
	});

	describe('appendWriter', () => {
		it('concatenates another writer and returns the bytes appended', () => {
			const inner = new Writer(WORD);
			inner.writeValue(2);
			const outer = new Writer(WORD);
			outer.writeValue(1);
			expect(outer.appendWriter(inner)).toBe(WORD);
			expect(outer.data).toBe(`0x${zeros(63)}01${zeros(63)}02`);
			expect(outer.length).toBe(2 * WORD);
		});

		it('appends nothing for an empty writer', () => {
			const outer = new Writer(WORD);
			expect(outer.appendWriter(new Writer(WORD))).toBe(0);
			expect(outer.length).toBe(0);
		});
	});
});

describe('Reader', () => {
	describe('word size', () => {
		it('defaults to 64 bytes', () => {
			expect(new Reader('0x').wordSize).toBe(64);
		});

		it('falls back to 64 for falsy word sizes (the `wordSize || 64` branch)', () => {
			expect(new Reader('0x', 0).wordSize).toBe(64);
			expect(new Reader('0x', undefined).wordSize).toBe(64);
		});

		it('exposes the data it was constructed with', () => {
			expect(new Reader('0xaabb').data).toBe('0xaabb');
			expect(new Reader('0x').consumed).toBe(0);
		});
	});

	describe('readValue (numeric: RIGHT-aligned)', () => {
		it('consumes a full 64-byte word and reads the trailing bytes as the value', () => {
			const reader = new Reader(rightAligned('01'), WORD);
			expect(reader.readValue().toNumber()).toBe(1);
			expect(reader.consumed).toBe(WORD);
		});

		it('does not read a left-aligned word as the same number', () => {
			// 0x01 left-aligned is 2^504, not 1 -- this is what pins the alignment.
			const reader = new Reader(leftAligned('01'), WORD);
			expect(reader.readValue().toNumber).toBeDefined();
			expect(reader.readValue.bind(reader)).toBeDefined();
			const value = new Reader(leftAligned('01'), WORD).readValue();
			expect(value.eq(1)).toBe(false);
			expect(value.eq(BigNumber.from(2).pow(504))).toBe(true);
		});

		it('reads the maximum 64-byte word', () => {
			const reader = new Reader(`0x${'ff'.repeat(WORD)}`, WORD);
			expect(reader.readValue().eq(BigNumber.from(`0x${'ff'.repeat(WORD)}`))).toBe(true);
		});

		it('reads successive words independently', () => {
			const reader = new Reader(`0x${zeros(63)}01${zeros(63)}02`, WORD);
			expect(reader.readValue().toNumber()).toBe(1);
			expect(reader.readValue().toNumber()).toBe(2);
			expect(reader.consumed).toBe(2 * WORD);
		});

		it('throws when fewer than 64 bytes remain', () => {
			// 32 bytes -- a full ETH word, but not a full QRL word.
			expect(() => new Reader(`0x${zeros(32)}`, WORD).readValue()).toThrow(/out-of-bounds/);
			expect(() => new Reader(`0x${zeros(63)}`, WORD).readValue()).toThrow(/out-of-bounds/);
		});
	});

	describe('readBytes', () => {
		it('returns the requested length but consumes a whole word', () => {
			const reader = new Reader(`0x${'aa'.repeat(WORD)}`, WORD);
			expect(reader.readBytes(3)).toHaveLength(3);
			expect(reader.consumed).toBe(WORD);
		});

		it('reads left-aligned bytes from the front of the word', () => {
			const reader = new Reader(leftAligned('112233'), WORD);
			expect(Array.from(reader.readBytes(3))).toEqual([0x11, 0x22, 0x33]);
		});

		it('consumes two words for a 65-byte read', () => {
			const reader = new Reader(`0x${'aa'.repeat(128)}`, WORD);
			expect(reader.readBytes(65)).toHaveLength(65);
			expect(reader.consumed).toBe(128);
		});

		it('consumes nothing for a zero-length read', () => {
			const reader = new Reader(`0x${zeros(WORD)}`, WORD);
			expect(reader.readBytes(0)).toHaveLength(0);
			expect(reader.consumed).toBe(0);
		});

		it('throws when the aligned length overruns the buffer', () => {
			expect(() => new Reader('0xaabbcc', WORD).readBytes(3)).toThrow(/out-of-bounds/);
		});

		it('allows an unaligned tail read when allowLoose and loose are both set', () => {
			const reader = new Reader('0xaabbcc', WORD, undefined, true);
			expect(Array.from(reader.readBytes(3, true))).toEqual([0xaa, 0xbb, 0xcc]);
			expect(reader.consumed).toBe(3);
		});

		it('still throws for a loose read when allowLoose is false', () => {
			expect(() => new Reader('0xaabbcc', WORD, undefined, false).readBytes(3, true)).toThrow(
				/out-of-bounds/,
			);
		});

		it('still throws for a loose read that overruns even unaligned', () => {
			expect(() => new Reader('0xaabb', WORD, undefined, true).readBytes(3, true)).toThrow(
				/out-of-bounds/,
			);
		});
	});

	describe('subReader', () => {
		it('anchors a new reader at the given offset from the current position', () => {
			const reader = new Reader(`0x${zeros(63)}01${zeros(63)}02`, WORD);
			reader.readValue();
			expect(reader.subReader(0).readValue().toNumber()).toBe(2);
		});

		it('inherits the word size and looseness', () => {
			const reader = new Reader(`0x${zeros(128)}`, WORD, undefined, true);
			const sub = reader.subReader(0);
			expect(sub.wordSize).toBe(WORD);
			expect(sub.allowLoose).toBe(true);
		});

		it('does not advance the parent', () => {
			const reader = new Reader(`0x${zeros(128)}`, WORD);
			reader.subReader(0).readValue();
			expect(reader.consumed).toBe(0);
		});
	});

	describe('coerce', () => {
		it.each([8, 16, 24, 32, 40, 48])('converts uint%i to a JS number', bits => {
			expect(typeof Reader.coerce(`uint${bits}`, BigNumber.from(1))).toBe('number');
			expect(typeof Reader.coerce(`int${bits}`, BigNumber.from(1))).toBe('number');
		});

		it.each([56, 64, 128, 256, 512])('leaves uint%i as a BigNumber', bits => {
			expect(BigNumber.isBigNumber(Reader.coerce(`uint${bits}`, BigNumber.from(1)))).toBe(
				true,
			);
		});

		it('leaves non-numeric types untouched', () => {
			const value = { a: 1 };
			expect(Reader.coerce('address', value)).toBe(value);
			expect(Reader.coerce('tuple', value)).toBe(value);
		});

		it('uses the instance coerceFunc when one is supplied', () => {
			const coerceFunc = jest.fn().mockReturnValue('coerced');
			const reader = new Reader(`0x${zeros(WORD)}`, WORD, coerceFunc);
			expect(reader.coerce('uint8', BigNumber.from(1))).toBe('coerced');
			expect(coerceFunc).toHaveBeenCalledTimes(1);
		});

		it('falls back to the static coerce when no coerceFunc is supplied', () => {
			const reader = new Reader(`0x${zeros(WORD)}`, WORD);
			expect(reader.coerce('uint8', BigNumber.from(7))).toBe(7);
		});
	});
});

describe('checkResultErrors', () => {
	it('returns no errors for a clean result', () => {
		expect(checkResultErrors([1, 2, 3] as any)).toEqual([]);
	});

	it('returns no errors for a non-array', () => {
		expect(checkResultErrors('nope' as any)).toEqual([]);
	});

	it('collects an error thrown by a throwing getter, with its path', () => {
		const values: any = [1];
		const boom = new Error('boom');
		Object.defineProperty(values, 1, {
			enumerable: true,
			get: () => {
				throw boom;
			},
		});
		const errors = checkResultErrors(values);
		expect(errors).toHaveLength(1);
		expect(errors[0].error).toBe(boom);
		expect(errors[0].path).toEqual(['1']);
	});

	it('reports the nested path of a throwing getter', () => {
		const inner: any = [];
		const boom = new Error('nested boom');
		Object.defineProperty(inner, 0, {
			enumerable: true,
			get: () => {
				throw boom;
			},
		});
		const outer: any = [inner];
		const errors = checkResultErrors(outer);
		expect(errors).toHaveLength(1);
		expect(errors[0].error).toBe(boom);
		expect(errors[0].path).toEqual(['0', '0']);
	});
});

describe('Reader: shared buffer and read budget (M-9)', () => {
	const twoWords = `0x${rightAligned('01').slice(2)}${rightAligned('02').slice(2)}`;

	it('creates a sub-reader as a view on the same buffer instead of a copy (M-9)', () => {
		const reader = new Reader(twoWords, WORD);
		const sub = reader.subReader(WORD);
		expect(sub._data.buffer).toBe(reader._data.buffer);
		expect(sub._data.byteOffset).toBe(reader._data.byteOffset + WORD);
		expect(sub._data.length).toBe(WORD);
		expect(sub.readValue().toNumber()).toBe(2);

		// Nested sub-readers keep sharing the root buffer.
		const nested = reader.subReader(0).subReader(WORD);
		expect(nested._data.buffer).toBe(reader._data.buffer);
		expect(nested.readValue().toNumber()).toBe(2);
		expect(nested.data).toBe(rightAligned('02'));
	});

	it('keeps the sub-reader offset relative to its own base', () => {
		const reader = new Reader(twoWords, WORD);
		reader.readValue();
		const sub = reader.subReader(0);
		expect(sub.consumed).toBe(0);
		expect(sub.readValue().toNumber()).toBe(2);
		expect(() => sub.readValue()).toThrow(/out-of-bounds/);
	});

	it('accounts every read against one budget shared by all sub-readers (M-9)', () => {
		const reader = new Reader(twoWords, WORD);
		expect(reader.bytesRead).toBe(0);
		reader.readValue();
		expect(reader.bytesRead).toBe(WORD);
		reader.subReader(0).readValue();
		expect(reader.bytesRead).toBe(2 * WORD);
		// `reader` sits at the second word: the sub-reader starts there.
		const sub = reader.subReader(0);
		sub.readBytes(3);
		expect(reader.bytesRead).toBe(2 * WORD + 3);
		expect(sub.bytesRead).toBe(reader.bytesRead);
		expect(sub.subReader(0).bytesRead).toBe(reader.bytesRead);
	});

	it('rejects a decode that reads more than MAX_INFLATION times the input (M-9)', () => {
		const reader = new Reader(rightAligned('01'), WORD);
		for (let i = 0; i < MAX_INFLATION; i++) {
			expect(reader.subReader(0).readValue().toNumber()).toBe(1);
		}
		expect(reader.bytesRead).toBe(MAX_INFLATION * WORD);
		expect(() => reader.subReader(0).readValue()).toThrow(/inflation ratio/);
	});

	it('reports the budget error as BUFFER_OVERRUN so that it cannot be deferred', () => {
		const reader = new Reader(rightAligned('01'), WORD);
		for (let i = 0; i < MAX_INFLATION; i++) {
			reader.subReader(0).readValue();
		}
		let caught: { code?: string } | undefined;
		try {
			reader.readValue();
		} catch (error) {
			caught = error as { code?: string };
		}
		expect(caught?.code).toBe('BUFFER_OVERRUN');
	});

	it('does not count a read that is out-of-bounds', () => {
		const reader = new Reader(rightAligned('01'), WORD);
		expect(() => reader.subReader(WORD).readValue()).toThrow(/out-of-bounds/);
		expect(reader.bytesRead).toBe(0);
	});
});
