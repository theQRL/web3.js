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
import { ResponseTooLargeError } from '@theqrl/web3-errors';
import HttpProvider from '../../src';

describe('oversized HTTP response cleanup', () => {
	it.each([200, 413])(
		'closes a stalled HTTP %i connection after header rejection',
		async status => {
			const server = createServer((request, response) => {
				request.resume();
				response.writeHead(status, { 'Content-Length': '99999' });
				// Send the headers, then leave the response open without sending the body.
				response.flushHeaders();
			});
			const connectionClosed = new Promise<boolean>(resolve => {
				server.once('connection', socket => socket.once('close', () => resolve(true)));
			});
			let closeTimeout: ReturnType<typeof setTimeout> | undefined;

			try {
				await new Promise<void>((resolve, reject) => {
					server.once('error', reject);
					server.listen(0, '127.0.0.1', resolve);
				});
				const { port } = server.address() as AddressInfo;
				const provider = new HttpProvider(`http://127.0.0.1:${port}`, {
					maxResponseBytes: 2048,
				});

				await expect(
					provider.request({
						jsonrpc: '2.0',
						id: 1,
						method: 'qrl_blockNumber',
						params: [],
					}),
				).rejects.toThrow(ResponseTooLargeError);

				const stillOpen = new Promise<boolean>(resolve => {
					closeTimeout = setTimeout(() => resolve(false), 1_000);
				});
				expect(await Promise.race([connectionClosed, stillOpen])).toBe(true);
			} finally {
				clearTimeout(closeTimeout);
				server.closeAllConnections();
				await new Promise<void>(resolve => server.close(() => resolve()));
			}
		},
	);
});
