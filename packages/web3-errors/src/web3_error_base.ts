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
		if (value === null || value === undefined) return 'undefined';

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
			innerError: this.innerError,
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
		const text = BaseWeb3Error.convertToString(value, true);
		if (text.length <= MAX_ECHOED_VALUE_LENGTH) return text;
		return `${text.slice(0, MAX_ECHOED_VALUE_LENGTH)}... [truncated, ${
			text.length
		} characters]`;
	}
}
