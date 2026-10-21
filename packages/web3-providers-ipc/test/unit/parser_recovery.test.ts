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
				await expect(firstRequest).resolves.toEqual(
					autoReconnect ? firstResponse : protocolError,
				);
			} finally {
				provider.disconnect();
				socket.destroy();
				jest.useRealTimers();
			}
		},
	);
});
