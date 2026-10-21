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

import { EventEmitter } from 'stream';
import {
	Web3APIPayload,
	QRLExecutionAPI,
	JsonRpcResponse,
	Web3ProviderStatus,
} from '@theqrl/web3-types';
import {
	ConnectionNotOpenError,
	ConnectionTimeoutError,
	ProviderError,
	RequestQueueFullError,
	RequestTimeoutError,
	ResponseError,
} from '@theqrl/web3-errors';
import { sleep } from '../../../../fixtures/utils';
import { SocketProvider, SocketProviderOptions } from '../../src/socket_provider';

const dummySocketConnection = { dummy: 'dummy' };

class TestProvider extends SocketProvider<any, any, any> {
	protected _socketConnection?: typeof dummySocketConnection;

	/** Payloads handed to the socket, in order. */
	public readonly sentPayloads: any[] = [];
	/** When set, `_sendToSocket` throws it instead of recording the payload. */
	public sendError?: Error;

	protected _openSocketConnection() {
		this._socketConnection = dummySocketConnection;
	}

	// Dummy implementation of the abstract base methods
	// eslint-disable-next-line
	protected _addSocketListeners(): void {}
	// eslint-disable-next-line
	protected _removeSocketListeners(): void {}
	// eslint-disable-next-line
	protected _onCloseEvent(_event: any): void {}
	protected _sendToSocket(_payload: Web3APIPayload<QRLExecutionAPI, any>): void {
		if (this.sendError) throw this.sendError;
		this.sentPayloads.push(_payload);
	}
	// The controllable stub socket: `message([...])` delivers exactly the responses given.
	// Anything that is not an array parses to zero responses, which is how the pre-existing
	// tests drive the "lost connection" branch.
	// eslint-disable-next-line class-methods-use-this
	protected _parseResponses(_event: any): JsonRpcResponse[] {
		return (Array.isArray(_event) ? _event : []) as JsonRpcResponse[];
	}
	public message(_event: any): void {
		this._onMessage(_event);
	}

	/** Drives the real `_onConnect` path (flushes `_pendingRequestsQueue`). */
	public simulateOpen(): void {
		this._onConnect();
	}

	// eslint-disable-next-line
	protected _closeSocketConnection(
		_code?: number | undefined,
		_data?: string | undefined,
		// eslint-disable-next-line
	): void {}
	// eslint-disable-next-line
	getStatus(): Web3ProviderStatus {
		return this._connectionStatus;
	}
	// eslint-disable-next-line
	setStatus(status: Web3ProviderStatus) {
		this._connectionStatus = status;
	}
}

