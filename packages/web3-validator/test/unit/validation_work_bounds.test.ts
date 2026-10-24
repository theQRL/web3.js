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

import { Web3Validator } from '../../src/web3_validator';
import { Web3ValidatorError } from '../../src/errors';

const validator = new Web3Validator();
const schema = { type: 'array', items: { format: 'uint' } };

describe('validation work bounds (pass-5 audit)', () => {
	it('accepts large caller arrays without an implicit value-count limit', () => {
		const data = new Array(12_000).fill(1);
		expect(validator.validate(['uint256[]'], [data])).toBeUndefined();
		expect(validator.validateJSONSchema(schema, data)).toBeUndefined();
	});

	it('rejects oversized untrusted arrays before visiting elements when a budget is supplied', () => {
		const data = new Array(10_001).fill('bad');
		Object.defineProperty(data, 0, {
			get: () => {
				throw new Error('element was visited');
			},
		});
		expect(() => validator.validateJSONSchema(schema, data, { maxEntries: 10_000 })).toThrow(
			Web3ValidatorError,
		);
		expect(
			validator.validateJSONSchema(schema, data, {
				silent: true,
				maxEntries: 10_000,
			}),
		).toHaveLength(1);
	});

	it('shares an explicit budget across arguments and allows raising it', () => {
		const data = [new Array(6000).fill(1), new Array(6000).fill(2)];
		const types = ['uint256[]', 'uint256[]'];
		expect(validator.validate(types, data)).toBeUndefined();
		expect(() => validator.validate(types, data, { maxEntries: 10_000 })).toThrow(
			'Validation input exceeds 10000 entries',
		);
		expect(validator.validate(types, data, { maxEntries: 12_003 })).toBeUndefined();
	});

	it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
		'rejects an invalid explicit maxEntries (%s)',
		maxEntries => {
			expect(() => validator.validateJSONSchema(schema, [], { maxEntries })).toThrow(
				'maxEntries must be a positive safe integer',
			);
		},
	);

	it('caps diagnostics from an invalid array without an explicit budget', () => {
		const errors = validator.validateJSONSchema(schema, new Array(12_000).fill('bad'), {
			silent: true,
		});
		expect(errors).toHaveLength(100);
		expect(errors?.[0].keyword).not.toBe('validationBudget');
	});

	it('caps issue rendering and retained diagnostic entries', () => {
		const errors = Array.from({ length: 1000 }, () => ({
			keyword: 'test',
			instancePath: '',
			schemaPath: '',
			params: {},
			message: 'x'.repeat(10_000),
		}));
		const error = new Web3ValidatorError(errors);
		expect(error.errors).toHaveLength(100);
		expect(error.message.length).toBeLessThan(35_000);
		expect(error.message).toContain('900 more errors omitted');
	});
});
