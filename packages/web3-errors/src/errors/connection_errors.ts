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

import { ConnectionEvent } from '@theqrl/web3-types';
import {
	ERR_CONN,
	ERR_CONN_INVALID,
	ERR_CONN_TIMEOUT,
	ERR_CONN_NOT_OPEN,
	ERR_CONN_CLOSE,
	ERR_CONN_MAX_ATTEMPTS,
	ERR_CONN_PENDING_REQUESTS,
	ERR_REQ_ALREADY_SENT,
	ERR_CONN_HTTP_STATUS,
} from '../error_codes.js';
import { BaseWeb3Error, truncateEchoedText, toJsonSafe } from '../web3_error_base.js';

export class ConnectionError extends BaseWeb3Error {
	public code = ERR_CONN;
	public errorCode?: number;
	public errorReason?: string;

	public constructor(message: string, event?: ConnectionEvent) {
		super(message);

		if (event) {
			this.errorCode = event.code;
			this.errorReason = event.reason;
		}
	}

	public toJSON() {
		return { ...super.toJSON(), errorCode: this.errorCode, errorReason: this.errorReason };
	}
}

/**
 * The endpoint could not be reached. `host` is the `host:port` of the endpoint, never the
 * full URL; `event.reason`, when given, is the transport's error code (`ECONNREFUSED`,
 * `ENOTFOUND`, ...) and is appended to the message.
 */
export class InvalidConnectionError extends ConnectionError {
	public constructor(
		public host: string,
		event?: ConnectionEvent,
	) {
		super(
			`CONNECTION ERROR: Couldn't connect to node ${host}.${
				event?.reason ? ` Reason: ${event.reason}` : ''
			}`,
			event,
		);
		this.code = ERR_CONN_INVALID;
	}

	public toJSON() {
		return { ...super.toJSON(), host: this.host };
	}
}

export class ConnectionTimeoutError extends ConnectionError {
	public constructor(public duration: number) {
		super(`CONNECTION TIMEOUT: timeout of ${duration}ms achieved`);
		this.code = ERR_CONN_TIMEOUT;
	}

	public toJSON() {
		return { ...super.toJSON(), duration: this.duration };
	}
}

export class ConnectionNotOpenError extends ConnectionError {
	public constructor(event?: ConnectionEvent) {
		super('Connection not open', event);
		this.code = ERR_CONN_NOT_OPEN;
	}
}

export class ConnectionCloseError extends ConnectionError {
	public constructor(event?: ConnectionEvent) {
		super(
			`CONNECTION ERROR: The connection got closed with the close code ${
				event?.code ?? ''
			} and the following reason string ${event?.reason ?? ''}`,
			event,
		);
		this.code = ERR_CONN_CLOSE;
	}
}

export class MaxAttemptsReachedOnReconnectingError extends ConnectionError {
	public constructor(numberOfAttempts: number) {
		super(`Maximum number of reconnect attempts reached! (${numberOfAttempts})`);
		this.code = ERR_CONN_MAX_ATTEMPTS;
	}
}

export class PendingRequestsOnReconnectingError extends ConnectionError {
	public constructor() {
		super('CONNECTION ERROR: Provider started to reconnect before the response got received!');
		this.code = ERR_CONN_PENDING_REQUESTS;
	}
}

export class RequestAlreadySentError extends ConnectionError {
	public constructor(id: number | string) {
		super(`Request already sent with following id: ${id}`);
		this.code = ERR_REQ_ALREADY_SENT;
	}
}

/** HTTP statuses that conventionally invite a retry after a back-off. */
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Thrown by the HTTP provider when the endpoint answers with a non-2xx status (L-47).
 *
 * - `status` / `statusText`: the HTTP status line, also exposed as `errorCode` /
 *   `errorReason` like every {@link ConnectionError}.
 * - `retryAfter`: the `Retry-After` header in **seconds** (a delta or an HTTP date, both
 *   converted), `undefined` when absent or unparseable.
 * - `retryable`: `true` for 408, 425, 429 and the 5xx gateway/server statuses.
 * - `innerError`: a `ResponseError` built from the body when it was a JSON-RPC error reply
 *   (some endpoints pair a 4xx/5xx with one); an HTML or plain-text error page is dropped.
 * - `data`: that reply's `error.data`, kept at the top level as well so that a revert
 *   reported with a non-2xx status stays decodable (`ContractExecutionError` reads it).
 */
export class HttpStatusError extends ConnectionError {
	public readonly retryable: boolean;
	public data?: unknown;

	public constructor(
		public status: number,
		public statusText?: string,
		public retryAfter?: number,
		innerError?: Error,
	) {
		super(
			`HTTP STATUS ERROR: the JSON-RPC endpoint answered with HTTP ${status}${
				statusText ? ` (${truncateEchoedText(statusText)})` : ''
			}${retryAfter === undefined ? '' : `, retry after ${retryAfter}s`}${
				// The inner error usually wraps the node's reply. One of this library's errors
				// has bounded the node's text itself; any other error's message is bounded here
				// like every echoed, node-supplied text (P4-L-24).
				typeof innerError?.message === 'string' && innerError.message
					? `. ${
							innerError instanceof BaseWeb3Error
								? innerError.message
								: truncateEchoedText(innerError.message)
						}`
					: ''
			}`,
			{ code: status, reason: statusText },
		);
		this.code = ERR_CONN_HTTP_STATUS;
		this.innerError = innerError;
		this.data = (innerError as { data?: unknown } | undefined)?.data;
		this.retryable = RETRYABLE_HTTP_STATUSES.has(status);
	}

	public toJSON() {
		return {
			...super.toJSON(),
			status: this.status,
			statusText: this.statusText,
			retryAfter: this.retryAfter,
			retryable: this.retryable,
			data: toJsonSafe(this.data),
		};
	}
}
