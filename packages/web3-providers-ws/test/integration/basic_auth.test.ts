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
import express from 'express';
import { once } from 'events';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createProxyMiddleware } from 'http-proxy-middleware';
import WebSocketProvider from '../../src/index';
import {
	describeIf,
	getSystemTestProviderUrl,
	isWs,
	waitForSocketConnect,
	waitForCloseSocketConnection,
} from '../fixtures/system_test_utils';

describeIf(isWs)('Support of Basic Auth', () => {
	let server: Server;
	let clientWsUrl: string;
	let proxyUrl: string;
	let webSocketProvider: WebSocketProvider;

	beforeAll(async () => {
		clientWsUrl = getSystemTestProviderUrl();
		const app = express();

		const wsProxy = createProxyMiddleware({
			target: clientWsUrl,
			changeOrigin: true,
			ws: true,
			on: {
				error: () => {
					console.warn('************** proxy error');
				},
			},
		});

		app.use(wsProxy);
		server = app.listen(0, '127.0.0.1');
		await once(server, 'listening');
		proxyUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;

		server.on('upgrade', (req, socket, head) => {
			if (!req.headers.authorization?.includes('Basic ')) {
				socket.emit('error');
				socket.destroy();
			}
			const base64Credentials = req.headers.authorization?.split(' ')[1];
			const credentials: string = Buffer.from(base64Credentials as string, 'base64').toString(
				'ascii',
			);
			const [username, password] = credentials.split(':');
			if (username !== 'gqrl' || password !== 'authpass') {
				socket.emit('error');
				socket.destroy();
			}
			return wsProxy.upgrade?.(req as any, socket as any, head);
		});
	});
	afterAll(() => {
		server.close();
	});
	beforeEach(() => {
		webSocketProvider = new WebSocketProvider(
			proxyUrl,
			{
				headers: {
					authorization: `Basic ${Buffer.from('gqrl:authpass').toString('base64')}`,
				},
			},
			{ delay: 1, autoReconnect: false, maxAttempts: 1 },
		);
	});
	afterEach(async () => {
		if (webSocketProvider && webSocketProvider.getStatus() !== 'disconnected') {
			const closePromise = waitForCloseSocketConnection(webSocketProvider);
			webSocketProvider.disconnect();
			await closePromise;
		}
	});
	test('should connect with basic auth in an explicit header', async () => {
		await waitForSocketConnect(webSocketProvider);
		expect(webSocketProvider.getStatus()).toBe('connected');
	});
});
