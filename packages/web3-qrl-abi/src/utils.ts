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
import { AbiCoder, ParamType, booleanToBit } from '@theqrl/abi';
import { bytesToHex, isNullish, leftPad } from '@theqrl/web3-utils';
import {
	AbiInput,
	AbiCoderStruct,
	AbiFragment,
	AbiParameter,
	AbiStruct,
	AbiEventFragment,
	AbiFunctionFragment,
	AbiConstructorFragment,
} from '@theqrl/web3-types';
import ethersAbiCoder from './ethers_abi_coder.js';

export const isAbiFragment = (item: unknown): item is AbiFragment =>
	!isNullish(item) &&
	typeof item === 'object' &&
	!isNullish((item as { type: string }).type) &&
	['function', 'event', 'constructor', 'error'].includes((item as { type: string }).type);

export const isAbiErrorFragment = (item: unknown): item is AbiEventFragment =>
	!isNullish(item) &&
	typeof item === 'object' &&
	!isNullish((item as { type: string }).type) &&
	(item as { type: string }).type === 'error';

export const isAbiEventFragment = (item: unknown): item is AbiEventFragment =>
	!isNullish(item) &&
	typeof item === 'object' &&
	!isNullish((item as { type: string }).type) &&
	(item as { type: string }).type === 'event';

export const isAbiFunctionFragment = (item: unknown): item is AbiFunctionFragment =>
	!isNullish(item) &&
	typeof item === 'object' &&
	!isNullish((item as { type: string }).type) &&
	(item as { type: string }).type === 'function';

export const isAbiConstructorFragment = (item: unknown): item is AbiConstructorFragment =>
	!isNullish(item) &&
	typeof item === 'object' &&
	!isNullish((item as { type: string }).type) &&
	(item as { type: string }).type === 'constructor';

/**
 * Check if type is simplified struct format
 */
export const isSimplifiedStructFormat = (
	type: string | Partial<AbiParameter> | Partial<AbiInput>,
): type is Omit<AbiParameter, 'components' | 'name'> =>
	typeof type === 'object' &&
	typeof (type as { type: unknown }).type === 'undefined' &&
	typeof (type as { components: unknown }).components === 'undefined' &&
	typeof (type as { name: unknown }).name === 'undefined';

/**
 * Maps the correct tuple type and name when the simplified format in encode/decodeParameter is used
 */
export const mapStructNameAndType = (structName: string): AbiStruct =>
	structName.includes('[]')
		? { type: 'tuple[]', name: structName.slice(0, -2) }
		: { type: 'tuple', name: structName };

/**
 * Maps the simplified format in to the expected format of the ABICoder
 */
export const mapStructToCoderFormat = (struct: AbiStruct): Array<AbiCoderStruct> => {
	const components: Array<AbiCoderStruct> = [];

	for (const key of Object.keys(struct)) {
		const item = struct[key];

		if (typeof item === 'object') {
			components.push({
				...mapStructNameAndType(key),
				components: mapStructToCoderFormat(item as unknown as AbiStruct),
			});
		} else {
			components.push({
				name: key,
				type: struct[key] as string,
			});
		}
	}
	return components;
};

/**
 * Map types if simplified format is used
 */
export const mapTypes = (
	types: AbiInput[],
): Array<string | AbiParameter | Record<string, unknown>> => {
	const mappedTypes: Array<string | AbiParameter | Record<string, unknown>> = [];

	for (const type of types) {
		let modifiedType = type;

		// Clone object
		if (typeof type === 'object') {
			modifiedType = { ...type };
		}

		if (isSimplifiedStructFormat(modifiedType)) {
			const structName = Object.keys(modifiedType)[0] as unknown as keyof typeof modifiedType;
			// An empty object is neither a type string, an ABI parameter nor a struct (I-10).
			if (typeof structName !== 'string') {
				throw new AbiError(
					`Invalid ABI parameter: expected a type string, an object with a "type" or a struct definition, got ${JSON.stringify(
						modifiedType,
					)}`,
				);
			}

			mappedTypes.push({
				...mapStructNameAndType(structName),
				components: mapStructToCoderFormat(
					modifiedType[structName] as unknown as AbiStruct,
				) as unknown as AbiParameter[],
			});
		} else {
			mappedTypes.push(modifiedType);
		}
	}

	return mappedTypes;
};

/**
 * returns true if input is a hexstring and is odd-lengthed
 */
export const isOddHexstring = (param: unknown): boolean =>
	typeof param === 'string' && /^(-)?0x[0-9a-f]*$/i.test(param) && param.length % 2 === 1;

/**
 * format odd-length bytes to even-length
 */
export const formatOddHexstrings = (param: string): string =>
	isOddHexstring(param) ? `0x0${param.substring(2)}` : param;

/**
 * Handle some formatting of params for backwards compatibility with Ethers V4.
 *
 * A `bool` is normalised to `true`/`false` from exactly the forms the library's validator
 * (`web3-validator`'s `bool` format) accepts, mapped by value: `0`/`1`, `0n`/`1n`, `'0'`/`'1'`
 * and `'0x0'`/`'0x1'`. Any other value is passed through for the coder to reject, so `'0'`
 * and `'0x0'` encode as `false` on every path and `'false'` is an error (H-3).
 */
const STRICT_HEX = /^-?0x[0-9a-f]+$/i;

