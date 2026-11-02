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
import { InvalidResponseError, ProviderError, ResponseTooLargeError } from '@theqrl/web3-errors';
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

	describe('oversized input (P4-M-5)', () => {
		const DEFAULT_MAX = 10 * 1024 * 1024;
		type Handler = Parameters<ChunkResponseParser['onError']>[0] & jest.Mock;
		/** The request ids each report named, in order. */
		const reportedIds = (handler: jest.Mock) =>
			(handler as Handler).mock.calls.map(([, ids]: [unknown, unknown]) => ids);
		const framedParser = (emitter: EventEmitter, maxResponseBytes?: number) =>
			new ChunkResponseParser(emitter, true, { framed: true, maxResponseBytes });
		const streamParser = (emitter: EventEmitter, maxResponseBytes?: number) =>
			new ChunkResponseParser(emitter, true, { maxResponseBytes });

		it('defaults the bound to 10 MiB and lets maxResponseBytes raise it', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const handler = jest.fn();
			const strict = framedParser(emitter);
			strict.onError(handler);
			// 10 MiB + 1 KiB of payload.
			const message = JSON.stringify({
				...response(1),
				result: 'x'.repeat(DEFAULT_MAX + 1024),
			});

			expect(strict.parseResponse(message)).toEqual([]);
			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(expect.any(ResponseTooLargeError), [1]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toMatchObject({
				maxResponseBytes: DEFAULT_MAX,
				receivedBytes: message.length,
			});

			const relaxed = framedParser(new EventEmitter(), 64 * 1024 * 1024);
			expect(relaxed.parseResponse(message)).toEqual([JSON.parse(message)]);
		});

		it.each([0, -1, 1.5, NaN, Infinity])(
			'rejects maxResponseBytes %p at construction',
			maxResponseBytes => {
				expect(() => framedParser(new EventEmitter(), maxResponseBytes)).toThrow(
					ProviderError,
				);
			},
		);

		it('names every id an oversized frame carries, number or string, single or batch', () => {
			const handler = jest.fn();
			const parser = framedParser(new EventEmitter(), 256);
			parser.onError(handler);
			const padding = 'x'.repeat(300);
			const uuid = 'c3f1d7a8-1d4b-4b8e-9f3a-5d2e7c6b1a90';

			parser.parseResponse(JSON.stringify({ ...response(3), result: padding }));
			parser.parseResponse(JSON.stringify({ ...response(0), id: uuid, result: padding }));
			parser.parseResponse(`{"jsonrpc":"2.0", "id" : 12 ,"result":"${padding}"}`);
			parser.parseResponse(
				JSON.stringify([
					{ ...response(5), result: padding },
					{ ...response(6), result: padding },
					{ ...response(5), result: padding },
				]),
			);

			expect(reportedIds(handler)).toEqual([[3], [uuid], [12], [5, 6]]);
			expect(
				handler.mock.calls.every(([error]) => error instanceof ResponseTooLargeError),
			).toBe(true);
		});

		it('decodes escaped ids and ignores unsafe integers or missing ids', () => {
			const handler = jest.fn();
			const parser = framedParser(new EventEmitter(), 256);
			parser.onError(handler);
			const padding = 'x'.repeat(300);

			// An escaped string id, an unsafe integer and
			// a message without an id at all.
			parser.parseResponse(`{"jsonrpc":"2.0","id":"a\\"b","result":"${padding}"}`);
			parser.parseResponse(
				`{"jsonrpc":"2.0","id":99999999999999999999,"result":"${padding}"}`,
			);
			parser.parseResponse(`{"a":"${padding}"}`);

			expect(reportedIds(handler)).toEqual([['a"b'], [], []]);
		});

		it('scans a bounded prefix only, so an id after a large result is not found', () => {
			const handler = jest.fn();
			const parser = framedParser(new EventEmitter(), 1024);
			parser.onError(handler);

			parser.parseResponse(`{"jsonrpc":"2.0","result":"${'x'.repeat(70 * 1024)}","id":9}`);

			expect(handler).toHaveBeenCalledWith(expect.any(ResponseTooLargeError), []);
		});

		it('does not throw for an oversized frame when nobody listens for errors', () => {
			const parser = framedParser(new EventEmitter(), 16);
			expect(() => parser.parseResponse(JSON.stringify(response(1)))).not.toThrow();
		});

		it('stream mode: reports a complete oversized message with its id and keeps parsing', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const handler = jest.fn();
			const parser = streamParser(emitter, 256);
			parser.onError(handler);
			const big = JSON.stringify({ ...response(4), result: 'x'.repeat(300) });

			expect(parser.parseResponse(`${big}${JSON.stringify(response(1))}`)).toEqual([
				response(1),
			]);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(expect.any(ResponseTooLargeError), [4]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toMatchObject({ maxResponseBytes: 256, receivedBytes: big.length });
		});

		it('stream mode: follows an oversized message across chunks, keeps the stream in step and fails only its request', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const handler = jest.fn();
			const parser = streamParser(emitter, 1024);
			parser.onError(handler);
			// Brackets, quotes and escapes inside the value: a parser that gave up on the
			// message would take them for the start of new messages.
			const big = JSON.stringify({ ...response(7), result: `}{]["\\"{`.repeat(400) });
			const text = `${big}${JSON.stringify(response(8))}`;

			const results = [];
			for (let cut = 0; cut < text.length; cut += 300) {
				results.push(...parser.parseResponse(text.slice(cut, cut + 300)));
			}

			expect(results).toEqual([response(8)]);
			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(expect.any(ResponseTooLargeError), [7]);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toMatchObject({ maxResponseBytes: 1024, receivedBytes: big.length });
			// Nothing is kept of the message once it is complete.
			// @ts-expect-error read private member
			expect(parser.pendingParts).toEqual([]);
			// @ts-expect-error read private member
			expect(parser.discarding).toBe(false);
		});

		it('stream mode: keeps no more than the id prefix of a message being discarded', () => {
			const parser = streamParser(new EventEmitter(), 1024);
			const opening = `{"jsonrpc":"2.0","id":2,"result":"${'x'.repeat(2048)}`;

			expect(parser.parseResponse(opening)).toEqual([]);
			// @ts-expect-error read private member
			expect(parser.discarding).toBe(true);
			// @ts-expect-error read private member
			expect(parser.pendingParts.join('')).toBe(opening);
			for (let index = 0; index < 100; index += 1) {
				expect(parser.parseResponse('y'.repeat(1024))).toEqual([]);
			}
			// @ts-expect-error read private member
			expect(parser.pendingParts.join('')).toBe(opening);
			// @ts-expect-error read private member
			expect(parser.messageBytes).toBe(opening.length + 100 * 1024);
		});

		it('stream mode: a discarded message that never completes is bounded by the chunk timeout', () => {
			jest.useFakeTimers();
			try {
				const emitter = new EventEmitter();
				const errors = collectErrors(emitter);
				const handler = jest.fn();
				const parser = new ChunkResponseParser(emitter, false, { maxResponseBytes: 64 });
				parser.onError(handler);

				expect(parser.parseResponse(`{"id":1,"result":"${'x'.repeat(100)}`)).toEqual([]);
				expect(handler).not.toHaveBeenCalled();
				jest.advanceTimersByTime(15_000);

				expect(errors).toHaveLength(1);
				expect(errors[0]).toBeInstanceOf(InvalidResponseError);
				expect(handler).toHaveBeenCalledTimes(1);
				// @ts-expect-error read private member
				expect(parser.discarding).toBe(false);
				expect(parser.parseResponse(JSON.stringify(response(3)))).toEqual([response(3)]);
			} finally {
				jest.useRealTimers();
			}
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

		it('rejects a complete message above the size bound and, lacking an id, clears queues', () => {
			const emitter = new EventEmitter();
			const errors = collectErrors(emitter);
			const cleared = jest.fn();
			const parser = new ChunkResponseParser(emitter, false);
			parser.onError(cleared);
			const text = `{"a":"${'x'.repeat(10 * 1024 * 1024)}"}${JSON.stringify(response(1))}`;
			expect(parser.parseResponse(text)).toEqual([response(1)]);
			expect(cleared).toHaveBeenCalledTimes(1);
			expect(cleared).toHaveBeenCalledWith(expect.any(ResponseTooLargeError), []);
			expect(errors).toHaveLength(1);
			expect(errors[0]).toBeInstanceOf(ResponseTooLargeError);
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

test('recovers within the same chunk when joining response fragments fails', () => {
	const emitter = new EventEmitter();
	const errors = jest.fn();
	emitter.on('error', errors);
	const parser = new ChunkResponseParser(emitter, false);
	parser.parseResponse('{"jsonrpc":"2.0","id":1,"result":"');
	const state = parser as unknown as { pendingParts: string[]; lastChunkTimeout?: unknown };
	jest.spyOn(state.pendingParts, 'join').mockImplementation(() => {
		throw new RangeError('Invalid string length');
	});
	const next = { jsonrpc: '2.0', id: 2, result: 'ok' };
	expect(parser.parseResponse(`big"}${JSON.stringify(next)}`)).toEqual([next]);
	expect(errors).toHaveBeenCalledWith(expect.any(ResponseTooLargeError));
	expect(state.pendingParts).toEqual([]);
	expect(state.lastChunkTimeout).toBeUndefined();
	expect(parser.parseResponse(JSON.stringify(next))).toEqual([next]);
});

/* eslint-disable jest/no-conditional-expect -- framed and stream transports have distinct delivery steps */
test.each([true, false])(
	'bounds nested JSON before allocation and contains throwing error listeners (framed=%s)',
	framed => {
		const emitter = new EventEmitter();
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		emitter.on('error', () => {
			throw new Error('consumer');
		});
		const parser = new ChunkResponseParser(emitter, false, { framed });
		const fail = jest.fn();
		parser.onError(fail);
		const nested =
			'{"jsonrpc":"2.0","id":7,"result":' +
			'['.repeat(524288) +
			'0' +
			']'.repeat(524288) +
			'}';
		const good = '{"jsonrpc":"2.0","id":8,"result":"ok"}';
		try {
			if (framed) {
				expect(parser.parseResponse(nested)).toEqual([]);
				expect(parser.parseResponse(good)).toEqual([JSON.parse(good)]);
			} else {
				expect(parser.parseResponse(nested.slice(0, 2048))).toEqual([]);
				expect(parser.parseResponse(nested.slice(2048) + good)).toEqual([JSON.parse(good)]);
			}
			expect(fail).toHaveBeenCalledWith(expect.any(InvalidResponseError), [7]);
			expect(fail.mock.calls[0][0].message).toContain('nesting depth');
		} finally {
			parser.reset();
			warn.mockRestore();
		}
	},
);

test.each([
	[true, '[]'],
	[false, '[]'],
	[true, '{}'],
	[false, '{}'],
] as const)(
	'bounds empty-container allocation, preserves following replies and ignores quoted brackets (framed=%s, item=%s)',
	(framed, item) => {
		const parser = new ChunkResponseParser(new EventEmitter(), false, {
			framed,
			maxResponseBytes: 65536,
		});
		const fail = jest.fn();
		parser.onError(fail);
		const hostile =
			'{"jsonrpc":"2.0","id":42,"result":[' + `${item},`.repeat(5000) + item + ']}';
		const good = JSON.stringify({ id: 43, result: '[{}]"\\' });
		if (framed) {
			expect(parser.parseResponse(hostile)).toEqual([]);
			expect(parser.parseResponse(good)).toEqual([JSON.parse(good)]);
		} else {
			expect(parser.parseResponse(hostile.slice(0, 1000))).toEqual([]);
			expect(parser.parseResponse(hostile.slice(1000) + good)).toEqual([JSON.parse(good)]);
		}
		expect(fail).toHaveBeenCalledWith(expect.any(InvalidResponseError), [42]);
		expect(fail.mock.calls[0][0].message).toContain('container count');
		parser.reset();
	},
);

test.each([
	[true, 65536],
	[false, 65536],
	[true, 10 * 1024 * 1024],
	[false, 10 * 1024 * 1024],
] as const)(
	'accepts struct-logger traces with empty memory near the byte cap (framed=%s, maxResponseBytes=%s)',
	(framed, maxResponseBytes) => {
		const entry = {
			pc: 0,
			op: 'PUSH1',
			gas: 900000,
			gasCost: 3,
			depth: 1,
			stack: ['0x1'],
			memory: [],
		};
		const encoded = JSON.stringify(entry);
		const prefix =
			'{"jsonrpc":"2.0","id":42,"result":{"gas":1,"failed":false,"returnValue":"","structLogs":[';
		const suffix = ']}}';
		const count = Math.floor(
			(maxResponseBytes - prefix.length - suffix.length + 1) / (encoded.length + 1),
		);
		const text = prefix + `${encoded},`.repeat(count - 1) + encoded + suffix;
		expect(Buffer.byteLength(text)).toBeLessThanOrEqual(maxResponseBytes);
		expect(Buffer.byteLength(text)).toBeGreaterThan(maxResponseBytes * 0.99);
		const parser = new ChunkResponseParser(new EventEmitter(), false, {
			framed,
			maxResponseBytes,
		});
		const fail = jest.fn();
		parser.onError(fail);
		const replies = framed
			? parser.parseResponse(text)
			: [
					...parser.parseResponse(text.slice(0, text.length / 2)),
					...parser.parseResponse(text.slice(text.length / 2)),
				];
		expect(replies).toHaveLength(1);
		expect(replies[0]).toHaveProperty('result.structLogs.length', count);
		expect(replies[0]).toHaveProperty('result.structLogs.0', entry);
		expect(replies[0]).toHaveProperty(`result.structLogs.${count - 1}`, entry);
		expect(fail).not.toHaveBeenCalled();
		parser.reset();
	},
);

test.each([true, false])(
	'accepts a full 1024-frame trace and enforces custom depth (framed=%s)',
	framed => {
		const text =
			'{"id":1,"result":' + '{"calls":['.repeat(1024) + '{}' + ']}'.repeat(1024) + '}';
		const parser = new ChunkResponseParser(new EventEmitter(), false, { framed });
		expect(parser.parseResponse(text)).toHaveLength(1);
		const limited = new ChunkResponseParser(new EventEmitter(), false, {
			framed,
			maxResponseDepth: 100,
		});
		const fail = jest.fn();
		limited.onError(fail);
		expect(limited.parseResponse(text)).toEqual([]);
		expect(fail.mock.calls[0][0].message).toContain('nesting depth 100');
		parser.reset();
		limited.reset();
	},
);

describe('UTF-8 response byte accounting (P10-TR-2)', () => {
	it.each([true, false])('enforces encoded bytes (framed=%s)', framed => {
		const message = { jsonrpc: '2.0', id: 1, result: '日😀'.repeat(30) };
		const wire = JSON.stringify(message);
		const size = Buffer.byteLength(wire);
		const errors = jest.fn();
		const exact = new ChunkResponseParser(new EventEmitter(), false, {
			framed,
			maxResponseBytes: size,
		});
		expect(exact.parseResponse(wire)).toEqual([message]);
		const small = new ChunkResponseParser(new EventEmitter(), false, {
			framed,
			maxResponseBytes: size - 1,
		});
		small.onError(errors);
		expect(small.parseResponse(wire)).toEqual([]);
		expect(errors).toHaveBeenCalledWith(expect.any(ResponseTooLargeError), [1]);
		expect(small.parseResponse('{"id":2}')).toEqual([{ id: 2 }]);
	});
	it('counts a surrogate pair split across chunks once, including empty chunks', () => {
		const wire = JSON.stringify({ id: 1, result: '😀' });
		const split = wire.indexOf('😀') + 1;
		const parser = new ChunkResponseParser(new EventEmitter(), false, {
			maxResponseBytes: Buffer.byteLength(wire),
		});
		expect(parser.parseResponse(wire.slice(0, split))).toEqual([]);
		expect(parser.parseResponse('')).toEqual([]);
		expect(parser.parseResponse(wire.slice(split))).toEqual([JSON.parse(wire)]);
	});
	it('bounds a partial multibyte stream before completion', () => {
		const parser = new ChunkResponseParser(new EventEmitter(), false, { maxResponseBytes: 80 });
		const errors = jest.fn();
		parser.onError(errors);
		parser.parseResponse('{"id":1,"result":"');
		parser.parseResponse('日'.repeat(30));
		// @ts-expect-error inspect the bounded discard state before the message ends
		expect(parser.discarding).toBe(true);
		parser.parseResponse('"}');
		expect(errors).toHaveBeenCalledWith(expect.any(ResponseTooLargeError), [1]);
		parser.reset();
	});
});
