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
import { TypedArray } from '@theqrl/web3-types';
import { isNullish } from '@theqrl/web3-validator';

/**
 * The deepest nesting {@link mergeDeep} (and so the formatter) accepts.
 *
 * Blocks, receipts, transactions and fee histories are a handful of levels deep. A reply
 * nested thousands of levels deep parses fine (V8's `JSON.parse` is iterative) but used to
 * exhaust the call stack of the recursive copy with a raw `RangeError` (L-31).
 */
export const MAX_NESTING_DEPTH = 64;

const isIterable = (item: unknown): item is Record<string, unknown> =>
	typeof item === 'object' &&
	!isNullish(item) &&
	!Array.isArray(item) &&
	!(item instanceof TypedArray);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const assertDepth = (depth: number): void => {
	if (depth > MAX_NESTING_DEPTH) {
		throw new FormatterError(
			`Object nesting exceeds the maximum depth of ${MAX_NESTING_DEPTH}`,
		);
	}
};

const cloneValue = (value: unknown, depth: number): unknown => {
	if (Array.isArray(value)) {
		assertDepth(depth);
		// Elements are copied too: a shallow `slice(0)` shared every element object with the
		// caller, so the formatter rewrote the dApp's own `accessList` entries (L-20).
		return value.map(element => cloneValue(element, depth + 1));
	}

	if (value instanceof TypedArray) {
		return (value as Uint8Array).slice(0);
	}

	if (isIterable(value)) {
		// eslint-disable-next-line no-use-before-define
		return mergeDeepAt({}, depth, value);
	}

	return value;
};

const mergeDeepAt = (
	destination: Record<string, unknown>,
	depth: number,
	...sources: Record<string, unknown>[]
): Record<string, unknown> => {
	if (!isIterable(destination)) {
		return destination;
	}
	assertDepth(depth);
	const result = { ...destination };
	for (const src of sources) {
		// eslint-disable-next-line no-restricted-syntax
		for (const key in src) {
			if (FORBIDDEN_KEYS.has(key) || !Object.hasOwnProperty.call(src, key)) {
				continue;
			}
			if (isIterable(src[key])) {
				if (!result[key]) {
					result[key] = {};
				}
				result[key] = mergeDeepAt(
					result[key] as Record<string, unknown>,
					depth + 1,
					src[key] as Record<string, unknown>,
				);
			} else if (!isNullish(src[key])) {
				result[key] = cloneValue(src[key], depth + 1);
			}
		}
	}
	return result;
};

// The following code is a derivative work of the code from the "LiskHQ/lisk-sdk" project,
// which is licensed under Apache version 2.
/**
 * Deep merge two objects.
 *
 * The result shares nothing with the sources: nested objects, arrays and the objects inside
 * arrays are copied, typed arrays are duplicated. Prototype-polluting keys are skipped.
 *
 * @param destination - The destination object.
 * @param sources - An array of source objects.
 * @returns - The merged object.
 * @throws FormatterError when the input is nested deeper than {@link MAX_NESTING_DEPTH}.
 */
export const mergeDeep = (
	destination: Record<string, unknown>,
	...sources: Record<string, unknown>[]
): Record<string, unknown> => mergeDeepAt(destination, 0, ...sources);
