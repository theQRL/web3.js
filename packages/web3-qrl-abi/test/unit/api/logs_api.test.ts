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

import { AbiError } from '@theqrl/web3-errors';
import { AbiParameter } from '@theqrl/web3-types';
import { decodeLog } from '../../../src/api/logs_api';
import { encodeParameters } from '../../../src/api/parameters_api';
import { validDecodeLogsData } from '../../fixtures/data';

describe('logs_api', () => {
	describe('decodeLog', () => {
		it.each(['string', 'bytes', 'function', 'tuple', 'uint256[]'])(
			'returns the 32-byte hash for an indexed %s value',
			type => {
				const hash = `0x${'ab'.repeat(32)}`;
				const topic = `${hash}${'00'.repeat(32)}`;

				const decoded = decodeLog([{ name: 'value', type, indexed: true }], '0x', [topic]);

				expect(decoded.value).toBe(hash);
			},
		);

		it('decodes a fixed bytes value from a 64-byte indexed topic', () => {
			const value = `0x${'ab'.repeat(48)}`;
			const decoded = decodeLog([{ name: 'value', type: 'bytes48', indexed: true }], '0x', [
				`${value}${'00'.repeat(16)}`,
			]);

			expect(decoded.value).toBe(value);
		});

		describe('valid data', () => {
			it.each(validDecodeLogsData)(
				'should pass for valid values: %j',
				({ input: { abi, data, topics }, output }) => {
					const expected = decodeLog(abi, data, topics);
					expect(JSON.parse(JSON.stringify(expected))).toEqual(output);
				},
			);
		});
	});

	describe('missing topics', () => {
		const indexed = [{ indexed: true, name: 'from', type: 'address' }];

		it('throws an AbiError when the log has fewer topics than the event has indexed inputs', () => {
			expect(() => decodeLog(indexed, '0x', undefined as unknown as string[])).toThrow(
				AbiError,
			);
			expect(() => decodeLog(indexed, '0x', [])).toThrow(AbiError);
		});

		it('decodes non-indexed inputs when topics are absent', () => {
			const encoded = encodeParameters(['uint256'], [7]);
			const decoded = decodeLog(
				[{ indexed: false, name: 'value', type: 'uint256' }],
				encoded,
				undefined as unknown as string[],
			);
			expect(decoded.value).toBe(BigInt(7));
		});
	});

	describe('untrusted log shape and ABI names (L-34)', () => {
		const word = (n: number) => `0x${n.toString(16).padStart(128, '0')}`;
		const signature = `0x${'ab'.repeat(64)}`;
		const inputs = [
			{ type: 'uint256', name: 'a', indexed: true },
			{ type: 'uint256', name: 'b' },
		];
		const topicA = word(5);
		const topicB = word(6);
		const data = word(7);

		it('rejects inputs that are not an array with an AbiError', () => {
			expect(() => decodeLog('x' as unknown as AbiParameter[], data, [signature, topicA])).toThrow(
				AbiError,
			);
		});

		it.each(['', '0x', undefined, JSON.parse('null')])(
			'rejects empty data (%p) when the event has non-indexed inputs instead of returning undefined values',
			value => {
				expect(() => decodeLog(inputs, value as string, [signature, topicA])).toThrow(
					/log data is empty/,
				);
			},
		);

		it.each(['zz', 'ab', 123, {}, '0x0g'])('rejects data that is not a hex string (%p)', value => {
			expect(() => decodeLog(inputs, value as string, [signature, topicA])).toThrow(
				/must be a hex string/,
			);
		});

		it('accepts missing or empty data when the event has no non-indexed input', () => {
			for (const value of [undefined, '', '0x']) {
				const decoded = decodeLog([inputs[0]], value as string, [signature, topicA]);
				expect(decoded.a).toBe(BigInt(5));
				expect(decoded.__length__).toBe(1);
			}
		});

		it('rejects more topics than the event has indexed inputs instead of reading the wrong topic', () => {
			expect(() => decodeLog(inputs, data, [signature, topicA, topicB])).toThrow(
				/3 topics but the event has 1 indexed input/,
			);
			expect(decodeLog(inputs, data, [signature, topicA]).a).toBe(BigInt(5));
			expect(decodeLog(inputs, data, [topicA]).a).toBe(BigInt(5));
		});

		it('ignores the topics when the event has no indexed input', () => {
			// web3-qrl-contract decodes a log whose topic count does not match the event with an
			// empty input list and the full topic list.
			expect(decodeLog([], data, [signature, topicA, topicB])).toEqual({ __length__: 0 });
			expect(decodeLog([inputs[1]], data, [signature, topicA, topicB]).b).toBe(BigInt(7));
		});

		it('does not re-parent the result for an input named __proto__', () => {
			const decoded = decodeLog(
				[{ type: 'tuple', name: '__proto__', components: [{ type: 'uint256', name: 'x' }] }],
				data,
				[signature],
			);
			expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
			expect(Object.keys(decoded)).toEqual(['0', '__length__']);
			expect((decoded as { x?: unknown }).x).toBeUndefined();
			expect(decoded[0]).toMatchObject({ x: BigInt(7) });
		});

		it('keeps the counter intact for an input named __length__', () => {
			const decoded = decodeLog([{ type: 'uint256', name: '__length__' }], data, [signature]);
			expect(decoded.__length__).toBe(1);
			expect(decoded[0]).toBe(BigInt(7));
		});

		it('does not shadow Object.prototype members with a named parameter', () => {
			const decoded = decodeLog(
				[
					{ type: 'uint256', name: 'constructor', indexed: true },
					{ type: 'uint256', name: 'toString' },
				],
				data,
				[signature, topicA],
			);
			expect(typeof decoded.toString).toBe('function');
			expect(decoded.constructor).toBe(Object);
			expect(decoded[0]).toBe(BigInt(5));
			expect(decoded[1]).toBe(BigInt(7));
			expect(decoded.__length__).toBe(2);
		});

		it('still exposes ordinary names, including ones that are not Object.prototype members', () => {
			const decoded = decodeLog(
				[
					{ type: 'uint256', name: 'prototype', indexed: true },
					{ type: 'uint256', name: 'length' },
				],
				data,
				[signature, topicA],
			);
			expect(decoded.prototype).toBe(BigInt(5));
			expect(decoded.length).toBe(BigInt(7));
		});
	});
});
