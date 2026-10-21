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

import { createServer } from 'http';
import { AddressInfo } from 'net';
import { RequestTimeoutError } from '@theqrl/web3-errors';
import HttpProvider from '../../src';

describe.each([200, 503])('HTTP %i body cancellation cleanup', status => {
	it.each(['timeout', 'caller abort'])('closes the stalled connection on %s', async mode => {
		const controller = new AbortController();
		const reason = new Error('cancelled by caller');
		const timeoutError = expect.any(RequestTimeoutError);
		let abortTimer: ReturnType<typeof setTimeout> | undefined;
		let closeTimer: ReturnType<typeof setTimeout> | undefined;
		const server = createServer((request, response) => {
			request.resume();
			response.writeHead(status, { 'Content-Type': 'application/json' });
			response.write('{');
			// Abort after the connection deadline: reaching the caller abort requires
			// the provider to have received headers and retired that deadline first.
			if (mode === 'caller abort')
				abortTimer = setTimeout(() => controller.abort(reason), 750);
		});
		const connectionClosed = new Promise<boolean>(resolve => {
			server.once('connection', socket => socket.once('close', () => resolve(true)));
		});

		try {
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', resolve);
			});
			const { port } = server.address() as AddressInfo;
			const provider = new HttpProvider(`http://127.0.0.1:${port}`, {
				connectionTimeout: 500,
				requestTimeout: mode === 'timeout' ? 1_000 : 5_000,
			});
			const request = provider.request(
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'qrl_blockNumber',
					params: [],
				},
				{ signal: controller.signal },
			);
			await expect(request).rejects.toEqual(mode === 'timeout' ? timeoutError : reason);

			const stillOpen = new Promise<boolean>(resolve => {
				closeTimer = setTimeout(() => resolve(false), 1_000);
			});
			expect(await Promise.race([connectionClosed, stillOpen])).toBe(true);
		} finally {
			clearTimeout(abortTimer);
			clearTimeout(closeTimer);
			server.closeAllConnections();
			await new Promise<void>(resolve => server.close(() => resolve()));
		}
	});
});
