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

import { FormatterError } from '@theqrl/web3-errors';
import { MAX_NESTING_DEPTH, mergeDeep } from '../../src/objects';
import { mergeDeepData } from '../fixtures/objects';

describe('objects', () => {
	describe('mergeDeep', () => {
		it.each(mergeDeepData)('$message', ({ destination, sources, output }) => {
			const result = mergeDeep(destination, ...sources);

			expect(result).toEqual(output);
		});

		it('should not pollute Object.prototype via __proto__', () => {
			const untrusted = JSON.parse('{"__proto__":{"polluted":"yes"}}');
			const result = mergeDeep({}, untrusted) as Record<string, unknown>;
			expect(({} as Record<string, unknown>).polluted).toBeUndefined();
			expect(result.polluted).toBeUndefined();
		});

		it('should ignore constructor and prototype keys', () => {
			const untrusted = { constructor: { polluted: 'yes' }, prototype: { polluted: 'yes' } };
			mergeDeep({}, untrusted);
			expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		});

		it('should not mutate the sources', () => {
			const before = { a: undefined, b: true, c: new Uint8Array([1, 2, 3]) };
			const result = mergeDeep({}, before, {
				a: 3,
				d: 'string',
				e: { nested: BigInt(4) },
			}) as any;

			expect(before.a).toBeUndefined();
			expect(result.b).toBe(true);
			expect(result.c).toEqual(new Uint8Array([1, 2, 3]));
		});

		it('should not overwrite if undefined', () => {
			const result = mergeDeep(
				{},
				{ a: undefined, b: true, c: new Uint8Array([1, 2, 3]), f: 99 },
				{ a: 3, d: 'string', e: { nested: BigInt(4) }, f: undefined },
			) as any;

			expect(result.a).toBe(3);
			expect(result.b).toBe(true);
			expect(result.c).toEqual(new Uint8Array([1, 2, 3]));
			expect(result.d).toBe('string');
			expect(result.e).toEqual({ nested: BigInt(4) });
			expect(result.f).toBe(99);
		});

		it('should not merge array values', () => {
			const result = mergeDeep({}, { a: [1, 2] }, { a: [3, 4], b: [4, 5] }) as any;

			expect(result.a).toStrictEqual([3, 4]);
			expect(result.b).toStrictEqual([4, 5]);
		});

		it('should not merge typed array values', () => {
			const result = mergeDeep(
				{},
				{ a: new Uint8Array([1, 2]) },
				{ a: new Uint8Array([3, 4]), b: new Uint8Array([4, 5]) },
			) as any;

			expect(result.a).toStrictEqual(new Uint8Array([3, 4]));
			expect(result.b).toStrictEqual(new Uint8Array([4, 5]));
		});

		it('should duplicate array values', () => {
			const data = { a: new Uint8Array([1, 2]) };
			const result = mergeDeep({}, data) as any;

			// Mutate source object
			data.a[0] = 3;

			expect(result.a).toStrictEqual(new Uint8Array([1, 2]));
		});
	});

	describe('deep copies and depth bound', () => {
		it('copies the objects inside arrays instead of sharing them with the source (L-20)', () => {
			const element = { k: 1, nested: { deep: true }, bytes: new Uint8Array([1]) };
			const result = mergeDeep({}, { arr: [element, [element], 'x'] }) as {
				arr: [typeof element, [typeof element], string];
			};

			expect(result.arr[0]).toEqual(element);
			expect(result.arr[0]).not.toBe(element);
			expect(result.arr[0].nested).not.toBe(element.nested);
			expect(result.arr[0].bytes).not.toBe(element.bytes);
			expect(result.arr[1][0]).not.toBe(element);

			result.arr[0].k = 2;
			result.arr[0].nested.deep = false;
			expect(element).toEqual({ k: 1, nested: { deep: true }, bytes: new Uint8Array([1]) });
		});

		it('skips prototype-polluting keys inside array elements too', () => {
			const untrusted = JSON.parse('{"arr":[{"__proto__":{"polluted":"yes"},"a":1}]}');
			const result = mergeDeep({}, untrusted) as { arr: Record<string, unknown>[] };
			expect(({} as Record<string, unknown>).polluted).toBeUndefined();
			expect(Object.keys(result.arr[0])).toEqual(['a']);
		});

		it('accepts input nested exactly MAX_NESTING_DEPTH deep', () => {
			let data: Record<string, unknown> = { a: 1 };
			for (let i = 0; i < MAX_NESTING_DEPTH; i += 1) data = { n: data };
			expect(() => mergeDeep({}, data)).not.toThrow();
		});

		it('rejects input nested deeper than MAX_NESTING_DEPTH with a FormatterError instead of a RangeError (L-31)', () => {
			let data: Record<string, unknown> = { a: 1 };
			for (let i = 0; i < MAX_NESTING_DEPTH + 1; i += 1) data = { n: data };
			expect(() => mergeDeep({}, data)).toThrow(FormatterError);

			let hostile: Record<string, unknown> = { a: 1 };
			for (let i = 0; i < 100_000; i += 1) hostile = { n: hostile };
			expect(() => mergeDeep({}, hostile)).toThrow(FormatterError);

			let arrays: unknown = 1;
			for (let i = 0; i < 100_000; i += 1) arrays = [arrays];
			expect(() => mergeDeep({}, { arrays })).toThrow(FormatterError);
		});
	});
});
