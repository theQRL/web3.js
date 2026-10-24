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

import { toChecksumAddress } from '@theqrl/web3-utils';

import { AbiCoder, defaultAbiCoder } from '../../src/abi-coder.js';
import { ParamType } from '../../src/fragments.js';

// Numeric values occupy 64-byte words. Offsets are measured in bytes from the
// start of the head block; tails are 64-byte aligned.
const WORD = 64;

const zeros = (n: number) => '00'.repeat(n);
/** A 64-byte word holding `n`, right-aligned (the encoding for numbers/offsets). */
const word = (n: number | string) => {
	const hex = typeof n === 'number' ? n.toString(16) : n;
	const body = hex.length % 2 ? `0${hex}` : hex;
	return `${'0'.repeat(WORD * 2 - body.length)}${body}`;
};
/** A 64-byte word holding `hex`, left-aligned (the encoding for byte data). */
const bytesWord = (hex: string) => `${hex}${'0'.repeat(WORD * 2 - hex.length)}`;

const ADDR_A = toChecksumAddress(`Q${'ab'.repeat(64)}`);
const ADDR_B = `Q${'0'.repeat(127)}1`;
const ADDR_ZERO = `Q${'0'.repeat(128)}`;

describe('AbiCoder', () => {
	describe('word size', () => {
		it('uses a 64-byte word', () => {
			expect(new AbiCoder()._getWordSize()).toBe(64);
			expect(new AbiCoder()._getWriter().wordSize).toBe(64);
			expect(new AbiCoder()._getReader(new Uint8Array(0)).wordSize).toBe(64);
		});

		it('exposes a shared default instance', () => {
			expect(defaultAbiCoder).toBeInstanceOf(AbiCoder);
			expect(defaultAbiCoder.coerceFunc).toBeNull();
		});
	});

	describe('encode: static types', () => {
		it('encodes uint256 right-aligned in one word', () => {
			expect(defaultAbiCoder.encode(['uint256'], [1])).toBe(`0x${word(1)}`);
			expect(defaultAbiCoder.encode(['uint256'], [1])).toHaveLength(2 + WORD * 2);
		});

		it('encodes uint8 in a full 64-byte word, not a byte', () => {
			expect(defaultAbiCoder.encode(['uint8'], [255])).toBe(`0x${word(0xff)}`);
		});

		it('encodes bool as 1 and 0', () => {
			expect(defaultAbiCoder.encode(['bool'], [true])).toBe(`0x${word(1)}`);
			expect(defaultAbiCoder.encode(['bool'], [false])).toBe(`0x${word(0)}`);
		});

		it('encodes a negative int256 as sign-extended twos-complement across the word', () => {
			// -1 in twos-complement over a 64-byte word is all-ones.
			expect(defaultAbiCoder.encode(['int256'], [-1])).toBe(`0x${'ff'.repeat(WORD)}`);
		});

		it('encodes 512-bit integer bounds', () => {
			const bits = WORD * 8;
			const magnitudeBits = bits - 1;
			const maxUint512 = BigNumber.from(2).pow(bits).sub(1);
			const maxInt512 = BigNumber.from(2).pow(magnitudeBits).sub(1);
			const minInt512 = BigNumber.from(2).pow(magnitudeBits).mul(-1);

			expect(defaultAbiCoder.encode(['uint512'], [maxUint512])).toBe(
				`0x${'ff'.repeat(WORD)}`,
			);
			// 2^511 - 1 is 0x7f followed by 63 all-ones bytes.
			expect(defaultAbiCoder.encode(['int512'], [maxInt512])).toBe(
				`0x7f${'ff'.repeat(WORD - 1)}`,
			);
			// -(2^511) in twos-complement is 0x80 followed by 63 zero bytes.
			expect(defaultAbiCoder.encode(['int512'], [minInt512])).toBe(`0x80${zeros(WORD - 1)}`);

			expect(() => defaultAbiCoder.encode(['uint512'], [maxUint512.add(1)])).toThrow(
				/out-of-bounds/,
			);
			expect(() => defaultAbiCoder.encode(['int512'], [maxInt512.add(1)])).toThrow(
				/out-of-bounds/,
			);
			expect(() => defaultAbiCoder.encode(['int512'], [minInt512.sub(1)])).toThrow(
				/out-of-bounds/,
			);
		});

		it('enforces bounds for widths between 256 and 512', () => {
			const maxUint384 = BigNumber.from(2).pow(384).sub(1);
			const minInt264 = BigNumber.from(2).pow(263).mul(-1);
			expect(() => defaultAbiCoder.encode(['uint384'], [maxUint384.add(1)])).toThrow(
				/out-of-bounds/,
			);
			expect(() => defaultAbiCoder.encode(['int264'], [minInt264.sub(1)])).toThrow(
				/out-of-bounds/,
			);
		});

		it('encodes bytes48 left-aligned with 16 bytes of trailing padding', () => {
			expect(defaultAbiCoder.encode(['bytes48'], [`0x${'ab'.repeat(48)}`])).toBe(
				`0x${'ab'.repeat(48)}${zeros(16)}`,
			);
		});

		it('encodes bytes32 left-aligned in one word', () => {
			const value = `0x${'ab'.repeat(32)}`;
			expect(defaultAbiCoder.encode(['bytes32'], [value])).toBe(
				`0x${bytesWord('ab'.repeat(32))}`,
			);
		});

		it('encodes address as its 64 bytes verbatim', () => {
			expect(defaultAbiCoder.encode(['address'], [ADDR_A])).toBe(`0x${'ab'.repeat(64)}`);
		});

		it('encodes several static types as consecutive words', () => {
			expect(
				defaultAbiCoder.encode(['uint512', 'bool', 'address'], [7, true, ADDR_ZERO]),
			).toBe(`0x${word(7)}${word(1)}${word(0)}`);
		});
	});

	describe('encode: dynamic types', () => {
		it('encodes bytes as offset, length, then right-padded data', () => {
			// head: one word holding the offset (64, since the head block is one word)
			// tail: length word (2) + the data left-aligned in one word
			expect(defaultAbiCoder.encode(['bytes'], ['0x1234'])).toBe(
				`0x${word(64)}${word(2)}${bytesWord('1234')}`,
			);
		});

		it('encodes empty bytes as offset and a zero length, with no data word', () => {
			expect(defaultAbiCoder.encode(['bytes'], ['0x'])).toBe(`0x${word(64)}${word(0)}`);
		});

		it('encodes a 65-byte payload across two data words', () => {
			const data = 'aa'.repeat(65);
			expect(defaultAbiCoder.encode(['bytes'], [`0x${data}`])).toBe(
				`0x${word(64)}${word(65)}${data}${zeros(63)}`,
			);
		});

		it('encodes string as its UTF-8 byte length and left-aligned bytes', () => {
			// "abc" is 0x616263, 3 bytes.
			expect(defaultAbiCoder.encode(['string'], ['abc'])).toBe(
				`0x${word(64)}${word(3)}${bytesWord('616263')}`,
			);
		});

		it('measures string length in UTF-8 bytes, not code points', () => {
			// U+00E9 is 2 bytes in UTF-8 (0xc3 0xa9).
			expect(defaultAbiCoder.encode(['string'], ['é'])).toBe(
				`0x${word(64)}${word(2)}${bytesWord('c3a9')}`,
			);
		});

		it('offsets past the whole head block when a static type precedes a dynamic one', () => {
			// head = uint512 word + offset word = 128 bytes, so the offset is 128.
			expect(defaultAbiCoder.encode(['uint512', 'bytes'], [1, '0x12'])).toBe(
				`0x${word(1)}${word(128)}${word(1)}${bytesWord('12')}`,
			);
		});

		it('gives each dynamic value its own offset into a shared tail', () => {
			// head = two offset words = 128 bytes.
			// first tail: len + data = 128 bytes, so the second offset is 128 + 128 = 256.
			expect(defaultAbiCoder.encode(['bytes', 'bytes'], ['0x11', '0x22'])).toBe(
				`0x${word(128)}${word(256)}${word(1)}${bytesWord('11')}${word(1)}${bytesWord('22')}`,
			);
		});
	});

	describe('encode: arrays', () => {
		it('encodes a fixed-length static array inline with no offset', () => {
			expect(defaultAbiCoder.encode(['uint512[2]'], [[1, 2]])).toBe(`0x${word(1)}${word(2)}`);
		});

		it('encodes a dynamic array as offset, count, then elements', () => {
			expect(defaultAbiCoder.encode(['uint512[]'], [[1, 2]])).toBe(
				`0x${word(64)}${word(2)}${word(1)}${word(2)}`,
			);
		});

		it('encodes an empty dynamic array as offset and a zero count', () => {
			expect(defaultAbiCoder.encode(['uint512[]'], [[]])).toBe(`0x${word(64)}${word(0)}`);
		});

		it('encodes a fixed-length address array as consecutive 64-byte words', () => {
			expect(defaultAbiCoder.encode(['address[2]'], [[ADDR_A, ADDR_ZERO]])).toBe(
				`0x${'ab'.repeat(64)}${word(0)}`,
			);
		});

		it('rejects a fixed-length array of the wrong size', () => {
			expect(() => defaultAbiCoder.encode(['uint512[2]'], [[1, 2, 3]])).toThrow();
			expect(() => defaultAbiCoder.encode(['uint512[2]'], [[1]])).toThrow();
		});

		it('rejects a non-array value for an array type', () => {
			expect(() => defaultAbiCoder.encode(['uint512[]'], ['nope' as any])).toThrow();
		});
	});

	describe('encode: tuples', () => {
		it('encodes a static tuple inline', () => {
			expect(defaultAbiCoder.encode(['tuple(uint512,bool)'], [[1, true]])).toBe(
				`0x${word(1)}${word(1)}`,
			);
		});

		it('encodes a dynamic tuple behind an offset', () => {
			// tuple(bytes) is dynamic: outer offset 64, then inner head offset 64,
			// then the inner tail.
			expect(defaultAbiCoder.encode(['tuple(bytes)'], [['0x12']])).toBe(
				`0x${word(64)}${word(64)}${word(1)}${bytesWord('12')}`,
			);
		});

		it('accepts an object for a named tuple', () => {
			const byArray = defaultAbiCoder.encode(['tuple(uint512 a, bool b)'], [[1, true]]);
			const byObject = defaultAbiCoder.encode(
				['tuple(uint512 a, bool b)'],
				[{ a: 1, b: true }],
			);
			expect(byObject).toBe(byArray);
		});

		it('rejects an object for an unnamed tuple', () => {
			expect(() =>
				defaultAbiCoder.encode(['tuple(uint512,bool)'], [{ a: 1, b: true }]),
			).toThrow(/missing names/);
		});
	});

	describe('encode: argument checking', () => {
		it('rejects a types/values length mismatch', () => {
			expect(() => defaultAbiCoder.encode(['uint512', 'bool'], [1])).toThrow(
				/length mismatch/,
			);
			expect(() => defaultAbiCoder.encode(['uint512'], [1, true])).toThrow(/length mismatch/);
		});

		it('encodes nothing for no types', () => {
			expect(defaultAbiCoder.encode([], [])).toBe('0x');
		});
	});

	describe('round-trip', () => {
		it.each<[string, any]>([
			['uint512', BigNumber.from('0x0123456789abcdef')],
			['uint8', 255],
			['int512', BigNumber.from(-1)],
			['int64', BigNumber.from('-9223372036854775808')],
			['bool', true],
			['bool', false],
			['bytes32', `0x${'ab'.repeat(32)}`],
			['bytes48', `0x${'ab'.repeat(48)}`],
			['bytes64', `0x${'ab'.repeat(64)}`],
			['bytes1', '0xff'],
			['uint384', BigNumber.from(2).pow(384).sub(1)],
			['int264', BigNumber.from(2).pow(263).mul(-1)],
			['address', ADDR_A],
			['address', ADDR_B],
			['address', ADDR_ZERO],
			['bytes', '0x'],
			['bytes', '0x1234'],
			['bytes', `0x${'aa'.repeat(200)}`],
			['string', ''],
			['string', 'hello world'],
			['string', 'café ☃ 🚀'],
		])('round-trips %s', (type, value) => {
			const encoded = defaultAbiCoder.encode([type], [value]);
			const [decoded] = defaultAbiCoder.decode([type], encoded);
			// Normalise BigNumber to its hex form so numeric and non-numeric types
			// can share one unconditional assertion.
			const normalise = (v: any) => (BigNumber.isBigNumber(v) ? v.toHexString() : v);
			expect(normalise(decoded)).toEqual(normalise(value));
		});

		it('round-trips a fixed-length array', () => {
			const [decoded] = defaultAbiCoder.decode(
				['uint8[3]'],
				defaultAbiCoder.encode(['uint8[3]'], [[1, 2, 3]]),
			);
			expect(Array.from(decoded)).toEqual([1, 2, 3]);
		});

		it('round-trips a dynamic array', () => {
			const [decoded] = defaultAbiCoder.decode(
				['uint8[]'],
				defaultAbiCoder.encode(['uint8[]'], [[1, 2, 3]]),
			);
			expect(Array.from(decoded)).toEqual([1, 2, 3]);
		});

		it('round-trips an empty dynamic array', () => {
			const [decoded] = defaultAbiCoder.decode(
				['uint8[]'],
				defaultAbiCoder.encode(['uint8[]'], [[]]),
			);
			expect(Array.from(decoded)).toEqual([]);
		});

		it('round-trips an address array', () => {
			const [decoded] = defaultAbiCoder.decode(
				['address[]'],
				defaultAbiCoder.encode(['address[]'], [[ADDR_A, ADDR_B, ADDR_ZERO]]),
			);
			expect(Array.from(decoded)).toEqual([ADDR_A, ADDR_B, ADDR_ZERO]);
		});

		it('round-trips a dynamic array of dynamic values', () => {
			const [decoded] = defaultAbiCoder.decode(
				['string[]'],
				defaultAbiCoder.encode(['string[]'], [['a', 'bb', 'ccc']]),
			);
			expect(Array.from(decoded)).toEqual(['a', 'bb', 'ccc']);
		});

		it('round-trips a nested array', () => {
			const value = [
				[1, 2],
				[3, 4],
			];
			const [decoded] = defaultAbiCoder.decode(
				['uint8[2][2]'],
				defaultAbiCoder.encode(['uint8[2][2]'], [value]),
			);
			expect(decoded.map((row: any) => Array.from(row))).toEqual(value);
		});

		it('round-trips a static tuple with named access', () => {
			const encoded = defaultAbiCoder.encode(['tuple(uint8 a, bool b)'], [{ a: 5, b: true }]);
			const [decoded] = defaultAbiCoder.decode(['tuple(uint8 a, bool b)'], encoded);
			expect(decoded.a).toBe(5);
			expect(decoded.b).toBe(true);
			expect(Array.from(decoded)).toEqual([5, true]);
		});

		it('round-trips a mixed static/dynamic tuple', () => {
			const type = 'tuple(address to, uint512 value, bytes data)';
			const value = { to: ADDR_A, value: BigNumber.from(1000), data: '0xdeadbeef' };
			const [decoded] = defaultAbiCoder.decode(
				[type],
				defaultAbiCoder.encode([type], [value]),
			);
			expect(decoded.to).toBe(ADDR_A);
			expect(decoded.value.eq(1000)).toBe(true);
			expect(decoded.data).toBe('0xdeadbeef');
		});

		it('round-trips an array of tuples', () => {
			const type = 'tuple(address to, uint8 n)[]';
			const value = [
				{ to: ADDR_A, n: 1 },
				{ to: ADDR_B, n: 2 },
			];
			const [decoded] = defaultAbiCoder.decode(
				[type],
				defaultAbiCoder.encode([type], [value]),
			);
			expect(decoded).toHaveLength(2);
			expect(decoded[0].to).toBe(ADDR_A);
			expect(decoded[1].n).toBe(2);
		});

		it('round-trips a deeply nested tuple', () => {
			const type = 'tuple(tuple(uint8 x, string s) inner, address[] addrs)';
			const value = {
				inner: { x: 9, s: 'deep' },
				addrs: [ADDR_ZERO, ADDR_A],
			};
			const [decoded] = defaultAbiCoder.decode(
				[type],
				defaultAbiCoder.encode([type], [value]),
			);
			expect(decoded.inner.x).toBe(9);
			expect(decoded.inner.s).toBe('deep');
			expect(Array.from(decoded.addrs)).toEqual([ADDR_ZERO, ADDR_A]);
		});

		it('round-trips a multi-argument mixed signature', () => {
			const types = ['address', 'uint512', 'bytes', 'bool', 'string'];
			const values = [ADDR_A, BigNumber.from('0xdeadbeef'), '0x0102', false, 'ok'];
			const decoded = defaultAbiCoder.decode(types, defaultAbiCoder.encode(types, values));
			expect(decoded[0]).toBe(ADDR_A);
			expect(decoded[1].eq('0xdeadbeef')).toBe(true);
			expect(decoded[2]).toBe('0x0102');
			expect(decoded[3]).toBe(false);
			expect(decoded[4]).toBe('ok');
		});
	});

	describe('decode', () => {
		it('returns a frozen result', () => {
			const decoded = defaultAbiCoder.decode(['uint8'], `0x${word(1)}`);
			expect(Object.isFrozen(decoded)).toBe(true);
		});

		it('throws when the data is truncated', () => {
			expect(() => defaultAbiCoder.decode(['uint256'], `0x${zeros(32)}`)).toThrow(
				/out-of-bounds/,
			);
		});

		it('throws when a dynamic array length exceeds the available data', () => {
			// offset word -> a count of 2^32, far beyond the buffer.
			expect(() =>
				defaultAbiCoder.decode(['uint512[]'], `0x${word(64)}${word(0x100000000)}`),
			).toThrow(/insufficient data length/);
		});

		// Decoding errors are deferred by the coder: reading the slot throws.
		const readFirst = (decoded: ReadonlyArray<unknown>) => () => decoded[0];

		it('rejects a uint8 word with non-zero high bits', () => {
			const decoded = defaultAbiCoder.decode(['uint8'], `0x${'ff'.repeat(WORD - 1)}05`);
			expect(readFirst(decoded)).toThrow(/out-of-bounds/);
		});

		it('rejects an int8 word that is not sign-extended', () => {
			// 0xff in the low byte with zero high bytes is 255, not a sign-extended -1.
			const decoded = defaultAbiCoder.decode(['int8'], `0x${zeros(WORD - 1)}ff`);
			expect(readFirst(decoded)).toThrow(/out-of-bounds/);
		});

		it('decodes a canonical negative int8', () => {
			expect(defaultAbiCoder.decode(['int8'], `0x${'ff'.repeat(WORD)}`)[0]).toBe(-1);
		});

		it('rejects a bool word that is neither 0 nor 1', () => {
			const decoded = defaultAbiCoder.decode(['bool'], `0x${word(2)}`);
			expect(readFirst(decoded)).toThrow(/invalid boolean value/);
		});

		it('rejects a bytes4 word with non-zero padding', () => {
			const decoded = defaultAbiCoder.decode(
				['bytes4'],
				`0x${bytesWord('deadbeef').slice(0, -2)}01`,
			);
			expect(readFirst(decoded)).toThrow(/non-zero padding/);
		});

		it('decodes canonical bytes4', () => {
			expect(defaultAbiCoder.decode(['bytes4'], `0x${bytesWord('deadbeef')}`)[0]).toBe(
				'0xdeadbeef',
			);
		});

		it('accepts a Uint8Array as well as a hex string', () => {
			const encoded = defaultAbiCoder.encode(['uint8'], [42]);
			const bytes = Uint8Array.from(
				(encoded.slice(2).match(/../g) as string[]).map(b => parseInt(b, 16)),
			);
			expect(defaultAbiCoder.decode(['uint8'], bytes)[0]).toBe(42);
		});
	});

	describe('coerceFunc', () => {
		it('is applied to decoded values', () => {
			const coerceFunc = jest.fn((_type: string, value: any) => value);
			const coder = new AbiCoder(coerceFunc);
			coder.decode(['uint8'], `0x${word(1)}`);
			expect(coerceFunc).toHaveBeenCalled();
		});
	});

	describe('getDefaultValue', () => {
		it('produces the zero value for each type', () => {
			const defaults = defaultAbiCoder.getDefaultValue([
				'uint512',
				'bool',
				'address',
				'bytes64',
				'bytes48',
				'bytes',
				'string',
			]);
			expect(defaults[0]).toBe(0);
			expect(defaults[1]).toBe(false);
			expect(defaults[2]).toBe(ADDR_ZERO);
			expect(defaults[3]).toBe(`0x${zeros(WORD)}`);
			expect(defaults[4]).toBe(`0x${zeros(48)}`);
			expect(defaults[5]).toBe('0x');
			expect(defaults[6]).toBe('');
		});

		it('produces an empty array for a dynamic array and a filled one for a fixed array', () => {
			expect(Array.from(defaultAbiCoder.getDefaultValue(['uint8[]'])[0])).toEqual([]);
			expect(Array.from(defaultAbiCoder.getDefaultValue(['uint8[3]'])[0])).toEqual([0, 0, 0]);
		});
	});

	describe('_getCoder validation', () => {
		it.each(['uint0', 'uint257', 'uint520', 'uint7', 'int0', 'int257', 'int520', 'int9'])(
			'rejects the invalid numeric type %s',
			type => {
				expect(() => defaultAbiCoder._getCoder(ParamType.from(type))).toThrow(/bit length/);
			},
		);

		it.each(['uint8', 'uint256', 'uint512', 'int8', 'int256', 'int512', 'uint', 'int'])(
			'accepts the valid numeric type %s',
			type => {
				expect(() => defaultAbiCoder._getCoder(ParamType.from(type))).not.toThrow();
			},
		);

		it('defaults a bare uint/int to 256 bits', () => {
			expect(defaultAbiCoder._getCoder(ParamType.from('uint')).name).toBe('uint256');
			expect(defaultAbiCoder._getCoder(ParamType.from('int')).name).toBe('int256');
		});

		it.each(['bytes0', 'bytes65'])('rejects the invalid type %s', type => {
			expect(() => defaultAbiCoder._getCoder(ParamType.from(type))).toThrow(
				/invalid bytes length/,
			);
		});

		it('rejects an unknown type', () => {
			expect(() => defaultAbiCoder._getCoder(ParamType.from('nonsense'))).toThrow(
				/invalid type/,
			);
		});
	});
});

