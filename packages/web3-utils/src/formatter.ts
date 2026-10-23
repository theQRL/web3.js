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
import { FormatterError } from '@theqrl/web3-errors';
import { Bytes, DataFormat, FMT_BYTES, FMT_NUMBER, FormatType } from '@theqrl/web3-types';
import {
	isNullish,
	isObject,
	JsonSchema,
	utils,
	ValidationSchemaInput,
} from '@theqrl/web3-validator';
import { bytesToUint8Array, bytesToHex, numberToHex, toBigInt } from './converters.js';
import { deepCopy, MAX_NESTING_DEPTH } from './objects.js';
import { padLeft } from './string_manipulation.js';
import { uint8ArrayConcat } from './uint8array.js';

const { parseBaseType } = utils;

const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER = BigInt(Number.MIN_SAFE_INTEGER);

export const isDataFormat = (dataFormat: unknown): dataFormat is DataFormat =>
	typeof dataFormat === 'object' &&
	!isNullish(dataFormat) &&
	'number' in dataFormat &&
	'bytes' in dataFormat;

/**
 * Finds the schema that corresponds to a specific data path within a larger JSON schema.
 * It works by iterating over the dataPath array and traversing the JSON schema one step at a time until it reaches the end of the path.
 *
 * @param schema - represents a JSON schema, which is an object that describes the structure of JSON data
 * @param dataPath - represents an array of strings that specifies the path to the data within the JSON schema
 * @param oneOfPath - represents an optional array of two-element tuples that specifies the "oneOf" option to choose, if the schema has oneOf and the data path can match multiple subschemas
 * @returns the JSON schema that matches the data path
 *
 */
const findSchemaByDataPath = (
	schema: JsonSchema,
	dataPath: string[],
	oneOfPath: [string, number][] = [],
): JsonSchema | undefined => {
	let result: JsonSchema = { ...schema } as JsonSchema;
	let previousDataPath: string | undefined;

	for (const dataPart of dataPath) {
		if (result.oneOf && previousDataPath) {
			const prev = previousDataPath ?? '';
			const path = oneOfPath.find((element: [string, number]) => prev === element[0]);

			if (path && path[0] === previousDataPath) {
				result = result.oneOf[path[1]];
			}
		}
		if (!result.properties && !result.items) {
			return undefined;
		}

		if (result.properties) {
			result = (result.properties as Record<string, JsonSchema>)[dataPart];
		} else if (result.items && (result.items as JsonSchema).properties) {
			const node = (result.items as JsonSchema).properties as Record<string, JsonSchema>;

			if (!node) {
				return undefined;
			}

			result = node[dataPart];
		} else if (result.items && isObject(result.items)) {
			result = result.items;
		} else if (result.items && Array.isArray(result.items)) {
			result = result.items[parseInt(dataPart, 10)];
		}

		if (result && dataPart) previousDataPath = dataPart;
	}

	return result;
};
/**
 * Converts a value depending on the format
 *
 * A value that cannot be parsed as the given type is returned unchanged: the scope of this
 * function is formatting, not validation.
 *
 * @param value - value to convert
 * @param qrlType - The type of the value to be parsed
 * @param format - The format to be converted to
 * @returns - The value converted to the specified format
 * @throws FormatterError when `format.number` is {@link FMT_NUMBER.NUMBER} and the value lies
 * outside the safe integer range: a JavaScript number cannot hold it without rounding (L-55).
 */
export const convertScalarValue = (value: unknown, qrlType: string, format: DataFormat) => {
	const { baseType, baseTypeSize } = parseBaseType(qrlType);

	if (baseType === 'int' || baseType === 'uint') {
		let parsed: bigint;
		try {
			parsed = toBigInt(value);
		} catch {
			return value;
		}

		switch (format.number) {
			case FMT_NUMBER.NUMBER:
				// 1 QRL is 1e18 planck, so silently rounding here corrupted every realistic
				// balance, value or fee a caller asked for in this format.
				if (parsed > MAX_SAFE_INTEGER || parsed < MIN_SAFE_INTEGER) {
					throw new FormatterError(
						`Value ${parsed.toString()} cannot be represented as a JavaScript number without loss of precision; use FMT_NUMBER.BIGINT, FMT_NUMBER.STR or FMT_NUMBER.HEX`,
					);
				}
				return Number(parsed);
			case FMT_NUMBER.HEX:
				return numberToHex(parsed);
			case FMT_NUMBER.STR:
				return parsed.toString();
			case FMT_NUMBER.BIGINT:
				return parsed;
			default:
				// An unknown number format leaves the value untouched.
				return value;
		}
	}

	if (baseType === 'bytes') {
		try {
			let paddedValue;
			if (baseTypeSize) {
				if (typeof value === 'string') paddedValue = padLeft(value, baseTypeSize * 2);
				else if (value instanceof Uint8Array) {
					paddedValue = uint8ArrayConcat(
						new Uint8Array(baseTypeSize - value.length),
						value,
					);
				}
			} else {
				paddedValue = value;
			}
			switch (format.bytes) {
				case FMT_BYTES.HEX:
					return bytesToHex(bytesToUint8Array(paddedValue as Bytes));
				case FMT_BYTES.UINT8ARRAY:
					return bytesToUint8Array(paddedValue as Bytes);
				default:
					return value;
			}
		} catch {
			return value;
		}
	}

	return value;
};

