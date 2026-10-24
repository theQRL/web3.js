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
import * as fs from 'fs';
import { ConnectionError, InvalidClientError } from '@theqrl/web3-errors';
import { IpcProvider } from '../../src/index';

jest.mock('net');
jest.mock('fs');

describe('IpcProvider', () => {
	let socketPath: string;

	const socketStats = { isSocket: () => true } as unknown as fs.Stats;

	beforeEach(() => {
		socketPath = '/test/test.ipc';
		jest.spyOn(fs, 'statSync').mockReturnValue(socketStats);
	});

	describe('constructor', () => {
		it('should construct the instance of the provider', () => {
			const provider = new IpcProvider(socketPath);
			expect(provider).toBeInstanceOf(IpcProvider);
			expect(provider.SocketConnection).toBeInstanceOf(Socket);
		});

		it('should try to connect', () => {
			const connectSpy = jest.spyOn(IpcProvider.prototype, 'connect');
			new IpcProvider(socketPath);

			expect(connectSpy).toHaveBeenCalled();
		});
	});

	describe('connect', () => {
		it('should verify socket path', () => {
			new IpcProvider(socketPath);

			expect(fs.statSync).toHaveBeenCalledWith(socketPath);
			expect(fs.statSync).toHaveBeenCalledTimes(1);
		});

		it('should throw error if socket path does not exists', () => {
			jest.spyOn(fs, 'statSync').mockImplementation(() => {
				throw Object.assign(new Error('ENOENT: no such file or directory'), {
					code: 'ENOENT',
				});
			});
			expect(() => new IpcProvider(socketPath)).toThrow(
				new ConnectionError(
					`Error while connecting to ${socketPath}. Reason: ${
						new InvalidClientError(socketPath).message
					}`,
				),
			);
		});

		it('does not require a socket inode on Windows (named pipes)', () => {
			jest.spyOn(fs, 'statSync').mockReturnValue({
				isSocket: () => false,
			} as unknown as fs.Stats);
			const platform = Object.getOwnPropertyDescriptor(process, 'platform');
			Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
			try {
				expect(() => new IpcProvider(socketPath)).not.toThrow();
			} finally {
				Object.defineProperty(process, 'platform', platform as PropertyDescriptor);
			}
		});

		it('refuses a path that exists but is not a socket (L-43)', () => {
			jest.spyOn(fs, 'statSync').mockReturnValue({
				isSocket: () => false,
			} as unknown as fs.Stats);
			expect(() => new IpcProvider(socketPath)).toThrow(ConnectionError);
			expect(() => new IpcProvider(socketPath)).toThrow(
				`IPC path "${socketPath}" exists but is not a Unix domain socket`,
			);
		});

		it('should add listeners to socket', () => {
			const provider = new IpcProvider(socketPath);
			// @ts-expect-error-next-line
			jest.spyOn(provider._socketConnection, 'on');

			// @ts-expect-error-next-line
			expect(provider._socketConnection.on).toHaveBeenCalledWith(
				'connect',
				expect.any(Function),
			);
			// @ts-expect-error-next-line
			expect(provider._socketConnection.on).toHaveBeenCalledWith('end', expect.any(Function));
			// @ts-expect-error-next-line
			expect(provider._socketConnection.on).toHaveBeenCalledWith(
				'close',
				expect.any(Function),
			);
			// @ts-expect-error-next-line
			expect(provider._socketConnection.on).toHaveBeenCalledWith(
				'data',
				expect.any(Function),
			);
		});

		it('should connect to socket path', () => {
			const provider = new IpcProvider(socketPath);
			// @ts-expect-error-next-line
			jest.spyOn(provider._socketConnection, 'connect');

			// @ts-expect-error-next-line
			expect(provider._socketConnection.connect).toHaveBeenCalledTimes(1);
			// @ts-expect-error-next-line
			expect(provider._socketConnection.connect).toHaveBeenCalledWith({
				path: socketPath,
			});
		});
	});
});
