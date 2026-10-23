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
import WebSocket from 'ws';
import { once } from 'events';
import { AddressInfo } from 'net';

export const createProxy = async (
	port: number,
	origin: string,
): Promise<{
	server: WebSocket.Server;
	port: number;
	path: string;
	close: () => Promise<void>;
	originWs: WebSocket;
}> => {
	const originWs = new WebSocket(origin);
	const connectedClients = new Set<WebSocket>();

	await once(originWs, 'open');

	const webSocketServer = new WebSocket.Server({
		host: '127.0.0.1',
		port,
	});
	await once(webSocketServer, 'listening');
	const boundPort = (webSocketServer.address() as AddressInfo).port;
	const closeSocket = async (socket: WebSocket) =>
		new Promise(resolve => {
			if (socket.readyState === WebSocket.CLOSED) {
				resolve(true);
				return;
			}
			const timeOut = setTimeout(() => {
				resolve(true);
			}, 2000);
			socket.once('close', () => {
				clearTimeout(timeOut);
				resolve(true);
			});
			socket.terminate();
		});

	const closeServer = async () =>
		new Promise(resolve => {
			webSocketServer.close(() => resolve(true));
		});

	webSocketServer.on('connection', ws => {
		connectedClients.add(ws);
		ws.on('message', (d, isBinary) => {
			originWs.send(d, { binary: isBinary });
		});
		const onOriginMessage = (d: WebSocket.RawData, isBinary: boolean) => {
			ws.send(d, { binary: isBinary });
		};
		originWs.on('message', onOriginMessage);
		ws.on('close', () => {
			connectedClients.delete(ws);
			originWs.removeListener('message', onOriginMessage);
			ws.removeAllListeners();
		});
	});

	return {
		path: `ws://127.0.0.1:${boundPort}`,
		port: boundPort,
		server: webSocketServer,
		originWs,
		close: async () => {
			for (const socket of connectedClients) {
				// eslint-disable-next-line no-await-in-loop
				await closeSocket(socket);
			}
			originWs.removeAllListeners('message');
			await closeSocket(originWs);
			await closeServer();
		},
	};
};
