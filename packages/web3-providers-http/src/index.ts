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

import fetch from 'cross-fetch';
import {
	QRLExecutionAPI,
	JsonRpcResponseWithResult,
	Web3APIMethod,
	Web3APIPayload,
	Web3APIReturnType,
	Web3APISpec,
	Web3BaseProvider,
	Web3ProviderStatus,
} from '@theqrl/web3-types';
import {
	ConnectionTimeoutError,
	InvalidClientError,
	MethodNotImplementedError,
	ProviderCapabilityError,
	RequestTimeoutError,
	ResponseError,
	ResponseTooLargeError,
} from '@theqrl/web3-errors';
import {
	composeAbortSignal,
	resolveProviderBounds,
	validateTimeout,
	type ResolvedProviderBounds,
} from '@theqrl/web3-utils';
import { HttpProviderOptions, HttpRequestOptions } from './types.js';

export { HttpProviderOptions, HttpRequestOptions } from './types.js';

/**
 * Statuses whose responses are defined to carry no body, so a missing body stream is
 * expected rather than a sign that the bound cannot be enforced.
 */
const EMPTY_BODY_STATUSES = new Set([204, 205, 304]);

/** A WHATWG `ReadableStream` body (browsers, undici, node-fetch v3). */
const isWhatwgStream = (body: unknown): body is ReadableStream<Uint8Array> =>
	typeof (body as { getReader?: unknown } | null)?.getReader === 'function';

/**
 * A Node `Readable` body (node-fetch v2, which is what `cross-fetch` ponyfills on Node).
 *
 * Deliberately keyed on `Symbol.asyncIterator`: a `Buffer` is *synchronously* iterable, so
 * a bare `for await` over one would silently yield individual byte *numbers* instead of
 * chunks and defeat the byte accounting. Buffers are handled separately, before this.
 */
const isAsyncIterable = (body: unknown): body is AsyncIterable<unknown> =>
	typeof (body as { [Symbol.asyncIterator]?: unknown } | null)?.[Symbol.asyncIterator] ===
	'function';

export default class HttpProvider<
	API extends Web3APISpec = QRLExecutionAPI,
