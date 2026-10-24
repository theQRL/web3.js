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
	JsonRpcError,
	JsonRpcPayload,
	JsonRpcResponse,
	JsonRpcResponseWithError,
} from '@theqrl/web3-types';
import { BaseWeb3Error, truncateEchoedText, toJsonSafe } from '../web3_error_base.js';
import { ERR_INVALID_RESPONSE, ERR_RESPONSE, ERR_RESPONSE_TOO_LARGE } from '../error_codes.js';

// To avoid circular package dependency, copied to code here. If you update this please update same function in `json_rpc.ts`
const isResponseWithError = <Error = unknown, Result = unknown>(
	response: JsonRpcResponse<Result, Error>,
): response is JsonRpcResponseWithError<Error> =>
	typeof response === 'object' &&
	// eslint-disable-next-line no-null/no-null
	response !== null &&
	!Array.isArray(response) &&
	response.jsonrpc === '2.0' &&
	// eslint-disable-next-line no-null/no-null
	(response.result === undefined || response.result === null) &&
	// JSON-RPC 2.0 defines `error` as an object; `"error": null` is a malformed reply.
	typeof response.error === 'object' &&
	// eslint-disable-next-line no-null/no-null
	response.error !== null &&
	!Array.isArray(response.error) &&
	(typeof response.id === 'number' || typeof response.id === 'string');

// A provider can hand back anything, `null` inside a batch array included; only an object can
// carry an `error` member, so it is checked for before it is read.
const errorOf = (value: unknown): JsonRpcError | undefined =>
	// eslint-disable-next-line no-null/no-null
	typeof value === 'object' && value !== null && 'error' in value
		? (value as { error?: JsonRpcError }).error
		: undefined;

/**
 * The node's `error.message`, bounded to the cap every echoed value gets: it used to be copied
 * verbatim, so an HTTP 500 carrying a 2 MiB message produced a 2 MiB error message (P4-L-24).
 * The full text stays reachable through `innerError`.
 */
const buildErrorMessage = (response: JsonRpcResponse<unknown, unknown>): string =>
	isResponseWithError(response) && typeof response.error.message === 'string'
		? truncateEchoedText(response.error.message)
		: '';

/**
 * A single (non-batch) reply whose `id` differs from the request's: the default
 * `Returned error: ` message carried nothing for the common case of a result reply with the
 * wrong id (I-15), so the mismatch is named instead.
 */
const describeIdMismatch = (response: unknown, request: unknown): string | undefined => {
	// eslint-disable-next-line no-null/no-null
	if (typeof request !== 'object' || request === null || Array.isArray(request)) {
		return undefined;
	}
	// eslint-disable-next-line no-null/no-null
	if (typeof response !== 'object' || response === null || Array.isArray(response)) {
		return undefined;
	}
	const requestId = (request as { id?: unknown }).id;
	const responseId = (response as { id?: unknown }).id;
	if (requestId === undefined || responseId === requestId) return undefined;
	return `Invalid JSON-RPC response: response id ${truncateEchoedText(
		BaseWeb3Error.convertToString(responseId),
	)} does not match request id ${truncateEchoedText(BaseWeb3Error.convertToString(requestId))}`;
};

export class ResponseError<ErrorType = unknown, RequestType = unknown> extends BaseWeb3Error {
	public code = ERR_RESPONSE;
	public data?: ErrorType | ErrorType[];
	public request?: JsonRpcPayload<RequestType>;

	public constructor(
		response: JsonRpcResponse<unknown, ErrorType>,
		message?: string,
		request?: JsonRpcPayload<RequestType>,
	) {
		super(
			message ??
				`Returned error: ${
					Array.isArray(response)
						? response.map(r => buildErrorMessage(r)).join(',')
						: buildErrorMessage(response)
				}`,
		);

		if (!message) {
			this.data = Array.isArray(response)
				? response.map(r => errorOf(r)?.data as ErrorType)
				: (errorOf(response)?.data as ErrorType);
		}

		this.request = request;
		const errorOrErrors: JsonRpcError | JsonRpcError[] | undefined = Array.isArray(response)
			? (response.map(r => errorOf(r)) as JsonRpcError[])
			: errorOf(response);

		this.innerError = errorOrErrors as unknown as Error | Error[] | undefined;
	}

	public toJSON() {
		return {
			...super.toJSON(),
			data: toJsonSafe(this.data),
			request: toJsonSafe(this.request),
		};
	}
}

/**
 * Thrown when a response exceeds the `maxResponseBytes` bound.
 *
 * This deliberately does not extend {@link ResponseError}: there is no JSON-RPC error
 * payload to carry, because the response was refused before (or instead of) being
 * parsed. `maxResponseBytes` is the configured limit; `receivedBytes` is the declared
 * (`content-length`) or observed decoded size when known.
 */
export class ResponseTooLargeError extends BaseWeb3Error {
	public code = ERR_RESPONSE_TOO_LARGE;

	public constructor(
		public maxResponseBytes: number,
		public receivedBytes?: number,
	) {
		super(
			`RESPONSE TOO LARGE: response ${
				receivedBytes === undefined ? '' : `of ${receivedBytes} bytes `
			}exceeds maxResponseBytes (${maxResponseBytes})`,
		);
	}

	public toJSON() {
		return {
			...super.toJSON(),
			maxResponseBytes: this.maxResponseBytes,
			receivedBytes: this.receivedBytes,
		};
	}
}

export class InvalidResponseError<ErrorType = unknown, RequestType = unknown> extends ResponseError<
	ErrorType,
	RequestType
> {
	public constructor(
		result: JsonRpcResponse<unknown, ErrorType>,
		request?: JsonRpcPayload<RequestType>,
	) {
		const mismatch = describeIdMismatch(result, request);
		const returnedError = mismatch === undefined ? '' : buildErrorMessage(result);
		super(
			result,
			mismatch === undefined
				? undefined
				: `${mismatch}${returnedError ? `. Returned error: ${returnedError}` : ''}`,
			request,
		);
		this.code = ERR_INVALID_RESPONSE;
		if (mismatch !== undefined) {
			// A custom message skips the base class's `data` extraction; keep it available.
			this.data = errorOf(result)?.data as ErrorType;
		}
		const errorOrErrors: JsonRpcError | JsonRpcError[] | undefined = Array.isArray(result)
			? (result.map(r => errorOf(r)) as JsonRpcError[])
			: errorOf(result);

		this.innerError = errorOrErrors as unknown as Error | Error[] | undefined;
	}
}
