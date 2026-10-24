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

import {
	ConstructorFragment,
	ErrorFragment,
	EventFragment,
	FormatTypes,
	Fragment,
	FunctionFragment,
} from '../../src/fragments.js';

// ---------------------------------------------------------------------------
// EventFragment, ConstructorFragment and FunctionFragment were previously
// non-constructible: Fragment's constructor Object.freeze(this)'d the instance,
// and under `target: es2022` the derived classes' field declarations emitted
// Object.defineProperty after the freeze -> "Cannot redefine property". Fixed by
// setting `useDefineForClassFields: false` in the abi tsconfigs (the vendored
// ethers-v5 code assumes that semantics). These suites assert the now-working
// behaviour (finding C46).

describe('Fragment dispatch', () => {
	it('routes "error ..." to an ErrorFragment', () => {
		const fragment = Fragment.from('error Unauthorized(address caller)');
		expect(fragment).toBeInstanceOf(ErrorFragment);
		expect(fragment.type).toBe('error');
		expect(fragment.name).toBe('Unauthorized');
	});

	it('rejects an unsupported fragment string', () => {
		expect(() => Fragment.from('modifier onlyOwner()')).toThrow(/unsupported fragment/);
	});

	it('returns null for fallback and receive objects', () => {
		expect(Fragment.from({ type: 'fallback' } as any)).toBeNull();
		expect(Fragment.from({ type: 'receive' } as any)).toBeNull();
	});

	it('rejects an unknown fragment object', () => {
		expect(() => Fragment.from({ type: 'nonsense' } as any)).toThrow(/invalid fragment object/);
	});

	it('recognises and passes through an existing fragment', () => {
		const fragment = Fragment.from('error Foo()');
		expect(Fragment.isFragment(fragment)).toBe(true);
		expect(Fragment.from(fragment)).toBe(fragment);
	});

	it('does not recognise a plain object as a fragment', () => {
		expect(Fragment.isFragment({ type: 'function' })).toBe(false);
		// eslint-disable-next-line no-null/no-null
		expect(Fragment.isFragment(null)).toBe(false);
		expect(Fragment.isFragment(undefined)).toBe(false);
	});

	it('cannot be constructed directly', () => {
		// eslint-disable-next-line no-null/no-null
		expect(() => new (ErrorFragment as any)(null, {})).toThrow(/static from method/);
	});
});

describe('checkForbidden', () => {
	it('rejects the builtin error signatures', () => {
		expect(() => ErrorFragment.from('Error(string)')).toThrow(/user defined/);
		expect(() => ErrorFragment.from('Panic(uint256)')).toThrow(/user defined/);
		expect(() => ErrorFragment.from('Panic(uint)')).toThrow(/user defined/);
	});

	it('accepts Panic(uint512) as a custom error', () => {
		expect(ErrorFragment.from('Panic(uint512)').format()).toBe('Panic(uint512)');
	});
});

describe('ErrorFragment', () => {
	it('parses inputs', () => {
		const fragment = ErrorFragment.from('InsufficientBalance(uint512 available)');
		expect(fragment.type).toBe('error');
		expect(fragment.name).toBe('InsufficientBalance');
		expect(fragment.inputs).toHaveLength(1);
		expect(fragment.inputs[0].type).toBe('uint512');
		expect(fragment.inputs[0].name).toBe('available');
	});

	it('parses an error with no inputs', () => {
		expect(ErrorFragment.from('Unauthorized()').inputs).toHaveLength(0);
	});

	it('is frozen', () => {
		expect(Object.isFrozen(ErrorFragment.from('Foo()'))).toBe(true);
	});

	it('produces the canonical sighash form, dropping names', () => {
		expect(
			ErrorFragment.from('Unauthorized(address caller, uint512 code)').format(
				FormatTypes.sighash,
			),
		).toBe('Unauthorized(address,uint512)');
	});

	it('keeps the "error" keyword and names in the full form', () => {
		expect(ErrorFragment.from('Unauthorized(address caller)').format(FormatTypes.full)).toBe(
			'error Unauthorized(address caller)',
		);
	});

	it('keeps the "error" keyword but drops names in the minimal form', () => {
		expect(ErrorFragment.from('Unauthorized(address caller)').format(FormatTypes.minimal)).toBe(
			'error Unauthorized(address)',
		);
	});

	it('defaults to the sighash format', () => {
		const fragment = ErrorFragment.from('Foo(address a)');
		expect(fragment.format()).toBe(fragment.format(FormatTypes.sighash));
	});

	it('round-trips string -> full -> string', () => {
		// The full form carries the "error" keyword, so it re-parses via
		// Fragment.from (which dispatches on the keyword) rather than
		// ErrorFragment.from (which expects the keyword already stripped).
		const once = ErrorFragment.from('Unauthorized(address caller, uint512 code)').format(
			FormatTypes.full,
		);
		expect(once).toBe('error Unauthorized(address caller, uint512 code)');
		expect(Fragment.from(once).format(FormatTypes.full)).toBe(once);
	});

	it('round-trips string -> JSON -> object -> string', () => {
		const fragment = ErrorFragment.from('Unauthorized(address caller)');
		const json = JSON.parse(fragment.format(FormatTypes.json));
		expect(json.type).toBe('error');
		expect(json.name).toBe('Unauthorized');
		expect(ErrorFragment.fromObject(json).format(FormatTypes.full)).toBe(
			fragment.format(FormatTypes.full),
		);
	});

	it('handles a tuple input', () => {
		const fragment = ErrorFragment.from('Foo(tuple(address a, uint512 b) order)');
		expect(fragment.inputs[0].baseType).toBe('tuple');
		expect(fragment.inputs[0].components).toHaveLength(2);
		expect(fragment.format(FormatTypes.sighash)).toBe('Foo((address,uint512))');
	});

	it('rejects an invalid error name', () => {
		expect(() => ErrorFragment.fromString('9Bad(uint512)')).toThrow(/invalid identifier/);
	});

	it('rejects an object with the wrong type', () => {
		expect(() => ErrorFragment.fromObject({ type: 'function', name: 'foo' } as any)).toThrow();
	});

	it('rejects an unknown format type', () => {
		expect(() => ErrorFragment.from('Foo()').format('bogus')).toThrow(/invalid format/);
	});
});

