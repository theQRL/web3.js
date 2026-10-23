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

import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import {
	ConnectionError,
	ConnectionNotOpenError,
	InvalidClientError,
	MaxAttemptsReachedOnReconnectingError,
	RequestSerializationError,
	ResponseTooLargeError,
} from '@theqrl/web3-errors';
import { IpcProvider } from '../../src/index';

// Real Unix domain sockets: `net` and `fs` are deliberately not mocked here.

const wait = async (ms: number) =>
	new Promise<void>(resolve => {
		setTimeout(resolve, ms);
	});

const until = async (predicate: () => boolean, timeoutMs: number, what: string) => {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
		// eslint-disable-next-line no-await-in-loop
		await wait(10);
	}
};

/** `sun_path` is 108 bytes: keep the socket path short whatever the temp dir is. */
const makeTempDir = () => {
	const base = os.tmpdir().length > 50 ? '/tmp' : os.tmpdir();
	return fs.mkdtempSync(path.join(base, 'w3ipc-'));
};

/** Splits concatenated JSON objects (several requests can share one chunk). */
const splitJson = (text: string): string[] => {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === '{') {
			if (depth === 0) start = index;
			depth += 1;
		} else if (text[index] === '}') {
			depth -= 1;
			if (depth === 0) parts.push(text.slice(start, index + 1));
		}
	}
	return parts;
};

interface TestServer {
	clients: net.Socket[];
	close: () => Promise<void>;
}

/** 10 MiB + 1 KiB of payload: above the default `maxResponseBytes`, within a raised one. */
const OVERSIZED_RESULT_LENGTH = 10 * 1024 * 1024 + 1024;

/**
 * Answers the EIP-1193 probes and `qrl_blockNumber`; a request for method `split` is answered
 * with `"é"` written as two chunks cut inside the two-byte character, `big` with a result of
 * {@link OVERSIZED_RESULT_LENGTH} characters and `slow` 200 ms later.
 */
const startServer = async (socketPath: string): Promise<TestServer> => {
	const clients: net.Socket[] = [];
	const server = net.createServer(client => {
		clients.push(client);
		client.setEncoding('utf8');
		client.on('error', () => undefined);
		client.on('data', (chunk: string) => {
			for (const text of splitJson(chunk)) {
				const request = JSON.parse(text) as { id: number; method: string };
				// `silent` is answered by the test itself.
				if (request.method === 'silent') continue;
				if (request.method === 'big') {
					client.write(
						JSON.stringify({
							jsonrpc: '2.0',
							id: request.id,
							result: 'a'.repeat(OVERSIZED_RESULT_LENGTH),
						}),
					);
					continue;
				}
				if (request.method === 'slow') {
					setTimeout(
						() =>
							client.write(
								JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0x5' }),
							),
						200,
					);
					continue;
				}
				if (request.method === 'split') {
					const reply = Buffer.from(
						JSON.stringify({ jsonrpc: '2.0', id: request.id, result: 'é' }),
						'utf8',
					);
					const cut = reply.indexOf(0xc3) + 1;
					client.write(reply.subarray(0, cut));
					setTimeout(() => client.write(reply.subarray(cut)), 20);
					continue;
				}
				client.write(
					JSON.stringify({
						jsonrpc: '2.0',
						id: request.id,
						result: request.method === 'qrl_accounts' ? [] : '0x5',
					}),
				);
			}
		});
	});
	await new Promise<void>(resolve => {
		server.listen(socketPath, () => resolve());
	});
	return {
		clients,
		close: async () => {
			for (const client of clients) client.destroy();
			await new Promise<void>(resolve => {
				server.close(() => resolve());
			});
		},
	};
};

const payload = (id: number, method: string) => ({ jsonrpc: '2.0', id, method, params: [] });

