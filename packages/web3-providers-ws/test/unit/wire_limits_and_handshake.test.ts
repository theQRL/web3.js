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

jest.unmock('isomorphic-ws');
/* eslint-disable jest/no-conditional-expect -- each table case has a distinct transport verdict */
import { AddressInfo } from 'net';
import { WebSocketServer, RawData } from 'ws';
import { JsonRpcRequest } from '@theqrl/web3-types';
import { ResponseTooLargeError } from '@theqrl/web3-errors';
import WebSocketProvider from '../../src/index';

const parseRequest = (data: RawData): JsonRpcRequest => {
	const bytes = Array.isArray(data)
		? Buffer.concat(data)
		: Buffer.isBuffer(data)
			? data
			: Buffer.from(data);
	return JSON.parse(bytes.toString()) as JsonRpcRequest;
};

describe('WebSocket wire limits and handshake (pass-5 audit)', () => {
	it.each([
		{ mode: 'reply', autoReconnect: false },
		{ mode: 'notification', autoReconnect: false },
		{ mode: 'wire limit', autoReconnect: false },
		{ mode: 'close 1009', autoReconnect: false },
		{ mode: 'wire limit', autoReconnect: true },
		{ mode: 'close 1009', autoReconnect: true },
	])(
		'handles an oversized $mode through a real socket (autoReconnect=$autoReconnect)',
		async ({ mode, autoReconnect }) => {
			const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
			await new Promise<void>(resolve => {
				server.once('listening', resolve);
			});
			server.on('connection', socket => {
				socket.on('error', () => undefined);
				socket.on('message', data => {
					const request = parseRequest(data);
					if (request.id === 11) {
						if (mode === 'close 1009') {
							socket.close(1009, 'Message too big');
							return;
						}
						socket.send(
							JSON.stringify(
								mode === 'notification'
									? {
											jsonrpc: '2.0',
											method: 'qrl_subscription',
											params: { result: 'x'.repeat(600) },
										}
									: {
											jsonrpc: '2.0',
											id: 11,
											result: 'x'.repeat(mode === 'wire limit' ? 2000 : 600),
										},
							),
						);
						if (mode !== 'notification') return;
					}
					// Both outstanding requests must fail on a wire-level close.
					if (request.id === 12 && (mode === 'wire limit' || mode === 'close 1009'))
						return;
					socket.send(
						JSON.stringify({
							jsonrpc: '2.0',
							id: request.id,
							result: request.method === 'qrl_accounts' ? [] : '0x1',
						}),
					);
				});
			});
			const provider = new WebSocketProvider(
				`ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
				{},
				{ autoReconnect, delay: 10, maxAttempts: 2 },
				{ maxResponseBytes: 512, requestTimeout: 1000 },
			);
			const errors: unknown[] = [];
			provider.on('error', (error: unknown) => {
				errors.push(error);
			});
			try {
				await new Promise<void>(resolve => {
					provider.once('connect', () => resolve());
				});
				const reconnected = autoReconnect
					? new Promise<void>(resolve => {
							provider.once('connect', () => resolve());
						})
					: undefined;
				const first = provider
					.request({ jsonrpc: '2.0', id: 11, method: 'qrl_blockNumber', params: [] })
					.catch((error: unknown) => error);
				const second = provider
					.request({ jsonrpc: '2.0', id: 12, method: 'qrl_blockNumber', params: [] })
					.catch((error: unknown) => error);
				const [a, b] = await Promise.all([first, second]);
				if (mode === 'notification') expect(a).toHaveProperty('result', '0x1');
				else expect(a).toBeInstanceOf(ResponseTooLargeError);
				if (mode === 'reply' || mode === 'notification') {
					expect(b).toHaveProperty('result', '0x1');
					expect(provider.getStatus()).toBe('connected');
				} else expect(b).toBeInstanceOf(ResponseTooLargeError);
				expect(errors.some(error => error instanceof ResponseTooLargeError)).toBe(true);
				if (autoReconnect) {
					await reconnected;
					await expect(
						provider.request({
							jsonrpc: '2.0',
							id: 13,
							method: 'qrl_blockNumber',
							params: [],
						}),
					).resolves.toHaveProperty('result', '0x1');
				}
			} finally {
				provider.disconnect();
				for (const socket of server.clients) socket.terminate();
				await new Promise<void>(resolve => {
					server.close(() => resolve());
				});
			}
		},
	);
	it('does not announce connect when the RPC handshake fails', async () => {
		const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
		await new Promise<void>(resolve => {
			server.once('listening', resolve);
		});
		server.on('connection', socket => {
			socket.on('message', data => {
				const request = parseRequest(data);
				socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						id: request.id,
						error: { code: -32603, message: 'unavailable' },
					}),
				);
			});
		});
		const provider = new WebSocketProvider(
			`ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
			{},
			{ autoReconnect: false },
		);
		const connected = jest.fn();
		provider.on('connect', connected);
		try {
			await new Promise<void>(resolve => {
				provider.once('error', () => resolve());
			});
			expect(connected).not.toHaveBeenCalled();
		} finally {
			provider.disconnect();
			for (const socket of server.clients) socket.terminate();
			await new Promise<void>(resolve => {
				server.close(() => resolve());
			});
		}
	});
});
