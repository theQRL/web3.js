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

import { BigNumber } from '@ethersproject/bignumber';
import { defineReadOnly } from '@ethersproject/properties';

import { Logger } from '@ethersproject/logger';
import { version } from './_version.js';

const logger = new Logger(version);

export interface JsonFragmentType {
	readonly name?: string;
	readonly indexed?: boolean;
	readonly type?: string;
	readonly internalType?: any; // @TODO: in v6 reduce type
	readonly components?: ReadonlyArray<JsonFragmentType>;
}

export interface JsonFragment {
	readonly name?: string;
	readonly type?: string;

	readonly anonymous?: boolean;

	readonly payable?: boolean;
	readonly constant?: boolean;
	readonly stateMutability?: string;

	readonly inputs?: ReadonlyArray<JsonFragmentType>;
	readonly outputs?: ReadonlyArray<JsonFragmentType>;

	readonly gas?: string;
}

const _constructorGuard = {};

// AST Node parser state
type ParseState = {
	allowArray?: boolean;
	allowName?: boolean;
	allowParams?: boolean;
	allowType?: boolean;
	readArray?: boolean;
};

// AST Node
type ParseNode = {
	parent?: any;
	type?: string;
	name?: string;
	state?: ParseState;
	indexed?: boolean;
	components?: Array<ParseNode>;
};

const ModifiersBytes: { [name: string]: boolean } = { calldata: true, memory: true, storage: true };
const ModifiersNest: { [name: string]: boolean } = { calldata: true, memory: true };
function checkModifier(type: string, name: string): boolean {
	if (type === 'bytes' || type === 'string') {
		if (ModifiersBytes[name]) {
			return true;
		}
	} else if (type === 'address') {
		if (name === 'payable') {
			return true;
		}
	} else if (type.includes('[') || type === 'tuple') {
		if (ModifiersNest[name]) {
			return true;
		}
	}
	if (ModifiersBytes[name] || name === 'payable') {
		logger.throwArgumentError('invalid modifier', 'name', name);
	}
	return false;
}

