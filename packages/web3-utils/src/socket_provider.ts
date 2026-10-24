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
import {
	ConnectionEvent,
	Eip1193EventName,
	QRLExecutionAPI,
	JsonRpcBatchRequest,
	JsonRpcBatchResponse,
	JsonRpcId,
	JsonRpcNotification,
	JsonRpcRequest,
	JsonRpcResponse,
	JsonRpcResponseWithResult,
	JsonRpcResult,
	ProviderConnectInfo,
	ProviderMessage,
	ProviderRpcError,
	SocketRequestItem,
	Web3APIMethod,
	Web3APIPayload,
	Web3APIReturnType,
	Web3APISpec,
	Web3Eip1193ProviderEventCallback,
	Web3ProviderEventCallback,
	Web3ProviderMessageEventCallback,
	Web3ProviderStatus,
} from '@theqrl/web3-types';
import {
	BaseWeb3Error,
	ConnectionError,
	ConnectionNotOpenError,
	ConnectionTimeoutError,
	InvalidClientError,
	MaxAttemptsReachedOnReconnectingError,
	PendingRequestsOnReconnectingError,
	ProviderError,
	RequestAlreadySentError,
	RequestQueueFullError,
	RequestTimeoutError,
	ResponseError,
	Web3WSProviderError,
	redactClientUrl,
} from '@theqrl/web3-errors';
import { Eip1193Provider } from './web3_eip1193_provider.js';
import { ChunkResponseParser } from './chunk_response_parser.js';
import { isNullish } from './validation.js';
import { Web3DeferredPromise } from './web3_deferred_promise.js';
import * as jsonRpc from './json_rpc.js';
import {
	resolveProviderBounds,
	validateTimeout,
	type ProviderBoundsOptions,
	type RequestBoundsOptions,
	type ResolvedProviderBounds,
} from './provider_bounds.js';
import { composeAbortSignal, type AbortComposition } from './abort_helpers.js';

export type ReconnectOptions = {
	autoReconnect: boolean;
	delay: number;
	maxAttempts: number;
};

/**
 * A point-in-time view of a socket provider's request bookkeeping.
 *
 * `maxInFlightRequests` defaults to a deliberately conservative 256; these counters exist
 * so the value can be calibrated against a real workload instead of guessed.
 */
export interface SocketProviderDiagnostics {
	/** Currently outstanding request ids: `pendingRequests + sentRequests`. */
	inFlight: number;
	/** Request ids accepted but not yet written to the socket (waiting for a connection). */
	pendingRequests: number;
	/** Request ids written to the socket and awaiting a response. */
	sentRequests: number;
	/** The highest `inFlight` observed over the lifetime of this provider. */
	peakInFlight: number;
	/** The configured cap that `inFlight` is checked against. */
	maxInFlightRequests: number;
}

/**
 * Constructor options shared by the socket (WebSocket / IPC) providers.
 *
 * The bound names (`connectionTimeout`, `requestTimeout`, `maxResponseBytes`,
 * `maxInFlightRequests`) are the same ones the HTTP provider accepts, so every transport
 * presents one surface. `maxResponseBytes` bounds every message the peer sends: a larger one
 * is dropped unparsed and identified requests fail with a `ResponseTooLargeError`.
 * Oversized notifications are dropped without failing unrelated requests. WebSocket also
 * has a separate wire limit (twice this bound, capped at 536,870,888 bytes); exceeding it closes the
 * connection and fails all outstanding requests with `ResponseTooLargeError`.
 */
export interface SocketProviderOptions extends ProviderBoundsOptions {
	/**
	 * Opt-in diagnostic hook. When supplied it is invoked with a fresh
	 * {@link SocketProviderDiagnostics} every time a request is admitted or settled.
	 * Nothing is computed or reported unless this is provided; {@link
	 * SocketProvider.getDiagnostics} is always available for polling instead.
	 */
	onDiagnostics?: (diagnostics: SocketProviderDiagnostics) => void;
}

/**
 * Everything that must be torn down when a request reaches any terminal state.
 *
 * One record is shared by every id a request owns, so a batch of N ids has a single
 * deadline, a single abort listener and settles exactly once.
 */
/** A JSON-RPC id that has been checked to actually be present. */
type DefinedJsonRpcId = Exclude<JsonRpcId, undefined>;

interface RequestLifecycle {
	/** Every request id this entry occupies. A batch of N ids consumes N slots. */
	readonly ids: DefinedJsonRpcId[];
	/** The composed deadline + caller-cancellation signal. */
	readonly abort: AbortComposition;
	/** The listener attached to `abort.signal`, so it can be detached again. */
	onAbort?: () => void;
	/** Guards against a second settle (e.g. a late response racing the deadline). */
	settled: boolean;
}

const DEFAULT_RECONNECTION_OPTIONS = {
	autoReconnect: true,
	delay: 5000,
	maxAttempts: 5,
};