> extends Web3BaseProvider<API> {
	private readonly clientUrl: string;
	private readonly httpProviderOptions: HttpProviderOptions | undefined;
	private readonly bounds: ResolvedProviderBounds;

	public constructor(clientUrl: string, httpProviderOptions?: HttpProviderOptions) {
		super();
		if (!HttpProvider.validateClientUrl(clientUrl)) throw new InvalidClientError(clientUrl);
		HttpProvider.warnIfCleartext(clientUrl);
		this.clientUrl = clientUrl;
		this.httpProviderOptions = httpProviderOptions;
		// Validates every bound up-front, so a bad option fails at construction rather than
		// on the first request. Rejects Infinity/NaN/<=0: timeouts cannot be disabled.
		this.bounds = resolveProviderBounds(httpProviderOptions);
	}

	private static warnIfCleartext(clientUrl: string): void {
		if (!/^http:\/\//i.test(clientUrl)) return;
		const host = clientUrl.replace(/^http:\/\//i, '').split(/[/?#]/)[0].split(':')[0];
		const loopbacks = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
		if (loopbacks.has(host.toLowerCase())) return;
		console.warn(
			`web3-providers-http: cleartext http:// URL to non-loopback host "${host}". Use https:// for production.`,
		);
	}

	/**
	 * Reads the `content-length` header, if it is present and a sane non-negative integer.
	 *
	 * Only ever an *optimization*: the header is absent on chunked responses and can simply
	 * lie, so the streamed byte count is what actually enforces the bound.
	 */
	private static declaredContentLength(response: Response): number | undefined {
		// `??` collapses the absent-header null and a missing headers bag alike.
		const raw = response.headers?.get?.('content-length') ?? '';
		if (raw === '') return undefined;
		const declared = Number(raw);
		return Number.isInteger(declared) && declared >= 0 ? declared : undefined;
	}

	private static decodeChunks(chunks: Uint8Array[], totalBytes: number): string {
		const merged = new Uint8Array(totalBytes);
		let offset = 0;
		for (const chunk of chunks) {
			merged.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return new TextDecoder('utf-8').decode(merged);
	}

	/**
	 * Reads a response body, counting decoded bytes as they arrive and aborting the moment
	 * the running total exceeds `maxResponseBytes`.
	 *
	 * The body is only concatenated and decoded once the bounded read has completed, so an
	 * oversized response is never fully materialized. `response.text()` is never called.
	 */
	private async readBoundedText(response: Response, signal: AbortSignal): Promise<string> {
		const { maxResponseBytes } = this.bounds;
		// `??` normalizes a null body (the spec shape) and an absent one to undefined.
		const body: unknown = (response as { body?: unknown }).body ?? undefined;

		// Cheap early rejection. Not authoritative -- see declaredContentLength.
		const declared = HttpProvider.declaredContentLength(response);
		if (declared !== undefined && declared > maxResponseBytes) {
			try {
				if (isWhatwgStream(body)) {
					// A failing or stalled cancellation must not mask the size error.
					void body.cancel().catch(() => undefined);
				} else if (isAsyncIterable(body)) {
					(body as { destroy?: () => void }).destroy?.();
				}
			} catch {
				// Preserve the size error; request() also aborts the underlying transport.
			}
			throw new ResponseTooLargeError(maxResponseBytes, declared);
		}

		if (body === undefined) {
			// A genuinely empty body has no stream to read, and that is fine.
			if (declared === 0 || EMPTY_BODY_STATUSES.has(response.status)) return '';
			// Otherwise the fetch implementation is withholding the only thing that makes
			// the bound enforceable. Fail closed rather than fall back to response.text().
			throw new ProviderCapabilityError(
				'readable response body',
				'the fetch implementation returned a non-empty response with no readable body, so maxResponseBytes cannot be enforced',
			);
		}

		// An already-materialized body (a mock, or a locally constructed Response). It was
		// buffered outside our control, so there is nothing left to stream -- but its exact
		// size is known, so the bound is still enforced before we decode it.
		if (body instanceof Uint8Array) {
			if (body.byteLength > maxResponseBytes) {
				throw new ResponseTooLargeError(maxResponseBytes, body.byteLength);
			}
			return HttpProvider.decodeChunks([body], body.byteLength);
		}

		if (isWhatwgStream(body)) {
			return this.readFromReader(body.getReader(), signal);
		}

		if (isAsyncIterable(body)) {
			return this.readFromAsyncIterable(body, signal);
		}

		throw new ProviderCapabilityError(
			'readable response body',
			`the fetch implementation returned a response body of an unsupported type (${typeof body}), so maxResponseBytes cannot be enforced`,
		);
	}

	private static assertBinaryChunk(chunk: unknown): Uint8Array {
		if (!(chunk instanceof Uint8Array)) {
			throw new ProviderCapabilityError(
				'binary response chunks',
				`the response body yielded a non-binary chunk (${typeof chunk}), so response bytes cannot be counted`,
			);
		}
		return chunk;
	}

	/** Bounded read of a WHATWG stream. */
	private async readFromReader(
		reader: ReadableStreamDefaultReader<Uint8Array>,
		signal: AbortSignal,
	): Promise<string> {
		const { maxResponseBytes } = this.bounds;
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;

		// The header-phase signal is disposed once headers land, so the in-flight body is
		// bounded by cancelling the reader when the request deadline (or the caller) fires.
		const onAbort = () => {
			void reader.cancel();
		};
		signal.addEventListener('abort', onAbort, { once: true });

		try {
			for (;;) {
				if (signal.aborted) throw signal.reason;

				// eslint-disable-next-line no-await-in-loop
				const { done, value } = await reader.read();
				if (done) break;
				if (value === undefined) continue;

				const chunk = HttpProvider.assertBinaryChunk(value);
				totalBytes += chunk.byteLength;

				if (totalBytes > maxResponseBytes) {
					// eslint-disable-next-line no-await-in-loop
					await reader.cancel();
					throw new ResponseTooLargeError(maxResponseBytes, totalBytes);
				}

				chunks.push(chunk);
			}

			// Cancelling a reader makes a pending read() resolve as `done` rather than throw,
			// so the loop above exits normally on abort. Without this the partial body would
			// be returned as if it were complete.
			if (signal.aborted) throw signal.reason;
		} finally {
			signal.removeEventListener('abort', onAbort);
		}

		return HttpProvider.decodeChunks(chunks, totalBytes);
	}

	/** Bounded read of a Node `Readable` (the `cross-fetch` path on Node). */
	private async readFromAsyncIterable(
		body: AsyncIterable<unknown>,
		signal: AbortSignal,
	): Promise<string> {
		const { maxResponseBytes } = this.bounds;
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;

		const destroy = () => {
			(body as { destroy?: () => void }).destroy?.();
		};
		const onAbort = () => destroy();
		signal.addEventListener('abort', onAbort, { once: true });

		try {
			for await (const value of body) {
				if (signal.aborted) throw signal.reason;

				const chunk = HttpProvider.assertBinaryChunk(value);
				totalBytes += chunk.byteLength;

				if (totalBytes > maxResponseBytes) {
					destroy();
					throw new ResponseTooLargeError(maxResponseBytes, totalBytes);
				}

				chunks.push(chunk);
			}

			// As above: destroying the stream can end the iteration quietly rather than
			// throwing, so a partial body must not be mistaken for a complete one.
			if (signal.aborted) throw signal.reason;
		} finally {
			signal.removeEventListener('abort', onAbort);
		}

		return HttpProvider.decodeChunks(chunks, totalBytes);
	}

	private async parseBoundedJson<T>(response: Response, signal: AbortSignal): Promise<T> {
		const text = await this.readBoundedText(response, signal);
		try {
			return JSON.parse(text) as T;
		} catch (err) {
			throw new ResponseError({} as never, `Failed to parse HTTP response: ${String(err)}`);
		}
	}

	private static validateClientUrl(clientUrl: string): boolean {
		return typeof clientUrl === 'string' ? /^http(s)?:\/\//i.test(clientUrl) : false;
	}

	/* eslint-disable class-methods-use-this */
	public getStatus(): Web3ProviderStatus {
		throw new MethodNotImplementedError();
	}

	/* eslint-disable class-methods-use-this */
	public supportsSubscriptions() {
		return false;
	}

	/**
	 * Sends a single JSON-RPC request.
	 *
	 * Every request is bounded in two independent phases:
	 * - `connectionTimeout` (default 30s) bounds time-to-response-headers only.
	 * - `requestTimeout` (default 120s) bounds the whole request, body read included.
	 *
	 * Precedence for the request deadline is: `requestOptions.requestTimeout` (must be
	 * finite) > the constructor's `requestTimeout` > the 120s default. A caller `signal` is
	 * *composed* with the deadline, never substituted for it, so whichever fires first wins
	 * and neither can be used to disable the other.
	 *
	 * Response bytes are counted as they stream in and the read is aborted above
	 * `maxResponseBytes` (default 10 MiB), which throws `ResponseTooLargeError`.
	 *
	 * IMPORTANT -- a `RequestTimeoutError` means the outcome is **unknown**, not that the
	 * request was rejected. The node may have received, accepted and executed the call; only
	 * the answer failed to arrive in time. For state-changing calls such as transaction
	 * submission, a timeout must never be treated as "it did not happen" -- resubmitting
	 * without checking first risks a duplicate. Query by hash/nonce to establish the actual
	 * outcome. A caller-triggered abort carries the same caveat: it stops us waiting, it
	 * does not undo anything already in flight.
	 *
	 * @param payload - the JSON-RPC payload
	 * @param requestOptions - `fetch` options, plus an optional finite `requestTimeout`
	 * override and an optional caller `signal`
	 */
	public async request<
		Method extends Web3APIMethod<API>,
		ResultType = Web3APIReturnType<API, Method>,
	>(
		payload: Web3APIPayload<API, Method>,
		requestOptions?: HttpRequestOptions,
	): Promise<JsonRpcResponseWithResult<ResultType>> {
		const { requestTimeout: requestTimeoutOverride, ...restRequestOptions } =
			requestOptions ?? {};

		// A per-request override is validated exactly like the constructor option, so it
		// cannot smuggle in Infinity/NaN/<=0 and unbound the request.
		const requestTimeout =
			requestTimeoutOverride === undefined
				? this.bounds.requestTimeout
				: validateTimeout(requestTimeoutOverride, 'requestTimeout');
		const { connectionTimeout } = this.bounds;

		const providerOptionsCombined = {
			...this.httpProviderOptions?.providerOptions,
			...restRequestOptions,
		};
		const { signal: callerSignal, ...fetchInit } = providerOptionsCombined;
		const method = (payload as unknown as { method?: string }).method;

		// Layer 1 bounds the whole request and folds in the caller's cancellation.
		const requestComposition = composeAbortSignal({
			timeout: requestTimeout,
			signal: callerSignal ?? undefined,
			timeoutReason: () => new RequestTimeoutError(requestTimeout, method),
		});
		// Layer 2 chains off layer 1 and adds the shorter header-phase deadline. It is
		// disposed as soon as headers arrive so that it cannot cut short the body read.
		const headerComposition = composeAbortSignal({
			timeout: connectionTimeout,
			signal: requestComposition.signal,
			timeoutReason: () => new ConnectionTimeoutError(connectionTimeout),
		});
		// Keep an explicit transport abort after the header deadline is retired. Destroying
		// node-fetch's exposed body alone does not close its underlying HTTP connection.
		const fetchController = new AbortController();
		const abortFetch = () => fetchController.abort(headerComposition.signal.reason);
		if (headerComposition.signal.aborted) {
			abortFetch();
		} else {
			headerComposition.signal.addEventListener('abort', abortFetch, { once: true });
		}

		try {
			const response = await fetch(this.clientUrl, {
				...fetchInit,
				method: 'POST',
				headers: {
					...providerOptionsCombined.headers,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
				signal: fetchController.signal,
			});

			// Headers are in: the connect deadline has been met, so retire it. From here the
			// body read is bounded by the request deadline alone.
			headerComposition.dispose();

			if (!response.ok) {
				throw new ResponseError(
					(await this.parseBoundedJson(response, requestComposition.signal)) as never,
				);
			}

			return await this.parseBoundedJson<JsonRpcResponseWithResult<ResultType>>(
				response,
				requestComposition.signal,
			);
		} catch (error) {
			// Bound violations are already precise; never relabel them as timeouts.
			if (error instanceof ResponseTooLargeError) {
				fetchController.abort(error);
				throw error;
			}
			if (error instanceof ProviderCapabilityError) throw error;
			// `timedOut` is what distinguishes our deadline from the caller's cancellation:
			// an abort reason alone cannot tell them apart reliably.
			if (headerComposition.timedOut) throw new ConnectionTimeoutError(connectionTimeout);
			if (requestComposition.timedOut) throw new RequestTimeoutError(requestTimeout, method);
			// A caller-initiated abort propagates untouched.
			throw error;
		} finally {
			// Idempotent, and reached on every terminal path: success, error, timeout, abort.
			headerComposition.signal.removeEventListener('abort', abortFetch);
			headerComposition.dispose();
			requestComposition.dispose();
		}
	}

	/* eslint-disable class-methods-use-this */
	public on() {
		throw new MethodNotImplementedError();
	}

	/* eslint-disable class-methods-use-this */
	public removeListener() {
		throw new MethodNotImplementedError();
	}

	/* eslint-disable class-methods-use-this */
	public once() {
		throw new MethodNotImplementedError();
	}

	/* eslint-disable class-methods-use-this */
	public removeAllListeners() {
		throw new MethodNotImplementedError();
	}

	/* eslint-disable class-methods-use-this */
	public connect() {
		throw new MethodNotImplementedError();
	}

	/* eslint-disable class-methods-use-this */
	public disconnect() {
		throw new MethodNotImplementedError();
	}

	/* eslint-disable class-methods-use-this */
	public reset() {
		throw new MethodNotImplementedError();
	}

	/* eslint-disable class-methods-use-this */
	public reconnect() {
		throw new MethodNotImplementedError();
	}
}

export { HttpProvider };
