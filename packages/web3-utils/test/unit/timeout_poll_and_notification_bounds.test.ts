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

import { EventEmitter } from 'events';
import { ChunkResponseParser } from '../../src/chunk_response_parser';
import { Web3DeferredPromise } from '../../src/web3_deferred_promise';
import { rejectIfConditionAtInterval } from '../../src/promise_helpers';

describe('timeout, polling and notification bounds (pass-5 audit)', () => {
	it.each([0, NaN, Infinity, -1])('rejects explicit invalid deferred timeout %s', timeout => {
		expect(
			() =>
				new Web3DeferredPromise({ timeout, eagerStart: false, timeoutMessage: 'timeout' }),
		).toThrow();
	});
	it('does not overlap asynchronous polling conditions', async () => {
		jest.useFakeTimers();
		let finish!: (value: Error) => void;
		const condition = jest.fn(
			async () =>
				new Promise<Error>(resolve => {
					finish = resolve;
				}),
		);
		const [timer, pending] = rejectIfConditionAtInterval(condition, 10);
		const result = pending.catch((error: unknown) => error);
		try {
			jest.advanceTimersByTime(100);
			expect(condition).toHaveBeenCalledTimes(1);
			finish(new Error('done'));
			await expect(result).resolves.toEqual(new Error('done'));
		} finally {
			clearInterval(timer);
			jest.useRealTimers();
		}
	});
	it('ignores nested ids and drops oversized notifications without rejecting requests', () => {
		const emitter = new EventEmitter();
		const errors = jest.fn();
		emitter.on('error', errors);
		const parser = new ChunkResponseParser(emitter, false, {
			maxResponseBytes: 256,
			framed: true,
		});
		const rejectRequests = jest.fn();
		parser.onError(rejectRequests);
		parser.parseResponse(
			JSON.stringify({
				jsonrpc: '2.0',
				method: 'qrl_subscription',
				params: { id: 77, result: 'x'.repeat(300) },
			}),
		);
		expect(errors).toHaveBeenCalledTimes(1);
		expect(rejectRequests).not.toHaveBeenCalled();
		parser.parseResponse(
			JSON.stringify({ jsonrpc: '2.0', result: { id: 77, value: 'x'.repeat(300) } }),
		);
		expect(rejectRequests).toHaveBeenCalledWith(expect.any(Error), []);
	});
});
