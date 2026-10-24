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
import { Web3ValidationErrorObject } from '@theqrl/web3-types';

import { z, ZodType, ZodIssue, ZodIssueCode, ZodTypeAny } from 'zod';

import { BaseWeb3Error, truncateEchoedText } from '@theqrl/web3-errors';
import { Web3ValidatorError } from './errors.js';
import { Json, JsonSchema, Web3ValidationOptions } from './types.js';
import formats from './formats.js';

// Depth is always bounded. An aggregate value budget is opt-in for untrusted
// data: a small global limit also rejects legitimate caller-supplied calldata.
const checkValidationBudget = (data: unknown, maxEntries?: number) => {
	if (maxEntries !== undefined && (!Number.isSafeInteger(maxEntries) || maxEntries <= 0)) {
		throw new Web3ValidatorError([
			{
				keyword: 'validationBudget',
				instancePath: '',
				schemaPath: '',
				params: { maxEntries },
				message: 'maxEntries must be a positive safe integer',
			},
		]);
	}
	let remaining = maxEntries ?? Infinity;
	const visit = (value: unknown, depth: number) => {
		remaining -= 1;
		if (remaining < 0 || depth > 64) {
			throw new Web3ValidatorError([
				{
					keyword: 'validationBudget',
					instancePath: '',
					schemaPath: '',
					params: { maxEntries, maxDepth: 64 },
					message:
						depth > 64
							? 'Validation input exceeds 64 nesting levels'
							: `Validation input exceeds ${maxEntries} entries`,
				},
			]);
		}
		if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
			// Check array size before iterating or copying its contents.
			if (Array.isArray(value) && value.length > remaining) {
				remaining = -1;
				visit(undefined, depth);
			}
			// eslint-disable-next-line no-restricted-syntax -- stop at the budget without allocating Object.keys for an unbounded object
			for (const key in value) {
				if (Object.prototype.hasOwnProperty.call(value, key))
					visit((value as Record<string, unknown>)[key], depth + 1);
			}
		}
	};
	visit(data, 0);
};

const convertToZod = (schema: JsonSchema): ZodType => {
	if ((!schema?.type || schema?.type === 'object') && schema?.properties) {
		const obj: { [key: string]: ZodType } = {};
		for (const name of Object.keys(schema.properties)) {
			const zItem = convertToZod(schema.properties[name]);
			if (zItem) {
				obj[name] = zItem;
			}
		}

		if (Array.isArray(schema.required)) {
			return z
				.object(obj)
				.partial()
				.required(schema.required.reduce((acc, v: string) => ({ ...acc, [v]: true }), {}));
		}
		return z.object(obj).partial();
	}

	if (schema?.type === 'array' && !schema?.items) {
		// Zod would build an array schema around `undefined` and fail later with a raw
		// `TypeError` (`_parseSync`); a schema that names no element type is a schema error.
		throw new Web3ValidatorError([
			{
				keyword: 'items',
				message: 'An array schema requires "items" (the element schema)',
				params: { type: 'array' },
				instancePath: '',
				schemaPath: '',
			},
		]);
	}

	if (schema?.type === 'array' && schema?.items) {
		if (Array.isArray(schema.items) && schema.items.length > 0) {
			const arr: Partial<[ZodTypeAny, ...ZodTypeAny[]]> = [];
			for (const item of schema.items) {
				const zItem = convertToZod(item);
				if (zItem) {
					arr.push(zItem);
				}
			}
			return z.tuple(arr as [ZodTypeAny, ...ZodTypeAny[]]);
		}

		// Enforce the declared size of fixed-length ABI arrays (`T[n]`).
		// Dynamic arrays (`T[]`) carry no `minItems`/`maxItems` and stay unconstrained.
		let zodArraySchema = z.array(convertToZod(schema.items as JsonSchema));
		zodArraySchema =
			typeof schema?.minItems === 'number'
				? zodArraySchema.min(schema.minItems)
				: zodArraySchema;
		zodArraySchema =
			typeof schema?.maxItems === 'number'
				? zodArraySchema.max(schema.maxItems)
				: zodArraySchema;

		return zodArraySchema;
	}

	if (schema.oneOf && Array.isArray(schema.oneOf)) {
		return z.union(
			schema.oneOf.map(oneOfSchema => convertToZod(oneOfSchema)) as [
				ZodTypeAny,
				ZodTypeAny,
				...ZodTypeAny[],
			],
		);
	}

	if (schema?.format) {
		// Only the registered formats are callable: a schema naming an unknown format (or an
		// `Object.prototype` member such as `constructor`) must fail as a validation error,
		// never as `check is not a function` or by silently passing (L-26, I-11).
		const check = Object.prototype.hasOwnProperty.call(formats, schema.format)
			? formats[schema.format]
			: undefined;

		if (typeof check !== 'function') {
			throw new Web3ValidatorError([
				{
					keyword: 'format',
					message: `Unknown format "${schema.format}"`,
					params: { format: schema.format },
					instancePath: '',
					schemaPath: '',
				},
			]);
		}

		return z.any().superRefine((value: unknown, context) => {
			if (!check(value))
				context.addIssue({ code: 'custom', params: { value, format: schema.format } });
		});
	}

	if (
		schema?.type &&
		![
			'object',
			'array',
			'string',
			'number',
			'boolean',
			'bigint',
			'null',
			'undefined',
			'any',
			'unknown',
			'date',
		].includes(String(schema.type))
	) {
		throw new Web3ValidatorError([
			{
				keyword: 'type',
				instancePath: '',
				schemaPath: '',
				params: { type: schema.type },
				message: `Unsupported schema type ${String(schema.type)}`,
			},
		]);
	}
	if (
		schema?.type &&
		schema?.type !== 'object' &&
		typeof (z as unknown as { [key: string]: () => ZodType })[String(schema.type)] ===
			'function'
	) {
		return (z as unknown as { [key: string]: () => ZodType })[String(schema.type)]();
	}
	return z.object({ data: z.any() }).partial();
};

