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

/* eslint-disable jest/no-conditional-expect -- each table case has a distinct transport verdict */
import http from 'http';
import { AddressInfo } from 'net';
import { ConnectionError, InvalidConnectionError } from '@theqrl/web3-errors';
import HttpProvider from '../../src/index';

describe('native fetch failures (pass-5 audit)', () => {
	it.each(['truncated', 'redirect'])('wraps a real %s response', async mode => {
		const server = http.createServer((_request, response) => {
			if (mode === 'redirect') {
				response.writeHead(302, { Location: '/redirected' });
				response.end();
			} else {
				response.writeHead(200, { 'Content-Length': '1000', Connection: 'close' });
				response.end('{"jsonrpc":');
			}
		});
		await new Promise<void>(resolve => {
			server.listen(0, '127.0.0.1', resolve);
		});
		const provider = new HttpProvider(
			`http://127.0.0.1:${(server.address() as AddressInfo).port}`,
			{ requestTimeout: 2000 },
		);
		try {
			const result = provider.request({
				jsonrpc: '2.0',
				id: 1,
				method: 'qrl_blockNumber',
				params: [],
			});
			if (mode === 'truncated')
				await expect(result).rejects.toBeInstanceOf(InvalidConnectionError);
			else {
				await expect(result).rejects.toBeInstanceOf(ConnectionError);
				await expect(result).rejects.toThrow('redirect');
			}
		} finally {
			server.closeAllConnections();
			await new Promise<void>(resolve => {
				server.close(() => resolve());
			});
		}
	});
});

test('refuses an ignored node-fetch agent before making a native fetch request', async () => {
	const fetchRequest = jest.spyOn(globalThis, 'fetch');
	const provider = new HttpProvider('http://127.0.0.1:1', {
		providerOptions: { agent: {} } as never,
	});
	await expect(
		provider.request({ jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber', params: [] }),
	).rejects.toThrow('use an undici dispatcher');
	expect(fetchRequest).not.toHaveBeenCalled();
});
