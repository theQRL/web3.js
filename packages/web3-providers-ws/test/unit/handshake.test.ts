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

import net from 'net';
import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import { MaxAttemptsReachedOnReconnectingError } from '@theqrl/web3-errors';
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

describe('WebSocketProvider handshake and socket replacement', () => {
	it('reports disconnected and closes the socket when the handshake stalls (M-8)', async () => {
		const server = await stallingServer();
		const provider = new WebSocketProvider(
			server.url,
			{},
			{ autoReconnect: false },
			{ connectionTimeout: 150, requestTimeout: 1000 },
		);
		provider.on('error', () => undefined);
		try {
			await until(() => server.accepted.length === 1, 1000, 'the TCP connection');
			expect(provider.getStatus()).toBe('connecting');

			await until(() => provider.getStatus() === 'disconnected', 1500, 'disconnected');
			// The stalled socket is torn down, not kept half-open for the process lifetime.
			await until(() => server.accepted[0].destroyed, 1500, 'the server-side close');
			const socket = provider.SocketConnection as WsSocket;
			expect(socket.readyState).not.toBe(socket.CONNECTING);
			expect(socket.readyState).not.toBe(socket.OPEN);
		} finally {
			provider.disconnect();
			await server.close();
		}
	});

	it('retries a stalled handshake and gives up after maxAttempts (M-8)', async () => {
		const server = await stallingServer();
		const provider = new WebSocketProvider(
			server.url,
			{},
			{ autoReconnect: true, delay: 20, maxAttempts: 2 },
			{ connectionTimeout: 120, requestTimeout: 1000 },
		);
		const errors: unknown[] = [];
		provider.on('error', (error: unknown) => {
			errors.push(error);
		});
		try {
			await until(
				() => errors.some(error => error instanceof MaxAttemptsReachedOnReconnectingError),
				4000,
				'MaxAttemptsReachedOnReconnectingError',
			);
			// The first attempt plus one per reconnect attempt, every one of them closed.
			expect(server.accepted).toHaveLength(3);
			await until(
				() => server.accepted.every(socket => socket.destroyed),
				1500,
				'every server-side socket to close',
			);
			expect(provider.getStatus()).toBe('disconnected');
			// @ts-expect-error protected member
			expect(provider._reconnectAttempts).toBe(2);
		} finally {
			provider.disconnect();
			await server.close();
		}
	});

	it('passes the connection timeout to ws as handshakeTimeout unless the caller sets one', () => {
		// `ws` arms its handshake deadline with `req.setTimeout`, which records the value.
		const handshakeTimeoutOf = (provider: WebSocketProvider) =>
			(provider.SocketConnection as unknown as { _req?: { timeout?: number } })._req?.timeout;
		const byDefault = new WebSocketProvider(
			'ws://127.0.0.1:1',
			{},
			{ autoReconnect: false },
			{ connectionTimeout: 150 },
		);
		byDefault.on('error', () => undefined);
		const overridden = new WebSocketProvider(
			'ws://127.0.0.1:1',
			{ handshakeTimeout: 5 },
			{ autoReconnect: false },
			{ connectionTimeout: 150 },
		);
		overridden.on('error', () => undefined);
		try {
			expect(handshakeTimeoutOf(byDefault)).toBe(150);
			expect(handshakeTimeoutOf(overridden)).toBe(5);
		} finally {
			byDefault.disconnect();
			overridden.disconnect();
		}
	});

	it('closes a still-connecting previous socket when connect() is called again (L-44, M-8)', async () => {
		const server = await stallingServer();
		const provider = new WebSocketProvider(
			server.url,
			{},
			{ autoReconnect: false },
			{ connectionTimeout: 5000, requestTimeout: 1000 },
		);
		provider.on('error', () => undefined);
		try {
			await until(() => server.accepted.length === 1, 1000, 'the first TCP connection');
			const first = provider.SocketConnection as WsSocket;

			provider.connect();

			expect(provider.SocketConnection).not.toBe(first);
			await until(() => server.accepted.length === 2, 1000, 'the second TCP connection');
			await until(() => server.accepted[0].destroyed, 1500, 'the first socket to close');
			expect(server.accepted[1].destroyed).toBe(false);
			expect(provider.getStatus()).toBe('connecting');

			provider.disconnect();
			await until(() => server.accepted[1].destroyed, 1500, 'the second socket to close');
		} finally {
			provider.disconnect();
			await server.close();
		}
	});

	it('closes an open previous socket when connect() is called again (L-44)', async () => {
		const open = new Set<number>();
		let sequence = 0;
		const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
		wss.on('connection', socket => {
			sequence += 1;
			const id = sequence;
			open.add(id);
			socket.on('close', () => open.delete(id));
			socket.on('message', raw => {
				const request = JSON.parse((raw as Buffer).toString('utf8')) as {
					id: number;
					method: string;
				};
				socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						id: request.id,
						result: request.method === 'qrl_accounts' ? [] : '0x1',
					}),
				);
			});
		});
		await new Promise<void>(resolve => {
			wss.on('listening', () => resolve());
		});
		const { port } = wss.address() as net.AddressInfo;
		const provider = new WebSocketProvider(
			`ws://127.0.0.1:${port}`,
			{},
			{ autoReconnect: false },
			{ connectionTimeout: 2000, requestTimeout: 1000 },
		);
		provider.on('error', () => undefined);
		try {
			await until(() => provider.getStatus() === 'connected', 2000, 'the first connection');
			expect([...open]).toEqual([1]);

			provider.connect();

			await until(() => provider.getStatus() === 'connected', 2000, 'the second connection');
			await until(() => !open.has(1), 2000, 'the first connection to close');
			expect([...open]).toEqual([2]);
		} finally {
			provider.disconnect();
			await new Promise<void>(resolve => {
				wss.close(() => resolve());
			});
		}
	});
});