const assertDepth = (depth: number): void => {
	if (depth > MAX_NESTING_DEPTH) {
		throw new FormatterError(`Data nesting exceeds the maximum depth of ${MAX_NESTING_DEPTH}`);
	}
};

/**
 * The schema that applies to an array value once a `oneOf` has been resolved against the data:
 * the alternative whose `items` type matches the first element. This is the (naive) handling
 * of `BlockSchema.transactions`, which is either an array of hashes or an array of objects.
 */
const resolveArraySchema = (schemaProp: JsonSchema, value: unknown[]): JsonSchema => {
	if (isNullish(schemaProp.oneOf) || Array.isArray(schemaProp.items)) {
		return schemaProp;
	}

	// An empty array has no first element to pick the alternative by: it takes the first
	// alternative that describes array items, so `transactions: []` stays an empty array
	// instead of vanishing from every empty block (P4-M-6).
	if (value.length === 0) {
		return (
			schemaProp.oneOf.find(alternative => !isNullish(alternative?.items)) ?? schemaProp
		);
	}

	let resolved = schemaProp;
	for (const alternative of schemaProp.oneOf) {
		const itemsType = (alternative?.items as JsonSchema | undefined)?.type;
		if (
			(typeof value[0] === 'object' && itemsType === 'object') ||
			(typeof value[0] === 'string' && itemsType !== 'object')
		) {
			resolved = alternative;
		}
	}

	return resolved;
};

/**
 * Formats an object in place against the schema node that describes it. Keys without a
 * schema are removed; a `null` under a schema key is kept as `null` (the node said so);
 * schema lookups are own-property lookups so a node-supplied key such as `toString` or
 * `constructor` never resolves to an `Object.prototype` member.
 */
const convertObject = (
	object: Record<string, unknown>,
	nodeSchema: JsonSchema,
	format: DataFormat,
	depth: number,
): void => {
	assertDepth(depth);

	// An object handed in where an array of objects was described is formatted as one of its
	// elements (kept from the path based lookup, which fell through to `items.properties`).
	const properties =
		nodeSchema.properties ??
		(isObject(nodeSchema.items) ? nodeSchema.items.properties : undefined);

	for (const [key, value] of Object.entries(object)) {
		const schemaProp =
			!isNullish(properties) && Object.prototype.hasOwnProperty.call(properties, key)
				? properties[key]
				: undefined;

		if (isNullish(schemaProp)) {
			delete object[key];
			continue;
		}

		if (isObject(value)) {
			convertObject(value, schemaProp, format, depth + 1);
			continue;
		}

		if (Array.isArray(value)) {
			const arraySchema = resolveArraySchema(schemaProp, value);

			if (isNullish(arraySchema.items)) {
				// No item schema: an empty array is kept as the empty array it is (P4-M-6); a
				// non-empty one cannot be formatted and is dropped.
				if (value.length === 0) {
					continue;
				}
				delete object[key];
				continue;
			}

			// eslint-disable-next-line no-use-before-define
			convertArray(value, arraySchema, format, depth + 1);
			continue;
		}

		object[key] = convertScalarValue(value, schemaProp.format as string, format);
	}
};

/**
 * Formats one array element against the schema of the array's items and returns the value to
 * store in its place. Objects and nested arrays are formatted in place; everything else is
 * converted as a scalar, which leaves an unparseable value untouched.
 */
const convertElement = (
	element: unknown,
	itemSchema: JsonSchema,
	format: DataFormat,
	depth: number,
): unknown => {
	if (!isNullish(itemSchema.format)) {
		return convertScalarValue(element, itemSchema.format, format);
	}

	if (isObject(element)) {
		convertObject(element, itemSchema, format, depth);
		return element;
	}

	if (Array.isArray(element)) {
		const arraySchema = resolveArraySchema(itemSchema, element);

		if (!isNullish(arraySchema.items)) {
			// eslint-disable-next-line no-use-before-define
			convertArray(element, arraySchema, format, depth);
		}
		return element;
	}

	// A scalar under a schema that declares no format has nothing to be converted to.
	return element;
};

