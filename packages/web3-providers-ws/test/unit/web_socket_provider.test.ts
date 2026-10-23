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
import WebSocket from 'isomorphic-ws';
import { QRLExecutionAPI, Web3APIPayload } from '@theqrl/web3-types';
import {
	InvalidClientError,
	ProviderError,
	RequestSerializationError,
	Web3WSProviderError,
} from '@theqrl/web3-errors';
import WebSocketProvider from '../../src/index';
import {
	invalidConnectionStrings,
	validConnectionStrings,
	wsProviderOptions,
} from '../fixtures/test_data';

jest.mock('isomorphic-ws');

describe('WebSocketProvider', () => {
	let wsProvider: WebSocketProvider;
	let jsonRpcPayload: Web3APIPayload<QRLExecutionAPI, 'qrl_getBalance'>;
	let jsonRpcResponse: Record<string, unknown>;
	const testAddress =
		'Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3';

	beforeEach(() => {
		jest.spyOn(WebSocket.prototype, 'send');

		wsProvider = new WebSocketProvider('ws://localhost:8545');

		jsonRpcPayload = {
			jsonrpc: '2.0',
			id: 42,
			method: 'qrl_getBalance',
			params: [testAddress, 'latest'],
		};
		jsonRpcResponse = { ...jsonRpcPayload, result: JSON.stringify(jsonRpcPayload) };
	});

	describe('constructor', () => {
		it('should construct with expected methods', () => {
			expect(wsProvider.request).toBeDefined();
			expect(wsProvider.getStatus).toBeDefined();
			expect(wsProvider.supportsSubscriptions).toBeDefined();
			expect(wsProvider.request).toBeDefined();
			expect(wsProvider.on).toBeDefined();
			expect(wsProvider.removeListener).toBeDefined();
			expect(wsProvider.once).toBeDefined();
			expect(wsProvider.removeAllListeners).toBeDefined();
			expect(wsProvider.connect).toBeDefined();
			expect(wsProvider.disconnect).toBeDefined();
			expect(wsProvider.reset).toBeDefined();
			expect(wsProvider.SocketConnection).toBeInstanceOf(WebSocket);
		});

		it('should allow for providerOptions to be passed upon instantiation', () => {
			expect(
				() => new WebSocketProvider('ws://localhost:8545', wsProviderOptions),
			).not.toThrow();
		});

		it.each(validConnectionStrings)(
			'should instantiation with valid client - %s',
			validClient => {
				expect(() => new WebSocketProvider(validClient)).not.toThrow();
			},
		);

		it.each(invalidConnectionStrings)(
			'should instantiation with invalid client - %s',
			invalidClient => {
				expect(
					() =>
						// @ts-expect-error - Purposefully passing invalid types to check validation
						new WebSocketProvider(invalidClient),
				).toThrow(`Client URL "${invalidClient as unknown as string}" is invalid.`);
			},
		);
	});

	describe('supportsSubscriptions', () => {
		it('should return true', () => {
			expect(wsProvider.supportsSubscriptions()).toBe(true);
		});
	});

	describe('request', () => {
		describe('success response', () => {
			it('should return expected response', async () => {
				const result = await wsProvider.request(jsonRpcPayload);

				expect(result).toEqual(jsonRpcResponse);
			});
		});
	});

	describe('malformed frames from the peer', () => {
		const socket = () => wsProvider.SocketConnection as unknown as WebSocket;

		it.each([
			['[null]', 1],
			['null', 1],
			['0', 1],
			['"text"', 1],
			['{', 1],
			['', 1],
			['[1]', 1],
		])('reports frame %p instead of throwing or reconnecting', (frame, expectedErrors) => {
			const errors: unknown[] = [];
			wsProvider.on('error', (error: unknown) => {
				errors.push(error);
			});
			// @ts-expect-error protected member
			const reconnect = jest.spyOn(wsProvider, '_reconnect');

			expect(() => socket().emit('message', { data: frame })).not.toThrow();

			expect(errors).toHaveLength(expectedErrors);
			expect(reconnect).not.toHaveBeenCalled();
		});

		it('does not throw when no error listener is attached', () => {
			expect(() => socket().emit('message', { data: '[null]' })).not.toThrow();
			expect(() => socket().emit('message', { data: '{' })).not.toThrow();
		});

		it('does not throw on binary frames', () => {
			wsProvider.on('error', () => undefined);

			expect(() => socket().emit('message', { data: Buffer.from('[null]') })).not.toThrow();
			expect(() => socket().emit('message', { data: new ArrayBuffer(4) })).not.toThrow();
			expect(() =>
				socket().emit('message', { data: [Buffer.from('nu'), Buffer.from('ll')] }),
			).not.toThrow();
		});

		it('decodes a binary frame that carries a valid response', async () => {
			const request = wsProvider.request(jsonRpcPayload);
			// The mock answers after 100 ms; answer first, as a Buffer, with the same shape.
			socket().emit('message', { data: Buffer.from(JSON.stringify(jsonRpcResponse)) });

			await expect(request).resolves.toEqual(jsonRpcResponse);
		});

		it('reports an unsupported frame data type as a ProviderError', () => {
			const errors: unknown[] = [];
			wsProvider.on('error', (error: unknown) => {
				errors.push(error);
			});

			expect(() => socket().emit('message', { data: 42 })).not.toThrow();
			expect(() => socket().emit('message', { data: [Buffer.from('x'), 'y'] })).not.toThrow();

			expect(errors).toHaveLength(2);
			expect(errors[0]).toBeInstanceOf(ProviderError);
			expect(errors[1]).toBeInstanceOf(ProviderError);
		});

		it('keeps answering requests after a malformed frame', async () => {
			wsProvider.on('error', () => undefined);
			socket().emit('message', { data: '{' });

			const result = await wsProvider.request(jsonRpcPayload);

			expect(result).toEqual(jsonRpcResponse);
		});
	});

	describe('cleartext warning (I-15)', () => {
		it('names the parsed hostname only and skips loopback hosts', () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

			new WebSocketProvider('ws://127.0.0.1:8546/path');
			new WebSocketProvider('ws://[::1]:8546');
			new WebSocketProvider('ws://localhost:8546');
			// Unparseable: refused at construction (P4-L-15), nothing to warn about.
			expect(() => new WebSocketProvider('ws://[::1')).toThrow(InvalidClientError);
			expect(warn).not.toHaveBeenCalled();

			new WebSocketProvider('ws://node.example:8546/v3/KEY');
			new WebSocketProvider('ws://evil.example/');
			expect(warn).toHaveBeenCalledTimes(2);
			expect(warn.mock.calls[0][0]).toBe(
				'web3-providers-ws: cleartext ws:// URL to non-loopback host "node.example". Use wss:// for production.',
			);
			expect(warn.mock.calls[1][0]).toContain('"evil.example"');
			expect(JSON.stringify(warn.mock.calls)).not.toContain('pw');
			expect(JSON.stringify(warn.mock.calls)).not.toContain('KEY');
		});

		it('redacts credentials and the path from InvalidClientError', () => {
			expect(() => new WebSocketProvider('http://user:pw@node.example/v3/KEY')).toThrow(
				'Client URL "http://***@node.example/[redacted]" is invalid.',
			);
		});

		it.each([
			'ws://user:pw@127.0.0.1:8546/path',
			'wss://alice:hunter2@node.example/v3/KEY',
			'ws://token@127.0.0.1:8546',
		])('rejects credentials in the URL (%s) at construction with a redacted error', url => {
			// Credentials belong in socketOptions.headers: a browser WebSocket refuses such a URL
			// and `ws` would send them as Basic authentication unasked.
			let thrown: unknown;
			try {
				new WebSocketProvider(url, {}, { autoReconnect: false });
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(InvalidClientError);
			expect((thrown as Error).message).toContain('***@');
			expect((thrown as Error).message).not.toMatch(/pw|hunter2|token|KEY/);
		});
	});

	describe('URL validation (P4-L-15)', () => {
		it.each([
			['ws://alice:hunter2@127.0.0.1:99999/v3/API-KEY-0123', 'ws://***@127.0.0.1:99999/[redacted]'],
			['wss://alice:hunter2@[::1/v3/API-KEY-0123', 'wss://***@[::1/[redacted]'],
			['ws://alice:hunter2@exa mple.com/v3/API-KEY-0123', 'ws://***@exa mple.com/[redacted]'],
		])('refuses the unparseable %s without echoing credentials or path', (url, redacted) => {
			let thrown: unknown;
			try {
				new WebSocketProvider(url, {}, { autoReconnect: false });
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(InvalidClientError);
			const { message } = thrown as Error;
			expect(message).toBe(`Client URL "${redacted}" is invalid.`);
			expect(message).not.toContain('hunter2');
			expect(message).not.toContain('API-KEY');
			expect(message).not.toContain('alice');
		});

		it.each(['ws://[::1]:8546/path?token=x', 'WSS://node.example', 'ws://127.0.0.1:1'])(
			'accepts the well-formed %s',
			url => {
				expect(() => new WebSocketProvider(url)).not.toThrow();
			},
		);
	});

	describe('close arguments (P4-L-17)', () => {
		type MockSocket = { readyState: number; CONNECTING: number; close: jest.Mock };
		const socket = () => wsProvider.SocketConnection as unknown as MockSocket;

		beforeEach(() => {
			socket().close = jest.fn();
		});

		it.each([
			[1005, 'reserved code'],
			[1001, 'going away is not for clients'],
			[2999, 'below the library range'],
			[5000, 'above the private range'],
			[1000.5, 'not an integer'],
			[Number.NaN, 'NaN'],
		])('refuses close code %p (%s) before touching the connection', code => {
			// @ts-expect-error protected member
			const closeSocket = jest.spyOn(wsProvider, '_closeSocketConnection');
			let thrown: unknown;
			try {
				wsProvider.disconnect(code, 'bye');
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(Web3WSProviderError);
			expect((thrown as Error).message).toContain('expected 1000 or a code in the range 3000-4999');
			expect(closeSocket).not.toHaveBeenCalled();
			expect(socket().close).not.toHaveBeenCalled();
			expect(wsProvider.getStatus()).toBe('connected');
		});

		it('refuses a reason above 123 UTF-8 bytes or of the wrong type', () => {
			// 62 two-byte characters: 124 bytes.
			expect(() => wsProvider.disconnect(1000, 'é'.repeat(62))).toThrow(
				'Invalid WebSocket close reason: 124 UTF-8 bytes exceed the 123-byte limit of a close frame',
			);
			expect(() => wsProvider.disconnect(3000, 'x'.repeat(124))).toThrow(Web3WSProviderError);
			expect(() => wsProvider.disconnect(3000, 42 as unknown as string)).toThrow(
				'Invalid WebSocket close reason: expected a string',
			);
			expect(socket().close).not.toHaveBeenCalled();
			expect(wsProvider.getStatus()).toBe('connected');
		});

		it.each([
			[undefined, undefined],
			[1000, undefined],
			[3000, 'bye'],
			[4999, 'é'.repeat(61)],
		])('passes code %p and reason %p to the socket', (code, data) => {
			wsProvider.disconnect(code, data);
			expect(socket().close).toHaveBeenCalledWith(code ?? 1000, data);
			expect(wsProvider.getStatus()).toBe('disconnected');
		});

		it('silences the error ws reports for a handshake aborted by disconnect() (I-F12)', () => {
			const current = socket();
			current.readyState = current.CONNECTING;
			const removeEventListener = jest.spyOn(
				current as unknown as { removeEventListener: () => void },
				'removeEventListener',
			);

			wsProvider.disconnect();

			// @ts-expect-error protected member
			expect(removeEventListener).toHaveBeenCalledWith('error', wsProvider._onErrorHandler);
			expect(current.close).toHaveBeenCalledWith(1000, undefined);
		});
	});

	describe('stale close events (P4-L-18)', () => {
		it('ignores a close reported by a socket that is no longer the current one', () => {
			// @ts-expect-error protected member
			const reconnect = jest.spyOn(wsProvider, '_reconnect');
			// @ts-expect-error protected member
			const clearQueues = jest.spyOn(wsProvider, '_clearQueues');
			const socket = wsProvider.SocketConnection as unknown as WebSocket;

			socket.emit('close', { code: 1000, reason: '', wasClean: true, target: {} });
			expect(reconnect).not.toHaveBeenCalled();
			expect(clearQueues).not.toHaveBeenCalled();

			socket.emit('close', { code: 1006, reason: '', wasClean: false, target: socket });
			expect(reconnect).toHaveBeenCalledTimes(1);
		});
	});

	describe('payload serialisation (I-15)', () => {
		it('rejects a bigint param with RequestSerializationError and sends nothing', async () => {
			await expect(
				wsProvider.request({ ...jsonRpcPayload, id: 43, params: [BigInt(1)] } as never),
			).rejects.toThrow(RequestSerializationError);
			expect(WebSocket.prototype.send).not.toHaveBeenCalled();
		});

		it('rejects a payload whose toJSON yields no JSON text', async () => {
			await expect(
				wsProvider.request({ ...jsonRpcPayload, id: 44, toJSON: () => undefined } as never),
			).rejects.toThrow('payload serialised to undefined');
			expect(WebSocket.prototype.send).not.toHaveBeenCalled();
		});
	});

	describe('socket replacement (L-44)', () => {
		type MockSocket = {
			readyState: number;
			CLOSING?: number;
			CLOSED?: number;
			close?: jest.Mock;
		};
		const current = () => wsProvider.SocketConnection as unknown as MockSocket;

		type MockSocketWithTerminate = MockSocket & {
			terminate?: jest.Mock;
			listenerCount: (event: string) => number;
		};

		it('closes an open previous socket, terminates a closing one and leaves a closed or unclosable one alone', () => {
			// The manual mock has no close(): nothing to do.
			const unclosable = current();
			expect(() => wsProvider.connect()).not.toThrow();
			expect(current()).not.toBe(unclosable);

			// A close handshake the peer has not finished is not waited for (P4-L-17).
			const closing = current() as MockSocketWithTerminate;
			closing.CLOSING = 2;
			closing.CLOSED = 3;
			closing.readyState = 2;
			closing.close = jest.fn();
			closing.terminate = jest.fn();
			wsProvider.connect();
			expect(closing.close).not.toHaveBeenCalled();
			expect(closing.terminate).toHaveBeenCalledTimes(1);

			// A closing socket without terminate(): nothing else to do.
			const closingUnterminable = current() as MockSocketWithTerminate;
			closingUnterminable.CLOSING = 2;
			closingUnterminable.CLOSED = 3;
			closingUnterminable.readyState = 2;
			closingUnterminable.close = jest.fn();
			wsProvider.connect();
			expect(closingUnterminable.close).not.toHaveBeenCalled();

			const closed = current() as MockSocketWithTerminate;
			closed.CLOSING = 2;
			closed.CLOSED = 3;
			closed.readyState = 3;
			closed.close = jest.fn();
			closed.terminate = jest.fn();
			wsProvider.connect();
			expect(closed.close).not.toHaveBeenCalled();
			expect(closed.terminate).not.toHaveBeenCalled();

			const open = current();
			open.close = jest.fn();
			wsProvider.connect();
			expect(open.close).toHaveBeenCalledTimes(1);
			expect(current()).not.toBe(open);
		});

		it('detaches the listeners of a closing or closed socket as well (P4-L-18)', () => {
			for (const readyState of [2, 3]) {
				const previous = current() as MockSocketWithTerminate;
				previous.CLOSING = 2;
				previous.CLOSED = 3;
				previous.readyState = readyState;
				previous.close = jest.fn();
				previous.terminate = jest.fn();
				expect(previous.listenerCount('message')).toBe(1);

				wsProvider.connect();

				expect(previous.listenerCount('open')).toBe(0);
				expect(previous.listenerCount('message')).toBe(0);
				expect(previous.listenerCount('close')).toBe(0);
				// The provider's error listener is swapped for one that drops the event.
				expect(previous.listenerCount('error')).toBe(1);
				// @ts-expect-error protected member
				expect((previous as unknown as WebSocket).listeners('error')).not.toContain(wsProvider._onErrorHandler);
			}
		});
	});

	describe('status (M-8)', () => {
		it('reports disconnected once the base class marked it so, even while CONNECTING', () => {
			const socket = wsProvider.SocketConnection as unknown as { readyState: number };
			socket.readyState = 0;
			expect(wsProvider.getStatus()).toBe('connecting');
			// @ts-expect-error protected member
			wsProvider._connectionStatus = 'disconnected';
			expect(wsProvider.getStatus()).toBe('disconnected');
		});
	});
});
