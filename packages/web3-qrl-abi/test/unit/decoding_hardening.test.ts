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
import {
	decodeParameter,
	decodeParameters,
	encodeErrorSignature,
	encodeEventSignature,
	encodeParameter,
	encodeParameters,
} from '../../src';

const word = (hex: string) => hex.padStart(128, '0');

describe('decoding hardening (pass-4 audit)', () => {
	describe('nested decode errors surface eagerly (P4-L-32)', () => {
		it('throws for a non-canonical uint8 inside an array instead of returning a throwing getter', () => {
			const data = `0x${word('40')}${word('2')}${word('5')}${word('100')}`;
			expect(() => decodeParameters(['uint8[]'], data)).toThrow(AbiError);
		});

		it('throws for a bool array element that is not 0 or 1', () => {
			const data = `0x${word('40')}${word('1')}${word('2')}`;
			expect(() => decodeParameters(['bool[]'], data)).toThrow(AbiError);
		});

		it('still decodes a canonical array', () => {
			const data = `0x${word('40')}${word('2')}${word('5')}${word('7')}`;
			const decoded = decodeParameters(['uint8[]'], data);
			expect(decoded[0]).toEqual([BigInt(5), BigInt(7)]);
		});
	});

	describe('formatParam does not split a string into an array (P4-L-34)', () => {
		it('rejects a string for an array type', () => {
			expect(() => encodeParameter('uint8[]', '123')).toThrow(AbiError);
			expect(() => encodeParameters(['uint256[]'], ['1000'])).toThrow(AbiError);
			expect(() => encodeParameter('bool[]', '1100')).toThrow(AbiError);
		});

		it('still encodes real arrays', () => {
			expect(encodeParameter('uint8[]', ['1', '2', '3'])).toBe(
				`0x${word('40')}${word('3')}${word('1')}${word('2')}${word('3')}`,
			);
		});
	});

	describe('string round trip keeps a byte-order mark (P4-L-33)', () => {
		it('decodes exactly what was encoded', () => {
			expect(decodeParameter('string', encodeParameter('string', '﻿admin'))).toBe(
				'﻿admin',
			);
		});
	});
});

describe('decoded result shape (pass-4 informational, round 2)', () => {
	it('does not let an integer-like output name inflate __length__ or shadow a position', () => {
		const encoded = encodeParameters(['uint256'], [7]);
		const named = decodeParameters([{ type: 'uint256', name: '1' }], encoded);
		expect(named.__length__).toBe(1);
		expect(named[0]).toBe(BigInt(7));
		expect(Object.keys(named)).toEqual(['0', '__length__']);

		const hexName = decodeParameters([{ type: 'uint256', name: '0x0' }], encoded);
		expect(hexName.__length__).toBe(1);
		expect(hexName[0]).toBe(BigInt(7));
		expect(hexName['0x0']).toBe(BigInt(7));
	});

	it('does not let a second output named like the first position overwrite it', () => {
		const encoded = encodeParameters(['uint256', 'uint256'], [1, 2]);
		const decoded = decodeParameters(
			[
				{ type: 'uint256', name: 'x' },
				{ type: 'uint256', name: '0' },
			],
			encoded,
		);
		expect(decoded.__length__).toBe(2);
		expect(decoded[0]).toBe(BigInt(1));
		expect(decoded[1]).toBe(BigInt(2));
		expect(decoded.x).toBe(BigInt(1));
	});

	it('an output named __length__ stays reachable by position only (L-34)', () => {
		const encoded = encodeParameters(['uint256'], [9]);
		const decoded = decodeParameters([{ type: 'uint256', name: '__length__' }], encoded);
		expect(decoded.__length__).toBe(1);
		expect(decoded[0]).toBe(BigInt(9));
	});
});

describe('event topics are 64-byte QRVM topics (pass-4 informational, round 2)', () => {
	it('encodeEventSignature returns the keccak in the high 32 bytes of a 64-byte topic', () => {
		const topic = encodeEventSignature('Transfer(address,address,uint256)');
		expect(topic).toHaveLength(130);
		expect(topic.slice(0, 66)).toBe(
			'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
		);
		expect(topic.slice(66)).toBe('0'.repeat(64));
	});

	it('encodeErrorSignature keeps the 32-byte form whose first 4 bytes are the selector', () => {
		expect(encodeErrorSignature('Error(string)')).toHaveLength(66);
		expect(encodeErrorSignature('Error(string)').slice(0, 10)).toBe('0x08c379a0');
	});
});
