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
import { QRLTypedData } from '@theqrl/web3-types';
import { getEncodedQRLTypedData } from '../../src/index';
import { erroneousTestData, testData } from '../fixtures/get_encoded_qrl_typed_data';

describe('getEncodedQRLTypedData', () => {
	it.each(testData)('%s', (_, typedData, hashEncodedData, expectedResponse) => {
		const encodedMessage = getEncodedQRLTypedData(typedData, hashEncodedData);
		expect(encodedMessage).toBe(expectedResponse);
	});

	it.each(erroneousTestData)('%s', (_, typedData, hashEncodedData, expectedError) => {
		expect(() => getEncodedQRLTypedData(typedData, hashEncodedData)).toThrow(expectedError);
	});
});

describe('getEncodedQRLTypedData: malformed payloads are rejected, not hashed (I-10, H-3)', () => {
	const domainTypes = [
		{ name: 'name', type: 'string' },
		{ name: 'version', type: 'string' },
		{ name: 'chainId', type: 'uint256' },
		{ name: 'verifyingContract', type: 'address' },
	];
	const domain = {
		name: 'Typed Data',
		version: '1',
		chainId: 1,
		verifyingContract: `Q${'ab'.repeat(64)}`,
	};
	const typedData = (fieldType: string, value: unknown): QRLTypedData => ({
		types: { QRLTypedDataDomain: domainTypes, T: [{ name: 'v', type: fieldType }] },
		primaryType: 'T',
		domain,
		message: { v: value },
	});
	const encode = (fieldType: string, value: unknown) =>
		getEncodedQRLTypedData(typedData(fieldType, value));

	it.each([
		['string', 5],
		['string', {}],
		['string', ['a']],
		['bytes', 'hello'],
		['bytes', '0x123'],
		['bytes', '0xzz'],
		['bytes', 7],
		['bool', 'false'],
		['bool', 'true'],
		['bool', 2],
		['uint8', 256],
		['address', '0x1234'],
	])('rejects %s = %p with an AbiError', (fieldType, value) => {
		expect(() => encode(fieldType, value)).toThrow(AbiError);
	});

	it('encodes JSON booleans and rejects numeric bool forms (P6-ABI-2)', () => {
		const asFalse = encode('bool', false);
		const asTrue = encode('bool', true);
		expect(asFalse).not.toBe(asTrue);
		for (const value of ['0', '0x0', 0, BigInt(0)]) {
			expect(() => encode('bool', value)).toThrow(AbiError);
		}
		for (const value of ['1', '0x1', 1, BigInt(1)]) {
			expect(() => encode('bool', value)).toThrow(AbiError);
		}
	});

	it('hashes bytes given as a Uint8Array like their hex form', () => {
		expect(encode('bytes', new Uint8Array([0x12, 0x34]))).toBe(encode('bytes', '0x1234'));
		expect(encode('bytes', '0x')).toBe(encode('bytes', new Uint8Array(0)));
	});

	it('still hashes a string that merely looks like hex as text', () => {
		expect(encode('string', '0x1234')).not.toBe(encode('bytes', '0x1234'));
	});

	it.each([
		['a missing primaryType', { ...typedData('uint256', 1), primaryType: undefined }],
		['a primaryType that is not in types', { ...typedData('uint256', 1), primaryType: 'Nope' }],
		[
			'a missing QRLTypedDataDomain type',
			{
				...typedData('uint256', 1),
				types: { EIP712Domain: domainTypes, T: [{ name: 'v', type: 'uint256' }] },
			},
		],
		['a missing domain', { ...typedData('uint256', 1), domain: undefined }],
		['a missing message', { ...typedData('uint256', 1), message: undefined }],
		['types that are not an object', { ...typedData('uint256', 1), types: 'T' }],
		['a non-object payload', undefined],
	])('rejects %s with an AbiError instead of a TypeError', (_, payload) => {
		expect(() => getEncodedQRLTypedData(payload as unknown as QRLTypedData)).toThrow(AbiError);
	});

	it('does not read a field named constructor from Object.prototype', () => {
		expect(() =>
			getEncodedQRLTypedData({
				types: {
					QRLTypedDataDomain: domainTypes,
					T: [{ name: 'constructor', type: 'string' }],
				},
				primaryType: 'T',
				domain,
				message: JSON.parse('{}'),
			}),
		).toThrow(/missing data for 'constructor'/);
		// With the data present the field is an ordinary string field.
		expect(
			getEncodedQRLTypedData({
				types: {
					QRLTypedDataDomain: domainTypes,
					T: [{ name: 'constructor', type: 'string' }],
				},
				primaryType: 'T',
				domain,
				message: { constructor: 'x' },
			}),
		).toMatch(/^0x1901[0-9a-f]{128}$/);
	});

	it('does not resolve a field type through Object.prototype', () => {
		expect(() => encode('constructor', { x: 1 })).toThrow(AbiError);
	});

	it('rejects a struct whose name is not an identifier instead of hashing "undefined()"', () => {
		expect(() =>
			getEncodedQRLTypedData({
				types: {
					QRLTypedDataDomain: domainTypes,
					'My Type': [{ name: 'x', type: 'uint256' }],
					T: [{ name: 'a', type: 'My Type' }],
				},
				primaryType: 'T',
				domain,
				message: { a: { x: 1 } },
			}),
		).toThrow(/invalid struct type 'My Type'/);
		expect(() =>
			getEncodedQRLTypedData({
				types: {
					QRLTypedDataDomain: domainTypes,
					'My Type': [{ name: 'x', type: 'uint256' }],
				},
				primaryType: 'My Type',
				domain,
				message: { x: 1 },
			}),
		).toThrow(/invalid struct type 'My Type'/);
	});

	it('rejects a struct field definition without a name or type', () => {
		expect(() =>
			getEncodedQRLTypedData({
				types: {
					QRLTypedDataDomain: domainTypes,
					T: [{ name: 'v' } as { name: string; type: string }],
				},
				primaryType: 'T',
				domain,
				message: { v: 1 },
			}),
		).toThrow(AbiError);
	});

	it('rejects a struct value that is not an object', () => {
		expect(() =>
			getEncodedQRLTypedData({
				types: {
					QRLTypedDataDomain: domainTypes,
					P: [{ name: 'x', type: 'uint256' }],
					T: [{ name: 'p', type: 'P' }],
				},
				primaryType: 'T',
				domain,
				message: { p: 5 },
			}),
		).toThrow(/expected an object for type 'P'/);
	});
});
