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

// The unit root carries a manual mock of `isomorphic-ws` that Jest applies on its own;
// these tests need the real client.
jest.unmock('isomorphic-ws');

import crypto from 'crypto';
import net from 'net';
import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import {
	ConnectionNotOpenError,
	ConnectionTimeoutError,
	PendingRequestsOnReconnectingError,
	Web3WSProviderError,
} from '@theqrl/web3-errors';
import WebSocketProvider from '../../src/index';

// Real sockets on the loopback interface: `ws` is deliberately not mocked here.

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

const payload = (id: number, method: string) => ({ jsonrpc: '2.0', id, method, params: [] });

const reply = (request: { id: number; method: string }, result: unknown = '0x1') =>
	JSON.stringify({
		jsonrpc: '2.0',
		id: request.id,
		result: request.method === 'qrl_accounts' ? [] : result,
	});

/** A server that accepts the TCP connection and never answers the WebSocket upgrade. */
const stallingServer = async () => {
	const accepted: net.Socket[] = [];
	const server = net.createServer(socket => {
		accepted.push(socket);
		socket.resume();
		socket.on('error', () => undefined);
	});
	const port = await new Promise<number>(resolve => {
		server.listen(0, '127.0.0.1', () => {
			resolve((server.address() as net.AddressInfo).port);
		});
	});
	return {
		accepted,
		url: `ws://127.0.0.1:${port}`,
		close: async () => {
			for (const socket of accepted) socket.destroy();
			await new Promise<void>(resolve => {
				server.close(() => resolve());
			});
		},
	};
};

/** A `ws` server that answers every request; `slow` is answered after 300 ms, `silent` never. */
const answeringServer = async () => {
	const clients: WsSocket[] = [];
	const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
	wss.on('connection', socket => {
		clients.push(socket);
		socket.on('message', raw => {
			const request = JSON.parse((raw as Buffer).toString('utf8')) as {
				id: number;
				method: string;
			};
			if (request.method === 'silent') return;
			if (request.method === 'slow') {
				setTimeout(() => socket.send(reply(request)), 300);
				return;
			}
			socket.send(reply(request));
		});
	});
	await new Promise<void>(resolve => {
		wss.on('listening', () => resolve());
	});
	const { port } = wss.address() as net.AddressInfo;
	return {
		clients,
		url: `ws://127.0.0.1:${port}`,
		close: async () => {
			for (const client of clients) client.terminate();
			await new Promise<void>(resolve => {
				wss.close(() => resolve());
			});
		},
	};
};

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Decodes the masked text frames of one TCP chunk (the frames a client sends). */
const decodeClientTextFrames = (chunk: Buffer): string[] => {
	const texts: string[] = [];
	let offset = 0;
	while (offset + 2 <= chunk.length) {
		const opcode = chunk[offset] & 0x0f;
		let length = chunk[offset + 1] & 0x7f;
		let cursor = offset + 2;
		if (length === 126) {
			length = chunk.readUInt16BE(cursor);
			cursor += 2;
		} else if (length === 127) {
			length = Number(chunk.readBigUInt64BE(cursor));
			cursor += 8;
		}
		const mask = chunk.subarray(cursor, cursor + 4);
		cursor += 4;
		const unmasked = Buffer.alloc(length);
		for (let index = 0; index < length; index += 1) {
			unmasked[index] = chunk[cursor + index] ^ mask[index % 4];
		}
		if (opcode === 0x1) texts.push(unmasked.toString('utf8'));
		offset = cursor + length;
	}
	return texts;
};

const encodeServerTextFrame = (text: string): Buffer => {
	const data = Buffer.from(text, 'utf8');
	if (data.length < 126) return Buffer.concat([Buffer.from([0x81, data.length]), data]);
	const header = Buffer.alloc(4);
	header[0] = 0x81;
	header[1] = 126;
	header.writeUInt16BE(data.length, 2);
	return Buffer.concat([header, data]);
};

/** A close frame with status code 1000 and no reason. */
const CLOSE_FRAME_1000 = Buffer.from([0x88, 0x02, 0x03, 0xe8]);

