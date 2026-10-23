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
import {
	isAddressString,
	isHexString32Bytes,
	isHexString8Bytes,
	isNumber,
	isTopicInBloom,
	utils,
	validator,
	Web3ValidatorError,
} from '../../src';

const body = 'ab'.repeat(64);

describe('pass-4 regressions (web3-validator)', () => {
	describe('address prefix (P4-L-44)', () => {
		it('accepts the capital Q go-qrl requires, in lower, upper and checksum case bodies', () => {
			expect(isAddressString(`Q${body}`)).toBe(true);
			expect(isAddressString(`Q${body.toUpperCase()}`)).toBe(true);
		});

		it('rejects a lowercase q prefix', () => {
			expect(isAddressString(`q${body}`)).toBe(false);
			expect(isAddressString(`q${body}`, false)).toBe(false);
			expect(() => validator.validate(['address'], [`q${body}`])).toThrow(Web3ValidatorError);
		});
	});

	describe('validation error messages (P4-L-39)', () => {
		it('reports a bigint or a circular value with a typed error instead of a TypeError', () => {
			expect(() => validator.validate(['uint256'], [{ a: BigInt(5) }])).toThrow(
				Web3ValidatorError,
			);
			expect(() => validator.validate(['bytes'], [[BigInt(1)]])).toThrow(Web3ValidatorError);
			const circular: Record<string, unknown> = {};
			circular.self = circular;
			expect(() => validator.validate(['address'], [circular])).toThrow(Web3ValidatorError);
			// eslint-disable-next-line no-null/no-null
			expect(() => validator.validate(['bytes'], [null])).toThrow(
				'value "null" at "/0" must pass "bytes" validation',
			);
		});
	});

	describe('transformJsonDataToAbiFormat (P4-L-40)', () => {
		it('keeps every element of a three-dimensional tuple array', () => {
			const abi = [{ name: 'x', type: 'tuple[][][]', components: [{ name: 'a', type: 'uint8' }] }];
			const data = [
				[
					[
						[{ a: 1 }, { a: 2 }],
						[{ a: 3 }],
					],
					[[{ a: 4 }]],
				],
			];
			const transformed = utils.transformJsonDataToAbiFormat(abi as never, data);
			expect(transformed).toEqual([
				[
					[
						[[1], [2]],
						[[3]],
					],
					[[[4]]],
				],
			]);
			expect(() => validator.validate(abi as never, transformed)).not.toThrow();
		});
	});

	describe('isTopicInBloom (P4-L-41)', () => {
		const bloom = `0x${'f'.repeat(512)}`;

		it('gives the same answer for a prefixed and an unprefixed topic', () => {
			const topic = 'a'.repeat(128);
			expect(isTopicInBloom(bloom, `0x${topic}`)).toBe(true);
			expect(isTopicInBloom(bloom, topic)).toBe(true);
		});
	});

	describe('fixed-size hex predicates', () => {
		it('rejects a sign and enforces the exact length', () => {
			expect(isHexString32Bytes(`0x${'a'.repeat(64)}`)).toBe(true);
			expect(isHexString32Bytes(`-0x${'a'.repeat(63)}`)).toBe(false);
			expect(isHexString32Bytes(`0x${'a'.repeat(62)}`, false)).toBe(false);
			expect(isHexString32Bytes('a'.repeat(64), false)).toBe(true);
			expect(isHexString8Bytes(`0x${'a'.repeat(16)}`)).toBe(true);
			expect(isHexString8Bytes(`-${'a'.repeat(15)}`, false)).toBe(false);
		});
	});

	describe('decimal number regex', () => {
		it('rejects a long run of digits followed by a non-digit quickly', () => {
			const started = Date.now();
			expect(isNumber(`${'1'.repeat(40_000)}x`)).toBe(false);
			expect(Date.now() - started).toBeLessThan(200);
			expect(isNumber('1.5')).toBe(true);
			expect(isNumber('.5')).toBe(true);
			expect(isNumber('1.')).toBe(true);
		});
	});
});

describe('schema errors are typed (pass-4 informational, round 2)', () => {
	it('rejects an array schema without items with a Web3ValidatorError', () => {
		expect(() => validator.validateJSONSchema({ type: 'array' }, [1, 2])).toThrow(
			Web3ValidatorError,
		);
		expect(() => validator.validateJSONSchema({ type: 'array' }, [1, 2])).toThrow(
			/requires "items"/,
		);
	});

	it('rejects a tuple without components with a Web3ValidatorError', () => {
		expect(() =>
			validator.validate([{ name: 'a', type: 'tuple' } as never], [[1]]),
		).toThrow(Web3ValidatorError);
		expect(() =>
			validator.validate([{ name: 'a', type: 'tuple' } as never], [[1]]),
		).toThrow(/requires "components"/);
	});
});
