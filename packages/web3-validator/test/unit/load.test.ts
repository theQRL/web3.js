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
import { Json, JsonSchema, ValidationSchemaInput } from '../..';

const abi = [
	{ indexed: true, internalType: 'address', name: 'from', type: 'address' },
	{ indexed: true, internalType: 'address', name: 'to', type: 'address' },
	{ indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
];

const abiJsonSchema = {
	type: 'array',
	items: [
		{ name: 'from', format: 'address' },
		{ name: 'to', format: 'address' },
		{ name: 'value', format: 'uint256' },
	],
};

const abiData = [
	'Qd5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72',
	'Qd5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72',
	'0xCB00CDE33a7a0Fba30C63745534F1f7Ae607076b',
];

const simpleSchema = {
	type: 'object',
	required: ['blockHash', 'blockNumber', 'from', 'to', 'data'],
	properties: {
		blockHash: {
			format: 'bytes32',
		},
		blockNumber: {
			format: 'uint',
		},
		from: {
			format: 'address',
		},
		to: {
			oneOf: [{ format: 'address' }, { type: 'null' }],
		},
		data: {
			format: 'bytes',
		},
	},
};

const simpleData = {
	blockHash: '0x0dec0518fa672a70027b04c286582e543ab17319fbdd384fa7bc8f3d5a542c0b',
	blockNumber: BigInt(2),
	from: 'Qd5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72',
	to: 'Qd5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72',
	data: '0xafea',
} as unknown as ValidationSchemaInput;

const createHugeSchema = (
	schema: JsonSchema,
	data: Json,
	n = 3,
): { schema: JsonSchema; data: Json } => {
	if (n > 0) {
		const { data: resultData, schema: resultSchema } = createHugeSchema(
			{ ...simpleSchema } as JsonSchema,
			{ ...simpleData } as Json,
			n - 1,
		);
		return {
			data: { ...(data as unknown as object), simple: resultData },
			schema: { ...schema, properties: { ...schema.properties, simple: resultSchema } },
		};
	}
	return {
		schema,
		data,
	};
};

const { schema: hugeSchema, data: hugeData } = createHugeSchema(
	{ ...simpleSchema } as JsonSchema,
	{ ...simpleData } as Json,
	500,
);

const { schema: hugeSchema1000, data: hugeData1000 } = createHugeSchema(
	{ ...simpleSchema } as JsonSchema,
	{ ...simpleData } as Json,
	1000,
);
describe('instance of validator', () => {
	let validator: Web3Validator;
	beforeAll(() => {
		validator = new Web3Validator();
	});

	it.each([
		[hugeSchema, hugeData],
		[hugeSchema1000, hugeData1000],
	])('rejects deeply nested inputs before schema traversal', (schema, data) => {
		expect(() => validator.validateJSONSchema(schema, data as object)).toThrow(
			'Validation input exceeds 64 nesting levels',
		);
	});

	it('accepts nested input within the traversal budget', () => {
		const { schema, data } = createHugeSchema(
			simpleSchema as JsonSchema,
			simpleData as Json,
			32,
		);
		expect(() => validator.validateJSONSchema(schema, data as object)).not.toThrow();
	});

	it('simple schema multiple times', () => {
		let t = 0;
		expect(() => {
			const t1 = Number(new Date());
			for (let i = 0; i < 500; i += 1) {
				validator.validateJSONSchema(simpleSchema, simpleData as object);
			}
			t = Number(new Date()) - t1;
		}).not.toThrow();
		expect(t).toBeLessThan(5000);
		expect(t).toBeGreaterThan(0);
	});

	it('simple schema 1000 times', () => {
		let t = 0;
		expect(() => {
			const t1 = Number(new Date());
			for (let i = 0; i < 1000; i += 1) {
				validator.validateJSONSchema(simpleSchema, simpleData as object);
			}
			t = Number(new Date()) - t1;
		}).not.toThrow();
		expect(t).toBeLessThan(15000);
		expect(t).toBeGreaterThan(0);
	});

	it('simple JSON schema 1000 times', () => {
		let t = 0;
		expect(() => {
			const t1 = Number(new Date());
			for (let i = 0; i < 1000; i += 1) {
				validator.validateJSONSchema(abiJsonSchema, abiData as object);
			}
			t = Number(new Date()) - t1;
		}).not.toThrow();
		expect(t).toBeLessThan(15000);
		expect(t).toBeGreaterThan(0);
	});

	it('simple ABI 1000 times', () => {
		let t = 0;
		expect(() => {
			const t1 = Number(new Date());
			for (let i = 0; i < 1000; i += 1) {
				validator.validate(abi, abiData);
			}
			t = Number(new Date()) - t1;
		}).not.toThrow();
		expect(t).toBeLessThan(10000);
		expect(t).toBeGreaterThan(0);
	});
});