// @TODO: Make sure that children of an indexed tuple are marked with a null indexed
function parseParamType(param: string, allowIndexed: boolean): ParseNode {
	const originalParam = param;
	function throwError(i: number) {
		logger.throwArgumentError(`unexpected character at position ${i}`, 'param', param);
	}
	param = param.replace(/\s/g, ' ');

	function newNode(parent: ParseNode): ParseNode {
		const node: ParseNode = { type: '', name: '', parent, state: { allowType: true } };
		if (allowIndexed) {
			node.indexed = false;
		}
		return node;
	}

	const parent: ParseNode = { type: '', name: '', state: { allowType: true } };
	let node = parent;

	for (let i = 0; i < param.length; i++) {
		const c = param[i];
		switch (c) {
			case '(':
				if (node.state.allowType && node.type === '') {
					node.type = 'tuple';
				} else if (!node.state.allowParams) {
					throwError(i);
				}
				node.state.allowType = false;
				node.type = verifyType(node.type);
				node.components = [newNode(node)];
				node = node.components[0];
				break;

			case ')':
				delete node.state;

				if (node.name === 'indexed') {
					if (!allowIndexed) {
						throwError(i);
					}
					node.indexed = true;
					node.name = '';
				}

				if (checkModifier(node.type, node.name)) {
					node.name = '';
				}

				node.type = verifyType(node.type);

				const child = node;
				node = node.parent;
				if (!node) {
					throwError(i);
				}
				delete child.parent;
				node.state.allowParams = false;
				node.state.allowName = true;
				node.state.allowArray = true;
				break;

			case ',':
				delete node.state;

				if (node.name === 'indexed') {
					if (!allowIndexed) {
						throwError(i);
					}
					node.indexed = true;
					node.name = '';
				}

				if (checkModifier(node.type, node.name)) {
					node.name = '';
				}

				node.type = verifyType(node.type);

				const sibling: ParseNode = newNode(node.parent);
				// { type: "", name: "", parent: node.parent, state: { allowType: true } };
				node.parent.components.push(sibling);
				delete node.parent;
				node = sibling;
				break;

			// Hit a space...
			case ' ':
				// Diff vs ethers v5 (L-35): whitespace inside `[...]` silently turned `uint256[ 2]`
				// into the dynamic array `uint256[]` named "2", changing selector and encoding.
				if (node.state.readArray) {
					throwError(i);
				}

				// If reading type, the type is done and may read a param or name
				if (node.state.allowType) {
					if (node.type !== '') {
						node.type = verifyType(node.type);
						delete node.state.allowType;
						node.state.allowName = true;
						node.state.allowParams = true;
					}
				}

				// If reading name, the name is done
				if (node.state.allowName) {
					if (node.name !== '') {
						if (node.name === 'indexed') {
							if (!allowIndexed) {
								throwError(i);
							}
							if (node.indexed) {
								throwError(i);
							}
							node.indexed = true;
							node.name = '';
						} else if (checkModifier(node.type, node.name)) {
							node.name = '';
						} else {
							node.state.allowName = false;
						}
					}
				}

				break;

			case '[':
				if (!node.state.allowArray) {
					throwError(i);
				}

				node.type += c;

				node.state.allowArray = false;
				node.state.allowName = false;
				node.state.readArray = true;
				break;

			case ']':
				if (!node.state.readArray) {
					throwError(i);
				}

				node.type += c;

				node.state.readArray = false;
				node.state.allowArray = true;
				node.state.allowName = true;
				break;

			default:
				if (node.state.allowType) {
					node.type += c;
					node.state.allowParams = true;
					node.state.allowArray = true;
				} else if (node.state.allowName) {
					node.name += c;
					delete node.state.allowArray;
				} else if (node.state.readArray) {
					node.type += c;
				} else {
					throwError(i);
				}
		}
	}

	if (node.parent) {
		logger.throwArgumentError('unexpected eof', 'param', param);
	}

	delete parent.state;

	if (node.name === 'indexed') {
		if (!allowIndexed) {
			throwError(originalParam.length - 7);
		}
		if (node.indexed) {
			throwError(originalParam.length - 7);
		}
		node.indexed = true;
		node.name = '';
	} else if (checkModifier(node.type, node.name)) {
		node.name = '';
	}

	parent.type = verifyType(parent.type);

	return parent;
}

function populate(object: any, params: any) {
	for (const key in params) {
		defineReadOnly(object, key, params[key]);
	}
}

// Diff vs ethers v5 (I-10): ABI JSON is untrusted input. A fragment that is not an object or an
// `inputs`/`outputs`/`components` list that is not an array used to end in a raw TypeError;
// they are rejected with an argument error instead.
function verifyObject(value: unknown, name: string): void {
	if (value == null || typeof value !== 'object') {
		logger.throwArgumentError(`invalid ${name}`, 'value', value);
	}
}

function verifyArray(value: unknown, name: string): Array<any> {
	if (!Array.isArray(value)) {
		logger.throwArgumentError(`invalid ${name}`, name, value);
	}
	return value as Array<any>;
}

export const FormatTypes: { [name: string]: string } = Object.freeze({
	// Bare formatting, as is needed for computing a sighash of an event or function
	sighash: 'sighash',

	// Human-Readable with Minimal spacing and without names (compact human-readable)
	minimal: 'minimal',

	// Human-Readable with nice spacing, including all names
	full: 'full',

	// JSON-format a la Hyperion
	json: 'json',
});

const paramTypeArray = new RegExp(/^(.*)\[([0-9]*)\]$/);

// Diff vs ethers v5 (M-10): the length of a fixed-length array comes from the (untrusted) ABI
// and sizes what the decoder allocates, so it must be a safe integer below this bound.
const MAX_ARRAY_LENGTH = 2 ** 32;

export class ParamType {
	// The local name of the parameter (of null if unbound)
	readonly name: string;

	// The fully qualified type (e.g. "address", "tuple(address)", "uint512[3][]"
	readonly type: string;

	// The base type (e.g. "address", "tuple", "array")
	readonly baseType: string;

