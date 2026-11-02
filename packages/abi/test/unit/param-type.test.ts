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

import { FormatTypes, ParamType } from '../../src/fragments.js';

describe('ParamType', () => {
	describe('fromString: simple types', () => {
		it.each(['address', 'bool', 'string', 'bytes', 'uint512', 'int8', 'bytes64'])(
			'parses %s with itself as the base type',
			type => {
				const param = ParamType.from(type);
				expect(param.type).toBe(type);
				expect(param.baseType).toBe(type);
				expect(param.name).toBeNull();
				expect(param.components).toBeNull();
				expect(param.arrayLength).toBeNull();
				expect(param.arrayChildren).toBeNull();
			},
		);

		it('parses a named parameter', () => {
			const param = ParamType.from('address owner');
			expect(param.type).toBe('address');
			expect(param.name).toBe('owner');
		});

		it('marks a parameter as ParamType', () => {
			expect(ParamType.isParamType(ParamType.from('address'))).toBe(true);
			expect(ParamType.isParamType({ type: 'address' })).toBe(false);
		});

		it('is frozen', () => {
			expect(Object.isFrozen(ParamType.from('address'))).toBe(true);
		});

		it('returns the same instance when given a ParamType', () => {
			const param = ParamType.from('address');
			expect(ParamType.from(param)).toBe(param);
		});
	});

	describe('fromString: arrays', () => {
		it('parses a fixed-length array', () => {
			const param = ParamType.from('uint512[3]');
			expect(param.baseType).toBe('array');
			expect(param.arrayLength).toBe(3);
			expect(param.arrayChildren.type).toBe('uint512');
		});

		it('parses a dynamic array with length -1', () => {
			const param = ParamType.from('uint512[]');
			expect(param.baseType).toBe('array');
			expect(param.arrayLength).toBe(-1);
			expect(param.arrayChildren.type).toBe('uint512');
		});

		it('peels the OUTERMOST dimension first for a nested array', () => {
			// "uint512[3][4]" is 4 elements, each of which is uint512[3].
			const param = ParamType.from('uint512[3][4]');
			expect(param.arrayLength).toBe(4);
			expect(param.arrayChildren.type).toBe('uint512[3]');
			expect(param.arrayChildren.arrayLength).toBe(3);
			expect(param.arrayChildren.arrayChildren.type).toBe('uint512');
		});

		it('parses a dynamic array of fixed arrays', () => {
			const param = ParamType.from('uint512[3][]');
			expect(param.arrayLength).toBe(-1);
			expect(param.arrayChildren.arrayLength).toBe(3);
		});

		it('parses an array of addresses', () => {
			const param = ParamType.from('address[]');
			expect(param.arrayChildren.baseType).toBe('address');
		});
	});

	describe('fromString: tuples', () => {
		it('parses an unnamed tuple', () => {
			const param = ParamType.from('tuple(uint512,address)');
			expect(param.baseType).toBe('tuple');
			expect(param.components).toHaveLength(2);
			expect(param.components[0].type).toBe('uint512');
			expect(param.components[1].type).toBe('address');
		});

		it('parses a tuple with named components', () => {
			const param = ParamType.from('tuple(uint512 amount, address to)');
			expect(param.components[0].name).toBe('amount');
			expect(param.components[1].name).toBe('to');
		});

		it('parses a bare parenthesised tuple', () => {
			const param = ParamType.from('(uint512,address)');
			expect(param.baseType).toBe('tuple');
			expect(param.components).toHaveLength(2);
		});

		it('parses a nested tuple', () => {
			const param = ParamType.from('tuple(uint512 a, tuple(bool b, string c) inner)');
			expect(param.components).toHaveLength(2);
			expect(param.components[1].baseType).toBe('tuple');
			expect(param.components[1].name).toBe('inner');
			expect(param.components[1].components).toHaveLength(2);
		});

		it('parses a tuple array', () => {
			const param = ParamType.from('tuple(uint512 a)[2]');
			expect(param.baseType).toBe('array');
			expect(param.arrayLength).toBe(2);
			expect(param.arrayChildren.baseType).toBe('tuple');
			expect(param.arrayChildren.components[0].name).toBe('a');
		});

		it('parses "tuple()" as a tuple holding one empty-typed (null) component', () => {
			// Inherited ethers quirk: the parser cannot distinguish "no components"
			// from "one component with an empty type", so an empty tuple comes back
			// with a single null component rather than zero components. This is what
			// the '' case in AbiCoder._getCoder / NullCoder exists to absorb.
			const param = ParamType.from('tuple()');
			expect(param.baseType).toBe('tuple');
			expect(param.components).toHaveLength(1);
			expect(param.components[0].type).toBe('');
			expect(param.components[0].baseType).toBe('');
		});
	});

	describe('fromObject', () => {
		it('builds from an object form', () => {
			const param = ParamType.from({ type: 'uint512', name: 'amount' });
			expect(param.type).toBe('uint512');
			expect(param.name).toBe('amount');
		});

		it('builds a tuple from components', () => {
			const param = ParamType.from({
				type: 'tuple',
				name: 'order',
				components: [
					{ type: 'address', name: 'to' },
					{ type: 'uint512', name: 'value' },
				],
			});
			expect(param.baseType).toBe('tuple');
			expect(param.name).toBe('order');
			expect(param.components).toHaveLength(2);
			expect(param.components[0].name).toBe('to');
		});

		it('builds a tuple array from components', () => {
			const param = ParamType.from({
				type: 'tuple[]',
				components: [{ type: 'address' }],
			});
			expect(param.baseType).toBe('array');
			expect(param.arrayLength).toBe(-1);
			expect(param.arrayChildren.baseType).toBe('tuple');
		});

		it('preserves indexed', () => {
			expect(ParamType.from({ type: 'address', indexed: true }).indexed).toBe(true);
			expect(ParamType.from({ type: 'address', indexed: false }).indexed).toBe(false);
		});
	});

	describe('indexed', () => {
		it('parses an indexed parameter when allowed', () => {
			const param = ParamType.from('address indexed owner', true);
			expect(param.indexed).toBe(true);
			expect(param.name).toBe('owner');
		});

		it('rejects an indexed parameter when not allowed', () => {
			expect(() => ParamType.from('address indexed owner', false)).toThrow();
		});
	});

	describe('format round-trips', () => {
		it.each([
			'address',
			'uint512',
			'bytes32',
			'uint512[]',
			'uint512[3]',
			'uint512[3][4]',
			'address[]',
		])('sighash-formats %s back to itself', type => {
			expect(ParamType.from(type).format(FormatTypes.sighash)).toBe(type);
		});

		it('defaults to the sighash format', () => {
			expect(ParamType.from('uint512').format()).toBe('uint512');
		});

		it('drops the "tuple" keyword and names in the sighash format', () => {
			expect(ParamType.from('tuple(uint512 a, address b)').format(FormatTypes.sighash)).toBe(
				'(uint512,address)',
			);
		});

		it('keeps the "tuple" keyword but drops names in the minimal format', () => {
			expect(ParamType.from('tuple(uint512 a, address b)').format(FormatTypes.minimal)).toBe(
				'tuple(uint512,address)',
			);
		});

		it('keeps the "tuple" keyword and names in the full format', () => {
			expect(ParamType.from('tuple(uint512 a, address b)').format(FormatTypes.full)).toBe(
				'tuple(uint512 a, address b)',
			);
		});

		it('includes the name only in the full format', () => {
			const param = ParamType.from('address owner');
			expect(param.format(FormatTypes.full)).toBe('address owner');
			expect(param.format(FormatTypes.minimal)).toBe('address');
			expect(param.format(FormatTypes.sighash)).toBe('address');
		});

		it('includes "indexed" in the minimal and full formats but not sighash', () => {
			const param = ParamType.from('address indexed owner', true);
			expect(param.format(FormatTypes.full)).toBe('address indexed owner');
			expect(param.format(FormatTypes.minimal)).toBe('address indexed');
			expect(param.format(FormatTypes.sighash)).toBe('address');
		});

		it('formats a tuple array', () => {
			expect(ParamType.from('tuple(uint512 a)[2]').format(FormatTypes.full)).toBe(
				'tuple(uint512 a)[2]',
			);
			expect(ParamType.from('tuple(uint512 a)[2]').format(FormatTypes.sighash)).toBe(
				'(uint512)[2]',
			);
		});

		it('formats a nested tuple', () => {
			const type = 'tuple(uint512 a, tuple(bool b) inner)';
			expect(ParamType.from(type).format(FormatTypes.full)).toBe(type);
		});

		it('rejects an unknown format type', () => {
			expect(() => ParamType.from('address').format('bogus')).toThrow(/invalid format/);
		});
	});

	describe('string <-> object round-trips', () => {
		it.each([
			'address',
			'uint512',
			'uint512[]',
			'uint512[3]',
			'tuple(uint512 a, address b)',
			'tuple(uint512 a, tuple(bool b) inner)',
			'tuple(uint512 a)[]',
		])('string -> JSON -> object -> string is stable for %s', type => {
			const fromString = ParamType.from(type);
			const json = JSON.parse(fromString.format(FormatTypes.json));
			const fromObject = ParamType.from(json);
			expect(fromObject.format(FormatTypes.full)).toBe(fromString.format(FormatTypes.full));
			expect(fromObject.baseType).toBe(fromString.baseType);
			expect(fromObject.type).toBe(fromString.type);
		});

		it('emits "tuple" as the JSON type for a tuple', () => {
			const json = JSON.parse(ParamType.from('tuple(uint512 a)').format(FormatTypes.json));
			expect(json.type).toBe('tuple');
			expect(json.components).toHaveLength(1);
			expect(json.components[0]).toEqual({ type: 'uint512', name: 'a' });
		});

		it('omits a missing name from the JSON form', () => {
			const json = JSON.parse(ParamType.from('uint512').format(FormatTypes.json));
			expect(json).toEqual({ type: 'uint512' });
		});

		it('includes indexed in the JSON form only when it is a boolean', () => {
			const indexed = JSON.parse(
				ParamType.from('address indexed a', true).format(FormatTypes.json),
			);
			expect(indexed.indexed).toBe(true);
			const plain = JSON.parse(ParamType.from('address a').format(FormatTypes.json));
			expect('indexed' in plain).toBe(false);
		});
	});

	describe('construction guard', () => {
		it('cannot be constructed directly', () => {
			// eslint-disable-next-line no-null/no-null
			expect(() => new (ParamType as any)(null, { type: 'address' })).toThrow(/fromString/);
		});
	});

	describe('malformed input', () => {
		it.each(['tuple(uint512', 'uint512]', 'uint512[[]', '(', ')', 'uint512 name extra'])(
			'rejects %s',
			type => {
				expect(() => ParamType.from(type)).toThrow();
			},
		);
	});

	describe('untrusted type strings and ABI JSON (L-35, M-10, I-10)', () => {
		it('rejects whitespace inside array brackets instead of parsing a dynamic array named by the digits (L-35)', () => {
			expect(ParamType.from('uint256[2]').arrayLength).toBe(2);
			expect(ParamType.from('uint256[2]').name).toBeNull();
			expect(() => ParamType.from('uint256[ 2]')).toThrow(/unexpected character/);
			expect(() => ParamType.from('uint256[2 ]')).toThrow(/unexpected character/);
			expect(() => ParamType.from('uint256[\t2]')).toThrow(/unexpected character/);
			expect(() => ParamType.from('uint256[ ]')).toThrow(/unexpected character/);
			expect(() => ParamType.from('tuple(uint256[ 2] a)')).toThrow(/unexpected character/);
			expect(() => ParamType.from('uint256[2][ 3]')).toThrow(/unexpected character/);
		});

		it('still accepts whitespace around names and before a bracket', () => {
			expect(ParamType.from('uint256[2] values').name).toBe('values');
			expect(ParamType.from('uint256 [2]').arrayLength).toBe(2);
		});

		it('rejects a fixed length that is not a safe integer below 2^32 (M-10)', () => {
			expect(() => ParamType.from('uint256[99999999999999999999]')).toThrow(
				/array length out-of-bounds/,
			);
			expect(() => ParamType.from('uint256[4294967296]')).toThrow(
				/array length out-of-bounds/,
			);
			expect(() => ParamType.fromObject({ type: 'uint8[9007199254740993]' })).toThrow(
				/array length out-of-bounds/,
			);
			expect(() => ParamType.from('uint8[4294967296][]')).toThrow(
				/array length out-of-bounds/,
			);
			expect(ParamType.from('uint256[4294967295]').arrayLength).toBe(4294967295);
			expect(ParamType.from('uint256[]').arrayLength).toBe(-1);
		});

		it('rejects a zero-length static array, which Hyperion cannot produce and whose elements consume no data (M-10)', () => {
			expect(() => ParamType.from('uint8[0]')).toThrow(/array length out-of-bounds/);
			expect(() => ParamType.from('uint8[0][]')).toThrow(/array length out-of-bounds/);
			expect(() => ParamType.fromObject({ type: 'tuple[0]', components: [] })).toThrow(
				/array length out-of-bounds/,
			);
			expect(ParamType.from('uint8[1]').arrayLength).toBe(1);
		});

		it.each([
			['a null type', JSON.parse('{"type":null}')],
			['a numeric type', { type: 5 }],
			['a missing type', { name: 'x' }],
			['a non-array components list', { type: 'tuple', components: 'x' }],
			['a null object', JSON.parse('null')],
			['an undefined object', undefined],
			['a string instead of an object', 'uint256'],
		])('rejects %s from ABI JSON with an argument error, not a TypeError (I-10)', (_, value) => {
			let caught: { code?: string } | undefined;
			try {
				ParamType.fromObject(value as any);
			} catch (error) {
				caught = error as { code?: string };
			}
			expect(caught).not.toBeInstanceOf(TypeError);
			expect(caught?.code).toBe('INVALID_ARGUMENT');
		});
	});
});