export class Validator {
	private static validatorInstance?: Validator;

	public static factory(): Validator {
		Validator.validatorInstance ??= new Validator();
		return Validator.validatorInstance;
	}

	public validate(schema: JsonSchema, data: Json, options?: Web3ValidationOptions) {
		try {
			checkValidationBudget(data, options?.maxEntries);
		} catch (error) {
			if (options?.silent && error instanceof Web3ValidatorError) return error.errors;
			throw error;
		}
		const zod = convertToZod(schema);
		const result = zod.safeParse(data);
		// Zod's SafeParseReturnType narrows to SafeParseError only on the explicit false check.
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
		if (result.success === false) {
			const errors = this.convertErrors(result.error.issues);
			if (errors) {
				if (options?.silent) {
					return errors;
				}
				throw new Web3ValidatorError(errors);
			}
		}
		return undefined;
	}
	// eslint-disable-next-line class-methods-use-this
	private convertErrors(errors: ZodIssue[] | undefined): Web3ValidationErrorObject[] | undefined {
		if (errors && Array.isArray(errors) && errors.length > 0) {
			return errors.slice(0, 100).map((error: ZodIssue) => {
				let message;
				let keyword;
				let params;
				let schemaPath;

				schemaPath = error.path.join('/');

				const field = String(error.path[error.path.length - 1]);
				const instancePath = error.path.join('/');
				if (error.code === ZodIssueCode.too_big) {
					keyword = 'maxItems';
					schemaPath = `${instancePath}/maxItems`;
					params = { limit: error.maximum };
					message = `must NOT have more than ${error.maximum} items`;
				} else if (error.code === ZodIssueCode.too_small) {
					keyword = 'minItems';
					schemaPath = `${instancePath}/minItems`;
					params = { limit: error.minimum };
					message = `must NOT have fewer than ${error.minimum} items`;
				} else if (error.code === ZodIssueCode.custom) {
					const { value, format } = (error.params ?? {}) as {
						value: unknown;
						format: string;
					};

					if (typeof value === 'undefined') {
						message = `value at "/${schemaPath}" is required`;
					} else {
						// `convertToString` never throws: a bigint or a circular object used to turn
						// the validation error into a raw `TypeError` (P4-L-39).
						message = `value "${
							// eslint-disable-next-line no-null/no-null -- `null` is reported as the node sent it
							value === null
								? 'null'
								: typeof value === 'string'
									? truncateEchoedText(value)
									: truncateEchoedText(BaseWeb3Error.convertToString(value, true))
						}" at "/${schemaPath}" must pass "${format}" validation`;
					}

					params = { value };
				}

				return {
					keyword: keyword ?? field,
					instancePath: instancePath ? `/${instancePath}` : '',
					schemaPath: schemaPath ? `#${schemaPath}` : '#',
					params: params ?? { value: error.message },
					message: message ?? error.message,
				} as Web3ValidationErrorObject;
			});
		}
		return undefined;
	}
}