	// Indexable Paramters ONLY (otherwise null)
	readonly indexed: boolean;

	// Tuples ONLY: (otherwise null)
	//  - sub-components
	readonly components: Array<ParamType>;

	// Arrays ONLY: (otherwise null)
	//  - length of the array (-1 for dynamic length)
	//  - child type
	readonly arrayLength: number;
	readonly arrayChildren: ParamType;

	readonly _isParamType: boolean;

	constructor(constructorGuard: any, params: any) {
		if (constructorGuard !== _constructorGuard) {
			logger.throwError('use fromString', Logger.errors.UNSUPPORTED_OPERATION, {
				operation: 'new ParamType()',
			});
		}
		populate(this, params);

		const match = this.type.match(paramTypeArray);
		if (match) {
			const arrayLength = parseInt(match[2] || '-1');
			// A fixed length must be a positive safe integer below 2^32: Hyperion (like Solidity)
			// has no zero-length static arrays, and a `T[0]` element type would let an array of
			// such elements grow without consuming any data (M-10).
			if (
				match[2] &&
				(!Number.isSafeInteger(arrayLength) || arrayLength < 1 || arrayLength >= MAX_ARRAY_LENGTH)
			) {
				logger.throwArgumentError('array length out-of-bounds', 'type', this.type);
			}
			populate(this, {
				arrayLength,
				arrayChildren: ParamType.fromObject({
					type: match[1],
					components: this.components,
				}),
				baseType: 'array',
			});
		} else {
			populate(this, {
				arrayLength: null,
				arrayChildren: null,
				baseType: this.components != null ? 'tuple' : this.type,
			});
		}

		this._isParamType = true;

		Object.freeze(this);
	}

	// Format the parameter fragment
	//   - sighash: "(uint512,address)"
	//   - minimal: "tuple(uint512,address) indexed"
	//   - full:    "tuple(uint512 foo, address bar) indexed baz"
	format(format?: string): string {
		if (!format) {
			format = FormatTypes.sighash;
		}
		if (!FormatTypes[format]) {
			logger.throwArgumentError('invalid format type', 'format', format);
		}

		if (format === FormatTypes.json) {
			const result: any = {
				type: this.baseType === 'tuple' ? 'tuple' : this.type,
				name: this.name || undefined,
			};
			if (typeof this.indexed === 'boolean') {
				result.indexed = this.indexed;
			}
			if (this.components) {
				result.components = this.components.map(comp => JSON.parse(comp.format(format)));
			}
			return JSON.stringify(result);
		}

		let result = '';

		// Array
		if (this.baseType === 'array') {
			result += this.arrayChildren.format(format);
			result += `[${this.arrayLength < 0 ? '' : String(this.arrayLength)}]`;
		} else if (this.baseType === 'tuple') {
			if (format !== FormatTypes.sighash) {
				result += this.type;
			}
			result += `(${this.components
				.map(comp => comp.format(format))
				.join(format === FormatTypes.full ? ', ' : ',')})`;
		} else {
			result += this.type;
		}

		if (format !== FormatTypes.sighash) {
			if (this.indexed) {
				result += ' indexed';
			}
			if (format === FormatTypes.full && this.name) {
				result += ` ${this.name}`;
			}
		}

		return result;
	}

	static from(value: string | JsonFragmentType | ParamType, allowIndexed?: boolean): ParamType {
		if (typeof value === 'string') {
			return ParamType.fromString(value, allowIndexed);
		}
		return ParamType.fromObject(value);
	}

	static fromObject(value: JsonFragmentType | ParamType): ParamType {
		if (ParamType.isParamType(value)) {
			return value;
		}
		verifyObject(value, 'param type object');

		return new ParamType(_constructorGuard, {
			name: value.name || null,
			type: verifyType(value.type),
			indexed: value.indexed == null ? null : !!value.indexed,
			components: value.components
				? verifyArray(value.components, 'components').map(ParamType.fromObject)
				: null,
		});
	}