describe('IpcProvider over real sockets', () => {
	let dir: string;

	beforeEach(() => {
		dir = makeTempDir();
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	describe('stream decoding and listener accounting (L-24)', () => {
		it('reassembles a multi-byte character split across two data events', async () => {
			const socketPath = path.join(dir, 's.ipc');
			const server = await startServer(socketPath);
			const provider = new IpcProvider(socketPath, {}, { autoReconnect: false });
			provider.on('error', () => undefined);
			try {
				await until(() => provider.getStatus() === 'connected', 2000, 'connect');
				const response = await provider.request(payload(1, 'split') as never);
				expect(response.result).toBe('é');
			} finally {
				provider.disconnect();
				await server.close();
			}
		});

		it('decodes binary chunks with a decoder that spans data events', async () => {
			const socketPath = path.join(dir, 's.ipc');
			const server = await startServer(socketPath);
			const provider = new IpcProvider(socketPath, {}, { autoReconnect: false });
			provider.on('error', () => undefined);
			try {
				await until(() => provider.getStatus() === 'connected', 2000, 'connect');
				const socket = provider.SocketConnection as net.Socket;
				const request = provider.request(payload(9, 'silent') as never);
				const reply = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 9, result: 'é' }));
				const cut = reply.indexOf(0xc3) + 1;
				socket.emit('data', reply.subarray(0, cut));
				socket.emit('data', reply.subarray(cut));
				expect((await request).result).toBe('é');
			} finally {
				provider.disconnect();
				await server.close();
			}
		});

		it('does not accumulate error listeners across reset()', async () => {
			const socketPath = path.join(dir, 's.ipc');
			const server = await startServer(socketPath);
			const provider = new IpcProvider(socketPath, {}, { autoReconnect: false });
			provider.on('error', () => undefined);
			try {
				await until(() => provider.getStatus() === 'connected', 2000, 'connect');
				const socket = provider.SocketConnection as net.Socket;
				// Node itself keeps an `end` listener on a socket; only the provider's counts.
				const counts = () => ({
					error: socket.listenerCount('error'),
					data: socket.listenerCount('data'),
					close: socket.listenerCount('close'),
					// @ts-expect-error protected member
					end: socket.listeners('end').filter(l => l === provider._onCloseHandler).length,
				});
				expect(counts()).toEqual({ error: 1, data: 1, close: 1, end: 1 });
				for (let index = 0; index < 5; index += 1) provider.reset();
				expect(counts()).toEqual({ error: 1, data: 1, close: 1, end: 1 });
			} finally {
				provider.disconnect();
				await server.close();
			}
		});
	});

	describe('oversized replies (P4-M-5)', () => {
		it('accepts a 10 MiB + 1 KiB reply when maxResponseBytes is raised to 64 MiB', async () => {
			const socketPath = path.join(dir, 's.ipc');
			const server = await startServer(socketPath);
			const provider = new IpcProvider(
				socketPath,
				{},
				{ autoReconnect: false },
				{ maxResponseBytes: 64 * 1024 * 1024, requestTimeout: 10_000 },
			);
			provider.on('error', () => undefined);
			try {
				await until(() => provider.getStatus() === 'connected', 2000, 'connect');
				const response = await provider.request(payload(2, 'big') as never);
				expect((response.result as string).length).toBe(OVERSIZED_RESULT_LENGTH);
			} finally {
				provider.disconnect();
				await server.close();
			}
		}, 20_000);

		it('fails only the request an oversized reply answers with the default bound', async () => {
			const socketPath = path.join(dir, 's.ipc');
			const server = await startServer(socketPath);
			const provider = new IpcProvider(
				socketPath,
				{},
				{ autoReconnect: false },
				{ requestTimeout: 10_000 },
			);
			const errors: unknown[] = [];
			provider.on('error', (error: unknown) => {
				errors.push(error);
			});
			try {
				await until(() => provider.getStatus() === 'connected', 2000, 'connect');
				const slow = provider.request(payload(1, 'slow') as never);
				const big = provider.request(payload(2, 'big') as never);

				await expect(big).rejects.toThrow(ResponseTooLargeError);
				await expect(big).rejects.toMatchObject({ maxResponseBytes: 10 * 1024 * 1024 });
				// The unrelated request, answered later on the same socket, is unaffected and
				// the connection stays usable.
				expect((await slow).result).toBe('0x5');
				expect(provider.getStatus()).toBe('connected');
				expect((await provider.request(payload(3, 'qrl_blockNumber') as never)).result).toBe(
					'0x5',
				);
				// Reported by the parser and once more by the rejected request, which re-emits
				// its rejection reason like every failed request does; nothing else.
				expect(errors.length).toBeGreaterThanOrEqual(1);
				expect(errors.every(error => error instanceof ResponseTooLargeError)).toBe(true);
			} finally {
				provider.disconnect();
				await server.close();
			}
		}, 20_000);
	});

	describe('disconnect (I-F13)', () => {
		it('emits disconnect exactly once', async () => {
			const socketPath = path.join(dir, 's.ipc');
			const server = await startServer(socketPath);
			const provider = new IpcProvider(socketPath, {}, { autoReconnect: false });
			provider.on('error', () => undefined);
			const disconnects: unknown[] = [];
			provider.on('disconnect', (event: unknown) => {
				disconnects.push(event);
			});
			try {
				await until(() => provider.getStatus() === 'connected', 2000, 'connect');
				provider.disconnect();
				await until(() => server.clients[0].destroyed, 2000, 'the server-side close');
				await wait(50);
				expect(disconnects).toHaveLength(1);
				expect(provider.getStatus()).toBe('disconnected');
			} finally {
				await server.close();
			}
		});
	});

	describe('recovery after a failed reconnect (L-43)', () => {
		/**
		 * A socket file nobody listens on any more (the node died without unlinking it):
		 * the server is bound under one name, the file renamed, and the server closed, which
		 * unlinks the original name only.
		 */
		const startStaleable = async () => {
			const livePath = path.join(dir, 'live.ipc');
			const stalePath = path.join(dir, 'stale.ipc');
			const server = await startServer(livePath);
			fs.renameSync(livePath, stalePath);
			return { stalePath, server };
		};

		it('reports max attempts after ECONNREFUSED and reconnects on the next request', async () => {
			const { stalePath, server } = await startStaleable();
			const provider = new IpcProvider(
				stalePath,
				{},
				{ autoReconnect: true, delay: 20, maxAttempts: 2 },
				{ connectionTimeout: 500, requestTimeout: 3000 },
			);
			const errors: unknown[] = [];
			provider.on('error', (error: unknown) => {
				errors.push(error);
			});
			let replacement: TestServer | undefined;
			try {
				await until(() => provider.getStatus() === 'connected', 2000, 'connect');
				await server.close();
				expect(fs.statSync(stalePath).isSocket()).toBe(true);

				await until(
					() =>
						errors.some(
							error => error instanceof MaxAttemptsReachedOnReconnectingError,
						),
					4000,
					'MaxAttemptsReachedOnReconnectingError',
				);
				expect(provider.getStatus()).toBe('disconnected');
				// @ts-expect-error protected member
				expect(provider._reconnectAttempts).toBe(2);
				// @ts-expect-error protected member
				expect(provider.isReconnecting).toBe(false);

				// A node that comes back is found by the next request, without disconnect()+connect().
				fs.unlinkSync(stalePath);
				replacement = await startServer(stalePath);
				const response = await provider.request(payload(7, 'qrl_blockNumber') as never);
				expect(response.result).toBe('0x5');
				expect(provider.getStatus()).toBe('connected');
			} finally {
				provider.disconnect();
				await replacement?.close();
			}
		});

		it('fails queued requests promptly instead of staying connecting (autoReconnect=false)', async () => {
			const { stalePath, server } = await startStaleable();
			await server.close();
			const provider = new IpcProvider(
				stalePath,
				{},
				{ autoReconnect: false },
				{ connectionTimeout: 500, requestTimeout: 5000 },
			);
			const errors: unknown[] = [];
			provider.on('error', (error: unknown) => {
				errors.push(error);
			});
			try {
				await until(() => provider.getStatus() === 'disconnected', 2000, 'disconnected');
				expect(
					errors.some(error => (error as Error).message?.includes('ECONNREFUSED')),
				).toBe(true);
				const started = Date.now();
				await expect(
					provider.request(payload(1, 'qrl_blockNumber') as never),
				).rejects.toThrow(ConnectionNotOpenError);
				expect(Date.now() - started).toBeLessThan(2000);
				expect(provider.getStatus()).toBe('disconnected');
			} finally {
				provider.disconnect();
			}
		});

		it.each([
			['a regular file', (p: string) => fs.writeFileSync(p, '')],
			['a directory', (p: string) => fs.mkdirSync(p)],
		])('refuses %s at construction with a typed error', (_label, create) => {
			const socketPath = path.join(dir, 'not-a-socket');
			create(socketPath);
			expect(() => new IpcProvider(socketPath, {}, { autoReconnect: false })).toThrow(
				ConnectionError,
			);
			expect(() => new IpcProvider(socketPath, {}, { autoReconnect: false })).toThrow(
				`IPC path "${socketPath}" exists but is not a Unix domain socket`,
			);
		});

		it('refuses a missing path with the client error', () => {
			const socketPath = path.join(dir, 'missing.ipc');
			expect(() => new IpcProvider(socketPath, {}, { autoReconnect: false })).toThrow(
				new InvalidClientError(socketPath).message,
			);
		});
	});

	describe('payload serialisation (I-15)', () => {
		it('rejects a bigint param with RequestSerializationError', async () => {
			const socketPath = path.join(dir, 's.ipc');
			const server = await startServer(socketPath);
			const provider = new IpcProvider(socketPath, {}, { autoReconnect: false });
			provider.on('error', () => undefined);
			try {
				await until(() => provider.getStatus() === 'connected', 2000, 'connect');
				await expect(
					provider.request({
						...payload(1, 'qrl_getBalance'),
						params: [BigInt(1)],
					} as never),
				).rejects.toThrow(RequestSerializationError);
				await expect(
					provider.request({
						...payload(3, 'qrl_blockNumber'),
						toJSON: () => undefined,
					} as never),
				).rejects.toThrow('payload serialised to undefined');
				// The connection is unaffected.
				const response = await provider.request(payload(2, 'qrl_blockNumber') as never);
				expect(response.result).toBe('0x5');
			} finally {
				provider.disconnect();
				await server.close();
			}
		});
	});
});
