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

import { isQRLTypedData } from '../../../src/validation/qrl_typed_data';
import { validator } from '../../../src/default_validator';

const validTypedData = {
	types: {
		QRLTypedDataDomain: [
			{ name: 'name', type: 'string' },
			{ name: 'version', type: 'string' },
			{ name: 'chainId', type: 'uint256' },
		],
		Message: [{ name: 'contents', type: 'string' }],
	},
	primaryType: 'Message',
	domain: { name: 'QRL', version: '1', chainId: 1 },
	message: { contents: 'hello' },
};

const clone = () => JSON.parse(JSON.stringify(validTypedData)) as Record<string, any>;

describe('validation', () => {
	describe('isQRLTypedData', () => {
		it('should accept a well-formed typed data object', () => {
			expect(isQRLTypedData(validTypedData)).toBe(true);
		});

		// eslint-disable-next-line no-null/no-null
		it.each([undefined, null, 'string', 42, true, [], () => undefined])(
			'should reject a non-object value: %s',
			value => {
				expect(isQRLTypedData(value)).toBe(false);
			},
		);

		it('should reject when types is missing', () => {
			const data = clone();
			delete data.types;
			expect(isQRLTypedData(data)).toBe(false);
		});

		it('should reject when types is not a plain object', () => {
			const data = clone();
			data.types = [];
			expect(isQRLTypedData(data)).toBe(false);
		});

		it('should reject when types.QRLTypedDataDomain is missing', () => {
			const data = clone();
			delete data.types.QRLTypedDataDomain;
			expect(isQRLTypedData(data)).toBe(false);
		});

		it('should reject when types.QRLTypedDataDomain is not an array', () => {
			const data = clone();
			data.types.QRLTypedDataDomain = {};
			expect(isQRLTypedData(data)).toBe(false);
		});

		it('should reject a type member that is not an object', () => {
			const data = clone();
			data.types.Message = ['contents'];
			expect(isQRLTypedData(data)).toBe(false);
		});

		it.each(['name', 'type'])('should reject a type member missing %s', field => {
			const data = clone();
			delete data.types.Message[0][field];
			expect(isQRLTypedData(data)).toBe(false);
		});

		it.each(['name', 'type'])('should reject a type member whose %s is empty', field => {
			const data = clone();
			data.types.Message[0][field] = '';
			expect(isQRLTypedData(data)).toBe(false);
		});

		it.each(['name', 'type'])('should reject a type member whose %s is not a string', field => {
			const data = clone();
			data.types.Message[0][field] = 42;
			expect(isQRLTypedData(data)).toBe(false);
		});

		it.each([undefined, '', 42, {}])('should reject primaryType: %s', primaryType => {
			const data = clone();
			data.primaryType = primaryType;
			expect(isQRLTypedData(data)).toBe(false);
		});

		it('should reject a primaryType that is not declared in types', () => {
			const data = clone();
			data.primaryType = 'NotDeclared';
			expect(isQRLTypedData(data)).toBe(false);
		});

		it.each(['domain', 'message'])('should reject when %s is missing', field => {
			const data = clone();
			delete data[field];
			expect(isQRLTypedData(data)).toBe(false);
		});

		it.each(['domain', 'message'])('should reject when %s is not a plain object', field => {
			const data = clone();
			data[field] = 'not-an-object';
			expect(isQRLTypedData(data)).toBe(false);
		});

		it('should accept unknown top-level keys', () => {
			const data = clone();
			data.someProviderExtension = { anything: true };
			expect(isQRLTypedData(data)).toBe(true);
		});
	});

	describe('qrlTypedData format wiring', () => {
		it('should pass validation for well-formed typed data', () => {
			expect(() => validator.validate(['qrlTypedData'], [validTypedData])).not.toThrow();
		});

		it('should throw Web3ValidatorError for malformed typed data', () => {
			const data = clone();
			delete data.types.QRLTypedDataDomain;
			expect(() => validator.validate(['qrlTypedData'], [data])).toThrow();
		});
	});
});