	static fromString(value: string, allowIndexed?: boolean): ParamType {
		function ParamTypify(node: ParseNode): ParamType {
			return ParamType.fromObject({
				name: node.name,
				type: node.type,
				indexed: node.indexed,
				components: node.components,
			});
		}

		return ParamTypify(parseParamType(value, !!allowIndexed));
	}

	static isParamType(value: any): value is ParamType {
		return !!(value != null && value._isParamType);
	}
}

function parseParams(value: string, allowIndex: boolean): Array<ParamType> {
	return splitNesting(value).map(param => ParamType.fromString(param, allowIndex));
}

// The `inputs`/`outputs` of a JSON fragment: absent means none, anything but an array is an
// error (I-10).
function verifyParams(value: unknown, name: string): Array<ParamType> {
	return value ? verifyArray(value, name).map(ParamType.fromObject) : [];
}

type TypeCheck<T> = { -readonly [K in keyof T]: T[K] };

interface _Fragment {
	readonly type: string;
	readonly name: string;
	readonly inputs: ReadonlyArray<ParamType>;
}

export abstract class Fragment {
	readonly type: string;
	readonly name: string;
	readonly inputs: Array<ParamType>;

	readonly _isFragment: boolean;

	constructor(constructorGuard: any, params: any) {
		if (constructorGuard !== _constructorGuard) {
			logger.throwError('use a static from method', Logger.errors.UNSUPPORTED_OPERATION, {
				operation: 'new Fragment()',
			});
		}
		populate(this, params);

		this._isFragment = true;

		Object.freeze(this);
	}

	abstract format(format?: string): string;

	static from(value: Fragment | JsonFragment | string): Fragment {
		if (Fragment.isFragment(value)) {
			return value;
		}

		if (typeof value === 'string') {
			return Fragment.fromString(value);
		}

		return Fragment.fromObject(value);
	}

	static fromObject(value: Fragment | JsonFragment): Fragment {
		if (Fragment.isFragment(value)) {
			return value;
		}
		verifyObject(value, 'fragment object');

		switch (value.type) {
			case 'function':
				return FunctionFragment.fromObject(value);
			case 'event':
				return EventFragment.fromObject(value);
			case 'constructor':
				return ConstructorFragment.fromObject(value);
			case 'error':
				return ErrorFragment.fromObject(value);
			case 'fallback':
			case 'receive':
				// @TODO: Something? Maybe return a FunctionFragment? A custom DefaultFunctionFragment?
				return null;
		}

		return logger.throwArgumentError('invalid fragment object', 'value', value);
	}

	static fromString(value: string): Fragment {
		// Make sure the "returns" is surrounded by a space and all whitespace is exactly one space
		value = value.replace(/\s/g, ' ');
		value = value.replace(/\(/g, ' (').replace(/\)/g, ') ').replace(/\s+/g, ' ');
		value = value.trim();

		if (value.split(' ')[0] === 'event') {
			return EventFragment.fromString(value.substring(5).trim());
		}
		if (value.split(' ')[0] === 'function') {
			return FunctionFragment.fromString(value.substring(8).trim());
		}
		if (value.split('(')[0].trim() === 'constructor') {
			return ConstructorFragment.fromString(value.trim());
		}
		if (value.split(' ')[0] === 'error') {
			return ErrorFragment.fromString(value.substring(5).trim());
		}

		return logger.throwArgumentError('unsupported fragment', 'value', value);
	}

	static isFragment(value: any): value is Fragment {
		return !!(value && value._isFragment);
	}
}

interface _EventFragment extends _Fragment {
	readonly anonymous: boolean;
}

export class EventFragment extends Fragment {
	readonly anonymous: boolean;

	format(format?: string): string {
		if (!format) {
			format = FormatTypes.sighash;
		}
		if (!FormatTypes[format]) {
			logger.throwArgumentError('invalid format type', 'format', format);
		}

		if (format === FormatTypes.json) {
			return JSON.stringify({
				type: 'event',
				anonymous: this.anonymous,
				name: this.name,
				inputs: this.inputs.map(input => JSON.parse(input.format(format))),
			});
		}

		let result = '';

		if (format !== FormatTypes.sighash) {
			result += 'event ';
		}

		result += `${this.name}(${this.inputs
			.map(input => input.format(format))
			.join(format === FormatTypes.full ? ', ' : ',')}) `;

		if (format !== FormatTypes.sighash) {
			if (this.anonymous) {
				result += 'anonymous ';
			}
		}

		return result.trim();
	}

