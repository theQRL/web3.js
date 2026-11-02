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
import { abiToJsonSchemaCases } from '../fixtures/abi_to_json_schema';
import { Web3Validator } from '../../src/web3_validator';
import { Web3ValidatorError } from '../../src/errors';
import { validNotBaseTypeData } from '../fixtures/validation';

describe('web3-validator', () => {
	describe('Web3Validator', () => {
		let validator: Web3Validator;

		beforeEach(() => {
			validator = new Web3Validator();
		});

		it('should initialize the validator', () => {
			expect(validator['_validator']).toBeDefined();
		});

		describe('validate', () => {
			it('should pass for valid data', () => {
				expect(validator.validate(['uint'], [1])).toBeUndefined();
			});

			it('should raise error with empty value', () => {
				expect(() => validator.validate(['string'], [])).toThrow(
					'must NOT have fewer than 1 items',
				);
			});

			it('should raise error with less value', () => {
				expect(() => validator.validate(['string', 'string'], ['value'])).toThrow(
					'must NOT have fewer than 2 items',
				);
			});

			it('should raise error with more value', () => {
				expect(() => validator.validate(['string'], ['value', 'value2'])).toThrow(
					'must NOT have more than 1 items',
				);
			});

			it('should raise error by default', () => {
				expect(() => validator.validate(['uint'], [-1])).toThrow(
					'Web3 validator found 1 error[s]:\nvalue "-1" at "/0" must pass "uint" validation',
				);
			});

			it('should return errors if set silent', () => {
				expect(validator.validate(['uint'], [-1], { silent: true })).toEqual([
					{
						instancePath: '/0',
						keyword: '0',
						message: 'value "-1" at "/0" must pass "uint" validation',
						params: { value: -1 },
						schemaPath: '#0',
					},
				]);
			});

			it('should return undefined for empty schema and empty data', () => {
				expect(validator.validate([], [])).toBeUndefined();
			});

			it('should return error is schema is empty but data no', () => {
				const data = [1];
				const testFunction = () => {
					validator.validate([], data);
				};
				expect(testFunction).toThrow('empty schema against data can not be validated');

				expect(testFunction).toThrow(Web3ValidatorError);
			});

			it.each(validNotBaseTypeData)(
				'should pass for valid non base type data %s',
				({ dataType, data }: { dataType: string; data: any }) => {
					expect(validator.validate([dataType], [data])).toBeUndefined();
				},
			);

			// Using "null" value intentionally for validation
			// eslint-disable-next-line no-null/no-null
			it.each([['uintt'], ['bytesabc'], ['uint8x'], [null], [5], [undefined]])(
				'throws a Web3ValidatorError, not a TypeError, for the schema entry %j (L-26)',
				entry => {
					expect(() => validator.validate([entry as never], [1])).toThrow(Web3ValidatorError);
				},
			);

			it('should add id if empty', () => {
				expect(
					validator.validate(
						[{ name: '', type: 'address' }],
						['Qd5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72'],
					),
				).toBeUndefined();
			});
		});

		describe('fixed size arrays', () => {
			it('should pass for exactly the declared number of items', () => {
				expect(validator.validate(['uint256[3]'], [[1, 2, 3]])).toBeUndefined();
			});

			it('should raise error with fewer items than declared', () => {
				expect(() => validator.validate(['uint256[3]'], [[1, 2]])).toThrow(
					'must NOT have fewer than 3 items',
				);
			});

			it('should raise error with more items than declared', () => {
				expect(() => validator.validate(['uint256[3]'], [[1, 2, 3, 4]])).toThrow(
					'must NOT have more than 3 items',
				);
			});

			it('should not constrain the length of a dynamic array', () => {
				expect(validator.validate(['uint256[]'], [[]])).toBeUndefined();
				expect(validator.validate(['uint256[]'], [[1]])).toBeUndefined();
				expect(validator.validate(['uint256[]'], [[1, 2, 3, 4, 5]])).toBeUndefined();
			});

			it('should enforce the declared size for a fixed size array of tuples', () => {
				const abi = [
					{
						name: 'a',
						type: 'tuple[2]',
						components: [
							{ name: 'a1', type: 'uint' },
							{ name: 'a2', type: 'string' },
						],
					},
				];

				expect(
					validator.validate(abi, [
						[
							[1, 'a'],
							[2, 'b'],
						],
					]),
				).toBeUndefined();

				expect(() => validator.validate(abi, [[[1, 'a']]])).toThrow(
					'must NOT have fewer than 2 items',
				);
				expect(() =>
					validator.validate(abi, [
						[
							[1, 'a'],
							[2, 'b'],
							[3, 'c'],
						],
					]),
				).toThrow('must NOT have more than 2 items');
			});

			it('should not constrain the length of a dynamic array of tuples', () => {
				const abi = [
					{
						name: 'a',
						type: 'tuple[]',
						components: [
							{ name: 'a1', type: 'uint' },
							{ name: 'a2', type: 'string' },
						],
					},
				];

				expect(validator.validate(abi, [[[1, 'a']]])).toBeUndefined();
				expect(
					validator.validate(abi, [
						[
							[1, 'a'],
							[2, 'b'],
							[3, 'c'],
						],
					]),
				).toBeUndefined();
			});

			// `uint256[2][]` is a dynamic array of `uint256[2]`, so only the inner
			// dimension of 2 is constrained.
			it('should enforce the inner dimension of a nested array', () => {
				expect(() => validator.validate(['uint256[2][]'], [[[1, 2, 3]]])).toThrow(
					'must NOT have more than 2 items',
				);
				expect(() => validator.validate(['uint256[2][]'], [[[1]]])).toThrow(
					'must NOT have fewer than 2 items',
				);
			});

			it('should not constrain the inner dimension of a dynamic nested array', () => {
				expect(validator.validate(['uint256[][]'], [[[1, 2, 3]]])).toBeUndefined();
				expect(validator.validate(['uint256[2][]'], [[[1, 2]]])).toBeUndefined();
			});
		});

		// Solidity reverses the usual array notation: `T[k][n]` is an array of `n`
		// elements of type `T[k]`, so the rightmost size is the *outer* dimension.
		// See https://docs.soliditylang.org/en/latest/types.html#arrays
		describe('multi dimensional arrays', () => {
			it('should pass for correctly shaped data', () => {
				// 3 outer elements, each of 2 uints.
				expect(
					validator.validate(
						['uint256[2][3]'],
						[
							[
								[1, 1],
								[2, 2],
								[3, 3],
							],
						],
					),
				).toBeUndefined();
			});

			it('should raise error with fewer items than declared in the outer dimension', () => {
				expect(() =>
					validator.validate(
						['uint256[2][3]'],
						[
							[
								[1, 1],
								[2, 2],
							],
						],
					),
				).toThrow('must NOT have fewer than 3 items');
			});

			it('should raise error with more items than declared in the outer dimension', () => {
				expect(() =>
					validator.validate(
						['uint256[2][3]'],
						[
							[
								[1, 1],
								[2, 2],
								[3, 3],
								[4, 4],
							],
						],
					),
				).toThrow('must NOT have more than 3 items');
			});

			it('should raise error with the wrong number of items in the inner dimension', () => {
				expect(() =>
					validator.validate(
						['uint256[2][3]'],
						[
							[
								[1, 1, 1],
								[2, 2, 2],
								[3, 3, 3],
							],
						],
					),
				).toThrow('must NOT have more than 2 items');

				expect(() =>
					validator.validate(['uint256[2][3]'], [[[1], [2], [3]]]),
				).toThrow('must NOT have fewer than 2 items');
			});

			// `uint256[][3]` is 3 elements of type `uint256[]`: outer fixed, inner free.
			it('should enforce only the outer dimension of `T[][3]`', () => {
				expect(
					validator.validate(['uint256[][3]'], [[[1], [1, 2], [1, 2, 3]]]),
				).toBeUndefined();

				expect(() => validator.validate(['uint256[][3]'], [[[1], [1, 2]]])).toThrow(
					'must NOT have fewer than 3 items',
				);
				expect(() =>
					validator.validate(['uint256[][3]'], [[[1], [1, 2], [1, 2, 3], [1]]]),
				).toThrow('must NOT have more than 3 items');
			});

			// `uint256[2][]` is a dynamic array of `uint256[2]`: outer free, inner fixed.
			it('should enforce only the inner dimension of `T[2][]`', () => {
				expect(validator.validate(['uint256[2][]'], [[]])).toBeUndefined();
				expect(
					validator.validate(
						['uint256[2][]'],
						[
							[
								[1, 1],
								[2, 2],
								[3, 3],
								[4, 4],
							],
						],
					),
				).toBeUndefined();

				expect(() =>
					validator.validate(
						['uint256[2][]'],
						[
							[
								[1, 1],
								[2, 2, 2],
							],
						],
					),
				).toThrow('must NOT have more than 2 items');
			});

			it('should enforce both dimensions of a nested array of tuples', () => {
				const abi = [
					{
						name: 'a',
						type: 'tuple[2][3]',
						components: [
							{ name: 'a1', type: 'uint' },
							{ name: 'a2', type: 'string' },
						],
					},
				];

				const pair = [
					[1, 'a'],
					[2, 'b'],
				];

				expect(validator.validate(abi, [[pair, pair, pair]])).toBeUndefined();

				// Outer dimension is 3.
				expect(() => validator.validate(abi, [[pair, pair]])).toThrow(
					'must NOT have fewer than 3 items',
				);

				// Inner dimension is 2.
				expect(() =>
					validator.validate(abi, [[[[1, 'a']], [[1, 'a']], [[1, 'a']]]]),
				).toThrow('must NOT have fewer than 2 items');
			});

			it('should not confuse the argument count with an array dimension', () => {
				// The argument list holds 2 arguments while the first argument declares an
				// outer dimension of 3. Both constraints must be applied independently.
				expect(
					validator.validate(
						['uint256[2][3]', 'bool'],
						[
							[
								[1, 1],
								[2, 2],
								[3, 3],
							],
							true,
						],
					),
				).toBeUndefined();
			});
		});
		describe('validateJsonSchema', () => {
			// The ABI-to-JSON schemas represent tuples as positional arrays (`z.tuple`),
			// so valid data must be supplied in the ABI (array) form. `abi.data` is that
			// form; `json.data` is the decoded *object* representation and is not a valid
			// input for these array-based schemas.
			it.each(abiToJsonSchemaCases)('should pass for valid data', testCase => {
				expect(
					validator.validateJSONSchema(testCase.json.fullSchema, testCase.abi.data),
				).toBeUndefined();
			});

			it.each(['nope', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
				'rejects the unknown format %j with a Web3ValidatorError (L-26, I-11)',
				format => {
					expect(() => validator.validateJSONSchema({ format }, 'anything' as unknown as object)).toThrow(
						Web3ValidatorError,
					);
					expect(() => validator.validateJSONSchema({ format }, 'anything' as unknown as object)).toThrow(
						`Unknown format "${format}"`,
					);
				},
			);

			it('should throw', () => {
				expect(() => {
					validator.validateJSONSchema(
						{
							type: 'array',
							items: [{ $id: 'a', required: true, format: 'uint' }],
							minItems: 1,
							maxItems: 1,
						},
						[],
					);
				}).toThrow(Web3ValidatorError);
			});
			it('should return errors on silent', () => {
				expect(
					validator.validateJSONSchema(
						{
							type: 'array',
							items: [{ $id: 'a', format: 'uint' }],
							minItems: 1,
							maxItems: 1,
						},
						[],
						{ silent: true },
					),
				).toMatchObject([
					{
						instancePath: '',
						schemaPath: '#/minItems',
						keyword: 'minItems',
						params: { limit: 1 },
						message: 'must NOT have fewer than 1 items',
					},
				]);
			});
		});
	});
});

describe('array element types keep their declared size (pass-3 residual)', () => {
	const validator = new Web3Validator();

	it('rejects bytes32[] elements that are not exactly 32 bytes', () => {
		expect(() => validator.validate(['bytes32[]'], [['0xabababab']])).toThrow(Web3ValidatorError);
		expect(() => validator.validate(['bytes32[]'], [[`0x${'ab'.repeat(33)}`]])).toThrow(
			Web3ValidatorError,
		);
		expect(validator.validate(['bytes32[]'], [[`0x${'ab'.repeat(32)}`]])).toBeUndefined();
	});

	it('rejects uint8[] elements above 255 and validates nested fixed dimensions', () => {
		expect(() => validator.validate(['uint8[]'], [[300]])).toThrow(Web3ValidatorError);
		expect(() => validator.validate(['uint8[2][]'], [[[256, 0]]])).toThrow(Web3ValidatorError);
		expect(validator.validate(['uint8[2][]'], [[[255, 0]]])).toBeUndefined();
	});

	it('still accepts unsized uint[] elements up to 256 bits', () => {
		expect(
			validator.validate(['uint[]'], [[BigInt(2) ** BigInt(256) - BigInt(1)]]),
		).toBeUndefined();
		expect(() => validator.validate(['uint[]'], [[BigInt(2) ** BigInt(256)]])).toThrow(
			Web3ValidatorError,
		);
	});
});
