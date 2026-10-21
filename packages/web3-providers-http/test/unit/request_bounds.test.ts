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

// Must be set up before the provider (and therefore cross-fetch) is imported.
const mockFetch = jest.fn();

jest.setMock('cross-fetch', mockFetch);

import { Readable } from 'stream';
import { Web3APIPayload, QRLExecutionAPI } from '@theqrl/web3-types';
import {
	ConnectionTimeoutError,
	ProviderCapabilityError,
	ProviderError,
	RequestTimeoutError,
	ResponseTooLargeError,
} from '@theqrl/web3-errors';
import {
	DEFAULT_CONNECTION_TIMEOUT,
	DEFAULT_MAX_RESPONSE_BYTES,
	DEFAULT_REQUEST_TIMEOUT,
} from '@theqrl/web3-utils';
import HttpProvider from '../../src/index';

const payload = {
	jsonrpc: '2.0',
	id: 42,
	method: 'qrl_getBalance',
	params: ['Q00', 'latest'],
} as unknown as Web3APIPayload<QRLExecutionAPI, 'qrl_getBalance'>;

const encoder = new TextEncoder();

interface FakeResponseInit {
	status?: number;
	headers?: Record<string, string>;
	body?: unknown;
}

const fakeResponse = ({ status = 200, headers = {}, body }: FakeResponseInit) => {
	const lower = Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
	);
	return {
		ok: status >= 200 && status < 300,
		status,
		// Mirrors the real Headers.get contract, which returns null for an absent header.
		// eslint-disable-next-line no-null/no-null
		headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
		body,
	} as unknown as Response;
};

/**
 * A WHATWG stream that reports how much of it was actually pulled, so a test can prove the
 * read was abandoned rather than merely rejected after buffering everything.
 */
const countingStream = (chunks: Uint8Array[]) => {
	const state = { pulled: 0, cancelled: false, readerRequested: false };
	let index = 0;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index >= chunks.length) {
				controller.close();
				return;
			}
			state.pulled += 1;
			controller.enqueue(chunks[index]);
			index += 1;
		},
		cancel() {
			state.cancelled = true;
		},
	});
	// Note: a ReadableStream pre-pulls one chunk of its own accord (highWaterMark 1), so
	// `pulled` runs slightly ahead of what the provider consumed. Whether a reader was ever
	// requested is the honest signal for "did not touch the body".
	const originalGetReader = stream.getReader.bind(stream);
	stream.getReader = ((...args: []) => {
		state.readerRequested = true;
		return originalGetReader(...args);
	}) as typeof stream.getReader;
	return { stream, state };
};

/** A stream that yields nothing and never closes: headers arrived, body stalled. */
const stalledStream = () => {
	const state = { cancelled: false };
	const stream = new ReadableStream<Uint8Array>({
		async pull() {
			// Never enqueues and never closes -- the read hangs until cancelled.
			return new Promise<void>(() => undefined);
		},
		cancel() {
			state.cancelled = true;
		},
	});
	return { stream, state };
};

const jsonStream = (value: unknown) => {
	const bytes = encoder.encode(JSON.stringify(value));
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});
};

