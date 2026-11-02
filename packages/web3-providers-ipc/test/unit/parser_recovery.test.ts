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

import { Socket } from 'net';
import { InvalidResponseError } from '@theqrl/web3-errors';
import { JsonRpcRequest } from '@theqrl/web3-types';
import { IpcProvider } from '../../src/index';

class TestIpcProvider extends IpcProvider {
	protected _openSocketConnection(): void {
		this._socketConnection = new Socket();
		jest.spyOn(this._socketConnection, 'write').mockImplementation(data => {
			const request = JSON.parse(String(data)) as JsonRpcRequest;
			if (request.method === 'qrl_chainId' || request.method === 'qrl_accounts') {
				this._socketConnection?.emit(
					'data',
					JSON.stringify({
						jsonrpc: '2.0',
						id: request.id,
						result: request.method === 'qrl_chainId' ? '0x1' : [],
					}),
				);
			}
			return true;
		});
	}
}

describe('IPC parser recovery', () => {
	it.each([false, true])(
		'keeps receiving replies after a chunk timeout (autoReconnect=%s)',
		async autoReconnect => {
			jest.useFakeTimers();
			const provider = new TestIpcProvider('/unused.ipc', {}, { autoReconnect });
			provider.on('error', () => undefined);
			const socket = provider.SocketConnection as Socket;
			try {
				socket.emit('connect');
				const firstRequest = provider
					.request({ jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber', params: [] })
					.catch((error: unknown) => error);
				socket.emit('data', '{');
				jest.advanceTimersByTime(10_000);
				socket.emit('data', JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }));
				jest.advanceTimersByTime(5_000);

				expect(provider.getStatus()).toBe('connected');
				expect(socket.listenerCount('data')).toBe(1);
				const request = provider.request({
					jsonrpc: '2.0',
					id: 2,
					method: 'qrl_blockNumber',
					params: [],
				});
				const response = { jsonrpc: '2.0', id: 2, result: '0x2' };
				socket.emit('data', JSON.stringify(response));
				await expect(request).resolves.toEqual(response);

				const firstResponse = { jsonrpc: '2.0', id: 1, result: '0x1' };
				const protocolError = expect.any(InvalidResponseError);
				socket.emit('data', JSON.stringify(firstResponse));
				await expect(firstRequest).resolves.toEqual(protocolError);
			} finally {
				provider.disconnect();
				socket.destroy();
				jest.useRealTimers();
			}
		},
	);
});

// IPC emits all messages from one read synchronously, before subscribe's promise resumes.
test('defers acknowledged IPC bursts until awaiting callers attach listeners, including reconnect', async () => {
	const provider = new TestIpcProvider('/unused.ipc', {}, { autoReconnect: false });
	const received: unknown[] = [];
	try {
		for (const round of [1, 2]) {
			if (round === 2) provider.connect();
			const connected = new Promise<void>(resolve =>
				provider.once('connect', () => resolve()),
			);
			const socket = provider.SocketConnection as Socket;
			socket.emit('connect');
			// eslint-disable-next-line no-await-in-loop -- exercise initial and replacement sockets in order
			await connected;
			const pending = provider.request({
				jsonrpc: '2.0',
				id: round,
				method: 'qrl_subscribe',
				params: ['newHeads'],
			});
			const notifications = Array.from({ length: 200 }, (_, i) => ({
				jsonrpc: '2.0',
				method: 'qrl_subscription',
				params: { subscription: `0x${round}`, result: i },
			}));
			socket.emit(
				'data',
				JSON.stringify({ jsonrpc: '2.0', id: round, result: `0x${round}` }) +
					notifications.map(item => JSON.stringify(item)).join(''),
			);
			// eslint-disable-next-line no-await-in-loop -- attach after registration, as public callers do
			await pending;
			const listener = (message: unknown) => {
				received.push(message);
			};
			provider.on('message', listener);
			// eslint-disable-next-line no-await-in-loop -- allow deferred notifications to flush
			await new Promise(resolve => setTimeout(resolve, 10));
			provider.removeListener('message', listener);
			expect(received.splice(0)).toEqual(notifications);
			provider.disconnect();
			socket.destroy();
		}
	} finally {
		provider.disconnect();
	}
});
