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

import { ProviderError } from '@theqrl/web3-errors';

/**
 * Default bound on the connect / handshake / response-headers phase, in milliseconds.
 *
 * For HTTP this bounds time-to-response-headers; for WebSocket and IPC it bounds the
 * socket connect and handshake.
 */
export const DEFAULT_CONNECTION_TIMEOUT = 30_000;

/**
 * Default bound on a single JSON-RPC request/response, in milliseconds.
 *
 * Applies uniformly to HTTP, WebSocket and IPC. Time spent waiting for a connection
 * counts toward this deadline.
 */
export const DEFAULT_REQUEST_TIMEOUT = 120_000;

/**
 * Default bound on decoded response bytes accepted from a node (10 MiB).
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/**
 * Default bound on combined pending + sent request IDs outstanding per provider.
 */
export const DEFAULT_MAX_IN_FLIGHT_REQUESTS = 256;

/**
 * The longest delay a JavaScript timer can hold: 2^31 - 1 milliseconds (about 24.8 days).
 * Node and browsers silently clamp a longer `setTimeout` delay to 1 ms, so a timeout above
 * this value would fire immediately instead of "never" (P4-L-5).
 */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Constructor-level bounds shared by the HTTP and socket (WebSocket / IPC) providers.
 *
 * Every field is optional; unset fields fall back to the `DEFAULT_*` constants in this
 * module via {@link resolveProviderBounds}. There is intentionally no way to express
 * "no timeout" -- see {@link validateTimeout}.
 */
export interface ProviderBoundsOptions {
	/**
	 * Bounds the connect / handshake / response-headers phase, in milliseconds.
	 * @defaultValue {@link DEFAULT_CONNECTION_TIMEOUT} (30_000)
	 */
	connectionTimeout?: number;
	/**
	 * Bounds a single JSON-RPC request/response, in milliseconds. Must be finite.
	 * @defaultValue {@link DEFAULT_REQUEST_TIMEOUT} (120_000)
	 */
	requestTimeout?: number;
	/**
	 * Maximum decoded response bytes accepted from the node.
	 * @defaultValue {@link DEFAULT_MAX_RESPONSE_BYTES} (10 MiB)
	 */
	maxResponseBytes?: number;
	/**
	 * Maximum combined pending + sent requests outstanding per provider.
	 * Currently enforced by the socket providers only.
	 * @defaultValue {@link DEFAULT_MAX_IN_FLIGHT_REQUESTS} (256)
	 */
	maxInFlightRequests?: number;
}

/**
 * {@link ProviderBoundsOptions} with every field resolved to a validated value.
 */
export type ResolvedProviderBounds = Required<ProviderBoundsOptions>;

/**
 * Per-request overrides accepted by provider `request()` implementations.
 */
export interface RequestBoundsOptions {
	/**
	 * Overrides the provider's `requestTimeout` for this request only. Must be finite.
	 */
	requestTimeout?: number;
	/**
	 * Caller-supplied cancellation signal, composed with the request deadline.
	 */
	signal?: AbortSignal;
}

/**
 * Validates a timeout option.
 *
 * Rejects `Infinity`, `NaN`, non-numbers, non-positive values and values above
 * {@link MAX_TIMER_DELAY_MS}, which a JavaScript timer cannot hold (it would fire after 1 ms
 * instead, P4-L-5). Notably there is no "infinite" or "disabled" opt-out: a caller that wants a
 * long deadline must name a finite one, so a request can never hang forever by configuration.
 *
 * @param value - the candidate timeout in milliseconds
 * @param optionName - the option name, used in the error message
 * @returns the validated timeout
 */
export const validateTimeout = (value: number, optionName: string): number => {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		throw new ProviderError(
			`Invalid ${optionName}: expected a finite number of milliseconds greater than 0, got ${String(
				value,
			)}. Timeouts cannot be disabled or infinite.`,
		);
	}

	if (value > MAX_TIMER_DELAY_MS) {
		throw new ProviderError(
			`Invalid ${optionName}: ${String(
				value,
			)} ms exceeds the longest delay a timer can hold (${MAX_TIMER_DELAY_MS} ms, about 24.8 days); a longer value would fire after 1 ms.`,
		);
	}

	return value;
};

/**
 * Validates a positive-integer bound (byte counts, request counts).
 *
 * @param value - the candidate bound
 * @param optionName - the option name, used in the error message
 * @returns the validated bound
 */
export const validatePositiveInteger = (value: number, optionName: string): number => {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new ProviderError(
			`Invalid ${optionName}: expected a positive integer, got ${String(value)}.`,
		);
	}

	return value;
};

/**
 * Applies the shared defaults to a partial options bag and validates the result.
 *
 * Both the HTTP and socket providers should call this once in their constructor so that
 * option names, defaults and validation stay identical across transports.
 *
 * @param options - user-supplied bounds, if any
 * @returns every bound resolved to a validated value
 */
export const resolveProviderBounds = (
	options?: ProviderBoundsOptions,
): ResolvedProviderBounds => ({
	connectionTimeout: validateTimeout(
		options?.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT,
		'connectionTimeout',
	),
	requestTimeout: validateTimeout(
		options?.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT,
		'requestTimeout',
	),
	maxResponseBytes: validatePositiveInteger(
		options?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
		'maxResponseBytes',
	),
	maxInFlightRequests: validatePositiveInteger(
		options?.maxInFlightRequests ?? DEFAULT_MAX_IN_FLIGHT_REQUESTS,
		'maxInFlightRequests',
	),
});