/**
 * Formats an array in place. `items` is either one schema for every element (scalars, objects
 * or, for a nested array such as `feeHistory.reward`, arrays again) or a tuple of per-position
 * schemas; positions without a schema are left untouched.
 */
const convertArray = (
	array: unknown[],
	arraySchema: JsonSchema,
	format: DataFormat,
	depth: number,
): void => {
	assertDepth(depth);

	const { items } = arraySchema;

	if (Array.isArray(items)) {
		for (let i = 0; i < array.length; i += 1) {
			const itemSchema = items[i];
			if (!isNullish(itemSchema)) {
				array[i] = convertElement(array[i], itemSchema, format, depth + 1);
			}
		}
		return;
	}

	if (!isObject(items)) {
		return;
	}

	for (let i = 0; i < array.length; i += 1) {
		array[i] = convertElement(array[i], items, format, depth + 1);
	}
};

/**
 * Converts the data to the specified format
 *
 * The data is formatted in place. Prefer the exported `format()` function, which copies the data first.
 *
 * @param data - data to convert
 * @param schema - The JSON schema that describes the structure of the data
 * @param dataPath - A string array that specifies the path to the data within the JSON schema
 * @param format  - The format to be converted to
 * @param oneOfPath - An optional array of two-element tuples that specifies the "oneOf" option to choose, if the schema has oneOf and the data path can match multiple subschemas
 * @returns - The data converted to the specified format
 */
export const convert = (
	data: Record<string, unknown> | unknown[] | unknown,
	schema: JsonSchema,
	dataPath: string[],
	format: DataFormat,
	oneOfPath: [string, number][] = [],
) => {
	const nodeSchema =
		dataPath.length > 0 ? findSchemaByDataPath(schema, dataPath, oneOfPath) : schema;

	if (isNullish(nodeSchema)) {
		return data;
	}

	if (isObject(data)) {
		convertObject(data, nodeSchema, format, dataPath.length);
		return data;
	}

	if (Array.isArray(data)) {
		const arraySchema = resolveArraySchema(nodeSchema, data);
		if (!isNullish(arraySchema.items)) {
			convertArray(data, arraySchema, format, dataPath.length);
		}
		return data;
	}

	return convertScalarValue(data, nodeSchema.format as string, format);
};

/**
 * Formats data (a scalar, an object or an array) according to a JSON schema and the requested
 * {@link DataFormat}.
 *
 * The caller's data is never modified: objects, arrays and the objects nested inside arrays
 * are deep-copied first (L-20). Nested arrays (`uint[][]`, `feeHistory.reward`) and top-level
 * arrays of objects are formatted like any other value (L-21). A `null` member under a schema
 * key is kept as `null`, and an empty array under a `oneOf` of array schemas stays `[]`
 * (P4-M-6).
 *
 * @throws FormatterError for a schema without `properties`, `items` or `format`, for data
 * nested deeper than {@link MAX_NESTING_DEPTH} (L-31), and for a number that does not fit a
 * JavaScript number when {@link FMT_NUMBER.NUMBER} is requested (L-55).
 */
export const format = <
	DataType extends Record<string, unknown> | unknown[] | unknown,
	ReturnType extends DataFormat,
>(
	schema: ValidationSchemaInput | JsonSchema,
	data: DataType,
	returnFormat: ReturnType,
): FormatType<DataType, ReturnType> => {
	const jsonSchema: JsonSchema = isObject(schema) ? schema : utils.qrlAbiToJsonSchema(schema);

	if (!jsonSchema.properties && !jsonSchema.items && !jsonSchema.format) {
		throw new FormatterError('Invalid json schema for formatting');
	}

	let result: unknown;

	if (isObject(data)) {
		// `deepCopy` keeps `null` members, so a reply's `to: null` or `blockNumber: null`
		// survives formatting (pass-3 follow-up on null preservation).
		const copy = deepCopy(data);
		convertObject(copy, jsonSchema, returnFormat, 0);
		result = copy;
	} else if (Array.isArray(data)) {
		// Array elements are deep-copied too, so the copy shares nothing with the caller.
		const copy = deepCopy(data);
		const arraySchema = resolveArraySchema(jsonSchema, copy);
		if (!isNullish(arraySchema.items)) {
			convertArray(copy, arraySchema, returnFormat, 0);
		}
		result = copy;
	} else {
		result = convertScalarValue(data, jsonSchema.format as string, returnFormat);
	}

	return result as FormatType<DataType, ReturnType>;
};
