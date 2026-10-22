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
});
