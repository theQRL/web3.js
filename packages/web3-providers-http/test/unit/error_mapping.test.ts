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

import { Web3APIPayload, QRLExecutionAPI } from '@theqrl/web3-types';
import {
	ConnectionError,
	ContractExecutionError,
	HttpStatusError,
	InvalidClientError,
	InvalidConnectionError,
	ProviderError,
	RequestSerializationError,
	ResponseError,
} from '@theqrl/web3-errors';
import HttpProvider from '../../src/index';

const payload = {
	jsonrpc: '2.0',
	id: 42,
	method: 'qrl_getBalance',
	params: ['Q00', 'latest'],
} as unknown as Web3APIPayload<QRLExecutionAPI, 'qrl_getBalance'>;

const encoder = new TextEncoder();

const textStream = (text: string) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(text));
			controller.close();
		},
	});

interface FakeResponseInit {
	status?: number;
	statusText?: string;
	headers?: Record<string, string>;
	body?: string;
}

const fakeResponse = ({
	status = 200,
	statusText = '',
	headers = {},
	body = '',
}: FakeResponseInit) => {
	const lower = Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
	);
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText,
		// eslint-disable-next-line no-null/no-null
		headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
		body: textStream(body),
	} as unknown as Response;
};

/** node-fetch v2 shapes its errors like this; the message embeds the full request URL. */
const fetchError = (message: string, type: string, code?: string) =>
	Object.assign(new Error(message), { name: 'FetchError', type, code, errno: code });

// A URL with a secret in its path: credentials in the URL are rejected at construction (see the
// URL validation tests), so only the path can carry something worth redacting.
const secretUrl = 'http://127.0.0.1:1/v3/API-KEY-0123456789abcdef';
// The credentialed form a fetch implementation may quote in its own error text.
const credentialedUrl = 'http://alice:hunter2@127.0.0.1:1/v3/API-KEY-0123456789abcdef';

const sentInit = () => mockFetch.mock.calls[0][1] as RequestInit;

