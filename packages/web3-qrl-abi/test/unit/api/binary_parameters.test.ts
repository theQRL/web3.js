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
import { decodeParameter, encodeParameter, encodeFunctionCall } from '../../../src';

describe.each([
	{ name: 'Uint8Array', createBytes: (bytes: number[]) => new Uint8Array(bytes) },
	{ name: 'Buffer', createBytes: (bytes: number[]) => Buffer.from(bytes) },
])('binary ABI arguments: $name', ({ createBytes }) => {
	it.each([
		{ type: 'bytes', bytes: [], hex: '0x', decoded: '0x' },
		{
			type: 'bytes',
			bytes: [0x00, 0x12, 0x80, 0xff, 0x00],
			hex: '0x001280ff00',
			decoded: '0x001280ff00',
		},
		{ type: 'bytes2', bytes: [0x12, 0x34], hex: '0x1234', decoded: '0x1234' },
		{
			type: 'bytes64',
			bytes: new Array<number>(64).fill(0xff),
			hex: `0x${'ff'.repeat(64)}`,
			decoded: `0x${'ff'.repeat(64)}`,
		},
	])(
		'encodes $type from $hex like the equivalent hex string',
		({ type, bytes, hex, decoded }) => {
			const input = createBytes(bytes);
			const encoded = encodeParameter(type, input);

			expect(encoded).toBe(encodeParameter(type, hex));
			expect(decodeParameter(type, encoded)).toBe(decoded);
			expect(Array.from(input)).toEqual(bytes);
		},
	);

	it.each(['bytes', 'bytes2'])('encodes only the selected bytes of a %s subarray', type => {
		const backing = createBytes([0xaa, 0x12, 0x34, 0xff]);
		const input = backing.subarray(1, 3);

		expect(encodeParameter(type, input)).toBe(encodeParameter(type, '0x1234'));
		expect(Array.from(backing)).toEqual([0xaa, 0x12, 0x34, 0xff]);
	});

	it.each(['bytes[]', 'bytes2[]', 'bytes[2]', 'bytes2[2]'])(
		'encodes binary members of %s without mutating the input',
		type => {
			const input = Object.freeze([createBytes([0x12, 0x34]), createBytes([0x56, 0x78])]);

			expect(encodeParameter(type, input)).toBe(encodeParameter(type, ['0x1234', '0x5678']));
			expect(input).toEqual([createBytes([0x12, 0x34]), createBytes([0x56, 0x78])]);
		},
	);

	it('encodes binary arguments using named function ABI inputs', () => {
		const abi = {
			type: 'function',
			name: 'store',
			inputs: [
				{ name: 'payload', type: 'bytes' },
				{ name: 'tag', type: 'bytes2' },
			],
		} as const;

		expect(
			encodeFunctionCall(abi, [createBytes([0x12, 0x34, 0xff]), createBytes([0x56, 0x78])]),
		).toBe(encodeFunctionCall(abi, ['0x1234ff', '0x5678']));
	});

	it.each([2, 64])('rejects a binary value exceeding the bytes%i width', size => {
		const input = createBytes(new Array<number>(size + 1).fill(0x12));

		expect(() => encodeParameter(`bytes${size}`, input)).toThrow(AbiError);
		expect(() => encodeParameter(`bytes${size}`, `0x${'12'.repeat(size + 1)}`)).toThrow(
			AbiError,
		);
	});

	it.each([2, 64])('rejects a binary value shorter than the bytes%i width', size => {
		const input = createBytes([0xab]);

		expect(() => encodeParameter(`bytes${size}`, input)).toThrow(AbiError);
		expect(() => encodeParameter(`bytes${size}`, '0xab')).toThrow(AbiError);
		expect(Array.from(input)).toEqual([0xab]);
	});

	it('rejects an empty fixed-byte value consistently with hex input', () => {
		expect(() => encodeParameter('bytes2', createBytes([]))).toThrow(AbiError);
		expect(() => encodeParameter('bytes2', '0x')).toThrow(AbiError);
	});
});
