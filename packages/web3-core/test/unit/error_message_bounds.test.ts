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

import { ProviderError, ResponseError } from '@theqrl/web3-errors';
import { Web3BatchRequest, Web3RequestManager } from '../../src';

const request = { jsonrpc: '2.0' as const, id: 1, method: 'qrl_blockNumber', params: [] };
const large = 'x'.repeat(1024 * 1024);

test('bounds a non-array batch error and keeps the node error (P13-TR-2)', async () => {
	const reply = { jsonrpc: '2.0', id: 1, error: { code: -32000, message: large } };
	const manager = new Web3RequestManager({ request: jest.fn().mockResolvedValue(reply) });
	const error = (await manager.sendBatch([request]).catch((e: unknown) => e)) as ResponseError;
	expect(error).toBeInstanceOf(ResponseError);
	expect(error.message).toContain('Batch request failed:');
	expect(error.message.length).toBeLessThan(400);
	expect(error.innerError).toBe(reply.error);
});

test('bounds mismatching batch ids and settles all entry promises (P13-TR-2)', async () => {
	const replies = Array.from({ length: 20 }, (_, id) => ({
		jsonrpc: '2.0',
		id: `${id}${large.slice(0, 10000)}`,
		result: '0x1',
	}));
	const manager = new Web3RequestManager({ request: jest.fn().mockResolvedValue(replies) });
	const batch = new Web3BatchRequest(manager);
	const entries = Array.from({ length: 20 }, (_, id) => batch.add({ ...request, id }));
	const error = (await batch.execute().catch((e: unknown) => e)) as ResponseError;
	expect(error).toBeInstanceOf(ResponseError);
	expect(error.message).toContain('Batch request mismatch');
	expect(error.message.length).toBeLessThan(700);
	expect((await Promise.allSettled(entries)).map(result => result.status)).toEqual(
		new Array(20).fill('rejected'),
	);
});

test('bounds a non-JSON-RPC provider rejection and retains its cause (P13-TR-2)', async () => {
	const manager = new Web3RequestManager({ request: jest.fn().mockRejectedValue(large) });
	const error = (await manager.send(request).catch((e: unknown) => e)) as ProviderError;
	expect(error).toBeInstanceOf(ProviderError);
	expect(error.message.length).toBeLessThan(400);
	expect(error.innerError).toBe(large);
});
