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

import { JsonRpcBatchResponse } from '@theqrl/web3-types';
import {
	OperationAbortError,
	OperationTimeoutError,
	RequestTimeoutError,
	ResponseError,
} from '@theqrl/web3-errors';
import { Web3BatchRequest } from '../../src/web3_batch_request';
import { Web3RequestManager } from '../../src/web3_request_manager';

describe('batch response matching and failures', () => {
	let manager: Web3RequestManager;
	let batch: Web3BatchRequest;

	beforeEach(() => {
		manager = new Web3RequestManager();
		batch = new Web3BatchRequest(manager);
	});

	afterEach(() => jest.useRealTimers());

	it('matches reordered responses using the default UUID IDs', async () => {
		const first = batch.add({ method: 'qrl_blockNumber' });
		const second = batch.add({ method: 'qrl_chainId' });
		const [one, two] = batch.requests;
		expect(typeof one.id).toBe('string');
		expect(typeof two.id).toBe('string');
		jest.spyOn(manager, 'sendBatch').mockResolvedValue([
			{ jsonrpc: '2.0', id: two.id, result: '0x2' },
			{ jsonrpc: '2.0', id: one.id, result: '0x1' },
		]);

		await batch.execute();
		await expect(first).resolves.toBe('0x1');
		await expect(second).resolves.toBe('0x2');
	});

	it.each(['unrelated UUID', 'duplicate UUID', 'string instead of number'])(
		'rejects every entry for an invalid response ID: %s',
		async kind => {
			const entries = [
				batch.add({
					method: 'qrl_blockNumber',
					id: kind === 'string instead of number' ? 1 : undefined,
				}),
				batch.add({
					method: 'qrl_chainId',
					id: kind === 'string instead of number' ? 2 : undefined,
				}),
			];
			const errors = entries.map(async entry => entry.catch((error: unknown) => error));
			const [one, two] = batch.requests;
			const ids =
				kind === 'unrelated UUID'
					? [one.id, 'unrelated-uuid']
					: kind === 'duplicate UUID'
						? [one.id, one.id]
						: [String(one.id), String(two.id)];
			jest.spyOn(manager, 'sendBatch').mockResolvedValue(
				ids.map(id => ({ jsonrpc: '2.0', id, result: '0x1' })),
			);

			await expect(batch.execute()).rejects.toBeInstanceOf(ResponseError);
			expect(entries.map(entry => entry.state)).toEqual(['rejected', 'rejected']);
			await expect(Promise.all(errors)).resolves.toEqual([
				expect.any(OperationAbortError),
				expect.any(OperationAbortError),
			]);
		},
	);

	it('distinguishes numeric IDs from equal-looking string IDs', async () => {
		const numeric = batch.add({ method: 'qrl_blockNumber', id: 1 });
		const textual = batch.add({ method: 'qrl_chainId', id: '1' });
		jest.spyOn(manager, 'sendBatch').mockResolvedValue([
			{ jsonrpc: '2.0', id: '1', result: 'textual' },
			{ jsonrpc: '2.0', id: 1, result: 'numeric' },
		]);
		await batch.execute();
		await expect(numeric).resolves.toBe('numeric');
		await expect(textual).resolves.toBe('textual');
	});

	it.each([new Error('connection lost'), new RequestTimeoutError(100)])(
		'rejects all entries when the request manager fails: %s',
		async error => {
			jest.useFakeTimers();
			jest.spyOn(manager, 'sendBatch').mockRejectedValue(error);
			const entries = [
				batch.add({ method: 'qrl_blockNumber' }),
				batch.add({ method: 'qrl_chainId' }),
			];
			const errors = entries.map(async entry => entry.catch((reason: unknown) => reason));

			await expect(batch.execute()).rejects.toBe(error);
			expect(entries.map(entry => entry.state)).toEqual(['rejected', 'rejected']);
			await expect(Promise.all(errors)).resolves.toEqual([error, error]);
			expect(jest.getTimerCount()).toBe(0);
		},
	);

	it('ignores a response arriving after the batch timeout', async () => {
		jest.useFakeTimers();
		let respond!: (response: JsonRpcBatchResponse<unknown>) => void;
		jest.spyOn(manager, 'sendBatch').mockReturnValue(
			new Promise(resolve => {
				respond = resolve;
			}),
		);
		const entry = batch.add({ method: 'qrl_blockNumber' });
		const error = entry.catch((reason: unknown) => reason);
		const timeout = expect(batch.execute({ timeout: 10 })).rejects.toBeInstanceOf(
			OperationTimeoutError,
		);
		await jest.advanceTimersByTimeAsync(10);
		await timeout;
		await expect(error).resolves.toBeInstanceOf(OperationAbortError);

		respond([{ jsonrpc: '2.0', id: batch.requests[0].id, result: 'late response' }]);
		await jest.advanceTimersByTimeAsync(0);
		expect(entry.state).toBe('rejected');
		expect(jest.getTimerCount()).toBe(0);
	});
});