	static from(value: EventFragment | JsonFragment | string): EventFragment {
		if (typeof value === 'string') {
			return EventFragment.fromString(value);
		}
		return EventFragment.fromObject(value);
	}

	static fromObject(value: JsonFragment | EventFragment): EventFragment {
		if (EventFragment.isEventFragment(value)) {
			return value;
		}
		verifyObject(value, 'event object');

		if (value.type !== 'event') {
			logger.throwArgumentError('invalid event object', 'value', value);
		}

		const params: TypeCheck<_EventFragment> = {
			name: verifyIdentifier(value.name),
			anonymous: value.anonymous,
			inputs: verifyParams(value.inputs, 'inputs'),
			type: 'event',
		};

		return new EventFragment(_constructorGuard, params);
	}

	static fromString(value: string): EventFragment {
		const match = value.match(regexParen);
		if (!match) {
			logger.throwArgumentError('invalid event string', 'value', value);
		}

		let anonymous = false;
		match[3].split(' ').forEach(modifier => {
			switch (modifier.trim()) {
				case 'anonymous':
					anonymous = true;
					break;
				case '':
					break;
				default:
					logger.warn(`unknown modifier: ${modifier}`);
			}
		});

		return EventFragment.fromObject({
			name: match[1].trim(),
			anonymous,
			inputs: parseParams(match[2], true),
			type: 'event',
		});
	}

	static isEventFragment(value: any): value is EventFragment {
		return value && value._isFragment && value.type === 'event';
	}
}

function parseGas(value: string, params: any): string {
	params.gas = null;

	const comps = value.split('@');
	if (comps.length !== 1) {
		if (comps.length > 2) {
			logger.throwArgumentError('invalid human-readable ABI signature', 'value', value);
		}
		if (!comps[1].match(/^[0-9]+$/)) {
			logger.throwArgumentError('invalid human-readable ABI signature gas', 'value', value);
		}
		params.gas = BigNumber.from(comps[1]);
		return comps[0];
	}

	return value;
}

function parseModifiers(value: string, params: any): void {
	params.constant = false;
	params.payable = false;
	params.stateMutability = 'nonpayable';

	value.split(' ').forEach(modifier => {
		switch (modifier.trim()) {
			case 'constant':
				params.constant = true;
				break;
			case 'payable':
				params.payable = true;
				params.stateMutability = 'payable';
				break;
			case 'nonpayable':
				params.payable = false;
				params.stateMutability = 'nonpayable';
				break;
			case 'pure':
				params.constant = true;
				params.stateMutability = 'pure';
				break;
			case 'view':
				params.constant = true;
				params.stateMutability = 'view';
				break;
			case 'external':
			case 'public':
			case '':
				break;
			default:
				console.log(`unknown modifier: ${modifier}`);
		}
	});
}

type StateInputValue = {
	constant?: boolean;
	payable?: boolean;
	stateMutability?: string;
	type?: string;
};

type StateOutputValue = {
	constant: boolean;
	payable: boolean;
	stateMutability: string;
};