describe('EventFragment', () => {
	it('should parse indexed inputs', () => {
		const fragment = EventFragment.from(
			'Transfer(address indexed from, address indexed to, uint512 value)',
		);
		expect(fragment.inputs).toHaveLength(3);
		expect(fragment.inputs[0].indexed).toBe(true);
		// ethers-v5 ParamType: a non-indexed event input has `indexed === null`, not false.
		expect(fragment.inputs[2].indexed).toBeNull();
		expect(fragment.anonymous).toBe(false);
	});

	it('should parse the anonymous modifier', () => {
		expect(EventFragment.from('Foo(uint512 a) anonymous').anonymous).toBe(true);
	});

	it('should produce the canonical sighash form', () => {
		expect(
			EventFragment.from('Transfer(address indexed from, uint512 value)').format(
				FormatTypes.sighash,
			),
		).toBe('Transfer(address,uint512)');
	});

	it('should keep indexed and names in the full form', () => {
		// ethers-v5 `full` format prefixes the fragment kind ("event ").
		expect(EventFragment.from('Foo(uint512 indexed a)').format(FormatTypes.full)).toBe(
			'event Foo(uint512 indexed a)',
		);
	});

	it('should round-trip string -> JSON -> object -> string', () => {
		const fragment = EventFragment.from('Transfer(address indexed from, uint512 value)');
		const json = JSON.parse(fragment.format(FormatTypes.json));
		expect(EventFragment.fromObject(json).format(FormatTypes.full)).toBe(
			fragment.format(FormatTypes.full),
		);
	});
});

describe('ConstructorFragment', () => {
	it('should parse inputs and default to nonpayable', () => {
		const fragment = ConstructorFragment.from('constructor(address owner, uint512 supply)');
		expect(fragment.type).toBe('constructor');
		expect(fragment.inputs).toHaveLength(2);
		expect(fragment.stateMutability).toBe('nonpayable');
		expect(fragment.payable).toBe(false);
	});

	it('should parse the payable modifier', () => {
		const fragment = ConstructorFragment.from('constructor(address owner) payable');
		expect(fragment.payable).toBe(true);
		expect(fragment.stateMutability).toBe('payable');
	});

	it('should format without a name', () => {
		expect(
			ConstructorFragment.from('constructor(address owner)').format(FormatTypes.full),
		).toBe('constructor(address owner)');
	});
});

