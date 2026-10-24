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

import { Web3Error } from '@theqrl/web3-types';

/**
 * Longest rendering of an offending value that an {@link InvalidValueError} message carries.
 * Anything longer is cut, so a multi-megabyte input yields a message of a few hundred bytes.
 */
export const MAX_ECHOED_VALUE_LENGTH = 256;

/**
 * Cuts a caller- or node-supplied text to {@link MAX_ECHOED_VALUE_LENGTH} characters for use in
 * an error message, naming the original length. Only what is echoed in `message` is bounded: the
 * full text stays wherever the caller keeps it (an `innerError`, a `data` member), so a
 * multi-megabyte `error.message` from a node cannot dictate the size of the error (P4-L-24).
 */
export const truncateEchoedText = (text: string): string => {
	const value = typeof text === 'string' ? text : String(text);
	return value.length <= MAX_ECHOED_VALUE_LENGTH
		? value
		: `${value.slice(0, MAX_ECHOED_VALUE_LENGTH)}... [truncated, ${value.length} characters]`;
};

/** JSON-safe diagnostic copy with bigint, cycle and depth handling. */
export const toJsonSafe = (value: unknown, ancestors = new Set<object>(), depth = 0): unknown => {
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'function' || typeof value === 'symbol') return undefined;
	// eslint-disable-next-line no-null/no-null -- JSON null is a diagnostic value.
	if (typeof value !== 'object' || value === null) return value;
	if (ancestors.has(value)) return '[Circular]';
	if (depth >= 64) return '[Maximum depth]';
	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			return Array.from({ length: value.length }, (_, index) => {
				const descriptor = Object.getOwnPropertyDescriptor(value, index);
				return descriptor && 'value' in descriptor
					? toJsonSafe(descriptor.value, ancestors, depth + 1)
					: undefined;
			});
		}
		const entries: [string, unknown][] =
			value instanceof Error
				? [
						['name', value.name],
						['message', value.message],
					]
				: [];
		for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
			if (descriptor.enumerable && 'value' in descriptor && key !== 'toJSON') {
				entries.push([key, toJsonSafe(descriptor.value, ancestors, depth + 1)]);
			}
		}
		return Object.fromEntries(entries);
	} catch {
		return '[Unserialisable object]';
	} finally {
		ancestors.delete(value);
	}
};

/**
 * Strips the user-info (`user:password@`) and everything after the authority (path, query,
 * fragment) from a URL-looking string, so that a credential or an API key embedded in a
 * client URL never ends up in an error message or a log line (L-48).
 *
 * The scheme and the `host:port` are kept, which is what a user needs to recognise the
 * endpoint. Strings that do not look like a URL (an IPC path, an empty string) are returned
 * unchanged, and non-strings are rendered with `String()`.
 */
export const redactClientUrl = (clientUrl: unknown): string => {
	if (typeof clientUrl !== 'string') return String(clientUrl);
	const match = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*@)?([^/?#]*)([/?#][\s\S]*)?$/i.exec(clientUrl);
	if (!match) return clientUrl;
	const [, scheme, userInfo, authority, rest] = match;
	return `${scheme}${userInfo ? '***@' : ''}${authority}${
		rest === undefined || rest === '/' ? (rest ?? '') : '/[redacted]'
	}`;
};

export abstract class BaseWeb3Error extends Error implements Web3Error {
	public readonly name: string;
	public abstract readonly code: number;
	public stack: string | undefined;
	public innerError: Error | Error[] | undefined;

	public constructor(msg?: string, innerError?: Error | Error[]) {
		super(msg);
		this.innerError = innerError;
		this.name = this.constructor.name;

		if (typeof Error.captureStackTrace === 'function') {
			// Captured onto this instance, with the frames of the concrete constructor
			// (`new.target`) and above omitted. The previous
			// `Error.captureStackTrace(new.target.constructor)` captured onto the global
			// `Function` object instead, defining a `stack` property on it at every
			// construction (I-15).
			Error.captureStackTrace(this, new.target);
		} else {
			this.stack = new Error().stack;
		}
	}

	/**
	 * Renders a value for an error message. BigInts are rendered as decimal strings.
	 *
	 * Never throws: a circular structure or a throwing `toJSON` is rendered as a placeholder
	 * instead of turning a typed error into a raw `TypeError` thrown from inside an error
	 * constructor (I-15).
	 */
	public static convertToString(value: unknown, unquotValue = false) {
		// Using "null" value intentionally for validation
		// eslint-disable-next-line no-null/no-null
		if (value === null) return 'null';
		if (value === undefined) return 'undefined';

		let result: string | undefined;
		try {
			result = JSON.stringify(
				value,
				(_, v) => (typeof v === 'bigint' ? v.toString() : v) as unknown,
			);
		} catch {
			result = `[unserialisable ${typeof value}]`;
		}
		// `JSON.stringify` yields `undefined` for a function or a symbol.
		if (result === undefined) return 'undefined';

		return unquotValue && ['bigint', 'string'].includes(typeof value)
			? result.replace(/['\\"]+/g, '')
			: result;
	}

	public toJSON() {
		return {
			name: this.name,
			code: this.code,
			message: this.message,
			innerError: toJsonSafe(this.innerError),
		};
	}
}

export abstract class InvalidValueError extends BaseWeb3Error {
	public readonly name: string;

	public constructor(value: unknown, msg: string) {
		super(`Invalid value given "${InvalidValueError.describeValue(value)}". Error: ${msg}.`);
		this.name = this.constructor.name;
	}

	/**
	 * The offending value, rendered without ever throwing and cut to
	 * {@link MAX_ECHOED_VALUE_LENGTH} characters: the value is caller (or node) supplied, so
	 * its size must not dictate the size of the message (I-15).
	 */
	private static describeValue(value: unknown): string {
		return truncateEchoedText(BaseWeb3Error.convertToString(value, true));
	}
}