function verifyState(value: StateInputValue): StateOutputValue {
	const result: any = {
		constant: false,
		payable: true,
		stateMutability: 'payable',
	};

	if (value.stateMutability != null) {
		result.stateMutability = value.stateMutability;

		// Set (and check things are consistent) the constant property
		result.constant = result.stateMutability === 'view' || result.stateMutability === 'pure';
		if (value.constant != null) {
			if (!!value.constant !== result.constant) {
				logger.throwArgumentError(
					`cannot have constant function with mutability ${result.stateMutability}`,
					'value',
					value,
				);
			}
		}

		// Set (and check things are consistent) the payable property
		result.payable = result.stateMutability === 'payable';
		if (value.payable != null) {
			if (!!value.payable !== result.payable) {
				logger.throwArgumentError(
					`cannot have payable function with mutability ${result.stateMutability}`,
					'value',
					value,
				);
			}
		}
	} else if (value.payable != null) {
		result.payable = !!value.payable;

		// If payable we can assume non-constant; otherwise we can't assume
		if (value.constant == null && !result.payable && value.type !== 'constructor') {
			logger.throwArgumentError('unable to determine stateMutability', 'value', value);
		}

		result.constant = !!value.constant;

		if (result.constant) {
			result.stateMutability = 'view';
		} else {
			result.stateMutability = result.payable ? 'payable' : 'nonpayable';
		}

		if (result.payable && result.constant) {
			logger.throwArgumentError('cannot have constant payable function', 'value', value);
		}
	} else if (value.constant != null) {
		result.constant = !!value.constant;
		result.payable = !result.constant;
		result.stateMutability = result.constant ? 'view' : 'payable';
	} else if (value.type !== 'constructor') {
		logger.throwArgumentError('unable to determine stateMutability', 'value', value);
	}

	return result;
}

interface _ConstructorFragment extends _Fragment {
	stateMutability: string;
	payable: boolean;
	gas?: BigNumber;
}

export class ConstructorFragment extends Fragment {
	stateMutability: string;
	payable: boolean;
	gas?: BigNumber;

	format(format?: string): string {
		if (!format) {
			format = FormatTypes.sighash;
		}
		if (!FormatTypes[format]) {
			logger.throwArgumentError('invalid format type', 'format', format);
		}

		if (format === FormatTypes.json) {
			return JSON.stringify({
				type: 'constructor',
				stateMutability:
					this.stateMutability !== 'nonpayable' ? this.stateMutability : undefined,
				payable: this.payable,
				gas: this.gas ? this.gas.toNumber() : undefined,
				inputs: this.inputs.map(input => JSON.parse(input.format(format))),
			});
		}

		if (format === FormatTypes.sighash) {
			logger.throwError(
				'cannot format a constructor for sighash',
				Logger.errors.UNSUPPORTED_OPERATION,
				{
					operation: 'format(sighash)',
				},
			);
		}

		let result = `constructor(${this.inputs
			.map(input => input.format(format))
			.join(format === FormatTypes.full ? ', ' : ',')}) `;

		if (this.stateMutability && this.stateMutability !== 'nonpayable') {
			result += `${this.stateMutability} `;
		}

		return result.trim();
	}

	static from(value: ConstructorFragment | JsonFragment | string): ConstructorFragment {
		if (typeof value === 'string') {
			return ConstructorFragment.fromString(value);
		}
		return ConstructorFragment.fromObject(value);
	}

	static fromObject(value: ConstructorFragment | JsonFragment): ConstructorFragment {
		if (ConstructorFragment.isConstructorFragment(value)) {
			return value;
		}
		verifyObject(value, 'constructor object');

		if (value.type !== 'constructor') {
			logger.throwArgumentError('invalid constructor object', 'value', value);
		}

		const state = verifyState(value);
		if (state.constant) {
			logger.throwArgumentError('constructor cannot be constant', 'value', value);
		}

		const params: TypeCheck<_ConstructorFragment> = {
			name: null,
			type: value.type,
			inputs: verifyParams(value.inputs, 'inputs'),
			payable: state.payable,
			stateMutability: state.stateMutability,
			gas: value.gas ? BigNumber.from(value.gas) : null,
		};

		return new ConstructorFragment(_constructorGuard, params);
	}

	static fromString(value: string): ConstructorFragment {
		const params: any = { type: 'constructor' };

		value = parseGas(value, params);

		const parens = value.match(regexParen);
		if (!parens || parens[1].trim() !== 'constructor') {
			logger.throwArgumentError('invalid constructor string', 'value', value);
		}

		params.inputs = parseParams(parens[2].trim(), false);

		parseModifiers(parens[3].trim(), params);

		return ConstructorFragment.fromObject(params);
	}

	static isConstructorFragment(value: any): value is ConstructorFragment {
		return value && value._isFragment && value.type === 'constructor';
	}
}