/**
 * A raw WebSocket server that answers requests and, on its first connection only, sends a
 * close frame 150 ms after the upgrade without ever ending the TCP connection: the client
 * answers with its own close frame, half-closes and then sits in CLOSING, which a `ws` server
 * would never let it do for long. `allowHalfOpen` keeps the server from ending its side when
 * the client half-closes.
 */
const closeFrameOnlyServer = async () => {
	const accepted: net.Socket[] = [];
	const server = net.createServer({ allowHalfOpen: true }, socket => {
		const index = accepted.length;
		accepted.push(socket);
		socket.on('error', () => undefined);
		let handshake = '';
		let upgraded = false;
		socket.on('data', (chunk: Buffer) => {
			if (upgraded) {
				for (const text of decodeClientTextFrames(chunk)) {
					const request = JSON.parse(text) as { id: number; method: string };
					socket.write(encodeServerTextFrame(reply(request, `0x${index}`)));
				}
				return;
			}
			handshake += chunk.toString('latin1');
			if (!handshake.includes('\r\n\r\n')) return;
			const key = /Sec-WebSocket-Key: (.+)\r\n/i.exec(handshake)?.[1]?.trim() ?? '';
			const accept = crypto
				.createHash('sha1')
				.update(key + WS_GUID)
				.digest('base64');
			socket.write(
				`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
			);
			upgraded = true;
			if (index === 0) {
				setTimeout(() => socket.write(CLOSE_FRAME_1000), 150);
			}
		});
	});
	const port = await new Promise<number>(resolve => {
		server.listen(0, '127.0.0.1', () => {
			resolve((server.address() as net.AddressInfo).port);
		});
	});
	return {
		accepted,
		url: `ws://127.0.0.1:${port}`,
		close: async () => {
			for (const socket of accepted) socket.destroy();
			await new Promise<void>(resolve => {
				server.close(() => resolve());
			});
		},
	};
};

describe('WebSocketProvider socket lifecycle', () => {
	it('serves a request issued while the previous socket is CLOSING on the replacement socket (P4-L-18)', async () => {
		const server = await closeFrameOnlyServer();
		const provider = new WebSocketProvider(
			server.url,
			{},
			{ autoReconnect: true, delay: 100, maxAttempts: 2 },
			{ connectionTimeout: 3000, requestTimeout: 3000 },
		);
		const errors: unknown[] = [];
		provider.on('error', (error: unknown) => {
			errors.push(error);
		});
		try {
			const first = provider.SocketConnection as WsSocket;
			await until(() => first.readyState === first.CLOSING, 2000, 'the close frame');
			expect(provider.getStatus()).toBe('disconnected');

			// The request opens a replacement socket; the old one is terminated, not waited for.
			const response = await provider.request(payload(11, 'qrl_blockNumber') as never);

			expect(response.result).toBe('0x1');
			const second = provider.SocketConnection as WsSocket;
			expect(second).not.toBe(first);
			expect(provider.getStatus()).toBe('connected');
			expect(second.readyState).toBe(second.OPEN);
			expect(second.listenerCount('open')).toBe(1);
			expect(second.listenerCount('message')).toBe(1);
			expect(second.listenerCount('close')).toBe(1);
			expect(server.accepted).toHaveLength(2);
			// Terminated rather than left waiting for a TCP end the peer never sends.
			await until(() => first.readyState === first.CLOSED, 2000, 'the first socket to close');
			expect(errors.some(error => error instanceof ConnectionNotOpenError)).toBe(false);
		} finally {
			provider.disconnect();
			await server.close();
		}
	});

	it('refuses a close code ws would reject before touching the connection (P4-L-17)', async () => {
		const server = await answeringServer();
		const provider = new WebSocketProvider(
			server.url,
			{},
			{ autoReconnect: false },
			{ requestTimeout: 2000 },
		);
		provider.on('error', () => undefined);
		try {
			await until(() => provider.getStatus() === 'connected', 2000, 'the connection');
			const socket = provider.SocketConnection as WsSocket;
			const inFlight = provider.request(payload(7, 'slow') as never);

			expect(() => provider.disconnect(1005, 'reserved code')).toThrow(Web3WSProviderError);

			expect(provider.getStatus()).toBe('connected');
			expect(socket.readyState).toBe(socket.OPEN);
			// Nothing was torn down: the reply still arrives.
			expect((await inFlight).result).toBe('0x1');

			const closed = new Promise<number>(resolve => {
				server.clients[0].on('close', code => resolve(code));
			});
			provider.disconnect(1000, 'bye');
			expect(await closed).toBe(1000);
			expect(provider.getStatus()).toBe('disconnected');
		} finally {
			await server.close();
		}
	});

	it('keeps a request parked for a reconnect alive past the connection timeout (P4-L-16)', async () => {
		// A port nobody listens on: bind and release.
		const probe = net.createServer();
		const port = await new Promise<number>(resolve => {
			probe.listen(0, '127.0.0.1', () => {
				resolve((probe.address() as net.AddressInfo).port);
			});
		});
		await new Promise<void>(resolve => {
			probe.close(() => resolve());
		});
		const provider = new WebSocketProvider(
			`ws://127.0.0.1:${port}`,
			{},
			{ autoReconnect: true, delay: 800, maxAttempts: 2 },
			{ connectionTimeout: 200, requestTimeout: 5000 },
		);
		const errors: unknown[] = [];
		provider.on('error', (error: unknown) => {
			errors.push(error);
		});
		try {
			// @ts-expect-error protected member
			await until(() => provider.isReconnecting, 2000, 'the back-off');
			const parked = provider.request(payload(1, 'qrl_blockNumber') as never);
			const outcome = parked.then(
				() => 'resolved',
				(error: unknown) => error,
			);
			expect(provider.getDiagnostics().pendingRequests).toBe(1);

			// Well past the connection timeout of the failed attempt, still in the back-off.
			await wait(400);
			expect(provider.getDiagnostics().pendingRequests).toBe(1);
			expect(errors.some(error => error instanceof ConnectionTimeoutError)).toBe(false);

			provider.disconnect();
			expect(await outcome).toBeInstanceOf(ConnectionNotOpenError);
		} finally {
			provider.disconnect();
		}
	});

	it('fails a request in flight when connect() replaces the socket, without waiting for its deadline (P4-L-21)', async () => {
		const server = await answeringServer();
		const provider = new WebSocketProvider(
			server.url,
			{},
			{ autoReconnect: false },
			{ requestTimeout: 1500 },
		);
		provider.on('error', () => undefined);
		try {
			await until(() => provider.getStatus() === 'connected', 2000, 'the connection');
			const started = Date.now();
			const slow = provider.request(payload(5, 'slow') as never);
			const assertion = expect(slow).rejects.toThrow(PendingRequestsOnReconnectingError);

			provider.connect();

			await assertion;
			expect(Date.now() - started).toBeLessThan(250);
			await until(() => provider.getStatus() === 'connected', 2000, 'the second connection');
			expect((await provider.request(payload(6, 'qrl_blockNumber') as never)).result).toBe(
				'0x1',
			);
		} finally {
			provider.disconnect();
			await server.close();
		}
	});

	it('does not report an error when disconnect() abandons a handshake in progress (I-F12)', async () => {
		const server = await stallingServer();
		const provider = new WebSocketProvider(
			server.url,
			{},
			{ autoReconnect: false },
			{ connectionTimeout: 2000 },
		);
		const errors: unknown[] = [];
		provider.on('error', (error: unknown) => {
			errors.push(error);
		});
		try {
			await until(() => server.accepted.length === 1, 1000, 'the TCP connection');
			expect(provider.getStatus()).toBe('connecting');

			provider.disconnect();

			await until(() => server.accepted[0].destroyed, 1500, 'the server-side close');
			await wait(50);
			expect(errors).toEqual([]);
			expect(provider.getStatus()).toBe('disconnected');
		} finally {
			provider.disconnect();
			await server.close();
		}
	});
});