describe('HttpProvider - error mapping and request hygiene', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	describe('non-2xx replies (L-47)', () => {
		it('reports 429 with its status text and Retry-After, without a body error', async () => {
			mockFetch.mockResolvedValueOnce(
				fakeResponse({
					status: 429,
					statusText: 'Too Many Requests',
					headers: { 'content-type': 'text/plain', 'retry-after': '30' },
					body: 'Too Many Requests',
				}),
			);
			const provider = new HttpProvider('http://localhost:8545');

			const request = provider.request(payload);
			await expect(request).rejects.toThrow(HttpStatusError);
			await expect(request).rejects.toMatchObject({
				status: 429,
				statusText: 'Too Many Requests',
				retryAfter: 30,
				retryable: true,
				innerError: undefined,
			});
			await expect(request).rejects.not.toThrow(ResponseError);
		});

		it('converts an HTTP-date Retry-After into seconds', async () => {
			const inTenSeconds = new Date(Date.now() + 10_000).toUTCString();
			mockFetch.mockResolvedValueOnce(
				fakeResponse({ status: 503, headers: { 'retry-after': inTenSeconds } }),
			);
			const provider = new HttpProvider('http://localhost:8545');

			const request = provider.request(payload);
			await expect(request).rejects.toThrow(HttpStatusError);
			const error = (await request.catch((e: unknown) => e)) as HttpStatusError;
			expect(error.retryAfter).toBeGreaterThanOrEqual(8);
			expect(error.retryAfter).toBeLessThanOrEqual(11);
		});

		it('attaches a JSON-RPC error body as innerError', async () => {
			mockFetch.mockResolvedValueOnce(
				fakeResponse({
					status: 401,
					statusText: 'Unauthorized',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 42,
						error: { code: -32000, message: 'unauthorized', data: '0x' },
					}),
				}),
			);
			const provider = new HttpProvider('http://localhost:8545');

			const error = (await provider
				.request(payload)
				.catch((e: unknown) => e)) as HttpStatusError;
			expect(error).toBeInstanceOf(HttpStatusError);
			expect(error.status).toBe(401);
			expect(error.retryable).toBe(false);
			expect(error.innerError).toBeInstanceOf(ResponseError);
			expect((error.innerError as ResponseError).message).toBe(
				'Returned error: unauthorized',
			);
			expect((error.innerError as ResponseError).data).toBe('0x');
			expect(error.message).toBe(
				'HTTP STATUS ERROR: the JSON-RPC endpoint answered with HTTP 401 (Unauthorized). Returned error: unauthorized',
			);
		});

		it('keeps the revert data of a JSON-RPC error body decodable', async () => {
			const revertData = `0x08c379a0${'00'.repeat(64)}`;
			mockFetch.mockResolvedValueOnce(
				fakeResponse({
					status: 500,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 42,
						error: { code: 3, message: 'execution reverted', data: revertData },
					}),
				}),
			);
			const provider = new HttpProvider('http://localhost:8545');

			const error = (await provider
				.request(payload)
				.catch((e: unknown) => e)) as HttpStatusError;
			expect(error).toBeInstanceOf(HttpStatusError);
			expect(error.data).toBe(revertData);
			// What web3-core's request manager does with an error whose message says "revert".
			const revert = new ContractExecutionError(error as never);
			expect(revert.innerError.data).toBe(revertData);
			expect(revert.innerError.message).toContain('execution reverted');
		});

		it.each([
			['an HTML page', 502, '<html><body><h1>502 Bad Gateway</h1></body></html>'],
			['a JSON null', 500, 'null'],
			['a JSON string', 500, '"abc"'],
			['an empty array', 500, '[]'],
			['an empty body', 500, ''],
		])('drops %s body and still names the status', async (_label, status, body) => {
			mockFetch.mockResolvedValueOnce(fakeResponse({ status, body }));
			const provider = new HttpProvider('http://localhost:8545');

			const request = provider.request(payload);
			await expect(request).rejects.toThrow(HttpStatusError);
			await expect(request).rejects.toMatchObject({ status, innerError: undefined });
		});
	});

	describe('transport errors (L-47, L-48)', () => {
		it('wraps a refused connection without the URL credentials or path', async () => {
			mockFetch.mockRejectedValueOnce(
				fetchError(
					`request to ${credentialedUrl} failed, reason: connect ECONNREFUSED 127.0.0.1:1`,
					'system',
					'ECONNREFUSED',
				),
			);
			const provider = new HttpProvider(secretUrl, { requestTimeout: 1000 });

			const error = (await provider.request(payload).catch((e: unknown) => e)) as Error;
			expect(error).toBeInstanceOf(InvalidConnectionError);
			expect(error.message).toBe(
				"CONNECTION ERROR: Couldn't connect to node 127.0.0.1:1. Reason: ECONNREFUSED",
			);
			expect(JSON.stringify((error as InvalidConnectionError).toJSON())).not.toContain(
				'hunter2',
			);
			expect(JSON.stringify((error as InvalidConnectionError).toJSON())).not.toContain(
				'API-KEY',
			);
			expect(error.message).not.toContain('alice');
		});

		it('wraps a refused redirect into a ConnectionError that names only the endpoint', async () => {
			mockFetch.mockRejectedValueOnce(
				fetchError(
					`uri requested responds with a redirect, redirect mode is set to error: ${credentialedUrl}`,
					'no-redirect',
				),
			);
			const provider = new HttpProvider(secretUrl);

			const error = (await provider.request(payload).catch((e: unknown) => e)) as Error;
			expect(error).toBeInstanceOf(ConnectionError);
			expect(error).not.toBeInstanceOf(InvalidConnectionError);
			expect(error.message).toBe(
				'CONNECTION ERROR: the JSON-RPC endpoint 127.0.0.1:1 answered with a redirect, which is refused unless providerOptions.redirect is set to "follow".',
			);
			expect(error.message).not.toContain('hunter2');
			expect(error.message).not.toContain('API-KEY');
		});

		it('wraps an undici "fetch failed" TypeError using its cause code', async () => {
			mockFetch.mockRejectedValueOnce(
				Object.assign(new TypeError('fetch failed'), {
					cause: Object.assign(new Error('getaddrinfo ENOTFOUND node.example'), {
						code: 'ENOTFOUND',
					}),
				}),
			);
			const provider = new HttpProvider('https://node.example/v3/KEY');

			const error = (await provider.request(payload).catch((e: unknown) => e)) as Error;
			expect(error).toBeInstanceOf(InvalidConnectionError);
			expect(error.message).toBe(
				"CONNECTION ERROR: Couldn't connect to node node.example. Reason: ENOTFOUND",
			);
		});

		it.each([
			[
				'an invalid header value',
				new TypeError("Headers.append: 'secret-key\\r\\nx' is an invalid header value."),
				'secret-key',
			],
			[
				'a URL with credentials',
				new TypeError(
					`Request cannot be constructed from a URL that includes credentials: ${credentialedUrl}`,
				),
				'hunter2',
			],
			[
				'node-fetch rejecting a header value',
				new TypeError('secret-key\\r\\nx is not a legal HTTP header value'),
				'secret-key',
			],
		])(
			'reports a TypeError for %s as a refused request, not as a connection failure (P4-L-23)',
			async (_label, thrown, secret) => {
				mockFetch.mockRejectedValueOnce(thrown);
				const provider = new HttpProvider(secretUrl);

				const error = (await provider.request(payload).catch((e: unknown) => e)) as Error;
				expect(error).toBeInstanceOf(ProviderError);
				expect(error).not.toBeInstanceOf(ConnectionError);
				expect(error.message).toContain('REQUEST REJECTED');
				expect(error.message).toContain('127.0.0.1:1');
				expect(error.message).toContain('providerOptions.headers');
				expect(error.message).not.toContain(secret);
				expect(error.message).not.toContain('API-KEY');
				expect(JSON.stringify((error as ProviderError).toJSON())).not.toContain(secret);
			},
		);

		it('still treats a TypeError with a cause as a transport failure (P4-L-23)', async () => {
			mockFetch.mockRejectedValueOnce(
				Object.assign(new TypeError('something else'), {
					cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
				}),
			);
			const provider = new HttpProvider('http://localhost:8545');

			const error = (await provider.request(payload).catch((e: unknown) => e)) as Error;
			expect(error).toBeInstanceOf(InvalidConnectionError);
			expect(error.message).toBe(
				"CONNECTION ERROR: Couldn't connect to node localhost:8545. Reason: ECONNREFUSED",
			);
		});

		it('leaves an unknown error from a custom fetch untouched', async () => {
			mockFetch.mockRejectedValueOnce(new Error('network down'));
			const provider = new HttpProvider('http://localhost:8545');

			await expect(provider.request(payload)).rejects.toThrow('network down');
		});
	});

	describe('URL validation (I-15, L-48)', () => {
		it.each(['http://127.0.0.1:99999/', 'http://', 'http://[::1', 'http:// space.example/'])(
			'rejects %s at construction with InvalidClientError',
			url => {
				expect(() => new HttpProvider(url)).toThrow(InvalidClientError);
			},
		);

		it.each([
			'http://[::1]:8545',
			'HTTP://127.0.0.1:8545/auth',
			'http://localhost:8545/',
			'https://node.example/v3/KEY',
		])('accepts %s', url => {
			expect(() => new HttpProvider(url)).not.toThrow();
		});

		it.each([
			'http://user:pw@localhost:8545/',
			'https://alice:hunter2@node.example/v3/KEY',
			'http://token@127.0.0.1:8545/',
			'http://:pw@127.0.0.1:8545/',
		])('rejects credentials in the URL (%s) at construction', url => {
			// Credentials belong in providerOptions.headers: WHATWG fetch refuses such a URL and
			// node-fetch would send them as Basic authentication unasked.
			expect(() => new HttpProvider(url)).toThrow(InvalidClientError);
		});

		it('keeps credentials and the path out of InvalidClientError', () => {
			expect(() => new HttpProvider('http://alice:hunter2@127.0.0.1:99999/v3/KEY')).toThrow(
				'Client URL "http://***@127.0.0.1:99999/[redacted]" is invalid.',
			);
			expect(() => new HttpProvider('http://alice:hunter2@127.0.0.1:8545/v3/KEY')).toThrow(
				'Client URL "http://***@127.0.0.1:8545/[redacted]" is invalid.',
			);
		});

		it('warns about cleartext using the parsed hostname only', () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

			new HttpProvider('http://127.0.0.1:8545/v3/KEY');
			new HttpProvider('http://[::1]:8545');
			new HttpProvider('http://localhost:8545');
			expect(warn).not.toHaveBeenCalled();

			new HttpProvider('http://node.example:8545/v3/KEY');
			new HttpProvider('http://evil.example/');
			expect(warn).toHaveBeenCalledTimes(2);
			expect(warn.mock.calls[0][0]).toBe(
				'web3-providers-http: cleartext http:// URL to non-loopback host "node.example". Use https:// for production.',
			);
			expect(warn.mock.calls[1][0]).toContain('"evil.example"');
			expect(JSON.stringify(warn.mock.calls)).not.toContain('pw');
			expect(JSON.stringify(warn.mock.calls)).not.toContain('KEY');
		});
	});

	describe('payload serialisation (I-15)', () => {
		it('rejects a bigint param with RequestSerializationError before sending', async () => {
			const provider = new HttpProvider('http://localhost:8545');

			await expect(
				provider.request({ ...payload, params: [BigInt(1)] } as never),
			).rejects.toThrow(RequestSerializationError);
			expect(mockFetch).not.toHaveBeenCalled();
		});
	});

	describe('header merging (I-15)', () => {
		const okResponse = () =>
			fakeResponse({
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 42, result: '0x1' }),
			});

		it('merges per-request headers on top of constructor headers', async () => {
			mockFetch.mockResolvedValueOnce(okResponse());
			const provider = new HttpProvider('http://localhost:8545', {
				providerOptions: { headers: { 'X-Api-Key': 'k', Authorization: 'Bearer old' } },
			});

			await provider.request(payload, { headers: { authorization: 'Bearer new' } });

			expect(sentInit().headers).toStrictEqual({
				'X-Api-Key': 'k',
				authorization: 'Bearer new',
				'Content-Type': 'application/json',
			});
		});

		it('keeps the JSON content type unless a content-type is given explicitly', async () => {
			mockFetch.mockResolvedValueOnce(okResponse());
			const provider = new HttpProvider('http://localhost:8545', {
				providerOptions: { headers: { 'content-type': 'text/plain' } },
			});

			await provider.request(payload);

			expect(sentInit().headers).toStrictEqual({ 'content-type': 'text/plain' });
		});

		it('accepts a Headers-like object and an array of pairs', async () => {
			mockFetch.mockResolvedValueOnce(okResponse());
			const headersLike = {
				forEach(callback: (value: string, name: string) => void) {
					callback('from-headers', 'x-one');
				},
			} as unknown as HeadersInit;
			const provider = new HttpProvider('http://localhost:8545', {
				providerOptions: { headers: headersLike },
			});

			await provider.request(payload, { headers: [['X-Two', 'from-array']] });

			expect(sentInit().headers).toStrictEqual({
				'x-one': 'from-headers',
				'X-Two': 'from-array',
				'Content-Type': 'application/json',
			});
		});
	});
});
