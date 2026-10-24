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
import * as fs from 'fs';
import net from 'net';
import { IpcProvider } from '../../src/index';

jest.mock('net');
jest.mock('fs');

// Pre-existing jest.mock('net') interop issue: under the project's pinned
// ts-jest/jest config, `net` is auto-mocked to `{}` and `new net.Socket(...)`
// throws "Cannot read properties of undefined (reading 'Socket')". Not
// related to the QRL address migrations; the runtime works fine.
describe('IPCProvider', () => {
	let socketPath: string;
	const testAddress =
		'Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3';

	beforeEach(() => {
		socketPath = '/test/test.ipc';
		jest.spyOn(fs, 'statSync').mockReturnValue({
			isSocket: () => true,
		} as unknown as fs.Stats);
		jest.spyOn(net.Socket.prototype, 'connect').mockImplementation(jest.fn());
		jest.spyOn(net.Socket.prototype, 'write').mockImplementation(jest.fn());
	});

	describe('methods', () => {
		it.each(['_openSocketConnection', '_addSocketListeners'])(
			'should call method %s',
			method => {
				const _method = jest.fn();
				// @ts-expect-error mock method
				jest.spyOn(IpcProvider.prototype, method).mockImplementation(_method);
				const ipc = new IpcProvider(socketPath);
				expect(ipc).toBeDefined();
				expect(_method).toHaveBeenCalled();
			},
		);
		it('should construct with expected methods', () => {
			const _closeSocketConnection = jest.fn();
			const _removeSocketListeners = jest.fn();
			const _onDisconnect = jest.fn();

			const code = 1002;
			const data = 'data';
			// @ts-expect-error mock method
			jest.spyOn(IpcProvider.prototype, '_closeSocketConnection').mockImplementation(
				_closeSocketConnection,
			);
			// @ts-expect-error mock method
			jest.spyOn(IpcProvider.prototype, '_removeSocketListeners').mockImplementation(
				_removeSocketListeners,
			);
			// @ts-expect-error mock method
			jest.spyOn(IpcProvider.prototype, '_onDisconnect').mockImplementation(_onDisconnect);
			const ipc = new IpcProvider(socketPath);
			// @ts-expect-error mock method
			ipc._parseResponses = jest.fn();
			ipc.disconnect(code, data);
			expect(_removeSocketListeners).toHaveBeenCalled();
			expect(_onDisconnect).toHaveBeenCalledWith(code, data);
			expect(_closeSocketConnection).toHaveBeenCalledWith(code, data);
		});
		it('getStatus', () => {
			const ipc = new IpcProvider(socketPath);
			// @ts-expect-error mock field
			ipc._socketConnection.connecting = true;
			expect(ipc.getStatus()).toBe('connecting');
		});
		it('socketConnection.destroy', () => {
			const ipc = new IpcProvider(socketPath);
			const destroy = jest.fn();
			const _onDisconnect = jest.fn();
			// @ts-expect-error mock method
			ipc._socketConnection.destroy = destroy;
			// @ts-expect-error mock method
			ipc._onDisconnect = _onDisconnect;
			const code = 1002;
			const data = 'data';
			// @ts-expect-error mock field
			ipc._socketConnection.connecting = false;
			// @ts-expect-error mock field
			ipc._connectionStatus = 'connected';
			expect(ipc.getStatus()).toBe('connected');
			ipc.disconnect(code, data);

			// Reported once, by the base class; the socket's end callback used to repeat it
			// (I-F13).
			expect(_onDisconnect).toHaveBeenCalledTimes(1);
			expect(_onDisconnect).toHaveBeenCalledWith(code, data);
			expect(destroy).toHaveBeenCalledTimes(1);
			expect(destroy).toHaveBeenCalledWith();
		});

		it('connection error', async () => {
			const ipc = new IpcProvider(socketPath);
			// @ts-expect-error mock method
			ipc._socketConnection.connecting = false;
			// @ts-expect-error mock method
			ipc._connectionStatus = 'disconnected';
			ipc.connect = jest.fn();

			await expect(
				ipc.request({
					jsonrpc: '2.0',
					id: 42,
					method: 'qrl_getBalance',
					params: [testAddress, 'latest'],
				}),
			).rejects.toThrow('Connection not open');
		});
		it('_onCloseHandler autoReconnect=false', () => {
			const ipc = new IpcProvider(socketPath, {}, { autoReconnect: false });
			const _clearQueues = jest.fn();
			const _removeSocketListeners = jest.fn();
			const _onDisconnect = jest.fn();

			// @ts-expect-error mock method
			ipc._clearQueues = _clearQueues;
			// @ts-expect-error mock method
			ipc._removeSocketListeners = _removeSocketListeners;
			// @ts-expect-error mock method
			ipc._onDisconnect = _onDisconnect;
			// @ts-expect-error mock method
			ipc._socketConnection.connecting = false;
			// @ts-expect-error emit method
			ipc._connectionStatus = 'connected';

			// @ts-expect-error emit method
			ipc._onCloseHandler();
			expect(_clearQueues).toHaveBeenCalled();
			expect(_removeSocketListeners).toHaveBeenCalled();
			expect(_onDisconnect).toHaveBeenCalledWith(undefined, undefined);
		});
		it('_onCloseHandler autoReconnect=true', () => {
			const ipc = new IpcProvider(socketPath);
			const _reconnect = jest.fn();
			// @ts-expect-error mock method
			ipc._reconnect = _reconnect;

			// @ts-expect-error emit event
			ipc._onCloseHandler();
			expect(_reconnect).toHaveBeenCalled();
		});
		it('listeners', () => {
			const ipc = new IpcProvider(socketPath, undefined, { autoReconnect: false });
			// @ts-expect-error mock method
			ipc.chunkResponseParser.parseResponse = jest.fn(() => {
				return [];
			});
			// @ts-expect-error mock method
			ipc._socketConnection.listeners = () => {
				throw new Error('error');
			};
			// Invokes the handlers as they are registered; a real socket never emits
			// `close`/`end` synchronously, so those two are only recorded.
			const on = jest.fn((event: string, cb: (data?: string) => void) => {
				if (event === 'error') {
					cb('error');
				} else if (event === 'data') {
					cb('data');
				} else if (event === 'connect') {
					cb();
				}
			});
			// @ts-expect-error mock method
			ipc._socketConnection.on = on;
			// @ts-expect-error mock method
			ipc.isReconnecting = true;
			// @ts-expect-error mock method
			ipc._reconnect = jest.fn();
			// @ts-expect-error mock method
			ipc._clearQueues = jest.fn();
			// @ts-expect-error mock method
			ipc._addSocketListeners();
			// The constructor already attached the error listener to this socket: re-adding
			// the others (what `reset()` does) must not add a second one (L-24).
			// @ts-expect-error mock method
			expect(on).not.toHaveBeenCalledWith('error', ipc._onErrorHandler);
			// @ts-expect-error mock method
			expect(on).toHaveBeenCalledWith('close', ipc._onCloseHandler);
			// @ts-expect-error mock method
			expect(on).toHaveBeenCalledWith('end', ipc._onCloseHandler);
			// A socket that carries no error listener yet gets one.
			// @ts-expect-error mock field
			ipc._socketConnection = { on, removeAllListeners: jest.fn(), destroy: jest.fn() };
			// @ts-expect-error mock method
			ipc._addSocketListeners();
			// @ts-expect-error mock method
			expect(on).toHaveBeenCalledWith('error', ipc._onErrorHandler);
			const removeAllListeners = jest.fn();
			// @ts-expect-error mock method
			ipc._socketConnection.removeAllListeners = removeAllListeners;
			// @ts-expect-error mock method
			ipc.isReconnecting = false;
			ipc.disconnect();
			expect(removeAllListeners).toHaveBeenCalledWith('end');
			expect(removeAllListeners).toHaveBeenCalledWith('close');
			expect(removeAllListeners).toHaveBeenCalledWith('data');
			expect(removeAllListeners).toHaveBeenCalledWith('connect');
		});
	});
});