describe('decode: untrusted node data (M-9, M-10)', () => {
	// The audit's PoC: a `bytes[]` whose element offsets all point at the offset table itself,
	// where the first word is 0 -> every element is a valid empty `bytes`. Each element used to
	// copy the rest of the buffer, so the decode was O(len^2).
	const pointAtSelf = (elements: number) =>
		`0x${word(WORD)}${word(elements)}${word(0).repeat(elements)}`;

	// Bytes copied by `Uint8Array.prototype.slice` while `fn` runs.
	const bytesCopiedBy = (fn: () => void) => {
		const original = Uint8Array.prototype.slice;
		let copied = 0;
		const spy = jest
			.spyOn(Uint8Array.prototype, 'slice')
			.mockImplementation(function slice(this: Uint8Array, start?: number, end?: number) {
				const result = original.call(this, start, end);
				copied += result.length;
				return result;
			});
		try {
			fn();
		} finally {
			spy.mockRestore();
		}
		return copied;
	};

	it('decodes a dynamic array whose elements all point at the same bytes without copying the buffer per element (M-9)', () => {
		const elements = 16382; // 1 MiB of data, as in the audit PoC
		const data = pointAtSelf(elements);
		const dataLength = (data.length - 2) / 2;
		let decoded: ReadonlyArray<any> = [];
		const copied = bytesCopiedBy(() => {
			decoded = defaultAbiCoder.decode(['bytes[]'], data);
		});
		expect(decoded[0]).toHaveLength(elements);
		expect(decoded[0][0]).toBe('0x');
		expect(decoded[0][elements - 1]).toBe('0x');
		// Only the words actually read are copied: a few words per element, not the whole
		// buffer (which would be elements * dataLength = 16 GiB here).
		expect(copied).toBeLessThan(8 * dataLength);
	});

	it('rejects a result whose elements share one large payload once the read budget is exhausted (M-9)', () => {
		// 64 `bytes` elements that all point at a single 4 KiB payload: 64 x 4 KiB would be read
		// from 8.3 KiB of data (31x), which no canonical encoding comes near.
		const elements = 64;
		const payload = 4096;
		const data = `0x${word(WORD)}${word(elements)}${word(elements * WORD).repeat(
			elements,
		)}${word(payload)}${'ab'.repeat(payload)}`;
		expect(() => defaultAbiCoder.decode(['bytes[]'], data)).toThrow(/inflation ratio/);
	});

	it('still decodes a large bytes result and a long uint256[] (M-9)', () => {
		const size = 1 << 20; // 1 MiB
		const payload = 'ab'.repeat(size);
		const bytes = defaultAbiCoder.decode(['bytes'], `0x${word(WORD)}${word(size)}${payload}`);
		expect(bytes[0]).toBe(`0x${payload}`);

		const count = 20000;
		const numbers = defaultAbiCoder.decode(
			['uint256[]'],
			`0x${word(WORD)}${word(count)}${word(7).repeat(count)}`,
		);
		expect(numbers[0]).toHaveLength(count);
		expect(numbers[0][count - 1]).toEqual(BigNumber.from(7));
	});

	it('still decodes nested dynamic values that reference distinct bytes', () => {
		const inner = (hex: string) => `${word(hex.length / 2)}${bytesWord(hex)}`;
		// tuple(bytes,string)[] with two elements.
		const elementA = `${word(2 * WORD)}${word(4 * WORD)}${inner('deadbeef')}${inner('6869')}`;
		const elementB = `${word(2 * WORD)}${word(4 * WORD)}${inner('ab')}${inner('')}`;
		const data = `0x${word(WORD)}${word(2)}${word(2 * WORD)}${word(
			2 * WORD + 6 * WORD,
		)}${elementA}${elementB}`;
		const decoded = defaultAbiCoder.decode(['tuple(bytes,string)[]'], data);
		expect(decoded[0]).toHaveLength(2);
		expect(decoded[0][0][0]).toBe('0xdeadbeef');
		expect(decoded[0][0][1]).toBe('hi');
		expect(decoded[0][1][0]).toBe('0xab');
		expect(decoded[0][1][1]).toBe('');
	});

	it('rejects a fixed-length array that cannot fit in the data before allocating anything (M-10)', () => {
		// 10^8 elements on one word of data used to allocate 10^8 coders and die with a V8 OOM.
		expect(() => defaultAbiCoder.decode(['uint8[100000000]'], `0x${word(1)}`)).toThrow(
			/insufficient data length/,
		);
		expect(() =>
			defaultAbiCoder.decode([ParamType.fromObject({ type: 'uint8[100000000]' })], `0x${word(1)}`),
		).toThrow(/insufficient data length/);
		// Nested inside a tuple and as the element of a dynamic array as well.
		expect(() =>
			defaultAbiCoder.decode(['tuple(uint8[100000000])'], `0x${word(1)}`),
		).toThrow(/insufficient data length/);
		expect(() =>
			defaultAbiCoder.decode(['uint8[100000000][]'], `0x${word(WORD)}${word(1)}`),
		).toThrow(/insufficient data length/);
	});

	it('still decodes fixed-length arrays that fit (M-10)', () => {
		expect(
			Array.from(defaultAbiCoder.decode(['uint8[2]'], `0x${word(1)}${word(2)}`)[0]),
		).toEqual([1, 2]);
		expect(
			defaultAbiCoder.decode(['uint8[2]', 'uint8'], `0x${word(1)}${word(2)}${word(3)}`)[1],
		).toBe(3);
	});

	it('bounds the number of decoded elements, so nested arrays of zero-size elements cannot exhaust memory (M-10)', () => {
		// 125 KiB of `tuple()[][]`: every outer offset points at one inner array of n zero-size
		// elements followed by n words of padding, which satisfies the data-length check at both
		// levels while reading nothing; it used to decode n^2 result objects (56 MiB at n = 1000).
		const n = 1000;
		const data = `0x${word(WORD)}${word(n)}${word(n * WORD).repeat(n)}${word(n)}${zeros(
			WORD,
		).repeat(n)}`;
		expect(() => defaultAbiCoder.decode(['tuple()[][]'], data)).toThrow(
			/decoded array elements exceed the budget/,
		);
		// A legitimate array spends at least one word per element and stays far below the budget.
		const flat = `0x${word(WORD)}${word(n)}${Array.from({ length: n }, (_, i) => word(i)).join(
			'',
		)}`;
		expect(defaultAbiCoder.decode(['uint256[]'], flat)[0]).toHaveLength(n);
		// Nested legitimate arrays as well: n inner arrays of one element each.
		const nested = `0x${word(WORD)}${word(n)}${Array.from({ length: n }, (_, i) =>
			word(n * WORD + i * 2 * WORD),
		).join('')}${`${word(1)}${word(7)}`.repeat(n)}`;
		expect(defaultAbiCoder.decode(['uint256[][]'], nested)[0]).toHaveLength(n);
	});
});

describe('string encoding input (pass-3 residual)', () => {
	it('rejects a non-string and an unpaired surrogate instead of encoding a different string', () => {
		expect(() => defaultAbiCoder.encode(['string'], [5])).toThrow(/expected string value/);
		expect(() => defaultAbiCoder.encode(['string'], ['\ud800'])).toThrow(/unpaired surrogate/);
		expect(() => defaultAbiCoder.encode(['string'], ['a\udc00b'])).toThrow(/unpaired surrogate/);
		expect(
			defaultAbiCoder.decode(['string'], defaultAbiCoder.encode(['string'], ['\ud83d\ude00 ok']))[0],
		).toBe('\ud83d\ude00 ok');
	});
});

describe('getDefaultValue bound (M-10)', () => {
	it('refuses to materialise an absurd fixed-length array', () => {
		expect(() => defaultAbiCoder.getDefaultValue(['uint8[4294967295]'])).toThrow(
			/too large for a default value/,
		);
		expect(Array.from(defaultAbiCoder.getDefaultValue(['uint8[65536]'])[0])).toHaveLength(65536);
	});
});