describe('SocketProvider', () => {
	const socketPath = `some_path`;
	const socketOption = { dummyOption: true } as const;

	describe('socket_provider unit tests', () => {
		describe('constructor', () => {
			it('should construct the instance of the provider', () => {
				const provider = new TestProvider(socketPath, socketOption);
				expect(provider).toBeInstanceOf(SocketProvider);
				expect(provider.SocketConnection).toEqual(dummySocketConnection);
			});
		});
		describe('malformed input from the peer', () => {
			it.each([{ autoReconnect: false }, { autoReconnect: true }])(
				'never triggers a reconnect when nothing parseable arrives (%p)',
				reconnectOptions => {
					const provider = new TestProvider(socketPath, socketOption, reconnectOptions);
					// @ts-expect-error run protected method
					jest.spyOn(provider, '_reconnect').mockReturnValue('');
					provider.message('');
					// @ts-expect-error run protected method
					expect(provider._reconnect).not.toHaveBeenCalled();
				},
			);

			it('reports, rather than throws, a null entry in a response batch', () => {
				const provider = new TestProvider(socketPath, socketOption, { autoReconnect: true });
				const errors: unknown[] = [];
				provider.on('error', (error: unknown) => {
					errors.push(error);
				});
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_reconnect').mockReturnValue('');

				// eslint-disable-next-line no-null/no-null
				expect(() => provider.message([null])).not.toThrow();

				expect(errors).toHaveLength(1);
				expect(errors[0]).toBeInstanceOf(ResponseError);
				// @ts-expect-error run protected method
				expect(provider._reconnect).not.toHaveBeenCalled();
			});

			it('does not throw on malformed entries when no error listener is attached', () => {
				const provider = new TestProvider(socketPath, socketOption, { autoReconnect: false });
				// eslint-disable-next-line no-null/no-null
				expect(() => provider.message([null, 1, 'x', true, [null]])).not.toThrow();
			});

			it('reports, rather than throws, when the transport cannot parse the event', () => {
				const provider = new TestProvider(socketPath, socketOption, { autoReconnect: true });
				const errors: unknown[] = [];
				provider.on('error', (error: unknown) => {
					errors.push(error);
				});
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_reconnect').mockReturnValue('');
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_parseResponses').mockImplementation(() => {
					throw new Error('binary frame');
				});

				expect(() => provider.message('anything')).not.toThrow();

				expect(errors).toHaveLength(1);
				expect((errors[0] as Error).message).toBe('binary frame');
				// @ts-expect-error run protected method
				expect(provider._reconnect).not.toHaveBeenCalled();
			});

			it('still settles the matching request after a malformed entry in the same event', async () => {
				const provider = new TestProvider(socketPath, socketOption, { autoReconnect: false });
				provider.on('error', () => undefined);
				provider.setStatus('connected');
				const payload = {
					jsonrpc: '2.0',
					id: 7,
					method: 'qrl_blockNumber',
					params: [],
				} as Web3APIPayload<QRLExecutionAPI, 'qrl_blockNumber'>;
				const response = { jsonrpc: '2.0', id: 7, result: '0x1' };

				const request = provider.request(payload);
				// eslint-disable-next-line no-null/no-null
				provider.message([null, response]);

				await expect(request).resolves.toEqual(response);
			});

			it('accepts 0 as a request id', () => {
				const provider = new TestProvider(socketPath, socketOption, { autoReconnect: false });
				provider.setStatus('connected');
				const payload = {
					jsonrpc: '2.0',
					id: 0,
					method: 'qrl_blockNumber',
					params: [],
				} as Web3APIPayload<QRLExecutionAPI, 'qrl_blockNumber'>;

				expect(() => {
					void provider.request(payload);
				}).not.toThrow();
				expect(provider.sentPayloads).toEqual([payload]);
			});
		});

		describe('testing connect() method', () => {
			it('should call method reconnect in case of error at _openSocketConnection', async () => {
				const provider = new TestProvider(socketPath, socketOption);
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_openSocketConnection').mockImplementation(() => {
					throw new Error();
				});
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_reconnect').mockReturnValue('');
				// @ts-expect-error run protected method
				provider.isReconnecting = true;
				provider.connect();

				await sleep(100);

				// @ts-expect-error run protected method
				expect(provider._reconnect).toHaveBeenCalled();
			});
			it('should call method reconnect in case of error at _addSocketListeners', async () => {
				const provider = new TestProvider(socketPath, socketOption);
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_addSocketListeners').mockImplementation(() => {
					throw new Error();
				});
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_reconnect').mockReturnValue('');
				// @ts-expect-error run protected method
				provider.isReconnecting = true;
				provider.connect();

				await sleep(100);

				// @ts-expect-error run protected method
				expect(provider._reconnect).toHaveBeenCalled();
			});
			it('should throw "Error while connecting..." in case of error inside `connect()`', () => {
				const dummyError = new Error('error');
				const provider = new TestProvider(socketPath, socketOption);
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_addSocketListeners').mockImplementation(() => {
					throw dummyError;
				});
				expect(() => provider.connect()).toThrow(
					`Error while connecting to ${socketPath}. Reason: ${dummyError.message}`,
				);
			});
			it('should throw "Client URL ... is invalid" in case of error with no message inside `connect()`', () => {
				const provider = new TestProvider(socketPath, socketOption);
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_addSocketListeners').mockImplementation(() => {
					throw new Error();
				});
				expect(() => provider.connect()).toThrow(`Client URL "${socketPath}" is invalid.`);
			});
		});

		describe('testing supportsSubscriptions() function', () => {
			it('should returns false when calling `supportsSubscriptions()`', () => {
				const provider = new TestProvider(socketPath, socketOption);
				expect(provider.supportsSubscriptions()).toBe(true);
			});
		});

		describe('testing on() method', () => {
			it('should internally call `_eventEmitter.on`', () => {
				const provider = new TestProvider(socketPath, socketOption);

				// @ts-expect-error run protected method
				const funcBSpy = jest.spyOn(provider._eventEmitter, 'on').mockReturnValue();
				const event = 'message';
				const func = () => {
					// ...
				};
				provider.on(event, func);
				expect(funcBSpy).toHaveBeenCalledWith(event, func);
			});
		});

		describe('testing once() method', () => {
			it('should internally call `_eventEmitter.once`', () => {
				const provider = new TestProvider(socketPath, socketOption);

				// @ts-expect-error run protected method
				const funcBSpy = jest.spyOn(provider._eventEmitter, 'once').mockReturnValue();
				const event = 'message';
				const func = () => {
					// ...
				};
				provider.once(event, func);
				expect(funcBSpy).toHaveBeenCalledWith(event, func);
			});
		});

		describe('testing removeListener() method', () => {
			it('should internally call `_eventEmitter.removeListener`', () => {
				const provider = new TestProvider(socketPath, socketOption);

				const funcBSpy = jest
					// @ts-expect-error run protected method
					.spyOn(provider._eventEmitter, 'removeListener')
					.mockReturnValue(new EventEmitter());
				const event = 'message';
				const func = () => {
					// ...
				};
				provider.removeListener(event, func);
				expect(funcBSpy).toHaveBeenCalledWith(event, func);
			});
		});

		describe('testing disconnect() method', () => {
			it('should internally call `super._onDisconnect` and change the connectionStatus to `disconnected`', () => {
				const provider = new TestProvider(socketPath, socketOption);

				const funcBSpy = jest
					// spy on provider.super._onDisconnect
					.spyOn(
						Object.getPrototypeOf(
							Object.getPrototypeOf(Object.getPrototypeOf(provider)),
						),
						'_onDisconnect',
					)
					.mockReturnValue(new EventEmitter());
				const code = 0;
				const data = '0x0';
				provider.disconnect(code, data);
				// @ts-expect-error run protected method
				expect(provider._connectionStatus).toBe('disconnected');
				expect(funcBSpy).toHaveBeenCalledWith(code, data);
			});
		});

		describe('testing reset() method', () => {
			it('should set `_reconnectAttempts` to 0', () => {
				const provider = new TestProvider(socketPath, socketOption);
				provider.reset();
				// @ts-expect-error run protected method
				expect(provider._reconnectAttempts).toBe(0);
			});
		});

		describe('testing request() method', () => {
			it('should throw if the _socketConnection is null', async () => {
				const provider = new TestProvider(socketPath, socketOption);
				const payload = { method: 'some_rpc_method' };
				// @ts-expect-error run protected method
				provider._socketConnection = undefined;
				await expect(provider.request(payload)).rejects.toThrow('Connection is undefined');
			});
			it('should throw if the payload id was not provided', async () => {
				const provider = new TestProvider(socketPath, socketOption);
				const payload = { method: 'some_rpc_method' };
				await expect(provider.request(payload)).rejects.toThrow('Request Id not defined');
			});
			it('should throw if the payload id was provided twice', async () => {
				const provider = new TestProvider(socketPath, socketOption);
				const payload = { id: 1, method: 'some_rpc_method' };
				provider.setStatus('connected');
				const reqPromise = provider.request(payload);
				expect(reqPromise).toBeInstanceOf(Promise);
				await expect(provider.request(payload)).rejects.toThrow(
					'Request already sent with following id: 1',
				);
			});

			it('should call `connect` when the status is `disconnected`', () => {
				const provider = new TestProvider(socketPath, socketOption);
				const payload = { id: 1, method: 'some_rpc_method' };
				provider.setStatus('disconnected');
				jest.spyOn(provider, 'connect').mockReturnValue();
				// @ts-expect-error run protected method
				jest.spyOn(provider, '_sendToSocket').mockReturnValue();
				provider
					.request(payload)
					.then(() => {
						// the status of the provider is manipulate manually to be disconnected,
						// 	for that, this request promise will never resolve
					})
					.catch(() => {
						// nothing
					});
				expect(provider.connect).toHaveBeenCalled();
			});
			it('should add request to the `_pendingRequestsQueue` when the status is `connecting`', () => {
				const provider = new TestProvider(socketPath, socketOption);
				const payload = { id: 1, method: 'some_rpc_method' };
				provider.setStatus('connecting');
				const reqPromise = provider.request(payload);
				expect(reqPromise).toBeInstanceOf(Promise);
				// @ts-expect-error run protected method
				expect(provider._pendingRequestsQueue.get(payload.id).payload).toBe(payload);
			});

			it('should add request to the `_sentRequestsQueue` when the status is `connected`', () => {
				const provider = new TestProvider(socketPath, socketOption);
				const payload = { id: 1, method: 'some_rpc_method' };
				provider.setStatus('connected');
				const reqPromise = provider.request(payload);
				expect(reqPromise).toBeInstanceOf(Promise);
				// @ts-expect-error run protected method
				expect(provider._sentRequestsQueue.get(payload.id).payload).toBe(payload);
			});
		});

		describe('testing _clearQueues() method', () => {
			it('should clear queues when called', () => {
				const provider = new TestProvider(socketPath, socketOption);
				const payload1 = { id: 1, method: 'some_rpc_method' };
				provider.setStatus('connecting');
				const req1 = provider.request(payload1);
				// when the queues will be cleared the promise will reject
				req1.catch(() => {
					// nothing
				});
				// @ts-expect-error run protected method
				expect(provider._pendingRequestsQueue.size).toBe(1);

				const payload2 = { id: 2, method: 'some_rpc_method' };
				provider.setStatus('connected');
				const req2 = provider.request(payload2);
				// when the queues will be cleared the promise will reject
				req2.catch(() => {
					// nothing
				});

				// @ts-expect-error run protected method
				expect(provider._sentRequestsQueue.size).toBe(1);

				provider.on('error', () => {
					// nothing
				});
				// @ts-expect-error run protected method
				provider._clearQueues();
				// @ts-expect-error run protected method
				expect(provider._pendingRequestsQueue.size).toBe(0);
				// @ts-expect-error run protected method
				expect(provider._sentRequestsQueue.size).toBe(0);
			});
		});
	});

	// C25: socket queues must have a deadline and a size cap, and every terminal path must
	// leave no stale map entry, timer or abort listener behind.
	describe('request deadlines and queue bounds', () => {
		const REQUEST_TIMEOUT = 120_000;
		const CONNECTION_TIMEOUT = 30_000;

		let eip1193OnConnect: jest.SpyInstance;

		const makeProvider = (options?: SocketProviderOptions) =>
			new TestProvider(socketPath, socketOption, { autoReconnect: false }, options);

		/** Constructs a provider and drives it through a successful handshake. */
		const makeConnectedProvider = (options?: SocketProviderOptions) => {
			const provider = makeProvider(options);
			provider.simulateOpen();
			return provider;
		};

		/** The cleanup invariant: nothing outstanding, nothing armed. */
		const expectNoResidue = (provider: TestProvider) => {
			expect(provider.getDiagnostics().inFlight).toBe(0);
			// @ts-expect-error read protected member
			expect(provider._pendingRequestsQueue.size).toBe(0);
			// @ts-expect-error read protected member
			expect(provider._sentRequestsQueue.size).toBe(0);
			expect(jest.getTimerCount()).toBe(0);
		};

		beforeEach(() => {
			jest.useFakeTimers();
			// `SocketProvider._onConnect` calls up into `Eip1193Provider._onConnect`, which
			// fires its own qrl_chainId / qrl_accounts requests. Stub it out so the queue
			// under test only ever holds what a test put there.
			eip1193OnConnect = jest
				.spyOn(Object.getPrototypeOf(SocketProvider.prototype), '_onConnect')
				.mockReturnValue(undefined);
		});

		afterEach(() => {
			eip1193OnConnect.mockRestore();
			jest.clearAllTimers();
			jest.useRealTimers();
		});

		it('rejects with RequestTimeoutError when a connected peer never replies', async () => {
			const provider = makeConnectedProvider();
			// The handshake completed, so its connection deadline is disarmed.
			expect(jest.getTimerCount()).toBe(0);

			const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });
			const assertion = expect(promise).rejects.toThrow(RequestTimeoutError);

			// The silent peer: connected, payload written, no response ever.
			expect(provider.sentPayloads).toHaveLength(1);
			expect(provider.getDiagnostics().inFlight).toBe(1);
			expect(jest.getTimerCount()).toBe(1);

			jest.advanceTimersByTime(REQUEST_TIMEOUT);
			await assertion;

			expectNoResidue(provider);
		});

		it('names the method and the duration in the timeout error', async () => {
			const provider = makeConnectedProvider();
			const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });
			const assertion = expect(promise).rejects.toMatchObject({
				duration: REQUEST_TIMEOUT,
				method: 'qrl_blockNumber',
			});

			jest.advanceTimersByTime(REQUEST_TIMEOUT);
			await assertion;
		});

		it('honours a per-request requestTimeout override', async () => {
			const provider = makeConnectedProvider();
			const promise = provider.request(
				{ id: 1, method: 'qrl_blockNumber' },
				{ requestTimeout: 5_000 },
			);
			const assertion = expect(promise).rejects.toThrow(RequestTimeoutError);

			jest.advanceTimersByTime(5_000);
			await assertion;
			expectNoResidue(provider);
		});

		it('rejects a requestTimeout of Infinity rather than allowing an unbounded request', async () => {
			const provider = makeConnectedProvider();
			await expect(
				provider.request({ id: 1, method: 'qrl_blockNumber' }, { requestTimeout: Infinity }),
			).rejects.toThrow(ProviderError);

			expectNoResidue(provider);
		});

		it('ignores a late response that arrives after the deadline, without double-settling', async () => {
			const provider = makeConnectedProvider();
			const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });
			const assertion = expect(promise).rejects.toThrow(RequestTimeoutError);

			jest.advanceTimersByTime(REQUEST_TIMEOUT);
			await assertion;
			expectNoResidue(provider);

			const onMessage = jest.fn();
			provider.on('message', onMessage);

			// The peer finally answers. The id is gone from the queue, so there is nothing
			// to settle a second time and nothing to emit.
			expect(() =>
				provider.message([{ jsonrpc: '2.0', id: 1, result: '0x1' }]),
			).not.toThrow();

			expect(onMessage).not.toHaveBeenCalled();
			// The rejection above stands: still a RequestTimeoutError, not a resolution.
			await expect(promise).rejects.toThrow(RequestTimeoutError);
			expectNoResidue(provider);
		});

		it('resolves and cleans up on a successful response', async () => {
			const provider = makeConnectedProvider();
			const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });

			provider.message([{ jsonrpc: '2.0', id: 1, result: '0x1' }]);

			await expect(promise).resolves.toMatchObject({ id: 1, result: '0x1' });
			expectNoResidue(provider);
		});

		it('settles a JSON-RPC error response and cleans up', async () => {
			const provider = makeConnectedProvider();
			const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });

			provider.message([
				{ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } },
			]);

			await expect(promise).resolves.toMatchObject({ id: 1 });
			expectNoResidue(provider);
		});

		it('rejects rather than strands the caller when an id-matching response is malformed', async () => {
			const provider = makeConnectedProvider();
			const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });

			// Matching id, but neither a result nor an error.
			provider.message([{ jsonrpc: '2.0', id: 1 }]);

			await expect(promise).rejects.toThrow(ResponseError);
			expectNoResidue(provider);
		});

		describe('in-flight cap', () => {
			it('rejects beyond maxInFlightRequests with the retryable typed error', async () => {
				const provider = makeConnectedProvider({ maxInFlightRequests: 2 });

				const first = provider.request({ id: 1, method: 'qrl_blockNumber' });
				const second = provider.request({ id: 2, method: 'qrl_blockNumber' });
				first.catch(() => undefined);
				second.catch(() => undefined);

				const overflow = provider.request({ id: 3, method: 'qrl_blockNumber' });
				await expect(overflow).rejects.toThrow(RequestQueueFullError);
				await expect(overflow).rejects.toMatchObject({
					retryable: true,
					maxInFlightRequests: 2,
				});

				// Rejected immediately: no hidden backpressure queue absorbed it.
				expect(provider.getDiagnostics().inFlight).toBe(2);
				// @ts-expect-error read protected member
				expect(provider._pendingRequestsQueue.has(3)).toBe(false);
				// @ts-expect-error read protected member
				expect(provider._sentRequestsQueue.has(3)).toBe(false);
				expect(provider.sentPayloads).toHaveLength(2);
				// The overflow rejection armed no timer of its own.
				expect(jest.getTimerCount()).toBe(2);
			});

			it('frees a slot once a request settles', async () => {
				const provider = makeConnectedProvider({ maxInFlightRequests: 1 });

				const first = provider.request({ id: 1, method: 'qrl_blockNumber' });
				await expect(
					provider.request({ id: 2, method: 'qrl_blockNumber' }),
				).rejects.toThrow(RequestQueueFullError);

				provider.message([{ jsonrpc: '2.0', id: 1, result: '0x1' }]);
				await expect(first).resolves.toMatchObject({ id: 1 });

				const third = provider.request({ id: 3, method: 'qrl_blockNumber' });
				third.catch(() => undefined);
				expect(provider.getDiagnostics().inFlight).toBe(1);
			});

			it('counts a batch as N slots and rejects it atomically', async () => {
				const provider = makeConnectedProvider({ maxInFlightRequests: 4 });

				const batch = provider.request([
					{ jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber' },
					{ jsonrpc: '2.0', id: 2, method: 'qrl_blockNumber' },
					{ jsonrpc: '2.0', id: 3, method: 'qrl_blockNumber' },
				] as any);
				batch.catch(() => undefined);

				// Three ids, three slots.
				expect(provider.getDiagnostics().inFlight).toBe(3);
				// ...but one payload and one deadline.
				expect(provider.sentPayloads).toHaveLength(1);
				expect(jest.getTimerCount()).toBe(1);

				// 3 + 3 > 4, so the whole batch is refused; none of its ids are registered.
				const overflow = provider.request([
					{ jsonrpc: '2.0', id: 4, method: 'qrl_blockNumber' },
					{ jsonrpc: '2.0', id: 5, method: 'qrl_blockNumber' },
					{ jsonrpc: '2.0', id: 6, method: 'qrl_blockNumber' },
				] as any);
				await expect(overflow).rejects.toThrow(RequestQueueFullError);

				expect(provider.getDiagnostics().inFlight).toBe(3);
				for (const id of [4, 5, 6]) {
					// @ts-expect-error read protected member
					expect(provider._sentRequestsQueue.has(id)).toBe(false);
					// @ts-expect-error read protected member
					expect(provider._pendingRequestsQueue.has(id)).toBe(false);
				}
				expect(provider.sentPayloads).toHaveLength(1);
				expect(jest.getTimerCount()).toBe(1);
			});

			it('defaults the cap to 256', () => {
				const provider = makeConnectedProvider();
				expect(provider.getDiagnostics().maxInFlightRequests).toBe(256);
			});

			it('rejects an invalid maxInFlightRequests at construction', () => {
				expect(() => makeProvider({ maxInFlightRequests: 0 })).toThrow(ProviderError);
				expect(() => makeProvider({ maxInFlightRequests: 1.5 })).toThrow(ProviderError);
			});
		});

		describe('batch responses', () => {
			it('releases every slot of a batch on a partial response', async () => {
				const provider = makeConnectedProvider();
				const batch = provider.request([
					{ jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber' },
					{ jsonrpc: '2.0', id: 2, method: 'qrl_blockNumber' },
					{ jsonrpc: '2.0', id: 3, method: 'qrl_blockNumber' },
				] as any);

				expect(provider.getDiagnostics().inFlight).toBe(3);

				// The node answers for 1 and 2 and silently drops 3.
				provider.message([
					[
						{ jsonrpc: '2.0', id: 1, result: '0x1' },
						{ jsonrpc: '2.0', id: 2, result: '0x2' },
					],
				]);

				await expect(batch).resolves.toHaveLength(2);
				// Id 3 must not be left holding a slot forever.
				expectNoResidue(provider);
			});

			it('times the whole batch out once when no response arrives', async () => {
				const provider = makeConnectedProvider();
				const batch = provider.request([
					{ jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber' },
					{ jsonrpc: '2.0', id: 2, method: 'qrl_blockNumber' },
				] as any);
				const assertion = expect(batch).rejects.toThrow(RequestTimeoutError);

				jest.advanceTimersByTime(REQUEST_TIMEOUT);
				await assertion;
				expectNoResidue(provider);
			});

			it('rejects a batch whose entries are missing ids', async () => {
				const provider = makeConnectedProvider();
				await expect(
					provider.request([
						{ jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber' },
						{ jsonrpc: '2.0', method: 'qrl_blockNumber' },
					] as any),
				).rejects.toThrow('Request Id not defined');
				expectNoResidue(provider);
			});

			it('rejects a batch that repeats an id', async () => {
				const provider = makeConnectedProvider();
				await expect(
					provider.request([
						{ jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber' },
						{ jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber' },
					] as any),
				).rejects.toThrow('Batch request contains duplicate ids');
				expectNoResidue(provider);
			});
		});

		describe('response id matching', () => {
			it('ignores a duplicate response id and settles only once', async () => {
				const provider = makeConnectedProvider();
				const onMessage = jest.fn();
				provider.on('message', onMessage);

				const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });

				provider.message([{ jsonrpc: '2.0', id: 1, result: '0x1' }]);
				provider.message([{ jsonrpc: '2.0', id: 1, result: '0xdeadbeef' }]);

				// The first response wins; the duplicate is not even emitted.
				await expect(promise).resolves.toMatchObject({ result: '0x1' });
				expect(onMessage).toHaveBeenCalledTimes(1);
				expectNoResidue(provider);
			});

			it('ignores an unknown response id and leaves the real request in flight', async () => {
				const provider = makeConnectedProvider();
				const onMessage = jest.fn();
				provider.on('message', onMessage);

				const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });

				provider.message([{ jsonrpc: '2.0', id: 99, result: '0xbad' }]);

				expect(onMessage).not.toHaveBeenCalled();
				expect(provider.getDiagnostics().inFlight).toBe(1);

				provider.message([{ jsonrpc: '2.0', id: 1, result: '0x1' }]);
				await expect(promise).resolves.toMatchObject({ result: '0x1' });
				expectNoResidue(provider);
			});

			it('exempts an established subscription stream from the request deadline', async () => {
				const provider = makeConnectedProvider();
				const onMessage = jest.fn();
				provider.on('message', onMessage);

				// The establishment RPC is bounded like any other request...
				const subscribe = provider.request({ id: 1, method: 'qrl_subscribe' });
				expect(jest.getTimerCount()).toBe(1);
				provider.message([{ jsonrpc: '2.0', id: 1, result: '0xsubid' }]);
				await expect(subscribe).resolves.toMatchObject({ result: '0xsubid' });

				// ...and once established, nothing is armed or queued for the stream itself.
				expectNoResidue(provider);

				provider.message([
					{
						jsonrpc: '2.0',
						method: 'qrl_subscription',
						params: { subscription: '0xsubid', result: { number: '0x1' } },
					},
				]);
				provider.message([
					{
						jsonrpc: '2.0',
						method: 'qrl_subscription',
						params: { subscription: '0xsubid', result: { number: '0x2' } },
					},
				]);

				// Two notifications delivered, plus the subscribe response.
				expect(onMessage).toHaveBeenCalledTimes(3);
				// Notifications hold no slot and arm no timer, however long the stream runs.
				expectNoResidue(provider);
			});
		});

		describe('connection deadline', () => {
			it('counts connection wait toward the request deadline', async () => {
				const provider = makeProvider();
				// Still connecting: the request parks in `_pendingRequestsQueue`.
				const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });
				const assertion = expect(promise).rejects.toThrow(RequestTimeoutError);

				// @ts-expect-error read protected member
				expect(provider._pendingRequestsQueue.size).toBe(1);
				expect(provider.sentPayloads).toHaveLength(0);

				// Burn 20s of the request's budget waiting for the handshake, then connect.
				jest.advanceTimersByTime(20_000);
				provider.simulateOpen();
				expect(provider.sentPayloads).toHaveLength(1);
				expect(provider.getDiagnostics().sentRequests).toBe(1);

				// Still alive 1ms short of the 120s *total*...
				jest.advanceTimersByTime(REQUEST_TIMEOUT - 20_000 - 1);
				await Promise.resolve();
				expect(provider.getDiagnostics().inFlight).toBe(1);

				// ...and dead on it. Had the deadline restarted when the payload was finally
				// written, it would still have 20s to run here.
				jest.advanceTimersByTime(1);
				await assertion;

				expectNoResidue(provider);
			});

			it('rejects pending requests with ConnectionTimeoutError when the handshake stalls', async () => {
				const provider = makeProvider();
				const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });
				const assertion = expect(promise).rejects.toThrow(ConnectionTimeoutError);

				// The 30s connection deadline is shorter than the 120s request deadline, so
				// a peer that accepts a socket but never handshakes fails fast.
				jest.advanceTimersByTime(CONNECTION_TIMEOUT);
				await assertion;

				expect(provider.getStatus()).toBe('disconnected');
				expectNoResidue(provider);
			});

			it('honours a custom connectionTimeout and disarms it on connect', () => {
				const provider = makeProvider({ connectionTimeout: 1_000 });
				// The constructor connects eagerly, which arms the connection deadline.
				expect(jest.getTimerCount()).toBe(1);

				provider.simulateOpen();
				expect(jest.getTimerCount()).toBe(0);
			});

			it('rejects an invalid connectionTimeout at construction', () => {
				expect(() => makeProvider({ connectionTimeout: 0 })).toThrow(ProviderError);
				expect(() => makeProvider({ requestTimeout: NaN })).toThrow(ProviderError);
			});
		});

		describe('teardown paths', () => {
			it('rejects outstanding promises on disconnect', async () => {
				const provider = makeConnectedProvider();
				const sentRequest = provider.request({ id: 1, method: 'qrl_blockNumber' });
				const assertion = expect(sentRequest).rejects.toThrow(ConnectionNotOpenError);

				provider.disconnect(1000, 'bye');

				await assertion;
				expectNoResidue(provider);
			});

			it('rejects both queues on disconnect, including requests still waiting to connect', async () => {
				const provider = makeProvider();
				const pending = provider.request({ id: 1, method: 'qrl_blockNumber' });
				const assertion = expect(pending).rejects.toThrow(ConnectionNotOpenError);

				// @ts-expect-error read protected member
				expect(provider._pendingRequestsQueue.size).toBe(1);
				provider.disconnect();

				await assertion;
				expectNoResidue(provider);
			});

			it('rejects outstanding promises on reset rather than dropping their bookkeeping', async () => {
				const provider = makeConnectedProvider();
				const first = provider.request({ id: 1, method: 'qrl_blockNumber' });
				const second = provider.request({ id: 2, method: 'qrl_blockNumber' });

				const assertions = Promise.all([
					expect(first).rejects.toThrow(ProviderError),
					expect(second).rejects.toThrow('the provider was reset'),
				]);

				provider.reset();

				await assertions;
				expectNoResidue(provider);
			});

			it('rejects outstanding promises on _clearQueues', async () => {
				const provider = makeConnectedProvider();
				const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });
				const assertion = expect(promise).rejects.toThrow(ConnectionNotOpenError);

				// @ts-expect-error run protected method
				provider._clearQueues();

				await assertion;
				expectNoResidue(provider);
			});

			it('cleans up when the socket write fails', async () => {
				const provider = makeConnectedProvider();
				provider.sendError = new Error('socket is gone');

				await expect(provider.request({ id: 1, method: 'qrl_blockNumber' })).rejects.toThrow(
					'socket is gone',
				);

				// The failed send must not leave its id, its deadline, or its listener behind.
				expectNoResidue(provider);
			});

			it('cleans up a batch when the deferred write on connect fails', async () => {
				const provider = makeProvider();
				const promise = provider.request([
					{ jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber' },
					{ jsonrpc: '2.0', id: 2, method: 'qrl_blockNumber' },
				] as any);
				const assertion = expect(promise).rejects.toThrow('socket is gone');

				provider.sendError = new Error('socket is gone');
				provider.simulateOpen();

				await assertion;
				expectNoResidue(provider);
			});
		});

		describe('caller cancellation', () => {
			it('rejects with the caller reason and detaches its listener', async () => {
				const provider = makeConnectedProvider();
				const controller = new AbortController();
				const removeListener = jest.spyOn(controller.signal, 'removeEventListener');

				const reason = new Error('caller changed their mind');
				const promise = provider.request(
					{ id: 1, method: 'qrl_blockNumber' },
					{ signal: controller.signal },
				);
				const assertion = expect(promise).rejects.toThrow(reason);

				controller.abort(reason);
				await assertion;

				// Not a RequestTimeoutError: `timedOut` separates our deadline from this.
				await expect(promise).rejects.not.toBeInstanceOf(RequestTimeoutError);
				expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
				expectNoResidue(provider);
			});

			it('rejects immediately when handed an already-aborted signal', async () => {
				const provider = makeConnectedProvider();
				const controller = new AbortController();
				controller.abort(new Error('already gone'));

				await expect(
					provider.request(
						{ id: 1, method: 'qrl_blockNumber' },
						{ signal: controller.signal },
					),
				).rejects.toThrow('already gone');

				// Nothing was written and nothing was registered.
				expect(provider.sentPayloads).toHaveLength(0);
				expectNoResidue(provider);
			});

			it('detaches the caller listener when the request succeeds normally', async () => {
				const provider = makeConnectedProvider();
				const controller = new AbortController();
				const removeListener = jest.spyOn(controller.signal, 'removeEventListener');

				const promise = provider.request(
					{ id: 1, method: 'qrl_blockNumber' },
					{ signal: controller.signal },
				);
				provider.message([{ jsonrpc: '2.0', id: 1, result: '0x1' }]);
				await expect(promise).resolves.toMatchObject({ result: '0x1' });

				expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
				expectNoResidue(provider);

				// A later abort finds nothing to settle.
				expect(() => controller.abort(new Error('too late'))).not.toThrow();
				expectNoResidue(provider);
			});
		});

		describe('diagnostics', () => {
			it('reports current and peak in-flight counts', async () => {
				const provider = makeConnectedProvider({ maxInFlightRequests: 8 });

				expect(provider.getDiagnostics()).toEqual({
					inFlight: 0,
					pendingRequests: 0,
					sentRequests: 0,
					peakInFlight: 0,
					maxInFlightRequests: 8,
				});

				const first = provider.request({ id: 1, method: 'qrl_blockNumber' });
				const second = provider.request({ id: 2, method: 'qrl_blockNumber' });

				expect(provider.getDiagnostics()).toMatchObject({
					inFlight: 2,
					sentRequests: 2,
					peakInFlight: 2,
				});

				provider.message([{ jsonrpc: '2.0', id: 1, result: '0x1' }]);
				provider.message([{ jsonrpc: '2.0', id: 2, result: '0x2' }]);
				await Promise.all([first, second]);

				// Peak is a high-water mark: it survives the requests settling, which is the
				// point of exposing it for calibration.
				expect(provider.getDiagnostics()).toMatchObject({
					inFlight: 0,
					peakInFlight: 2,
				});
			});

			it('is opt-in: the hook only fires when supplied', async () => {
				const onDiagnostics = jest.fn();
				const provider = makeConnectedProvider({ onDiagnostics });

				const promise = provider.request({ id: 1, method: 'qrl_blockNumber' });
				expect(onDiagnostics).toHaveBeenLastCalledWith(
					expect.objectContaining({ inFlight: 1, peakInFlight: 1 }),
				);

				provider.message([{ jsonrpc: '2.0', id: 1, result: '0x1' }]);
				await promise;

				expect(onDiagnostics).toHaveBeenLastCalledWith(
					expect.objectContaining({ inFlight: 0, peakInFlight: 1 }),
				);

				// A provider constructed without the hook computes and reports nothing.
				const quiet = makeConnectedProvider();
				const quietPromise = quiet.request({ id: 1, method: 'qrl_blockNumber' });
				quiet.message([{ jsonrpc: '2.0', id: 1, result: '0x1' }]);
				await quietPromise;
				expect(onDiagnostics).toHaveBeenCalledTimes(2);
			});
		});
	});
});
