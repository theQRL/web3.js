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
	BaseWeb3Error,
	ConnectionError,
	ConnectionTimeoutError,
	HttpStatusError,
	InvalidClientError,
	InvalidConnectionError,
	MethodNotImplementedError,
	ProviderCapabilityError,
	ProviderError,
	RequestSerializationError,
	RequestTimeoutError,
	ResponseError,
	ResponseTooLargeError,
} from '@theqrl/web3-errors';
import {
	composeAbortSignal,
	isNullish,
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

/** Error names of the transport layer (node-fetch v2 and undici) that are wrapped (L-47, L-48). */
const TRANSPORT_ERROR_NAMES = new Set(['FetchError', 'AbortError']);

/**
 * Whether a `TypeError` thrown by `fetch` reports a transport failure. Undici (Node's `fetch`)
 * does so with the message `fetch failed` and the network error as `cause`. Any other
 * `TypeError` means `fetch` refused the request itself, before anything was sent: an invalid
 * header name or value, or credentials in the URL, which WHATWG `fetch` rejects (P4-L-23).
 */
const isTransportTypeError = (error: unknown): boolean => {
	const { message, cause } = (error ?? {}) as { message?: unknown; cause?: unknown };
	return message === 'fetch failed' || (typeof cause === 'object' && !isNullish(cause));
};

/** node-fetch's `FetchError.type` values for a redirect it did not follow. */
const REDIRECT_ERROR_TYPES = new Set(['no-redirect', 'max-redirect', 'invalid-redirect']);

/**
 * Serialises a JSON-RPC payload, turning a serialisation failure (a `bigint` in `params`, a
 * circular structure, a throwing `toJSON`) into a typed error instead of a raw `TypeError`
 * from `JSON.stringify` (I-15).
 */
const serializePayload = (payload: unknown): string => {
	let body: string | undefined;
	try {
		body = JSON.stringify(payload);
	} catch (error) {
		throw new RequestSerializationError(error instanceof Error ? error.message : undefined);
	}
	if (typeof body !== 'string') {
		throw new RequestSerializationError(`payload serialised to ${typeof body}`);
	}
	return body;
};

/**
 * Use HttpProvider to connect to a node over HTTP(S).
 *
 * Credentials belong in `providerOptions.headers` (an `authorization` or an `x-api-key`
 * header), not in the URL: a URL of the form `http://user:password@host/` is rejected at
 * construction with an `InvalidClientError`. A WHATWG `fetch` (browsers, undici) refuses such a
 * URL anyway, node-fetch would send the credentials as Basic authentication without being asked,
 * and a URL is copied into logs and error reports far more readily than a header. Every error
 * raised by this provider names the endpoint by its `host:port` only, so that an API key
 * embedded in the path cannot reach a log line either (L-48).
 *
 * A non-2xx reply is reported as {@link HttpStatusError} (status, status text, `Retry-After`
 * and, when the body was a JSON-RPC error reply, that reply as `innerError`); a transport
 * failure (refused connection, DNS failure, a refused redirect) as a
 * {@link ConnectionError} (L-47).
 */
export default class HttpProvider<
	API extends Web3APISpec = QRLExecutionAPI,
> extends Web3BaseProvider<API> {
	private readonly clientUrl: string;
	/** `host:port` of the endpoint, the only part of the URL that error messages carry. */
	private readonly endpoint: string;
	private readonly httpProviderOptions: HttpProviderOptions | undefined;
	private readonly bounds: ResolvedProviderBounds;

	public constructor(clientUrl: string, httpProviderOptions?: HttpProviderOptions) {
		super();
		const parsedUrl = HttpProvider.parseClientUrl(clientUrl);
		if (parsedUrl === undefined) throw new InvalidClientError(clientUrl);
		HttpProvider.warnIfCleartext(parsedUrl);
		this.clientUrl = clientUrl;
		this.endpoint = parsedUrl.host;
		this.httpProviderOptions = httpProviderOptions;
		// Validates every bound up-front, so a bad option fails at construction rather than
		// on the first request. Rejects Infinity/NaN/<=0: timeouts cannot be disabled.
		this.bounds = resolveProviderBounds(httpProviderOptions);
	}

	/**
	 * Accepts `http://` and `https://` URLs that the WHATWG parser accepts and that carry no
	 * credentials. A URL that `fetch` would reject at request time (`http://`, a port above
	 * 65535, `http://user:password@host/`) therefore fails at construction with the typed
	 * {@link InvalidClientError} instead (I-15); the error names the URL with its credentials
	 * and path removed.
	 */
	private static parseClientUrl(clientUrl: unknown): URL | undefined {
		if (typeof clientUrl !== 'string' || !/^http(s)?:\/\//i.test(clientUrl)) return undefined;
		try {
			const url = new URL(clientUrl);
			if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
			// Credentials belong in a header, not in the URL: a WHATWG `fetch` refuses such a
			// URL, node-fetch would silently send them as Basic authentication, and a URL is
			// copied into logs and error reports far more readily than a header.
			if (url.username !== '' || url.password !== '') return undefined;
			return url;
		} catch {
			return undefined;
		}
	}

	private static warnIfCleartext(clientUrl: URL): void {
		if (clientUrl.protocol !== 'http:') return;
		// The parsed hostname: credentials, a port or a path can no longer be mistaken for the
		// host (I-15). IPv6 literals keep their brackets.
		const host = clientUrl.hostname.toLowerCase();
		const loopbacks = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);
		if (loopbacks.has(host)) return;
		console.warn(
			`web3-providers-http: cleartext http:// URL to non-loopback host "${host}". Use https:// for production.`,
		);
	}

	/**
	 * Flattens any `HeadersInit` shape (a `Headers` instance, an array of pairs or a record)
	 * into `lower-cased name -> [name as given, value]`, so that two spellings of one header
	 * can never both be sent.
	 */
	private static headerEntries(headers: HeadersInit | undefined): Map<string, [string, string]> {
		const entries = new Map<string, [string, string]>();
		if (!headers) return entries;
		const put = (name: string, value: string) => {
			entries.set(name.toLowerCase(), [name, value]);
		};
		if (Array.isArray(headers)) {
			for (const [name, value] of headers) put(String(name), String(value));
		} else if (typeof (headers as Headers).forEach === 'function') {
			(headers as Headers).forEach((value, name) => put(name, value));
		} else {
			for (const [name, value] of Object.entries(headers)) put(name, String(value));
		}
		return entries;
	}

	/**
	 * Constructor headers, per-request headers on top, and `Content-Type: application/json`
	 * unless a `content-type` (any letter case) was supplied explicitly (I-15).
	 */
	private buildHeaders(requestHeaders: HeadersInit | undefined): Record<string, string> {
		const merged = new Map<string, [string, string]>([
			...HttpProvider.headerEntries(this.httpProviderOptions?.providerOptions?.headers),
			...HttpProvider.headerEntries(requestHeaders),
		]);
		if (!merged.has('content-type')) {
			merged.set('content-type', ['Content-Type', 'application/json']);
		}
		return Object.fromEntries(merged.values());
	}

	/** The `Retry-After` header as seconds: a delta, or an HTTP date converted to one. */
	private static parseRetryAfter(value: string | null | undefined): number | undefined {
		if (!value) return undefined;
		const trimmed = value.trim();
		if (/^\d+$/.test(trimmed)) return Number(trimmed);
		const date = Date.parse(trimmed);
		if (Number.isNaN(date)) return undefined;
		return Math.max(0, Math.ceil((date - Date.now()) / 1000));
	}

	/** Whether a parsed body is a JSON-RPC error reply (or a batch of them). */
	private static isJsonRpcErrorBody(body: unknown): boolean {
		const isErrorReply = (value: unknown) =>
			typeof value === 'object' &&
			// eslint-disable-next-line no-null/no-null
			value !== null &&
			!Array.isArray(value) &&
			typeof (value as { error?: unknown }).error === 'object' &&
			// eslint-disable-next-line no-null/no-null
			(value as { error?: unknown }).error !== null;
		return Array.isArray(body)
			? body.length > 0 && body.every(isErrorReply)
			: isErrorReply(body);
	}

	/**
	 * Builds the error for a non-2xx reply. The body is read (bounded, like any other) only
	 * to attach a JSON-RPC error reply as `innerError`; an HTML or plain-text error page is
	 * not surfaced. A bound violation, a capability failure or an abort during that read is
	 * still reported as itself.
	 */
	private async buildHttpStatusError(
		response: Response,
		signal: AbortSignal,
	): Promise<HttpStatusError> {
		const retryAfter = HttpProvider.parseRetryAfter(response.headers?.get?.('retry-after'));
		let innerError: ResponseError | undefined;
		try {
			const body: unknown = await this.parseBoundedJson(response, signal);
			if (HttpProvider.isJsonRpcErrorBody(body)) {
				innerError = new ResponseError(body as never);
			}
		} catch (error) {
			if (
				error instanceof ResponseTooLargeError ||
				error instanceof ProviderCapabilityError ||
				signal.aborted
			) {
				throw error;
			}
		}
		return new HttpStatusError(response.status, response.statusText, retryAfter, innerError);
	}

	/**
	 * Wraps a transport error into the {@link ConnectionError} family. The original error is
	 * deliberately not attached: node-fetch formats the full request URL, credentials and
	 * path included, into its messages (L-48). What is kept is the endpoint's `host:port`
	 * and the transport's error code (`ECONNREFUSED`, `ENOTFOUND`, ...).
	 */
	private wrapTransportError(error: unknown): ConnectionError {
		const { name, type, code, errno, cause } = (error ?? {}) as {
			name?: unknown;
			type?: unknown;
			code?: unknown;
			errno?: unknown;
			cause?: { code?: unknown; message?: unknown };
		};
		if (
			(typeof type === 'string' && REDIRECT_ERROR_TYPES.has(type)) ||
			cause?.message === 'unexpected redirect'
		) {
			return new ConnectionError(
				`CONNECTION ERROR: the JSON-RPC endpoint ${this.endpoint} answered with a redirect${
					type === 'no-redirect' || cause?.message === 'unexpected redirect'
						? ', which is refused unless providerOptions.redirect is set to "follow"'
						: ` that could not be followed (${String(type)})`
				}.`,
			);
		}
		const reason = [code, errno, cause?.code, type, name].find(
			(candidate): candidate is string => typeof candidate === 'string' && candidate !== '',
		);
		return new InvalidConnectionError(this.endpoint, { reason });
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
			// Aborting fetch may have already errored the stream.
			void reader.cancel().catch(() => undefined);
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
					// Not awaited and never allowed to throw: a failing or stalled cancellation
					// must not mask the size error, which request() also answers by aborting
					// the transport (P4-L-19).
					try {
						void Promise.resolve(reader.cancel()).catch(() => undefined);
					} catch {
						// Preserve the size error.
					}
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
			try {
				(body as { destroy?: () => void }).destroy?.();
			} catch {
				// A failing teardown must not mask the error being reported (P4-L-19).
			}
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
	 * finite) \> the constructor's `requestTimeout` \> the 120s default. A caller `signal` is
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
	 * Failures are typed: a payload that cannot be serialised rejects with
	 * `RequestSerializationError` before anything is sent; a non-2xx reply with
	 * {@link HttpStatusError}; a transport failure with an `InvalidConnectionError` (or a
	 * `ConnectionError` for a refused redirect) that names the endpoint's `host:port` and the
	 * transport's error code only; an unparseable 2xx body with `ResponseError`.
	 *
	 * Per-request `headers` are merged on top of the constructor's `providerOptions.headers`
	 * (same header name, any letter case: the per-request value wins), and
	 * `Content-Type: application/json` is added unless a `content-type` was given explicitly.
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
		const {
			signal: callerSignal,
			redirect,
			headers: requestHeaders,
			...fetchInit
		} = providerOptionsCombined;
		const method = (payload as unknown as { method?: string }).method;
		// Serialised before any deadline is armed: a payload that cannot be sent leaves
		// nothing behind.
		const body = serializePayload(payload);
		const headers = this.buildHeaders(requestHeaders);

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
		const abortRequest = () => fetchController.abort(requestComposition.signal.reason);
		if (headerComposition.signal.aborted) {
			abortFetch();
		} else {
			headerComposition.signal.addEventListener('abort', abortFetch, { once: true });
			// This listener survives disposal of the header deadline during body reads.
			requestComposition.signal.addEventListener('abort', abortRequest, { once: true });
		}

		let headersReceived = false;
		try {
			// Modern Node's native fetch reports truncated bodies reliably. Keep the
			// ponyfill for runtimes without a native implementation.
			const fetchRequest = globalThis.fetch ?? fetch;
			const response = await fetchRequest(this.clientUrl, {
				...fetchInit,
				// A JSON-RPC endpoint has no legitimate reason to redirect. Following one would
				// re-send the request body and every custom header (API keys included) to
				// whatever host the endpoint names, so redirects are refused unless the caller
				// opts in explicitly through `providerOptions.redirect`.
				redirect: redirect ?? 'error',
				method: 'POST',
				headers,
				body,
				signal: fetchController.signal,
			});

			// Headers are in: the connect deadline has been met, so retire it. From here the
			// body read is bounded by the request deadline alone.
			headersReceived = true;
			headerComposition.dispose();

			if (!response.ok) {
				throw await this.buildHttpStatusError(response, requestComposition.signal);
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
			if (requestComposition.signal.aborted) throw requestComposition.signal.reason;
			// Our own typed errors (HTTP status, unparseable body) are already precise.
			if (error instanceof BaseWeb3Error) throw error;
			if (headersReceived) throw this.wrapTransportError(error);
			// Anything the transport threw embeds the full URL in its message (L-48).
			const errorName = (error as { name?: unknown } | undefined)?.name;
			if (errorName === 'TypeError') {
				if (isTransportTypeError(error)) throw this.wrapTransportError(error);
				// `fetch` refused the request itself. Its message quotes the offending header
				// value or the URL, credentials included, so it is not echoed (P4-L-23).
				throw new ProviderError(
					`REQUEST REJECTED: fetch refused the request to ${this.endpoint} before sending it (TypeError). Check the header names and values in providerOptions.headers, and move credentials from the URL into an authorization header: a WHATWG fetch rejects a URL that carries them.`,
				);
			}
			if (typeof errorName === 'string' && TRANSPORT_ERROR_NAMES.has(errorName)) {
				throw this.wrapTransportError(error);
			}
			throw error;
		} finally {
			// Idempotent, and reached on every terminal path: success, error, timeout, abort.
			headerComposition.signal.removeEventListener('abort', abortFetch);
			requestComposition.signal.removeEventListener('abort', abortRequest);
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
