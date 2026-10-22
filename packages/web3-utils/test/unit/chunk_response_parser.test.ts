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
import { InvalidResponseError } from '@theqrl/web3-errors';
import { ChunkResponseParser } from '../../src/chunk_response_parser';

describe('ChunkResponseParser', () => {
	const response = (id: number) => ({ jsonrpc: '2.0', id, result: '0x1' });
	const collectErrors = (emitter: EventEmitter) => {
		const errors: unknown[] = [];
		emitter.on('error', error => {
			errors.push(error);
		});
		return errors;
	};

	describe('stream mode (IPC)', () => {
		it.each([false, true])(
			'bounds a partial message despite ongoing traffic (autoReconnect=%s)',
			autoReconnect => {
				jest.useFakeTimers();
				try {
					const emitter = new EventEmitter();
					const errors = collectErrors(emitter);
					const parser = new ChunkResponseParser(emitter, autoReconnect);

					expect(parser.parseResponse('{')).toEqual([]);
					jest.advanceTimersByTime(10_000);
					expect(parser.parseResponse(JSON.stringify(response(1)))).toEqual([]);
					jest.advanceTimersByTime(5_000);

					expect(errors).toHaveLength(1);
					expect(errors[0]).toBeInstanceOf(InvalidResponseError);
					expect(parser.parseResponse(JSON.stringify(response(2)))).toEqual([
						response(2),
					]);
				} finally {
					jest.useRealTimers();
				}
			},
		);

		it('reassembles a message split across two chunks', () => {
			const parser = new ChunkResponseParser(new EventEmitter(), false);
			const text = JSON.stringify(response(1));

			expect(parser.parseResponse(text.slice(0, 10))).toEqual([]);
			expect(parser.parseResponse(text.slice(10))).toEqual([response(1)]);
		});

		it('splits concatenated messages', () => {
			const parser = new ChunkResponseParser(new EventEmitter(), false);

			expect(
				parser.parseResponse(JSON.stringify(response(1)) + JSON.stringify(response(2))),
			).toEqual([response(1), response(2)]);
		});

		it('reset() drops a partial chunk so it cannot prefix the next message', () => {
			const parser = new ChunkResponseParser(new EventEmitter(), false);

			expect(parser.parseResponse('{"jsonrpc":"2.0","id":1,')).toEqual([]);
			parser.reset();

			expect(parser.parseResponse(JSON.stringify(response(2)))).toEqual([response(2)]);
		});

		it('discards a chunk that never completes once the chunk timeout fires', () => {
			jest.useFakeTimers();
			try {
				const emitter = new EventEmitter();
				const errors = collectErrors(emitter);
				const parser = new ChunkResponseParser(emitter, false);

				expect(parser.parseResponse('{"jsonrpc":"2.0",')).toEqual([]);
				jest.advanceTimersByTime(15_000);

				expect(errors).toHaveLength(1);
				expect(errors[0]).toBeInstanceOf(InvalidResponseError);
				expect(parser.parseResponse(JSON.stringify(response(3)))).toEqual([response(3)]);
			} finally {
				jest.useRealTimers();
			}
		});

		it('discards a chunk that never completes even when auto-reconnect is on', () => {
			jest.useFakeTimers();
			try {
				const parser = new ChunkResponseParser(new EventEmitter(), true);

				expect(parser.parseResponse('{"jsonrpc":"2.0",')).toEqual([]);
				jest.advanceTimersByTime(15_000);

				expect(parser.parseResponse(JSON.stringify(response(3)))).toEqual([response(3)]);
			} finally {
				jest.useRealTimers();
			}
		});
	});

	describe('framed mode (WebSocket)', () => {
		it('preserves delimiter-like text inside a complete JSON message', () => {
			const parser = new ChunkResponseParser(new EventEmitter(), true, { framed: true });
			const message = { ...response(1), result: '}{}][{|--|' };

			expect(parser.parseResponse(JSON.stringify(message))).toEqual([message]);
		});

		it('drops a malformed frame without retaining it', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const parser = new ChunkResponseParser(emitter, true, { framed: true });

			expect(parser.parseResponse('{')).toEqual([]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toBeInstanceOf(InvalidResponseError);

			expect(parser.parseResponse(JSON.stringify(response(1)))).toEqual([response(1)]);
		});

		it('does not throw for a malformed frame when nobody listens for errors', () => {
			const parser = new ChunkResponseParser(new EventEmitter(), true, { framed: true });

			expect(() => parser.parseResponse('{')).not.toThrow();
			expect(() => parser.parseResponse('null')).not.toThrow();
			expect(parser.parseResponse(JSON.stringify(response(1)))).toEqual([response(1)]);
		});
	});

	describe('non-object JSON values', () => {
		it.each(['null', '0', 'false', '""', '"text"'])('drops %s and reports it', text => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const parser = new ChunkResponseParser(emitter, false);

			expect(parser.parseResponse(text)).toEqual([]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toBeInstanceOf(InvalidResponseError);
		});

		it('hands a batch array through for the provider to validate', () => {
			const parser = new ChunkResponseParser(new EventEmitter(), false);

			// eslint-disable-next-line no-null/no-null
			expect(parser.parseResponse('[null]')).toEqual([[null]]);
		});
	});

	describe('oversized input', () => {
		it('rejects a chunk above the size bound, clears queues and resets', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const cleared = jest.fn();
			const parser = new ChunkResponseParser(emitter, false);
			parser.onError(cleared);

			expect(parser.parseResponse(`{"a":"${'x'.repeat(10 * 1024 * 1024)}`)).toEqual([]);

			expect(cleared).toHaveBeenCalledTimes(1);
			expect(errors[0]).toBeInstanceOf(InvalidResponseError);
			expect(parser.parseResponse(JSON.stringify(response(1)))).toEqual([response(1)]);
		});
	});

	describe('stream mode boundary detection and cost', () => {
		const tricky = { ...response(1), result: 'a}{b"}{"c\\"]{ }][{ |--| \\' };

		it('keeps delimiter-like text and escaped quotes inside string values', () => {
			const parser = new ChunkResponseParser(new EventEmitter(), false);
			const text = JSON.stringify(tricky) + JSON.stringify(response(2));
			expect(parser.parseResponse(text)).toEqual([tricky, response(2)]);
		});

		it('reassembles messages cut at every possible position', () => {
			const text = `${JSON.stringify(tricky)}\n${JSON.stringify(response(2))}`;
			for (let cut = 1; cut < text.length; cut += 1) {
				const parser = new ChunkResponseParser(new EventEmitter(), false);
				const results = [
					...parser.parseResponse(text.slice(0, cut)),
					...parser.parseResponse(text.slice(cut)),
				];
				expect(results).toEqual([tricky, response(2)]);
			}
		});

		it('accepts whitespace between messages and batch arrays next to objects', () => {
			const parser = new ChunkResponseParser(new EventEmitter(), false);
			const batch = [response(1), response(2)];
			const text = `\n${JSON.stringify(batch)}\r\n${JSON.stringify(response(3))}\n`;
			expect(parser.parseResponse(text)).toEqual([batch, response(3)]);
		});

		it('skips garbage between messages, reports it once and keeps the messages', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const parser = new ChunkResponseParser(emitter, false);
			const text = `null${JSON.stringify(response(1))} 42 }]${JSON.stringify(response(2))}`;
			expect(parser.parseResponse(text)).toEqual([response(1), response(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toBeInstanceOf(InvalidResponseError);
		});

		it('drops a balanced segment that is not JSON and reports it once', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const parser = new ChunkResponseParser(emitter, false);
			const text = `${'{]'.repeat(1000)}${JSON.stringify(response(1))}`;
			expect(parser.parseResponse(text)).toEqual([response(1)]);
			expect(errors).toHaveLength(1);
		});

		it('does work linear in the input on a stream of unparseable fragments', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const parser = new ChunkResponseParser(emitter, false);
			const fragments = 20_000;
			const data = '}{'.repeat(fragments);
			const parse = jest.spyOn(JSON, 'parse');
			try {
				// `}` garbage, then `{}` empty objects, then a trailing `{` that stays pending.
				expect(parser.parseResponse(data)).toHaveLength(fragments - 1);
				const parsedBytes = parse.mock.calls.reduce(
					(total, [text]) => total + String(text).length,
					0,
				);
				// Every byte is handed to JSON.parse at most once; the old parser re-parsed a
				// growing prefix for every fragment (quadratic).
				expect(parsedBytes).toBeLessThanOrEqual(data.length);
				expect(parse.mock.calls.length).toBe(fragments - 1);
			} finally {
				parse.mockRestore();
				parser.reset();
			}
			expect(errors).toHaveLength(1);
		});

		it('rejects a complete message above the size bound and clears queues', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const cleared = jest.fn();
			const parser = new ChunkResponseParser(emitter, false);
			parser.onError(cleared);
			const text = `{"a":"${'x'.repeat(10 * 1024 * 1024)}"}${JSON.stringify(response(1))}`;
			expect(parser.parseResponse(text)).toEqual([response(1)]);
			expect(cleared).toHaveBeenCalledTimes(1);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toBeInstanceOf(InvalidResponseError);
		});

		it('gives a message that opens after another completed a fresh deadline', () => {
			jest.useFakeTimers();
			try {
				const emitter = new EventEmitter();
				const errors = collectErrors(emitter);
				const parser = new ChunkResponseParser(emitter, false);
				expect(parser.parseResponse('{"jsonrpc":"2.0",')).toEqual([]);
				jest.advanceTimersByTime(14_000);
				const rest = `"id":1,"result":"0x1"}${JSON.stringify(response(2)).slice(0, 5)}`;
				expect(parser.parseResponse(rest)).toEqual([response(1)]);
				jest.advanceTimersByTime(14_000);
				expect(errors).toHaveLength(0);
				jest.advanceTimersByTime(1_000);
				expect(errors).toHaveLength(1);
			} finally {
				jest.useRealTimers();
			}
		});
	});

	describe('timer handle (I-11)', () => {
		it('does not keep the process alive for a half-received message', () => {
			const parser = new ChunkResponseParser(new EventEmitter(), false);
			expect(parser.parseResponse('{"id":1')).toEqual([]);
			// @ts-expect-error read private member
			const timer = parser.lastChunkTimeout as NodeJS.Timeout;
			expect(timer.hasRef()).toBe(false);
			parser.reset();
			// @ts-expect-error read private member
			expect(parser.lastChunkTimeout).toBeUndefined();
		});
	});
});