export const formatParam = (type: string, _param: unknown): unknown => {
	if (type === 'function') {
		return _param;
	}
	if (type === 'bool') {
		const bit = booleanToBit(_param);
		return bit === undefined ? _param : bit === 1;
	}
	// Normalize binary values before cloning objects to preserve their bytes.
	const normalizedParam = _param instanceof Uint8Array ? bytesToHex(_param) : _param;
	const param =
		typeof normalizedParam === 'object' && !Array.isArray(normalizedParam)
			? { ...normalizedParam }
			: normalizedParam;
	const paramTypeBytes = /^bytes([0-9]*)$/;
	const paramTypeBytesArray = /^bytes([0-9]*)\[\]$/;
	const paramTypeNumber = /^(u?int)([0-9]*)$/;
	const paramTypeNumberArray = /^(u?int)([0-9]*)\[\]$/;
	const paramTypeBoolArray = /^bool\[\]$/;

	// Format BN to string
	if (param instanceof BigInt) {
		return param.toString(10);
	}

	if (
		paramTypeBytesArray.exec(type) ||
		paramTypeNumberArray.exec(type) ||
		paramTypeBoolArray.exec(type)
	) {
		// Only an array is mapped element-wise: spreading a string split `'123'` into
		// `['1', '2', '3']` and encoded a value the caller never wrote (P4-L-34). Anything else
		// is left to the coder, which rejects it.
		if (!Array.isArray(param)) {
			return param;
		}
		return (param as unknown[]).map(p => formatParam(type.replace('[]', ''), p));
	}

	// Format correct width for u?int[0-9]*
	let match = paramTypeNumber.exec(type);
	if (match) {
		const size = parseInt(match[2] ? match[2] : '256', 10);
		// Only a hex string carries a width worth normalising. A decimal string is a plain
		// number to the coder, and left-padding it with zeros turned '-57' into '00000-57',
		// which no longer parsed as a number for any `intN` narrower than 256 bits.
		if (typeof param === 'string' && STRICT_HEX.test(param) && size / 8 < param.length) {
			// pad to correct bit width
			return leftPad(param, size);
		}
	}

	// Fixed bytes must already have their declared width. Let the coder validate
	// them without padding or normalizing away a missing nibble.
	match = paramTypeBytes.exec(type);
	if (match) {
		return match[1] ? param : formatOddHexstrings(param as string);
	}
	return param;
};

export const modifyParams = (
	coder: ReturnType<AbiCoder['_getCoder']>,
	param: unknown[],
): unknown => {
	if (coder.name === 'array') {
		return param.map(p =>
			modifyParams(ethersAbiCoder._getCoder(ParamType.from(coder.type.replace('[]', ''))), [
				p,
			]),
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
	(coder as any).coders.forEach((c: ReturnType<AbiCoder['_getCoder']>, i: number) => {
		if (c.name === 'tuple') {
			modifyParams(c, [param[i]]);
		} else {
			param[i] = formatParam(c.name, param[i]);
		}
	});
	return [];
};

/**
 *  used to flatten json abi inputs/outputs into an array of type-representing-strings
 */

export const flattenTypes = (
	includeTuple: boolean,
	puts: ReadonlyArray<AbiParameter>,
): string[] => {
	const types: string[] = [];

	puts.forEach(param => {
		// ABI JSON is untrusted input: a parameter without a string `type` is an error, not a
		// raw TypeError from `.startsWith` / `.replace` below (I-10).
		if (typeof param?.type !== 'string') {
			throw new AbiError(
				`Invalid ABI parameter: missing "type" in ${JSON.stringify(param) ?? 'undefined'}`,
			);
		}
		if (typeof param.components === 'object') {
			if (!param.type.startsWith('tuple')) {
				throw new AbiError(
					`Invalid value given "${param.type}". Error: components found but type is not tuple.`,
				);
			}
			const arrayBracket = param.type.indexOf('[');
			const suffix = arrayBracket >= 0 ? param.type.substring(arrayBracket) : '';
			const result = flattenTypes(includeTuple, param.components);

			if (Array.isArray(result) && includeTuple) {
				types.push(`tuple(${result.join(',')})${suffix}`);
			} else if (!includeTuple) {
				types.push(`(${result.join(',')})${suffix}`);
			} else {
				types.push(`(${result.join()})`);
			}
		} else {
			types.push(param.type.replace(/^(u?int)(?=$|\[)/, '$1256'));
		}
	});

	return types;
};

/** Expand integer aliases in signature parameters, preserving the function/event/error name. */
export const canonicalizeSignature = (signature: string): string => {
	const paramsStart = signature.indexOf('(');
	if (paramsStart < 0) return signature;
	return (
		signature.slice(0, paramsStart) +
		signature.slice(paramsStart).replace(/\b(u?int)\b/g, '$1256')
	);
};

/**
 * Should be used to create full function/event name from json abi
 * returns a string
 */
export const jsonInterfaceMethodToString = (json: AbiFragment): string => {
	if (isAbiErrorFragment(json) || isAbiEventFragment(json) || isAbiFunctionFragment(json)) {
		if (json.name?.includes('(')) {
			return canonicalizeSignature(json.name);
		}

		return `${json.name ?? ''}(${flattenTypes(false, json.inputs ?? []).join(',')})`;
	}

	// Constructor fragment
	return `(${flattenTypes(false, json.inputs ?? []).join(',')})`;
};
