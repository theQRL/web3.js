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
import { DEFAULT_RETURN_FORMAT } from '@theqrl/web3-types';
import {
	InvalidAddressError,
	InvalidTypeError,
	InvalidUnitError,
	ProviderError,
} from '@theqrl/web3-errors';
import {
	deepCopy,
	encodePacked,
	format,
	fromPlanck,
	hexToUtf8,
	hyperionSha3,
	MAX_TIMER_DELAY_MS,
	mergeDeep,
	pollTillDefinedAndReturnIntervalId,
	toHex,
	toPlanck,
	validateTimeout,
	Web3DeferredPromise,
} from '../../src';

describe('formatting, polling and converter hardening (pass-4 audit)', () => {
	describe('format (P4-M-6, null preservation, prototype keys)', () => {
		const blockLikeSchema = {
			type: 'object',
			properties: {
				number: { format: 'uint' },
				transactions: {
					oneOf: [
						{
							type: 'array',
							items: { type: 'object', properties: { hash: { format: 'bytes32' } } },
						},
						{ type: 'array', items: { format: 'bytes32' } },
					],
				},
				to: { oneOf: [{ format: 'address' }, { type: 'null' }] },
				blockNumber: { format: 'uint' },
			},
		};

		it('keeps an empty array under a oneOf of array schemas', () => {
			const formatted = format(
				blockLikeSchema,
				{ number: '0x10', transactions: [] },
				DEFAULT_RETURN_FORMAT,
			) as unknown as { transactions?: unknown[] };
			expect(formatted.transactions).toEqual([]);
		});

		it('still formats a non-empty array under the oneOf', () => {
			const hash = `0x${'ab'.repeat(32)}`;
			const formatted = format(
				blockLikeSchema,
				{ number: '0x10', transactions: [hash] },
				DEFAULT_RETURN_FORMAT,
			) as unknown as { transactions?: unknown[]; number: bigint };
			expect(formatted.transactions).toEqual([hash]);
			expect(formatted.number).toBe(BigInt(16));
		});

		it('keeps null members the node sent', () => {
			const formatted = format(
				blockLikeSchema,
				// eslint-disable-next-line no-null/no-null
				{ number: '0x1', to: null, blockNumber: null },
				DEFAULT_RETURN_FORMAT,
			) as unknown as Record<string, unknown>;
			// eslint-disable-next-line no-null/no-null -- the reply's nulls must survive
			expect(formatted).toEqual({ number: BigInt(1), to: null, blockNumber: null });
		});

		it('does not resolve a node-supplied key against Object.prototype', () => {
			const formatted = format(
				{ type: 'object', properties: { number: { format: 'uint' } } },
				{ number: '0x1', toString: 'x', constructor: 'y', hasOwnProperty: 'z' },
				DEFAULT_RETURN_FORMAT,
			) as unknown as Record<string, unknown>;
			expect(Object.keys(formatted)).toEqual(['number']);
		});
	});

	describe('deepCopy', () => {
		it('copies null and undefined members and shares nothing', () => {
			/* eslint-disable no-null/no-null -- the point of the copy is to keep a node's nulls */
			const source = { a: null, b: undefined, c: [{ d: null }], e: new Uint8Array([1]) };
			/* eslint-enable no-null/no-null */
			const copy = deepCopy(source);
			expect(copy).toEqual(source);
			expect(copy.c).not.toBe(source.c);
			expect(copy.c[0]).not.toBe(source.c[0]);
			expect(copy.e).not.toBe(source.e);
		});
	});

	describe('pollTillDefinedAndReturnIntervalId (P4-M-3)', () => {
		it('awaits a call slower than the interval instead of discarding its result', async () => {
			let calls = 0;
			const [result, intervalId] = pollTillDefinedAndReturnIntervalId(async () => {
				calls += 1;
				await new Promise(resolve => {
					setTimeout(resolve, 150);
				});
				return 'receipt';
			}, 50);
			await expect(result).resolves.toBe('receipt');
			clearInterval(intervalId);
			// The first call is still in flight when the next ticks fire; they are skipped.
			expect(calls).toBe(1);
		});

		it('keeps polling until the function returns a value', async () => {
			let calls = 0;
			const [result, intervalId] = pollTillDefinedAndReturnIntervalId(async () => {
				calls += 1;
				await Promise.resolve();
				return calls < 3 ? undefined : 'done';
			}, 20);
			await expect(result).resolves.toBe('done');
			clearInterval(intervalId);
			expect(calls).toBe(3);
		});
	});

	describe('units (P4-L-35)', () => {
		it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])(
			'rejects the Object.prototype member %s as a unit',
			unit => {
				expect(() => toPlanck('1', unit as never)).toThrow(InvalidUnitError);
				expect(() => fromPlanck('1000', unit as never)).toThrow(InvalidUnitError);
			},
		);

		it('still converts real units', () => {
			expect(toPlanck('1', 'quanta')).toBe(`1${'0'.repeat(18)}`);
			expect(fromPlanck('1000000000', 'shor')).toBe('1');
		});
	});

	describe('toHex (P4-L-37)', () => {
		const good = `Q${'ab'.repeat(64)}`;

		it('throws for an address-shaped string with a wrong checksum instead of hashing it as text', () => {
			const checksummed = toHex(good) && good; // all-lowercase form is a valid non-checksummed address
			expect(toHex(checksummed, true)).toBe('address');
			const mixedCaseTypo = `Q${'ab'.repeat(63)}AB`; // mixed case that is not the SHAKE256 checksum
			expect(() => toHex(mixedCaseTypo)).toThrow(InvalidAddressError);
			expect(() => toHex(`q${'ab'.repeat(64)}`)).toThrow(InvalidAddressError);
		});

		it('treats a signed non-hex string as text', () => {
			expect(toHex('-abc', true)).toBe('string');
			expect(toHex('-abc')).toBe('0x2d616263');
		});
	});

	describe('UTF-8 decoding keeps a byte-order mark (P4-L-33)', () => {
		it('hexToUtf8 does not drop a leading U+FEFF', () => {
			expect(hexToUtf8('0xefbbbf61')).toBe('﻿a');
		});
	});

	describe('packed encoding (P4-L-36, P4-L-42)', () => {
		it('packs strings as their raw UTF-8 bytes, NUL characters included', () => {
			expect(encodePacked({ t: 'string', v: '\0a' })).toBe('0x0061');
			expect(encodePacked({ t: 'string', v: 'a\0' })).toBe('0x6100');
			expect(encodePacked('\0a')).toBe('0x0061');
			expect(hyperionSha3({ t: 'string', v: '\0' })).toBe(
				'0xbc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a',
			);
		});

		it('rejects malformed type names and array values for scalar types', () => {
			expect(() => encodePacked({ t: 'uint8x', v: 1 })).toThrow(InvalidTypeError);
			expect(() => encodePacked({ t: 'int256[2]x', v: [1, 2, 3] })).toThrow(InvalidTypeError);
			expect(() => encodePacked({ t: 'bytes3x', v: '0x010203' })).toThrow(InvalidTypeError);
			expect(() => encodePacked({ t: 'uint', v: [1, 2] })).toThrow(InvalidTypeError);
		});

		it('still packs well-formed types', () => {
			expect(encodePacked({ t: 'uint8', v: 1 })).toBe('0x01');
			expect(encodePacked({ t: 'uint8[2]', v: [1, 2] })).toBe(
				`0x${'0'.repeat(126)}01${'0'.repeat(126)}02`,
			);
		});
	});

	describe('timer bounds (P4-L-5)', () => {
		it('accepts the longest delay a timer can hold and rejects anything above it', () => {
			expect(validateTimeout(MAX_TIMER_DELAY_MS, 'timeout')).toBe(MAX_TIMER_DELAY_MS);
			expect(() => validateTimeout(MAX_TIMER_DELAY_MS + 1, 'timeout')).toThrow(ProviderError);
			expect(() => validateTimeout(Number.MAX_SAFE_INTEGER, 'timeout')).toThrow(ProviderError);
		});

		it('Web3DeferredPromise refuses a timeout a timer cannot hold', () => {
			expect(
				() =>
					new Web3DeferredPromise({
						timeout: Number.MAX_SAFE_INTEGER,
						eagerStart: true,
						timeoutMessage: 'never',
					}),
			).toThrow(ProviderError);
		});
	});
});

/* eslint-disable no-null/no-null -- null is the value under test */
describe('typed errors and null members (pass-4 informational, round 2)', () => {
	it('encodePacked rejects null and undefined with InvalidTypeError', () => {
		expect(() => encodePacked(null as never)).toThrow(InvalidTypeError);
		expect(() => encodePacked(undefined as never)).toThrow(InvalidTypeError);
		expect(() => hyperionSha3(null as never)).toThrow(InvalidTypeError);
	});

	it('mergeDeep keeps null members and skips undefined ones', () => {
		expect(mergeDeep({}, { a: null, b: [{ c: null, d: 1 }], e: undefined })).toEqual({
			a: null,
			b: [{ c: null, d: 1 }],
		});
		expect(mergeDeep({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
		expect(mergeDeep({ a: 1 }, { a: null })).toEqual({ a: null });
	});
});
/* eslint-enable no-null/no-null */