interface _FunctionFragment extends _ConstructorFragment {
	constant: boolean;
	outputs?: Array<ParamType>;
}

export class FunctionFragment extends ConstructorFragment {
	constant: boolean;
	outputs?: Array<ParamType>;

	format(format?: string): string {
		if (!format) {
			format = FormatTypes.sighash;
		}
		if (!FormatTypes[format]) {
			logger.throwArgumentError('invalid format type', 'format', format);
		}

		if (format === FormatTypes.json) {
			return JSON.stringify({
				type: 'function',
				name: this.name,
				constant: this.constant,
				stateMutability:
					this.stateMutability !== 'nonpayable' ? this.stateMutability : undefined,
				payable: this.payable,
				gas: this.gas ? this.gas.toNumber() : undefined,
				inputs: this.inputs.map(input => JSON.parse(input.format(format))),
				outputs: this.outputs.map(output => JSON.parse(output.format(format))),
			});
		}

		let result = '';

		if (format !== FormatTypes.sighash) {
			result += 'function ';
		}

		result += `${this.name}(${this.inputs
			.map(input => input.format(format))
			.join(format === FormatTypes.full ? ', ' : ',')}) `;

		if (format !== FormatTypes.sighash) {
			if (this.stateMutability) {
				if (this.stateMutability !== 'nonpayable') {
					result += `${this.stateMutability} `;
				}
			} else if (this.constant) {
				result += 'view ';
			}

			if (this.outputs && this.outputs.length) {
				result += `returns (${this.outputs
					.map(output => output.format(format))
					.join(', ')}) `;
			}

			if (this.gas != null) {
				result += `@${this.gas.toString()} `;
			}
		}

		return result.trim();
	}

	static from(value: FunctionFragment | JsonFragment | string): FunctionFragment {
		if (typeof value === 'string') {
			return FunctionFragment.fromString(value);
		}
		return FunctionFragment.fromObject(value);
	}

	static fromObject(value: FunctionFragment | JsonFragment): FunctionFragment {
		if (FunctionFragment.isFunctionFragment(value)) {
			return value;
		}
		verifyObject(value, 'function object');

		if (value.type !== 'function') {
			logger.throwArgumentError('invalid function object', 'value', value);
		}

		const state = verifyState(value);

		const params: TypeCheck<_FunctionFragment> = {
			type: value.type,
			name: verifyIdentifier(value.name),
			constant: state.constant,
			inputs: verifyParams(value.inputs, 'inputs'),
			outputs: verifyParams(value.outputs, 'outputs'),
			payable: state.payable,
			stateMutability: state.stateMutability,
			gas: value.gas ? BigNumber.from(value.gas) : null,
		};

		return new FunctionFragment(_constructorGuard, params);
	}

	static fromString(value: string): FunctionFragment {
		const params: any = { type: 'function' };
		value = parseGas(value, params);

		const comps = value.split(' returns ');
		if (comps.length > 2) {
			logger.throwArgumentError('invalid function string', 'value', value);
		}

		const parens = comps[0].match(regexParen);
		if (!parens) {
			logger.throwArgumentError('invalid function signature', 'value', value);
		}

		params.name = parens[1].trim();
		if (params.name) {
			verifyIdentifier(params.name);
		}

		params.inputs = parseParams(parens[2], false);

		parseModifiers(parens[3].trim(), params);

		// We have outputs
		if (comps.length > 1) {
			const returns = comps[1].match(regexParen);
			if (returns[1].trim() != '' || returns[3].trim() != '') {
				logger.throwArgumentError('unexpected tokens', 'value', value);
			}
			params.outputs = parseParams(returns[2], false);
		} else {
			params.outputs = [];
		}

		return FunctionFragment.fromObject(params);
	}

	static isFunctionFragment(value: any): value is FunctionFragment {
		return value && value._isFragment && value.type === 'function';
	}
}

// export class StructFragment extends Fragment {
// }

