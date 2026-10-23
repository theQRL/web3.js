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

import { toChecksumAddress } from '@theqrl/web3-utils';

import { AddressCoder } from '../../../src/coders/address.js';
import { Reader, Writer } from '../../../src/coders/abstract-coder.js';

// A QRL address is `Q` followed by 128 hex characters (64 bytes). Every value
// below is written out from that definition rather than captured from a run.
const HEX_CHARS = 128;
const ADDRESS_BYTES = 64;

const zeroBody = '0'.repeat(HEX_CHARS);
const oneBody = `${'0'.repeat(HEX_CHARS - 1)}1`;
const maxBody = 'f'.repeat(HEX_CHARS);
const abBody = 'ab'.repeat(ADDRESS_BYTES);
// A body that is entirely digits, so its checksummed form is identical to its
// lowercase form (EIP-55 style casing only touches a-f).
const digitBody = '9'.repeat(HEX_CHARS);

const addr = (body: string) => `Q${body}`;

const encodeOne = (value: string): string => {
	const writer = new Writer(64);
	const coder = new AddressCoder('to');
	const written = coder.encode(writer, value);
	return `${writer.data}|${written}`;
};

const encodeData = (value: string): string => {
	const writer = new Writer(64);
	new AddressCoder('to').encode(writer, value);
	return writer.data;
};

const decodeData = (data: string): string =>
	new AddressCoder('to').decode(new Reader(data, 64)) as string;