describe('FunctionFragment', () => {
	it('rejects an invalid function name before it ever reaches the constructor', () => {
		// This validation runs pre-construction, so it survives the defect.
		expect(() => FunctionFragment.fromString('9bad(uint512)')).toThrow(/invalid identifier/);
	});

	it('rejects an object with no determinable stateMutability', () => {
		expect(() =>
			FunctionFragment.fromObject({ type: 'function', name: 'foo', inputs: [] } as any),
		).toThrow(/unable to determine stateMutability/);
	});

	it('should parse inputs, outputs and state mutability', () => {
		const fragment = FunctionFragment.from(
			'transfer(address to, uint512 value) returns (bool success)',
		);
		expect(fragment.name).toBe('transfer');
		expect(fragment.inputs).toHaveLength(2);
		expect(fragment.outputs).toHaveLength(1);
		expect(fragment.outputs[0].type).toBe('bool');
	});

	it('should default to nonpayable with no outputs', () => {
		const fragment = FunctionFragment.from('foo()');
		expect(fragment.stateMutability).toBe('nonpayable');
		expect(fragment.constant).toBe(false);
		expect(fragment.payable).toBe(false);
		expect(fragment.outputs).toHaveLength(0);
	});

	it('should mark view/pure functions as constant', () => {
		expect(FunctionFragment.from('foo() view').constant).toBe(true);
		expect(FunctionFragment.from('foo() pure').constant).toBe(true);
		expect(FunctionFragment.from('foo() payable').payable).toBe(true);
	});

	it('should produce the canonical sighash form', () => {
		expect(
			FunctionFragment.from('transfer(address to, uint512 value) returns (bool)').format(
				FormatTypes.sighash,
			),
		).toBe('transfer(address,uint512)');
	});

	it('should produce the full form including returns', () => {
		// ethers-v5 `full` format prefixes the fragment kind ("function ").
		expect(
			FunctionFragment.from(
				'transfer(address to, uint512 value) view returns (bool success)',
			).format(FormatTypes.full),
		).toBe('function transfer(address to, uint512 value) view returns (bool success)');
	});

	it('should round-trip string -> JSON -> object -> string', () => {
		const fragment = FunctionFragment.from('balanceOf(address owner) view returns (uint512)');
		const json = JSON.parse(fragment.format(FormatTypes.json));
		expect(FunctionFragment.fromObject(json).format(FormatTypes.full)).toBe(
			fragment.format(FormatTypes.full),
		);
	});
});

describe('untrusted ABI JSON (I-10)', () => {
	const codeOf = (fn: () => unknown) => {
		try {
			fn();
		} catch (error) {
			expect(error).not.toBeInstanceOf(TypeError);
			return (error as { code?: string }).code;
		}
		return undefined;
	};

	it('rejects a null or non-object fragment with an argument error instead of a TypeError', () => {
		expect(() => Fragment.fromObject(JSON.parse('null'))).toThrow(/invalid fragment object/);
		expect(codeOf(() => Fragment.fromObject(JSON.parse('null')))).toBe('INVALID_ARGUMENT');
		expect(() => Fragment.fromObject(undefined as any)).toThrow(/invalid fragment object/);
		expect(() => Fragment.fromObject('function f()' as any)).toThrow(
			/invalid fragment object/,
		);
		expect(() => EventFragment.fromObject(JSON.parse('null'))).toThrow(/invalid event object/);
		expect(() => FunctionFragment.fromObject(JSON.parse('null'))).toThrow(
			/invalid function object/,
		);
		expect(() => ConstructorFragment.fromObject(JSON.parse('null'))).toThrow(
			/invalid constructor object/,
		);
		expect(() => ErrorFragment.fromObject(JSON.parse('null'))).toThrow(/invalid error object/);
	});

	it('rejects inputs and outputs that are not arrays', () => {
		expect(() =>
			EventFragment.fromObject({ type: 'event', name: 'E', inputs: 'x' as any }),
		).toThrow(/invalid inputs/);
		expect(codeOf(() => EventFragment.fromObject({ type: 'event', name: 'E', inputs: 'x' as any }))).toBe(
			'INVALID_ARGUMENT',
		);
		expect(() =>
			FunctionFragment.fromObject({
				type: 'function',
				name: 'f',
				stateMutability: 'view',
				inputs: [],
				outputs: {} as any,
			}),
		).toThrow(/invalid outputs/);
		expect(() =>
			FunctionFragment.fromObject({
				type: 'function',
				name: 'f',
				stateMutability: 'view',
				inputs: 5 as any,
			}),
		).toThrow(/invalid inputs/);
		expect(() => ErrorFragment.fromObject({ type: 'error', name: 'E', inputs: 5 as any })).toThrow(
			/invalid inputs/,
		);
		expect(() =>
			ConstructorFragment.fromObject({ type: 'constructor', inputs: 'x' as any }),
		).toThrow(/invalid inputs/);
	});

	it('rejects an input whose type is not a string', () => {
		expect(() =>
			EventFragment.fromObject({ type: 'event', name: 'E', inputs: [JSON.parse('{"type":null}')] }),
		).toThrow(/invalid type/);
	});

	it('still treats absent inputs and outputs as none', () => {
		expect(EventFragment.fromObject({ type: 'event', name: 'E' }).inputs).toEqual([]);
		const fn = FunctionFragment.fromObject({ type: 'function', name: 'f', stateMutability: 'view' });
		expect(fn.inputs).toEqual([]);
		expect(fn.outputs).toEqual([]);
		expect(ErrorFragment.fromObject({ type: 'error', name: 'E' }).inputs).toEqual([]);
	});
});