function checkForbidden(fragment: ErrorFragment): ErrorFragment {
	const sig = fragment.format();
	if (sig === 'Error(string)' || sig === 'Panic(uint256)') {
		logger.throwArgumentError(`cannot specify user defined ${sig} error`, 'fragment', fragment);
	}
	return fragment;
}

export class ErrorFragment extends Fragment {
	format(format?: string): string {
		if (!format) {
			format = FormatTypes.sighash;
		}
		if (!FormatTypes[format]) {
			logger.throwArgumentError('invalid format type', 'format', format);
		}

		if (format === FormatTypes.json) {
			return JSON.stringify({
				type: 'error',
				name: this.name,
				inputs: this.inputs.map(input => JSON.parse(input.format(format))),
			});
		}

		let result = '';

		if (format !== FormatTypes.sighash) {
			result += 'error ';
		}

		result += `${this.name}(${this.inputs
			.map(input => input.format(format))
			.join(format === FormatTypes.full ? ', ' : ',')}) `;

		return result.trim();
	}

	static from(value: ErrorFragment | JsonFragment | string): ErrorFragment {
		if (typeof value === 'string') {
			return ErrorFragment.fromString(value);
		}
		return ErrorFragment.fromObject(value);
	}

	static fromObject(value: ErrorFragment | JsonFragment): ErrorFragment {
		if (ErrorFragment.isErrorFragment(value)) {
			return value;
		}
		verifyObject(value, 'error object');

		if (value.type !== 'error') {
			logger.throwArgumentError('invalid error object', 'value', value);
		}

		const params: TypeCheck<_Fragment> = {
			type: value.type,
			name: verifyIdentifier(value.name),
			inputs: verifyParams(value.inputs, 'inputs'),
		};

		return checkForbidden(new ErrorFragment(_constructorGuard, params));
	}

	static fromString(value: string): ErrorFragment {
		const params: any = { type: 'error' };

		const parens = value.match(regexParen);
		if (!parens) {
			logger.throwArgumentError('invalid error signature', 'value', value);
		}

		params.name = parens[1].trim();
		if (params.name) {
			verifyIdentifier(params.name);
		}

		params.inputs = parseParams(parens[2], false);

		return checkForbidden(ErrorFragment.fromObject(params));
	}

	static isErrorFragment(value: any): value is ErrorFragment {
		return value && value._isFragment && value.type === 'error';
	}
}

function verifyType(type: string): string {
	// Diff vs ethers v5 (I-10): a `type` taken from ABI JSON that is not a string ended in a
	// raw TypeError below.
	if (typeof type !== 'string') {
		logger.throwArgumentError('invalid type', 'type', type);
	}

	// These need to be transformed to their full description
	if (type.match(/^uint($|[^1-9])/)) {
		type = `uint256${type.substring(4)}`;
	} else if (type.match(/^int($|[^1-9])/)) {
		type = `int256${type.substring(3)}`;
	}

	// @TODO: more verification

	return type;
}

// See: https://github.com/ethereum/solidity/blob/1f8f1a3db93a548d0555e3e14cfc55a10e25b60e/docs/grammar/SolidityLexer.g4#L234
const regexIdentifier = new RegExp('^[a-zA-Z$_][a-zA-Z0-9$_]*$');
function verifyIdentifier(value: string): string {
	if (!value || !value.match(regexIdentifier)) {
		logger.throwArgumentError(`invalid identifier "${value}"`, 'value', value);
	}
	return value;
}

const regexParen = new RegExp('^([^)(]*)\\((.*)\\)([^)(]*)$');

function splitNesting(value: string): Array<any> {
	value = value.trim();

	const result = [];
	let accum = '';
	let depth = 0;
	for (let offset = 0; offset < value.length; offset++) {
		const c = value[offset];
		if (c === ',' && depth === 0) {
			result.push(accum);
			accum = '';
		} else {
			accum += c;
			if (c === '(') {
				depth++;
			} else if (c === ')') {
				depth--;
				if (depth === -1) {
					logger.throwArgumentError('unbalanced parenthesis', 'value', value);
				}
			}
		}
	}
	if (accum) {
		result.push(accum);
	}

	return result;
}