describe('AddressCoder', () => {
	describe('construction', () => {
		it('is a static (non-dynamic) coder named "address"', () => {
			const coder = new AddressCoder('to');
			expect(coder.name).toBe('address');
			expect(coder.type).toBe('address');
			expect(coder.localName).toBe('to');
			// A 64-byte address fits exactly one 64-byte word, so it is never
			// head/tail encoded.
			expect(coder.dynamic).toBe(false);
		});
	});

	describe('defaultValue', () => {
		it('is the zero address: Q followed by 128 hex zeros', () => {
			const value = new AddressCoder('to').defaultValue();
			expect(value).toBe(`Q${'0'.repeat(128)}`);
			expect(value).toHaveLength(1 + 128);
			expect(value.startsWith('Q')).toBe(true);
		});

		it('is itself encodable (round-trips through the coder)', () => {
			const value = new AddressCoder('to').defaultValue();
			expect(decodeData(encodeData(value))).toBe(value);
		});
	});

	describe('encode', () => {
		it.each([
			['zero address', zeroBody],
			['one', oneBody],
			['all-ones', maxBody],
			['alternating nibbles', abBody],
			['all digits', digitBody],
		])('writes %s as exactly one 64-byte word equal to the address body', (_label, body) => {
			// A 64-byte address exactly fills a 64-byte word, so right-alignment
			// is the identity: the encoded word is the address body verbatim.
			expect(encodeData(addr(body))).toBe(`0x${body}`);
		});

		it('reports 64 bytes written', () => {
			const [data, written] = encodeOne(addr(abBody)).split('|');
			expect(Number(written)).toBe(ADDRESS_BYTES);
			// 0x + 128 hex chars
			expect(data).toHaveLength(2 + HEX_CHARS);
		});

		it('preserves leading zero bytes (the BigNumber path must re-pad)', () => {
			// encode() routes the address through writer.writeValue(), which converts
			// to a BigNumber and therefore drops leading zeros; the writer must pad
			// them back on the left. A body of 63 zero bytes + 0x01 is the sharpest
			// case for that.
			expect(encodeData(addr(oneBody))).toBe(`0x${oneBody}`);
			expect(encodeData(addr(oneBody))).toHaveLength(2 + HEX_CHARS);
		});

		it('advances the writer by one word, not one 20-byte ETH slot', () => {
			const writer = new Writer(64);
			new AddressCoder('to').encode(writer, addr(abBody));
			expect(writer.length).toBe(64);
			expect(writer.length).not.toBe(20);
			expect(writer.length).not.toBe(32);
		});
	});

	describe('decode', () => {
		it.each([
			['zero address', zeroBody],
			['one', oneBody],
			['all-ones', maxBody],
			['alternating nibbles', abBody],
		])('reads one 64-byte word back as %s', (_label, body) => {
			expect(decodeData(`0x${body}`)).toBe(toChecksumAddress(addr(body)));
		});

		it('consumes exactly one 64-byte word', () => {
			const reader = new Reader(`0x${abBody}${zeroBody}`, 64);
			new AddressCoder('to').decode(reader);
			expect(reader.consumed).toBe(64);
		});

		it('decodes the second word independently of the first', () => {
			const reader = new Reader(`0x${abBody}${oneBody}`, 64);
			const coder = new AddressCoder('to');
			expect(coder.decode(reader)).toBe(toChecksumAddress(addr(abBody)));
			expect(coder.decode(reader)).toBe(toChecksumAddress(addr(oneBody)));
			expect(reader.consumed).toBe(128);
		});

		it('throws when there is less than a full word of data', () => {
			// 63 bytes: one byte short of a word.
			expect(() => decodeData(`0x${'00'.repeat(63)}`)).toThrow(/out-of-bounds/);
		});

		it('rejects a 20-byte ETH-shaped word rather than left-padding it', () => {
			// Reader.readValue() insists on a full 64-byte word, so ETH-sized
			// calldata cannot be silently reinterpreted as a QRL address.
			expect(() => decodeData(`0x${'11'.repeat(20)}`)).toThrow(/out-of-bounds/);
		});
	});

	describe('round-trip', () => {
		it.each([zeroBody, oneBody, maxBody, abBody, digitBody])(
			'encode -> decode returns the checksummed form of Q%s',
			body => {
				expect(decodeData(encodeData(addr(body)))).toBe(toChecksumAddress(addr(body)));
			},
		);
	});

	describe('length validation', () => {
		it('rejects a 20-byte Ethereum address (0x-prefixed)', () => {
			expect(() => encodeData('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toThrow();
		});

		it('rejects a Q-prefixed 20-byte (40 hex char) address', () => {
			expect(() => encodeData(`Q${'ab'.repeat(20)}`)).toThrow();
		});

		it('rejects a Q-prefixed 32-byte (64 hex char) address', () => {
			expect(() => encodeData(`Q${'ab'.repeat(32)}`)).toThrow();
		});

		it('rejects an address one hex char too short', () => {
			expect(() => encodeData(`Q${'a'.repeat(127)}`)).toThrow();
		});

		it('rejects an address one hex char too long', () => {
			expect(() => encodeData(`Q${'a'.repeat(129)}`)).toThrow();
		});

		it('rejects an address two hex chars (one byte) too long', () => {
			expect(() => encodeData(`Q${'a'.repeat(130)}`)).toThrow();
		});
	});

	describe('prefix validation', () => {
		it('rejects a bare 128-hex-char body with no prefix', () => {
			expect(() => encodeData(abBody)).toThrow();
		});

		it('rejects a 0x-prefixed 64-byte hex string', () => {
			expect(() => encodeData(`0x${abBody}`)).toThrow();
		});

		it.each(['Z', 'X', '0', 'x'])('rejects the bad prefix %s', prefix => {
			expect(() => encodeData(`${prefix}${abBody}`)).toThrow();
		});

		it('rejects a lowercase "q" prefix, as go-qrl does (P4-L-44)', () => {
			// go-qrl's `hasQPrefix` accepts a capital `Q` only; the validator regex used to carry
			// the `i` flag and let `q…` through every address check while the node rejected it.
			expect(() => encodeData(`q${abBody}`)).toThrow();
		});

		it('emits the checksummed uppercase "Q" form on decode', () => {
			expect(decodeData(encodeData(`Q${abBody}`))).toBe(toChecksumAddress(`Q${abBody}`));
		});
	});

	describe('malformed input', () => {
		it.each([
			['empty string', ''],
			['just the prefix', 'Q'],
			['non-hex characters', `Q${'g'.repeat(128)}`],
			['embedded whitespace', `Q ${'a'.repeat(127)}`],
			['0x inside the body', `Q0x${'a'.repeat(126)}`],
		])('rejects %s', (_label, value) => {
			expect(() => encodeData(value)).toThrow();
		});

		it.each([
			// eslint-disable-next-line no-null/no-null
			['null', null],
			['undefined', undefined],
			['a number', 1234],
			['an object', {}],
			['an array', []],
		])('rejects %s', (_label, value) => {
			expect(() => encodeData(value as any)).toThrow();
		});
	});

	describe('case handling', () => {
		it('accepts an all-lowercase body (non-checksummed compatibility form)', () => {
			expect(encodeData(addr(abBody))).toBe(`0x${abBody}`);
		});

		it('accepts an all-uppercase body and normalises it to lowercase', () => {
			const upper = abBody.toUpperCase();
			// Same 64 bytes, so the same word must be written.
			expect(encodeData(addr(upper))).toBe(`0x${abBody}`);
		});

		it('encodes lowercase and uppercase forms of one address identically', () => {
			expect(encodeData(addr(abBody))).toBe(encodeData(addr(abBody.toUpperCase())));
		});

		it('accepts a correctly checksummed mixed-case body', () => {
			const checksummed = toChecksumAddress(addr(abBody));
			expect(encodeData(checksummed)).toBe(`0x${abBody}`);
		});

		it('rejects a mixed-case body whose checksum is wrong', () => {
			// Flip the case of exactly one hex letter in a valid checksummed
			// address. For the result to still be a valid checksum, SHAKE256 would
			// have to disagree at precisely that nibble and nowhere else -- so this
			// must be rejected.
			const checksummed = toChecksumAddress(addr(abBody));
			const i = checksummed.split('').findIndex((c, idx) => idx > 0 && /[a-f]/.test(c));
			expect(i).toBeGreaterThan(0);
			const flipped =
				checksummed.slice(0, i) + checksummed[i].toUpperCase() + checksummed.slice(i + 1);
			expect(flipped).not.toBe(checksummed);
			expect(() => encodeData(flipped)).toThrow();
		});

		it('always decodes to the checksummed form', () => {
			const checksummed = toChecksumAddress(addr(abBody));
			expect(checksummed).not.toBe(addr(abBody));
			expect(decodeData(encodeData(addr(abBody)))).toBe(checksummed);
			expect(decodeData(encodeData(checksummed))).toBe(checksummed);
		});
	});

	describe('error reporting', () => {
		it('reports the offending value and the parameter name', () => {
			expect(() => encodeData('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toThrow(
				/to|address/,
			);
		});
	});
});
