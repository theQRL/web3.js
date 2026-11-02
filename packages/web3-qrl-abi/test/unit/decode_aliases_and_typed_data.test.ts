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
import { AbiParameter, QRLTypedData } from '@theqrl/web3-types';
import { decodeLog, decodeParameters, encodeParameters, getEncodedQRLTypedData } from '../../src';

describe('decoded aliases, log names and typed data (pass-5 audit)', () => {
	it('converts a deep named tuple once per value and preserves its named aliases', () => {
		let parameter: AbiParameter = { name: 'value', type: 'uint8' };
		for (let i = 0; i < 30; i += 1)
			parameter = { name: 'value', type: 'tuple', components: [parameter] };
		let decoded = decodeParameters([parameter], `0x${'07'.padStart(128, '0')}`);
		for (let i = 0; i < 30; i += 1) {
			expect(decoded.value).toBe(decoded[0]);
			decoded = decoded[0] as typeof decoded;
		}
		expect(decoded.value).toBe(BigInt(7));
	});

	it('keeps positional log values when another input is named 0', () => {
		const result = decodeLog(
			[
				{ name: 'a', type: 'uint8', indexed: true },
				{ name: '0', type: 'uint8' },
				{ name: 'c', type: 'uint8' },
			],
			encodeParameters(['uint8', 'uint8'], [7, 9]),
			[`0x${'05'.padStart(128, '0')}`],
		);
		expect(result[0]).toBe(BigInt(5));
		expect(result[1]).toBe(BigInt(7));
		expect(result.c).toBe(BigInt(9));
	});

	const typed = (type: string, value: unknown): QRLTypedData => ({
		types: {
			QRLTypedDataDomain: [{ name: 'name', type: 'string' }],
			Item: [{ name: 'value', type }],
		},
		primaryType: 'Item',
		domain: { name: 'test' },
		message: { value },
	});
	it.each([
		'uint8 x',
		'uint8[0]',
		'uint8[2]',
		'uint8[][]',
		'uint520',
		'bytes65',
		'Missing',
		'Item',
		'',
	])('rejects a type the go-qrl signer does not support: %s', type => {
		expect(() => getEncodedQRLTypedData(typed(type, []), true)).toThrow(AbiError);
	});
	it('rejects unsigned extra message fields, including nested fields', () => {
		const input = typed('uint8', 1);
		input.message.extra = 'not signed';
		expect(() => getEncodedQRLTypedData(input, true)).toThrow('extra data');
		const nested = typed('Child', { value: 1, extra: 'not signed' });
		nested.types.Child = [{ name: 'value', type: 'uint8' }];
		expect(() => getEncodedQRLTypedData(nested, true)).toThrow('extra data');
	});
	it.each([0, 1, '0', '1', '0x1', BigInt(0), BigInt(1)])(
		'rejects non-JSON booleans in typed data: %s',
		value => {
			expect(() => getEncodedQRLTypedData(typed('bool', value), true)).toThrow(
				'expected a boolean',
			);
		},
	);
	it.each([true, false])('accepts JSON booleans: %s', value => {
		expect(getEncodedQRLTypedData(typed('bool', value), true)).toMatch(/^0x[0-9a-f]{64}$/);
	});
	it('rejects empty and declared-but-empty domains', () => {
		let input = { ...typed('uint8', 1), domain: {} };
		input.types.QRLTypedDataDomain = [];
		expect(() => getEncodedQRLTypedData(input, true)).toThrow('domain is undefined');
		input.types.QRLTypedDataDomain = [
			{ name: 'name', type: 'string' },
			{ name: 'version', type: 'string' },
		];
		input = { ...input, domain: { name: '', version: '1' } };
		expect(() => getEncodedQRLTypedData(input, true)).toThrow('empty domain field');
	});
	it.each([{ value: [1, 2] }, { value: new Uint8Array([1, 2]) }, { value: Buffer.from([1, 2]) }])(
		'rejects byte-like integer values',
		({ value }) => {
			expect(() => encodeParameters(['uint256'], [value])).toThrow(AbiError);
			expect(() => encodeParameters(['int256'], [value])).toThrow(AbiError);
			expect(() => encodeParameters(['uint256[]'], [[value]])).toThrow(AbiError);
		},
	);
});