const NORMAL_CLOSE_CODE = 1000; // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close

/**
 * Names a transport error without echoing its message. `ws` formats the full URL, credentials
 * and path included, into `Invalid URL: <url>` (P4-L-15), so only the error's class name and,
 * when it carries one, its short `code` (`ERR_INVALID_URL`, `ECONNREFUSED`, ...) are kept.
 * This library's own errors are the exception: their messages are built here, with any URL
 * already redacted, and are kept whole.
 */
const describeTransportError = (error: unknown): string => {
	if (error instanceof BaseWeb3Error) return error.message;
	const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
	const safeName = typeof name === 'string' && name !== '' ? name : 'Error';
	return typeof code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(code)
		? `${safeName} (${code})`
		: safeName;
};

const unrefTimer = (timer: unknown): void => {
	// A pending provider timer must not, by itself, keep a Node process alive.
	if (typeof (timer as { unref?: () => void }).unref === 'function') {
		(timer as { unref: () => void }).unref();
	}
};

export abstract class SocketProvider<
	MessageEvent,
	CloseEvent,
	ErrorEvent,
	API extends Web3APISpec = QRLExecutionAPI,
> extends Eip1193Provider<API> {
	protected isReconnecting: boolean;
	protected readonly _socketPath: string;
	protected readonly chunkResponseParser: ChunkResponseParser;
	/* eslint-disable @typescript-eslint/no-explicit-any */
	protected readonly _pendingRequestsQueue: Map<JsonRpcId, SocketRequestItem<any, any, any>>;
	/* eslint-disable @typescript-eslint/no-explicit-any */
	protected readonly _sentRequestsQueue: Map<JsonRpcId, SocketRequestItem<any, any, any>>;
	protected _reconnectAttempts!: number;
	protected readonly _socketOptions?: unknown;
	protected readonly _reconnectOptions: ReconnectOptions;
	/** Validated `connectionTimeout` / `requestTimeout` / `maxResponseBytes` / `maxInFlightRequests`. */
	protected readonly _providerBounds: ResolvedProviderBounds;
	/**
	 * Teardown state for every in-flight request, reachable from either queue map via the
	 * request item. Keyed by the item rather than by id so that the N ids of a batch share
	 * exactly one record.
	 */
	/* eslint-disable @typescript-eslint/no-explicit-any */
	private readonly _requestLifecycles = new WeakMap<
		SocketRequestItem<any, any, any>,
		RequestLifecycle
	>();
	/** Bounds the connect / handshake phase. Separate from the per-request deadline. */
	private _connectionTimer?: ReturnType<typeof setTimeout>;
	/** The pending reconnect attempt armed by {@link _reconnect}, so it can be cancelled. */
	private _reconnectTimer?: ReturnType<typeof setTimeout>;
	private _peakInFlight = 0;
	private readonly _onDiagnostics?: (diagnostics: SocketProviderDiagnostics) => void;
	protected _socketConnection?: unknown;
	public get SocketConnection() {
		return this._socketConnection;
	}
	protected _connectionStatus: Web3ProviderStatus;
	protected readonly _onMessageHandler: (event: MessageEvent) => void;
	protected readonly _onOpenHandler: () => void;
	protected readonly _onCloseHandler: (event: CloseEvent) => void;
	protected readonly _onErrorHandler: (event: ErrorEvent) => void;

	/**
	 * This is an abstract class for implementing a socket provider (e.g. WebSocket, IPC). It extends the EIP-1193 provider {@link EIP1193Provider}.
	 * @param socketPath - The path to the socket (e.g. /ipc/path or ws://localhost:8546)
	 * @param socketOptions - The options for the socket connection. Its type is supposed to be specified in the inherited classes.
	 * @param reconnectOptions - The options for the socket reconnection {@link ReconnectOptions}
	 * @param providerOptions - Timeout and queue bounds {@link SocketProviderOptions}
	 */
	public constructor(
		socketPath: string,
		socketOptions?: unknown,
		reconnectOptions?: Partial<ReconnectOptions>,
		providerOptions?: SocketProviderOptions,
	) {
		super();
		this._connectionStatus = 'connecting';

		// Resolved before anything else: `connect()` below arms the connection deadline, and
		// invalid bounds must fail construction rather than surface at the first request.
		this._providerBounds = resolveProviderBounds(providerOptions);
		this._onDiagnostics = providerOptions?.onDiagnostics;

		// Message handlers. Due to bounding of `this` and removing the listeners we have to keep it's reference.
		this._onMessageHandler = this._onMessage.bind(this);
		this._onOpenHandler = this._onConnect.bind(this);
		this._onCloseHandler = this._onCloseEvent.bind(this);
		this._onErrorHandler = this._onError.bind(this);

		if (!this._validateProviderPath(socketPath)) throw new InvalidClientError(socketPath);

		this._socketPath = socketPath;
		this._socketOptions = socketOptions;

		this._reconnectOptions = {
			...DEFAULT_RECONNECTION_OPTIONS,
			...(reconnectOptions ?? {}),
		};

		this._pendingRequestsQueue = new Map<JsonRpcId, SocketRequestItem<any, any, any>>();
		this._sentRequestsQueue = new Map<JsonRpcId, SocketRequestItem<any, any, any>>();

		// Created before the first `connect()` so that every connection, including the first,
		// starts from an empty parser.
		this.chunkResponseParser = new ChunkResponseParser(
			this._eventEmitter,
			this._reconnectOptions.autoReconnect,
			{
				framed: this._isFramedTransport(),
				maxResponseBytes: this._providerBounds.maxResponseBytes,
			},
		);
		this.chunkResponseParser.onError((error, requestIds) => {
			// A protocol error can fail requests without closing the live transport.
			// Keep its listeners so replies received after the parser resets still work.
			if (requestIds !== undefined && requestIds.length > 0) {
				// An oversized reply names the requests it answers: only those fail, an
				// unrelated request in flight on the same connection is unaffected (P4-M-5).
				for (const id of requestIds) {
					this._settleRequest(id, { reject: error });
				}
				return;
			}
			this._rejectAllRequests(error);
		});
		this.isReconnecting = false;

		this._init();
		this.connect();
	}

	protected _init() {
		this._reconnectAttempts = 0;
	}

	/**
	 * Try to establish a connection to the socket.
	 *
	 * A request already written to the socket being replaced is failed with
	 * `PendingRequestsOnReconnectingError` right away: its reply could only have arrived on
	 * that socket, so waiting would only end at the request's deadline (P4-L-21). Requests still
	 * waiting for a connection stay queued and are written once the new socket opens.
	 */
	public connect(): void {
		if (this._reconnectTimer !== undefined) this._cancelReconnect();
		this._invalidateConnection();
		try {
			// Bytes left over from a previous connection must never prefix the first message of
			// this one.
			this.chunkResponseParser.reset();
			this._rejectSentRequests();
			this._openSocketConnection();
			this._connectionStatus = 'connecting';
			this._armConnectionTimer();
			this._addSocketListeners();
		} catch (e) {
			this._clearConnectionTimer();
			if (!this.isReconnecting) {
				this._connectionStatus = 'disconnected';
				if (e && (e as Error).message) {
					// The socket path may be a `ws://user:password@host/path` URL: credentials
					// and path never belong in an error message (L-48), and neither does the
					// transport's message, which may quote the URL in full (P4-L-15).
					throw new ConnectionError(
						`Error while connecting to ${redactClientUrl(
							this._socketPath,
						)}. Reason: ${describeTransportError(e)}`,
					);
				} else {
					throw new InvalidClientError(this._socketPath);
				}
			} else {
				setImmediate(() => {
					this._reconnect();
				});
			}
		}
	}

	/**
	 * Arms the connect / handshake deadline. Cleared by {@link _onConnect}, and by every
	 * path that abandons the connection attempt (disconnect, reset, queue teardown).
	 *
	 * This bound is *separate* from the per-request deadline but does not replace it: a
	 * request issued while connecting has already armed its own `requestTimeout`, so the
	 * connection wait is spent out of the request's total budget (see {@link request}).
	 *
	 * When the deadline fires the attempt is abandoned for good: the socket's listeners are
	 * detached and the socket is closed, so a late handshake cannot resurrect it and nothing is
	 * left half-open. With `autoReconnect` the regular reconnect cycle takes over; without it
	 * the provider is `disconnected` and the next {@link request} opens a fresh socket. A peer
	 * that accepts TCP but never completes the handshake used to wedge the provider for the
	 * lifetime of the process (M-8).
	 *
	 * The timer belongs to one attempt. {@link _reconnect} clears it when that attempt fails,
	 * and the callback stands down while a reconnect is pending: it used to survive a fast
	 * socket failure, fire during the back-off and reject the requests parked for the reconnect
	 * with a `ConnectionTimeoutError` (P4-L-16).
	 */
	private _armConnectionTimer(): void {
		this._clearConnectionTimer();

		const duration = this._providerBounds.connectionTimeout;

		this._connectionTimer = setTimeout(() => {
			this._connectionTimer = undefined;

			if (this.getStatus() === 'connected' || this.isReconnecting) return;

			const error = new ConnectionTimeoutError(duration);
			this._connectionStatus = 'disconnected';
			// Listeners go first: closing the stalled socket must not be reported as a lost
			// connection by the transport's close / error handlers.
			this._removeSocketListeners();
			// A handshake that never completes must not strand the requests queued behind
			// it, whether or not their own 120s deadline has elapsed.
			this._rejectAllRequests(error);
			this._emitError(error);
			if (this._reconnectOptions.autoReconnect) {
				this._reconnect();
			}
			this._closeSocketConnection(NORMAL_CLOSE_CODE, 'connection timeout');
		}, duration);

		unrefTimer(this._connectionTimer);
	}

	/**
	 * Drops a pending reconnect attempt. Called by every caller-initiated teardown: a provider
	 * that was disconnected or reset must not re-open a socket on its own a minute later (L-22).
	 */
	private _cancelReconnect(): void {
		if (this._reconnectTimer !== undefined) {
			clearTimeout(this._reconnectTimer);
			this._reconnectTimer = undefined;
		}
		this.isReconnecting = false;
	}

	private _clearConnectionTimer(): void {
		if (this._connectionTimer !== undefined) {
			clearTimeout(this._connectionTimer);
			this._connectionTimer = undefined;
		}
	}

	protected abstract _openSocketConnection(): void;
	protected abstract _addSocketListeners(): void;

	protected abstract _removeSocketListeners(): void;

	protected abstract _onCloseEvent(_event: unknown): void;

	protected abstract _sendToSocket(_payload: Web3APIPayload<API, any>): void;

	protected abstract _parseResponses(_event: MessageEvent): JsonRpcResponse[];

	protected abstract _closeSocketConnection(_code?: number, _data?: string): void;

	// eslint-disable-next-line class-methods-use-this
	protected _validateProviderPath(path: string): boolean {
		return !!path;
	}

	/**
	 * Whether the transport delivers whole messages (WebSocket frames) rather than a byte
	 * stream (IPC). A framed transport never keeps partial input between messages, so one
	 * malformed frame cannot corrupt the parsing of every frame that follows it.
	 */
	// eslint-disable-next-line class-methods-use-this
	protected _isFramedTransport(): boolean {
		return false;
	}

	/**
	 *
	 * @returns `true` if the socket supports subscriptions
	 */
	// eslint-disable-next-line class-methods-use-this
	public supportsSubscriptions(): boolean {
		return true;
	}

	/**
	 * Registers a listener for the specified event type.
	 * @param type - The event type to listen for
	 * @param listener - The callback to be invoked when the event is emitted
	 */
	public on(
		type: 'disconnect',
		listener: Web3Eip1193ProviderEventCallback<ProviderRpcError>,
	): void;
	public on(
		type: 'connect',
		listener: Web3Eip1193ProviderEventCallback<ProviderConnectInfo>,
	): void;
	public on(type: 'chainChanged', listener: Web3Eip1193ProviderEventCallback<string>): void;
	public on(type: 'accountsChanged', listener: Web3Eip1193ProviderEventCallback<string[]>): void;
	public on<T = JsonRpcResult>(
		type: 'message',
		listener:
			| Web3Eip1193ProviderEventCallback<ProviderMessage>
			| Web3ProviderMessageEventCallback<T>,
	): void;
	public on<T = JsonRpcResult>(
		type: string,
		listener: Web3Eip1193ProviderEventCallback<unknown> | Web3ProviderEventCallback<T>,
	): void;
	public on<T = JsonRpcResult, P = unknown>(
		type: string | Eip1193EventName,
		listener:
			| Web3Eip1193ProviderEventCallback<P>
			| Web3ProviderMessageEventCallback<T>
			| Web3ProviderEventCallback<T>,
	): void {
		this._eventEmitter.on(type, listener);
	}

	/**
	 * Registers a listener for the specified event type that will be invoked at most once.
	 * @param type  - The event type to listen for
	 * @param listener - The callback to be invoked when the event is emitted
	 */
	public once(
		type: 'disconnect',
		listener: Web3Eip1193ProviderEventCallback<ProviderRpcError>,
	): void;
	public once(
		type: 'connect',
		listener: Web3Eip1193ProviderEventCallback<ProviderConnectInfo>,
	): void;
	public once(type: 'chainChanged', listener: Web3Eip1193ProviderEventCallback<string>): void;
	public once(
		type: 'accountsChanged',
		listener: Web3Eip1193ProviderEventCallback<string[]>,
	): void;
	public once<T = JsonRpcResult>(
		type: 'message',
		listener:
			| Web3Eip1193ProviderEventCallback<ProviderMessage>
			| Web3ProviderMessageEventCallback<T>,
	): void;
	public once<T = JsonRpcResult>(
		type: string,
		listener: Web3Eip1193ProviderEventCallback<unknown> | Web3ProviderEventCallback<T>,
	): void;
	public once<T = JsonRpcResult, P = unknown>(
		type: string | Eip1193EventName,
		listener:
			| Web3Eip1193ProviderEventCallback<P>
			| Web3ProviderMessageEventCallback<T>
			| Web3ProviderEventCallback<T>,
	): void {
		this._eventEmitter.once(type, listener);
	}

	/**
	 *  Removes a listener for the specified event type.
	 * @param type - The event type to remove the listener for
	 * @param listener - The callback to be executed
	 */
	public removeListener(
		type: 'disconnect',
		listener: Web3Eip1193ProviderEventCallback<ProviderRpcError>,
	): void;
	public removeListener(
		type: 'connect',
		listener: Web3Eip1193ProviderEventCallback<ProviderConnectInfo>,
	): void;
	public removeListener(
		type: 'chainChanged',
		listener: Web3Eip1193ProviderEventCallback<string>,
	): void;
	public removeListener(
		type: 'accountsChanged',
		listener: Web3Eip1193ProviderEventCallback<string[]>,
	): void;
	public removeListener<T = JsonRpcResult>(
		type: 'message',
		listener:
			| Web3Eip1193ProviderEventCallback<ProviderMessage>
			| Web3ProviderMessageEventCallback<T>,
	): void;
	public removeListener<T = JsonRpcResult>(
		type: string,
		listener: Web3Eip1193ProviderEventCallback<unknown> | Web3ProviderEventCallback<T>,
	): void;
	public removeListener<T = JsonRpcResult, P = unknown>(
		type: string | Eip1193EventName,
		listener:
			| Web3Eip1193ProviderEventCallback<P>
			| Web3ProviderMessageEventCallback<T>
			| Web3ProviderEventCallback<T>,
	): void {
		this._eventEmitter.removeListener(type, listener);
	}

	protected _onDisconnect(code: number, data?: string) {
		this._connectionStatus = 'disconnected';
		super._onDisconnect(code, data);
	}

	/**
	 * Disconnects the socket
	 * @param code - The code to be sent to the server
	 * @param data - The data to be sent to the server
	 */
	public disconnect(code?: number, data?: string): void {
		const disconnectCode = code ?? NORMAL_CLOSE_CODE;
		this._cancelReconnect();
		this._clearConnectionTimer();
		this.chunkResponseParser.reset();
		this._removeSocketListeners();
		if (this.getStatus() !== 'disconnected') {
			this._closeSocketConnection(disconnectCode, data);
		}
		// Outstanding work is rejected, not silently dropped: a caller awaiting a request
		// on a provider that is going away must observe a failure, not hang forever.
		this._rejectAllRequests(new ConnectionNotOpenError());
		this._onDisconnect(disconnectCode, data);
	}

	/**
	 * Returns the current and peak in-flight request counts.
	 *
	 * Cheap and always available; supply `onDiagnostics` to the constructor instead if you
	 * want to be pushed a snapshot on every admission and settle.
	 */
	public getDiagnostics(): SocketProviderDiagnostics {
		return {
			inFlight: this._inFlightCount(),
			pendingRequests: this._pendingRequestsQueue.size,
			sentRequests: this._sentRequestsQueue.size,
			peakInFlight: this._peakInFlight,
			maxInFlightRequests: this._providerBounds.maxInFlightRequests,
		};
	}

	private _inFlightCount(): number {
		return this._pendingRequestsQueue.size + this._sentRequestsQueue.size;
	}

	private _notifyDiagnostics(): void {
		const inFlight = this._inFlightCount();
		if (inFlight > this._peakInFlight) {
			this._peakInFlight = inFlight;
		}
		if (this._onDiagnostics) {
			this._onDiagnostics(this.getDiagnostics());
		}
	}

	/**
	 * The single cleanup primitive: every terminal path for a request goes through here.
	 *
	 * Success, JSON-RPC error, deadline, caller abort, send failure, disconnect, reconnect
	 * teardown and reset all call this, so "no stale map entry, no stale timer, no stale
	 * abort listener" is enforced in exactly one place rather than at each call site.
	 *
	 * Idempotent, and safe against re-entry: the ids are removed before the promise is
	 * settled, so a nested call finds nothing and returns `false`.
	 *
	 * @param requestId - any id owned by the request; a batch settles via any of its ids
	 * @param outcome - resolve with a response, or reject with a reason
	 * @returns `true` if this call settled the request, `false` if there was nothing to do
	 */
	private _settleRequest(
		requestId: JsonRpcId,
		outcome: { resolve: JsonRpcResponse } | { reject: unknown },
	): boolean {
		const item =
			this._sentRequestsQueue.get(requestId) ?? this._pendingRequestsQueue.get(requestId);

		// Unknown id, duplicate response, or a sibling id of an already-settled batch.
		if (!item) return false;

		const lifecycle = this._requestLifecycles.get(item);

		// 1. Release every slot this request holds (N for a batch, 1 otherwise).
		for (const id of lifecycle?.ids ?? [requestId]) {
			this._pendingRequestsQueue.delete(id);
			this._sentRequestsQueue.delete(id);
		}

		// 2. Drop the deadline timer and detach the abort listener.
		if (lifecycle) {
			if (lifecycle.onAbort) {
				lifecycle.abort.signal.removeEventListener('abort', lifecycle.onAbort);
				lifecycle.onAbort = undefined;
			}
			lifecycle.abort.dispose();
			this._requestLifecycles.delete(item);

			if (lifecycle.settled) {
				this._notifyDiagnostics();
				return false;
			}
			lifecycle.settled = true;
		}

		// 3. Settle exactly once.
		if ('resolve' in outcome) {
			item.deferredPromise.resolve(outcome.resolve);
		} else {
			item.deferredPromise.reject(outcome.reject);
		}

		this._notifyDiagnostics();
		return true;
	}

	/**
	 * Rejects every outstanding request through {@link _settleRequest}.
	 *
	 * Ids are snapshotted first because settling a batch removes its sibling ids.
	 */
	protected _rejectAllRequests(error: unknown): void {
		const ids = [...this._pendingRequestsQueue.keys(), ...this._sentRequestsQueue.keys()];

		for (const id of ids) {
			this._settleRequest(id, { reject: error });
		}
	}

	/**
	 * Rejects every request already written to the socket with
	 * `PendingRequestsOnReconnectingError`, leaving requests that still wait for a connection
	 * queued. Called whenever the socket a request was written to is given up (a reconnect, a
	 * caller's {@link connect}): its reply can only arrive on that socket (P4-L-21).
	 */
	private _rejectSentRequests(): void {
		if (this._sentRequestsQueue.size === 0) return;
		const error = new PendingRequestsOnReconnectingError();
		for (const id of [...this._sentRequestsQueue.keys()]) {
			this._settleRequest(id, { reject: error });
		}
	}

	/**
	 * Removes all listeners for the specified event type.
	 * @param type - The event type to remove the listeners for
	 */
	public removeAllListeners(type: string): void {
		this._eventEmitter.removeAllListeners(type);
	}

	protected _onError(event: ErrorEvent): void {
		// do not emit error while trying to reconnect
		if (this.isReconnecting) {
			this._reconnect();
		} else {
			this._emitError(event);
		}
	}

	/**
	 * Resets the provider: cancels every pending request and any pending reconnect, drops any
	 * partially received message and restarts the reconnect attempt counter.
	 *
	 * The transport listeners registered by {@link connect} stay attached. They used to be
	 * removed and re-added here, which on a transport that keeps its `error` listener across
	 * `_removeSocketListeners` (IPC) registered one more `error` listener per call (L-24).
	 */
	public reset(): void {
		this._cancelReconnect();
		this._clearConnectionTimer();
		this.chunkResponseParser.reset();
		// Previously these maps were simply cleared, which abandoned every caller's promise
		// in `pending` forever. Reset cancels outstanding work; it does not forget it.
		this._rejectAllRequests(
			new ProviderError('Request cancelled: the provider was reset before it settled'),
		);

		this._init();
	}

	protected _reconnect(): void {
		if (this.isReconnecting) {
			return;
		}
		this.isReconnecting = true;
		this._invalidateConnection();
		// The attempt that just failed must not time out during the back-off (P4-L-16).
		this._clearConnectionTimer();
		this.chunkResponseParser.reset();
		this._rejectSentRequests();

		if (this._reconnectAttempts < this._reconnectOptions.maxAttempts) {
			this._reconnectAttempts += 1;
			const base = this._reconnectOptions.delay;
			const exp = base * 2 ** (this._reconnectAttempts - 1);
			const capped = Math.min(exp, 60_000);
			const jitter = capped * (Math.random() * 0.4 - 0.2);
			const wait = Math.max(0, Math.floor(capped + jitter));
			// Stored so that `disconnect()` / `reset()` can cancel it (L-22) and unref'd so that
			// a pending attempt alone does not keep the process alive.
			this._reconnectTimer = setTimeout(() => {
				this._reconnectTimer = undefined;
				this._removeSocketListeners();
				this.connect();
				this.isReconnecting = false;
			}, wait);
			unrefTimer(this._reconnectTimer);
		} else {
			this.isReconnecting = false;
			this._clearQueues();
			this._removeSocketListeners();
			this._emitError(
				new MaxAttemptsReachedOnReconnectingError(this._reconnectOptions.maxAttempts),
			);
		}
	}

	/**
	 * Collects every JSON-RPC id a payload occupies.
	 *
	 * A batch owns all N of its ids: they are what a silent peer would leave behind, so
	 * they are what must be accounted for against the cap.
	 */
	// eslint-disable-next-line class-methods-use-this
	private _extractRequestIds(request: Web3APIPayload<API, any>): DefinedJsonRpcId[] {
		if (jsonRpc.isBatchRequest(request as unknown as JsonRpcBatchRequest)) {
			const ids = (request as unknown as JsonRpcBatchRequest).map(entry => entry.id);

			if (ids.length === 0 || ids.some(id => isNullish(id))) {
				throw new Web3WSProviderError('Request Id not defined');
			}
			if (new Set(ids).size !== ids.length) {
				throw new Web3WSProviderError('Batch request contains duplicate ids');
			}

			return ids as DefinedJsonRpcId[];
		}

		const id = (request as unknown as JsonRpcRequest).id;

		if (isNullish(id)) {
			throw new Web3WSProviderError('Request Id not defined');
		}

		return [id];
	}

	/**
	 *  Creates a request object to be sent to the server
	 *
	 * The returned promise always settles: on a response, on a JSON-RPC error, on
	 * `requestTimeout` ({@link RequestTimeoutError}), on caller abort, or on teardown. A
	 * connected peer that simply never replies is bounded by the deadline armed here.
	 *
	 * @param request - the JSON-RPC payload, single or batch
	 * @param requestOptions - optional per-request `requestTimeout` override and `signal`
	 */
	public async request<
		Method extends Web3APIMethod<API>,
		ResultType = Web3APIReturnType<API, Method>,
	>(
		request: Web3APIPayload<API, Method>,
		requestOptions?: RequestBoundsOptions,
	): Promise<JsonRpcResponseWithResult<ResultType>> {
		if (isNullish(this._socketConnection)) {
			throw new Error('Connection is undefined');
		}
		// If the socket is disconnected, open a connection. Not while a reconnect is pending:
		// the request would open a socket of its own, the reconnect timer would then open
		// another one and the first would never be closed (L-44). The request is parked in the
		// pending queue instead and written once the reconnect completes, within its own
		// deadline.
		if (this.getStatus() === 'disconnected' && !this.isReconnecting) {
			this.connect();
		}

		const requestIds = this._extractRequestIds(request);
		const primaryId = requestIds[0];

		for (const id of requestIds) {
			if (this._sentRequestsQueue.has(id) || this._pendingRequestsQueue.has(id)) {
				throw new RequestAlreadySentError(id);
			}
		}

		// Admission is atomic: a batch of N either takes N slots or takes none. Rejecting
		// here -- before any bookkeeping exists -- is what keeps overflow leak-free, and is
		// why there is no second, hidden queue to absorb the overflow.
		if (this._inFlightCount() + requestIds.length > this._providerBounds.maxInFlightRequests) {
			throw new RequestQueueFullError(this._providerBounds.maxInFlightRequests);
		}

		if (requestOptions?.signal?.aborted) {
			throw requestOptions.signal.reason ?? new ProviderError('Request aborted');
		}

		const requestTimeout =
			requestOptions?.requestTimeout === undefined
				? this._providerBounds.requestTimeout
				: validateTimeout(requestOptions.requestTimeout, 'requestTimeout');

		const method = jsonRpc.isBatchRequest(request as unknown as JsonRpcBatchRequest)
			? undefined
			: (request as unknown as JsonRpcRequest).method;

		const deferredPromise = new Web3DeferredPromise<JsonRpcResponseWithResult<ResultType>>();
		deferredPromise.catch(error => {
			this._emitError(error);
		});
		const reqItem: SocketRequestItem<API, Method, JsonRpcResponseWithResult<ResultType>> = {
			payload: request,
			deferredPromise,
		};

		// The deadline is armed here, before we know whether we can even write to the
		// socket. That is deliberate: a request parked in `_pendingRequestsQueue` waiting
		// for the handshake is spending its own budget, so connection wait counts toward
		// the request's total deadline exactly as the team decided.
		//
		// `Web3DeferredPromise`'s own timeout machinery is deliberately bypassed: it rejects
		// with `OperationTimeoutError` rather than the required `RequestTimeoutError`, it
		// cannot compose a caller's `AbortSignal`, and its timer is neither unref'd nor
		// observable. The deferred promise is used purely as a settle handle.
		const abort = composeAbortSignal({
			timeout: requestTimeout,
			signal: requestOptions?.signal,
			timeoutReason: () => new RequestTimeoutError(requestTimeout, method),
		});

		const lifecycle: RequestLifecycle = { ids: requestIds, abort, settled: false };
		this._requestLifecycles.set(reqItem, lifecycle);

		const onAbort = () => {
			// `timedOut` is what separates our own deadline from a caller cancelling: an
			// abort reason alone cannot, since a caller may abort with any reason at all.
			const reason = abort.timedOut
				? (abort.signal.reason ?? new RequestTimeoutError(requestTimeout, method))
				: (abort.signal.reason ?? new ProviderError('Request aborted'));

			this._settleRequest(primaryId, { reject: reason });
		};
		lifecycle.onAbort = onAbort;
		abort.signal.addEventListener('abort', onAbort, { once: true });

		const queue =
			this.getStatus() === 'connecting' || this.isReconnecting
				? this._pendingRequestsQueue
				: this._sentRequestsQueue;

		for (const id of requestIds) {
			queue.set(id, reqItem);
		}
		this._notifyDiagnostics();

		if (queue === this._pendingRequestsQueue) {
			// Sent by `_sendPendingRequests` once the handshake completes; the deadline
			// armed above keeps running in the meantime.
			return reqItem.deferredPromise;
		}

		try {
			this._sendToSocket(reqItem.payload);
		} catch (error) {
			// Reject the request promise immediately when sending fails
			// (e.g. when the socket is already disconnected).
			this._settleRequest(primaryId, { reject: error });
		}

		return deferredPromise;
	}

	protected _onConnect() {
		this._clearConnectionTimer();
		this._connectionStatus = 'connected';
		this._reconnectAttempts = 0;
		super._onConnect();
		this._sendPendingRequests();
	}

	private _sendPendingRequests() {
		const entries = [...this._pendingRequestsQueue.entries()];
		/* eslint-disable @typescript-eslint/no-explicit-any */
		const sent = new Set<SocketRequestItem<any, any, any>>();

		for (const [id, item] of entries) {
			// A batch occupies N ids but is one payload: write it once.
			if (sent.has(item)) continue;
			sent.add(item);

			const lifecycle = this._requestLifecycles.get(item);

			// Promote every id this request owns before writing, so a response that lands
			// synchronously still finds its entry in `_sentRequestsQueue`.
			for (const ownedId of lifecycle?.ids ?? [id]) {
				if (this._pendingRequestsQueue.delete(ownedId)) {
					this._sentRequestsQueue.set(ownedId, item);
				}
			}

			try {
				this._sendToSocket(item.payload as Web3APIPayload<API, any>);
			} catch (error) {
				// Previously a throw here escaped `_onConnect` and left every remaining
				// pending request stranded.
				this._settleRequest(id, { reject: error });
			}
		}
	}

	protected _onMessage(event: MessageEvent): void {
		let responses: JsonRpcResponse[];
		try {
			responses = this._parseResponses(event);
		} catch (error) {
			// Input the transport could not even hand to the parser (a binary frame on a text
			// protocol, for example) is a protocol error from the peer. It is reported, never
			// thrown: an exception escaping a socket callback terminates the process. Nor is it
			// a sign that the connection was lost, so it does not trigger a reconnect.
			this._emitError(error);
			return;
		}

		// A message that yields nothing parseable (a partial IPC chunk, or garbage that was
		// reported by the parser) is simply not a response. It is never treated as a lost
		// connection: connection loss is signalled by the transport's close/error events.
		for (const response of responses) {
			try {
				this._handleResponse(response);
			} catch (error) {
				this._emitError(error);
			}
		}
	}

	private _handleResponse(response: JsonRpcResponse): void {
		// Only an object can be a response, a batch or a notification. Anything else (`null`
		// inside a batch array, a number, ...) is malformed input from the peer and is reported
		// instead of being dereferenced.
		if (typeof response !== 'object' || isNullish(response)) {
			this._emitError(
				new ResponseError(
					response as never,
					'Invalid JSON-RPC response received from the node',
				),
			);
			return;
		}

		if (
			jsonRpc.isResponseWithNotification(response as JsonRpcNotification) &&
			typeof (response as JsonRpcNotification).method === 'string' &&
			(response as JsonRpcNotification).method.endsWith('_subscription')
		) {
			// An established subscription's stream is exempt from the per-request
			// deadline: notifications carry no request id, hold no queue slot and arm no
			// timer. The `*_subscribe` call that established it was bounded like any
			// other request; from here the stream is governed by heartbeat / reconnect /
			// unsubscribe / disconnect semantics instead.
			this._eventEmitter.emit('message', response);
			return;
		}

		if (Array.isArray(response) && !jsonRpc.isBatchResponse(response)) {
			// An array whose entries are not all well-formed responses (`[null]`, for example)
			// cannot be correlated with any request.
			this._emitError(
				new ResponseError(
					response as never,
					'Invalid JSON-RPC batch response received from the node',
				),
			);
			return;
		}

		const requestId = jsonRpc.isBatchResponse(response)
			? (response as unknown as JsonRpcBatchResponse)[0].id
			: (response as unknown as JsonRpcResponseWithResult).id;

		// Unknown ids, and duplicate ids for an already-settled request, find nothing
		// here and are dropped. A late response that lost the race against the deadline
		// is exactly this case, so it cannot double-settle.
		if (!this._sentRequestsQueue.has(requestId)) {
			return;
		}

		if (
			jsonRpc.isBatchResponse(response) ||
			jsonRpc.isResponseWithResult(response) ||
			jsonRpc.isResponseWithError(response)
		) {
			// Settled before the event goes out: a `message` listener that throws must not
			// leave the request to fail by deadline although its reply arrived (P4-L-20). The
			// throw is reported by the caller's per-response catch.
			this._settleRequest(requestId, { resolve: response });
			this._eventEmitter.emit('message', response);
		} else {
			// Malformed but id-matching. This used to drop the map entry without
			// settling, stranding the caller's promise permanently.
			this._settleRequest(requestId, {
				reject: new ResponseError(
					response,
					'Invalid JSON-RPC response received from the node',
				),
			});
		}
	}

	protected _clearQueues(event?: ConnectionEvent) {
		this._clearConnectionTimer();
		this.chunkResponseParser.reset();
		this._rejectAllRequests(new ConnectionNotOpenError(event));
		this._removeSocketListeners();
	}
}