describe('HttpProvider - request lifecycle bounds', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe('response size bound', () => {
		it('streams and aborts a chunked body with no content-length, before buffering it all', async () => {
			// 8 x 1 KiB against a 2 KiB cap: the cap is crossed on the third chunk.
			const chunks = Array.from({ length: 8 }, () => new Uint8Array(1024).fill(0x61));
			const { stream, state } = countingStream(chunks);
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: stream }));

			const provider = new HttpProvider('http://localhost:8545', {
				maxResponseBytes: 2048,
			});

			await expect(provider.request(payload)).rejects.toThrow(ResponseTooLargeError);

			// The decisive assertion: we bailed out partway instead of draining all 8 chunks
			// into memory. The cap is crossed on the third chunk, so most are never pulled.
			expect(state.pulled).toBeLessThan(chunks.length);
			expect(state.cancelled).toBe(true);
		});

		it('enforces the streamed count when content-length lies about a small body', async () => {
			const chunks = Array.from({ length: 4 }, () => new Uint8Array(1024).fill(0x61));
			const { stream, state } = countingStream(chunks);
			// Declares 10 bytes but actually sends 4 KiB.
			mockFetch.mockResolvedValueOnce(
				fakeResponse({ headers: { 'content-length': '10' }, body: stream }),
			);

			const provider = new HttpProvider('http://localhost:8545', {
				maxResponseBytes: 2048,
			});

			await expect(provider.request(payload)).rejects.toThrow(ResponseTooLargeError);
			expect(state.cancelled).toBe(true);
		});

		it.each([200, 413])(
			'cancels an HTTP %i body rejected by content-length without reading it',
			async status => {
				jest.useFakeTimers();
				const { stream, state } = countingStream([new Uint8Array(8).fill(0x61)]);
				mockFetch.mockResolvedValueOnce(
					fakeResponse({ status, headers: { 'content-length': '99999' }, body: stream }),
				);

				const provider = new HttpProvider('http://localhost:8545', {
					maxResponseBytes: 2048,
				});
				const controller = new AbortController();
				const request = provider.request(payload, { signal: controller.signal });

				await expect(request).rejects.toThrow(ResponseTooLargeError);
				await expect(request).rejects.toMatchObject({
					maxResponseBytes: 2048,
					receivedBytes: 99999,
				});
				// Rejected on the header alone: the body was never even opened for reading.
				expect(state.readerRequested).toBe(false);
				expect(state.cancelled).toBe(true);
				const { signal } = mockFetch.mock.calls[0][1] as RequestInit;
				expect(signal?.aborted).toBe(true);
				expect(controller.signal.aborted).toBe(false);
				expect(jest.getTimerCount()).toBe(0);
			},
		);

		it.each([200, 413])(
			'destroys an HTTP %i Node body rejected by content-length',
			async status => {
				const read = jest.fn();
				const body = new Readable({ read });
				mockFetch.mockResolvedValueOnce(
					fakeResponse({ status, headers: { 'content-length': '99999' }, body }),
				);
				const provider = new HttpProvider('http://localhost:8545', {
					maxResponseBytes: 2048,
				});

				await expect(provider.request(payload)).rejects.toThrow(ResponseTooLargeError);
				expect(body.destroyed).toBe(true);
				expect(read).not.toHaveBeenCalled();
				const { signal } = mockFetch.mock.calls[0][1] as RequestInit;
				expect(signal?.aborted).toBe(true);
			},
		);

		it.each(['throw', 'reject'])(
			'preserves the size error when body cancellation fails: %s',
			async failure => {
				const body = new ReadableStream<Uint8Array>();
				const cancel = jest.spyOn(body, 'cancel');
				if (failure === 'throw') {
					cancel.mockImplementation(() => {
						throw new Error('cancel failed');
					});
				} else {
					cancel.mockRejectedValue(new Error('cancel failed'));
				}
				mockFetch.mockResolvedValueOnce(
					fakeResponse({ headers: { 'content-length': '99999' }, body }),
				);
				const provider = new HttpProvider('http://localhost:8545', {
					maxResponseBytes: 2048,
				});

				await expect(provider.request(payload)).rejects.toThrow(ResponseTooLargeError);
				expect(cancel).toHaveBeenCalledTimes(1);
				const { signal } = mockFetch.mock.calls[0][1] as RequestInit;
				expect(signal?.aborted).toBe(true);
			},
		);

		it('rejects promptly when body cancellation never settles', async () => {
			jest.useFakeTimers();
			const cancel = jest.fn(async () => new Promise<void>(() => undefined));
			const body = new ReadableStream<Uint8Array>({ cancel });
			mockFetch.mockResolvedValueOnce(
				fakeResponse({ headers: { 'content-length': '99999' }, body }),
			);
			const provider = new HttpProvider('http://localhost:8545', { maxResponseBytes: 2048 });
			const rejected = jest.fn();
			const request = provider.request(payload).catch(rejected);

			await jest.advanceTimersByTimeAsync(0);
			expect(cancel).toHaveBeenCalledTimes(1);
			expect(rejected).toHaveBeenCalledWith(expect.any(ResponseTooLargeError));
			await request;
			expect(jest.getTimerCount()).toBe(0);
		});

		it('preserves the size error and aborts transport when Node destruction throws', async () => {
			const body = new Readable({ read: jest.fn() });
			const destroy = jest.spyOn(body, 'destroy').mockImplementation(() => {
				throw new Error('destroy failed');
			});
			mockFetch.mockResolvedValueOnce(
				fakeResponse({ headers: { 'content-length': '99999' }, body }),
			);
			const provider = new HttpProvider('http://localhost:8545', { maxResponseBytes: 2048 });

			await expect(provider.request(payload)).rejects.toThrow(ResponseTooLargeError);
			expect(destroy).toHaveBeenCalledTimes(1);
			const { signal } = mockFetch.mock.calls[0][1] as RequestInit;
			expect(signal?.aborted).toBe(true);
		});

		it.each([
			['absent', undefined],
			['buffered', new Uint8Array(8)],
			['unsupported', { unreadable: true }],
		])('preserves the size error when the body is %s', async (_label, body) => {
			mockFetch.mockResolvedValueOnce(
				fakeResponse({ headers: { 'content-length': '99999' }, body }),
			);
			const provider = new HttpProvider('http://localhost:8545', { maxResponseBytes: 2048 });

			await expect(provider.request(payload)).rejects.toThrow(ResponseTooLargeError);
			const { signal } = mockFetch.mock.calls[0][1] as RequestInit;
			expect(signal?.aborted).toBe(true);
		});

		it('counts bytes, not string characters, for multi-byte content', async () => {
			// 4 chars x 3 bytes each = 12 bytes. A char count (4) would pass a 5-byte cap.
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode('"日本語語"'));
					controller.close();
				},
			});
			mockFetch.mockResolvedValueOnce(fakeResponse({ body }));

			const provider = new HttpProvider('http://localhost:8545', { maxResponseBytes: 5 });

			await expect(provider.request(payload)).rejects.toThrow(ResponseTooLargeError);
		});

		it('accepts a response under the cap and decodes it only after the bounded read', async () => {
			const expected = { jsonrpc: '2.0', id: 42, result: '0x1' };
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: jsonStream(expected) }));

			const provider = new HttpProvider('http://localhost:8545');

			await expect(provider.request(payload)).resolves.toStrictEqual(expected);
		});

		it('reassembles a multi-chunk body split mid multi-byte character', async () => {
			const bytes = encoder.encode(JSON.stringify({ jsonrpc: '2.0', id: 42, result: '日本' }));
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					// Split at an arbitrary byte, likely mid-character.
					controller.enqueue(bytes.slice(0, 30));
					controller.enqueue(bytes.slice(30));
					controller.close();
				},
			});
			mockFetch.mockResolvedValueOnce(fakeResponse({ body }));

			const provider = new HttpProvider('http://localhost:8545');

			await expect(provider.request(payload)).resolves.toStrictEqual({
				jsonrpc: '2.0',
				id: 42,
				result: '日本',
			});
		});
	});

	describe('failing closed', () => {
		it('throws ProviderCapabilityError when a non-empty response exposes no stream', async () => {
			mockFetch.mockResolvedValueOnce(
				fakeResponse({ headers: { 'content-length': '32' }, body: undefined }),
			);

			const provider = new HttpProvider('http://localhost:8545');

			// Must NOT fall back to an unbounded response.text().
			await expect(provider.request(payload)).rejects.toThrow(ProviderCapabilityError);
		});

		it('throws ProviderCapabilityError for a body of an unsupported type', async () => {
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: { nonsense: true } }));

			const provider = new HttpProvider('http://localhost:8545');

			await expect(provider.request(payload)).rejects.toThrow(ProviderCapabilityError);
		});

		it('allows a genuinely empty body (204) rather than failing closed', async () => {
			// A spec-compliant fetch reports a bodyless response as `body: null`.
			// eslint-disable-next-line no-null/no-null
			mockFetch.mockResolvedValueOnce(fakeResponse({ status: 204, body: null }));

			const provider = new HttpProvider('http://localhost:8545');

			// Empty is not valid JSON, but it must fail as a parse error, not a capability one.
			await expect(provider.request(payload)).rejects.not.toThrow(ProviderCapabilityError);
		});

		it.each([
			['Infinity', Infinity],
			['NaN', NaN],
			['zero', 0],
			['negative', -1],
		])('rejects a non-finite constructor requestTimeout (%s)', (_label, value) => {
			expect(
				() => new HttpProvider('http://localhost:8545', { requestTimeout: value }),
			).toThrow(ProviderError);
		});

		it('rejects a non-finite per-request requestTimeout override', async () => {
			const provider = new HttpProvider('http://localhost:8545');

			// There is deliberately no infinite opt-out, per-request included.
			await expect(
				provider.request(payload, { requestTimeout: Infinity }),
			).rejects.toThrow(ProviderError);
			expect(mockFetch).not.toHaveBeenCalled();
		});
	});

	describe('timeouts', () => {
		it('throws ConnectionTimeoutError when headers never arrive', async () => {
			jest.useFakeTimers();
			mockFetch.mockImplementationOnce(
				async (_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) => {
						init.signal?.addEventListener('abort', () =>
							reject((init.signal as AbortSignal).reason),
						);
					}),
			);

			const provider = new HttpProvider('http://localhost:8545');
			const promise = provider.request(payload);
			const assertion = expect(promise).rejects.toThrow(ConnectionTimeoutError);

			jest.advanceTimersByTime(DEFAULT_CONNECTION_TIMEOUT);
			await assertion;
		});

		it('throws RequestTimeoutError when headers arrive but the body stalls', async () => {
			jest.useFakeTimers();
			const { stream, state } = stalledStream();
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: stream }));

			const provider = new HttpProvider('http://localhost:8545');
			const promise = provider.request(payload);
			const assertion = expect(promise).rejects.toThrow(RequestTimeoutError);

			// The 30s connect deadline was retired once headers landed, so it must not fire
			// mid-body; only the 120s request deadline applies here.
			await Promise.resolve();
			jest.advanceTimersByTime(DEFAULT_CONNECTION_TIMEOUT + 1);
			await Promise.resolve();

			jest.advanceTimersByTime(DEFAULT_REQUEST_TIMEOUT);
			await assertion;
			expect(state.cancelled).toBe(true);
		});

		it('honours a shorter per-request requestTimeout override', async () => {
			jest.useFakeTimers();
			const { stream } = stalledStream();
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: stream }));

			const provider = new HttpProvider('http://localhost:8545');
			const promise = provider.request(payload, { requestTimeout: 1_000 });
			const assertion = expect(promise).rejects.toThrow(RequestTimeoutError);

			await Promise.resolve();
			jest.advanceTimersByTime(1_000);
			await assertion;
		});

		it('honours a constructor requestTimeout, overridden per request', async () => {
			jest.useFakeTimers();
			const { stream } = stalledStream();
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: stream }));

			// Per-request override takes precedence over the constructor value.
			const provider = new HttpProvider('http://localhost:8545', { requestTimeout: 5_000 });
			const promise = provider.request(payload, { requestTimeout: 500 });
			const assertion = expect(promise).rejects.toThrow(RequestTimeoutError);

			await Promise.resolve();
			jest.advanceTimersByTime(500);
			await assertion;
		});

		it('reports the offending method and duration on timeout', async () => {
			jest.useFakeTimers();
			const { stream } = stalledStream();
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: stream }));

			const provider = new HttpProvider('http://localhost:8545');
			const promise = provider.request(payload, { requestTimeout: 1_000 });
			const assertion = expect(promise).rejects.toMatchObject({
				duration: 1_000,
				method: 'qrl_getBalance',
			});

			await Promise.resolve();
			jest.advanceTimersByTime(1_000);
			await assertion;
		});
	});

	describe('caller cancellation', () => {
		it('propagates a caller abort and does not mislabel it as a timeout', async () => {
			const controller = new AbortController();
			const reason = new Error('caller changed their mind');
			mockFetch.mockImplementationOnce(
				async (_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) => {
						init.signal?.addEventListener('abort', () =>
							reject((init.signal as AbortSignal).reason),
						);
					}),
			);

			const provider = new HttpProvider('http://localhost:8545');
			const promise = provider.request(payload, { signal: controller.signal });

			controller.abort(reason);

			// A cancellation is not a deadline: it must surface as the caller's own reason.
			await expect(promise).rejects.toThrow(reason);
			await expect(promise).rejects.not.toThrow(RequestTimeoutError);
			await expect(promise).rejects.not.toThrow(ConnectionTimeoutError);
		});

		it('composes an already-aborted caller signal without dispatching a request', async () => {
			const controller = new AbortController();
			controller.abort(new Error('too late'));
			mockFetch.mockImplementationOnce(
				async (_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) => {
						if (init.signal?.aborted) reject((init.signal as AbortSignal).reason);
					}),
			);

			const provider = new HttpProvider('http://localhost:8545');

			await expect(
				provider.request(payload, { signal: controller.signal }),
			).rejects.toThrow('too late');
		});

		it('lets the request deadline win when the caller never cancels', async () => {
			jest.useFakeTimers();
			const controller = new AbortController();
			const { stream } = stalledStream();
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: stream }));

			const provider = new HttpProvider('http://localhost:8545');
			const promise = provider.request(payload, {
				signal: controller.signal,
				requestTimeout: 1_000,
			});
			const assertion = expect(promise).rejects.toThrow(RequestTimeoutError);

			await Promise.resolve();
			jest.advanceTimersByTime(1_000);
			await assertion;
		});
	});

	describe('resource cleanup', () => {
		const trackedSignal = () => {
			const controller = new AbortController();
			const added: unknown[] = [];
			const removed: unknown[] = [];
			const { signal } = controller;
			const originalAdd = signal.addEventListener.bind(signal);
			const originalRemove = signal.removeEventListener.bind(signal);
			jest.spyOn(signal, 'addEventListener').mockImplementation((type, listener, opts) => {
				added.push(listener);
				originalAdd(type, listener as EventListener, opts);
			});
			jest.spyOn(signal, 'removeEventListener').mockImplementation((type, listener, opts) => {
				removed.push(listener);
				originalRemove(type, listener as EventListener, opts);
			});
			return { controller, signal, added, removed };
		};

		it('leaves no pending timers after a successful request', async () => {
			jest.useFakeTimers();
			mockFetch.mockResolvedValueOnce(
				fakeResponse({ body: jsonStream({ jsonrpc: '2.0', id: 42, result: '0x1' }) }),
			);

			const provider = new HttpProvider('http://localhost:8545');
			await provider.request(payload);

			// Both the connect and request deadlines must be disposed.
			expect(jest.getTimerCount()).toBe(0);
		});

		it('leaves no pending timers after a failed request', async () => {
			jest.useFakeTimers();
			mockFetch.mockRejectedValueOnce(new Error('network down'));

			const provider = new HttpProvider('http://localhost:8545');
			await expect(provider.request(payload)).rejects.toThrow('network down');

			expect(jest.getTimerCount()).toBe(0);
		});

		it('leaves no pending timers after a size-bound rejection', async () => {
			jest.useFakeTimers();
			const { stream } = countingStream([new Uint8Array(4096).fill(0x61)]);
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: stream }));

			const provider = new HttpProvider('http://localhost:8545', { maxResponseBytes: 16 });
			await expect(provider.request(payload)).rejects.toThrow(ResponseTooLargeError);

			expect(jest.getTimerCount()).toBe(0);
		});

		it('leaves no pending timers after a timeout', async () => {
			jest.useFakeTimers();
			const { stream } = stalledStream();
			mockFetch.mockResolvedValueOnce(fakeResponse({ body: stream }));

			const provider = new HttpProvider('http://localhost:8545');
			const promise = provider.request(payload, { requestTimeout: 1_000 });
			const assertion = expect(promise).rejects.toThrow(RequestTimeoutError);

			await Promise.resolve();
			jest.advanceTimersByTime(1_000);
			await assertion;

			expect(jest.getTimerCount()).toBe(0);
		});

		it('detaches every listener from the caller signal on success', async () => {
			const { signal, added, removed } = trackedSignal();
			mockFetch.mockResolvedValueOnce(
				fakeResponse({ body: jsonStream({ jsonrpc: '2.0', id: 42, result: '0x1' }) }),
			);

			const provider = new HttpProvider('http://localhost:8545');
			await provider.request(payload, { signal });

			expect(added.length).toBeGreaterThan(0);
			// A retained listener would keep the whole request graph alive.
			expect(removed).toStrictEqual(added);
		});

		it('detaches every listener from the caller signal on rejection', async () => {
			const { signal, added, removed } = trackedSignal();
			mockFetch.mockRejectedValueOnce(new Error('network down'));

			const provider = new HttpProvider('http://localhost:8545');
			await expect(provider.request(payload, { signal })).rejects.toThrow('network down');

			expect(added.length).toBeGreaterThan(0);
			expect(removed).toStrictEqual(added);
		});
	});

	describe('defaults and option plumbing', () => {
		it('applies the documented defaults', () => {
			expect(DEFAULT_CONNECTION_TIMEOUT).toBe(30_000);
			expect(DEFAULT_REQUEST_TIMEOUT).toBe(120_000);
			expect(DEFAULT_MAX_RESPONSE_BYTES).toBe(10 * 1024 * 1024);
		});

		it('sends a bounded signal and preserves caller fetch options', async () => {
			mockFetch.mockResolvedValueOnce(
				fakeResponse({ body: jsonStream({ jsonrpc: '2.0', id: 42, result: '0x1' }) }),
			);

			const provider = new HttpProvider('http://localhost:8545', {
				providerOptions: { headers: { 'X-Custom': 'yes' }, cache: 'no-store' },
			});
			await provider.request(payload);

			const init = mockFetch.mock.calls[0][1] as RequestInit & { signal?: AbortSignal };
			expect(init.signal).toBeInstanceOf(AbortSignal);
			expect(init.cache).toBe('no-store');
			expect(init.headers).toMatchObject({
				'X-Custom': 'yes',
				'Content-Type': 'application/json',
			});
			// The bounds must never leak into the fetch init.
			expect(init).not.toHaveProperty('requestTimeout');
			expect(init.method).toBe('POST');
		});
	});
});
