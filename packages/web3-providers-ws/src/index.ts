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

import type { ClientRequestArgs } from 'http';
import WebSocket, { ClientOptions, CloseEvent } from 'isomorphic-ws';
import {
	QRLExecutionAPI,
	Web3APIMethod,
	Web3APIPayload,
	Web3APISpec,
	Web3ProviderStatus,
} from '@theqrl/web3-types';
import {
	isNullish,
	ReconnectOptions,
	SocketProvider,
	SocketProviderOptions,
	toUtf8,
	uint8ArrayConcat,
} from '@theqrl/web3-utils';
import {
	BaseWeb3Error,
	ConnectionNotOpenError,
	ProviderError,
	RequestSerializationError,
	ResponseTooLargeError,
	Web3WSProviderError,
} from '@theqrl/web3-errors';

export type { ClientRequestArgs } from 'http';

export { ClientOptions } from 'isomorphic-ws';

/**
 * Serialises a JSON-RPC payload, turning a serialisation failure (a `bigint` in `params`, a
 * circular structure, a throwing `toJSON`) into a typed error instead of a raw `TypeError`
 * from `JSON.stringify` (I-15).
 */
const serializePayload = (payload: unknown): string => {
	let body: string | undefined;
	try {
		body = JSON.stringify(payload);
	} catch (error) {
		throw new RequestSerializationError(error instanceof Error ? error.message : undefined);
	}
	if (typeof body !== 'string') {
		throw new RequestSerializationError(`payload serialised to ${typeof body}`);
	}
	return body;
};

/**
 * Use WebSocketProvider to connect to a Node using a WebSocket connection, i.e. over the `ws` or `wss` protocol.
 *
 * Credentials belong in `socketOptions.headers` (an `authorization` or an `x-api-key`
 * header, as in the example below), not in the URL: `ws://user:password@host` is rejected at
 * construction with an `InvalidClientError` (a browser's WebSocket refuses such a URL and `ws`
 * would send the credentials as Basic authentication without being asked), and the URL is
 * redacted to its `host:port` in every error this provider raises (L-48).
 *
 * The opening handshake is bounded by `providerOptions.connectionTimeout` (30 s by default,
 * also passed to `ws` as `handshakeTimeout`): a peer that accepts the TCP connection but never
 * completes the upgrade is abandoned, the socket closed and, with `autoReconnect`, a
 * reconnect scheduled (M-8). Both `socketOptions.handshakeTimeout` and the provider option
 * can be set; the shorter one wins.
 *
 * `providerOptions.maxResponseBytes` (10 MiB by default) bounds every message the node sends.
 * Messages exceeding this parser bound are dropped and identified requests fail with
 * `ResponseTooLargeError`; notifications do not fail unrelated requests. The default
 * `ws` wire limit (`maxPayload`) is twice this bound. Exceeding the wire limit closes the
 * connection with code 1009 and fails all outstanding requests with `ResponseTooLargeError`,
 * since the frame is unavailable for request correlation.
 *
 * `disconnect(code, reason)` accepts the close codes every WebSocket client lets an endpoint
 * send, 1000 or 3000-4999, and a reason of at most 123 UTF-8 bytes; anything else is refused
 * with a `Web3WSProviderError` before the connection is touched (P4-L-17).
 *
 * @example
 * ```ts
 * const provider = new WebSocketProvider(
 * 		`ws://localhost:8545`,
 * 		{
 * 			headers: {
 * 				// to provide the API key if the Node requires the key to be inside the `headers` for example:
 * 				'x-api-key': '<Api key>',
 * 			},
 * 		},
 * 		{
 * 			delay: 500,
 * 			autoReconnect: true,
 * 			maxAttempts: 10,
 * 		},
 * 	);
 * ```
 *
 * The second and the third parameters are both optional. And you can for example, the second parameter could be an empty object or undefined.
 *  * @example
 * ```ts
 * const provider = new WebSocketProvider(
 * 		`ws://localhost:8545`,
 * 		{},
 * 		{
 * 			delay: 500,
 * 			autoReconnect: true,
 * 			maxAttempts: 10,
 * 		},
 * 	);
 * ```
 */
export default class WebSocketProvider<
	API extends Web3APISpec = QRLExecutionAPI,
> extends SocketProvider<WebSocket.MessageEvent, WebSocket.CloseEvent, WebSocket.ErrorEvent, API> {
	protected readonly _socketOptions?: ClientOptions | ClientRequestArgs;

	protected _socketConnection?: WebSocket;

	/**
	 * `ws://` or `wss://`, a URL the WHATWG parser accepts, and no credentials. A URL that `ws`
	 * would refuse when connecting (a port above 65535, a space in the host, an unbalanced IPv6
	 * literal) or that carries `user:password@` fails at construction with an
	 * `InvalidClientError`, which carries the URL with its credentials and path removed; `ws`
	 * quotes the full URL in its own error (P4-L-15).
	 */
	// eslint-disable-next-line class-methods-use-this
	protected _validateProviderPath(providerUrl: string): boolean {
		if (typeof providerUrl !== 'string' || !/^ws(s)?:\/\//i.test(providerUrl)) {
			return false;
		}
		let parsed: URL;
		try {
			parsed = new URL(providerUrl);
		} catch {
			return false;
		}
		if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
			return false;
		}
		// Credentials belong in `socketOptions.headers`, not in the URL: a browser's WebSocket
		// constructor refuses such a URL, `ws` would send the credentials as Basic
		// authentication without being asked, and a URL is copied into logs and error reports
		// far more readily than a header.
		return parsed.username === '' && parsed.password === '';
	}

	// A WebSocket frame is a whole message: nothing is carried over between frames.
	// eslint-disable-next-line class-methods-use-this
	protected _isFramedTransport(): boolean {
		return true;
	}

	/**
	 * This is a class used for Web Socket connections. It extends the abstract class SocketProvider {@link SocketProvider} that extends the EIP-1193 provider {@link EIP1193Provider}.
	 * @param socketPath - The path to the Web Socket.
	 * @param socketOptions - The options for the Web Socket client.
	 * @param reconnectOptions - The options for the socket reconnection {@link ReconnectOptions}
	 * @param providerOptions - Timeout and queue bounds {@link SocketProviderOptions}
	 */
	// this constructor is to specify the type for `socketOptions` for a better intellisense.
	public constructor(
		socketPath: string,
		socketOptions?: ClientOptions | ClientRequestArgs,
		reconnectOptions?: Partial<ReconnectOptions>,
		providerOptions?: SocketProviderOptions,
	) {
		super(socketPath, socketOptions, reconnectOptions, providerOptions);
		WebSocketProvider.warnIfCleartext(socketPath);
	}

	private static warnIfCleartext(socketPath: string): void {
		if (!/^ws:\/\//i.test(socketPath)) return;
		// The parsed hostname: credentials, a port or a path can no longer be mistaken for
		// the host (I-15). IPv6 literals keep their brackets. `_validateProviderPath` has
		// already parsed the URL once, so this cannot throw.
		const host = new URL(socketPath).hostname.toLowerCase();
		const loopbacks = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);
		if (loopbacks.has(host)) return;
		console.warn(
			`web3-providers-ws: cleartext ws:// URL to non-loopback host "${host}". Use wss:// for production.`,
		);
	}

	/**
	 * `'disconnected'` as soon as the base class says so: the connection deadline marks the
	 * provider disconnected while the socket may still be CONNECTING (a stalled handshake),
	 * and `disconnect()` marks it before the close handshake completes. Deriving the status
	 * from `readyState` alone hid that, so no reconnect was ever attempted (M-8).
	 */
	public getStatus(): Web3ProviderStatus {
		if (this._connectionStatus === 'disconnected') {
			return 'disconnected';
		}
		const socket = this._socketConnection;
		if (isNullish(socket)) {
			return 'disconnected';
		}
		if (socket.readyState === socket.CONNECTING) {
			return 'connecting';
		}
		if (socket.readyState === socket.OPEN) {
			return 'connected';
		}
		// CLOSING or CLOSED.
		return 'disconnected';
	}

	protected _openSocketConnection() {
		// `connect()` after a timed-out handshake, or during a reconnect back-off, used to
		// overwrite the reference and leave the previous socket open (M-8, L-44).
		this._discardSocket(this._socketConnection);
		const defaults: ClientOptions = {
			// Allow bounded oversize frames through to the parser so it can correlate
			// the error without dropping every other request on this connection.
			maxPayload: Math.min(
				Number.MAX_SAFE_INTEGER,
				2 * this._providerBounds.maxResponseBytes,
			),
			perMessageDeflate: false,
			// `ws` has no handshake deadline of its own: without one a peer that accepts the
			// TCP connection but never completes the upgrade keeps the socket CONNECTING
			// forever (M-8). Bounded by the same deadline as the provider's connection timer.
			handshakeTimeout: this._providerBounds.connectionTimeout,
		};
		const userOptions =
			this._socketOptions && Object.keys(this._socketOptions).length === 0
				? undefined
				: this._socketOptions;
		const merged = { ...defaults, ...(userOptions ?? {}) } as ClientOptions;
		this._socketConnection = new WebSocket(this._socketPath, undefined, merged);
	}

	/**
	 * Closes a socket this provider is about to replace. Its listeners are detached first,
	 * whatever its state, so that its close and error events are not taken for the new
	 * connection's: a CLOSING socket still fires `close` once the peer ends the TCP connection,
	 * and that event used to reject the requests parked for the replacement and strip the
	 * replacement's listeners (P4-L-18). `ws` reports an aborted handshake through `'error'`,
	 * which must keep a listener or it would crash the process.
	 *
	 * A socket in the middle of a close handshake is terminated rather than waited for: the
	 * peer may never end the connection, and nothing else would ever close it (P4-L-17).
	 */
	private _discardSocket(socket: WebSocket | undefined): void {
		if (isNullish(socket)) {
			return;
		}
		socket.removeEventListener('open', this._onOpenHandler);
		socket.removeEventListener('message', this._onMessageHandler);
		socket.removeEventListener('close', this._onCloseHandler);
		socket.removeEventListener('error', this._onErrorHandler);
		socket.addEventListener('error', () => undefined);
		if (socket.readyState === socket.CLOSED) {
			return;
		}
		if (socket.readyState === socket.CLOSING) {
			if (typeof socket.terminate === 'function') socket.terminate();
			return;
		}
		if (typeof socket.close === 'function') socket.close();
	}

	protected _closeSocketConnection(code?: number, data?: string) {
		const socket = this._socketConnection;
		if (!isNullish(socket) && socket.readyState === socket.CONNECTING) {
			// `ws` reports an abandoned handshake through `'error'` ("WebSocket was closed
			// before the connection was established"). A close this provider asked for is not
			// a transport error, so that report goes to a listener that drops it (I-F12).
			socket.removeEventListener('error', this._onErrorHandler);
			socket.addEventListener('error', () => undefined);
		}
		socket?.close(code, data);
	}

	/**
	 * Closes the connection with a WebSocket close code and reason.
	 *
	 * `code` must be 1000 or in 3000-4999 and `data` at most 123 UTF-8 bytes, the values every
	 * WebSocket client accepts in a close frame; anything else is refused with a
	 * `Web3WSProviderError` before any teardown. `ws` used to refuse the frame only after it
	 * had marked the socket CLOSING, which left a connection that could never be closed and
	 * in-flight requests that failed by deadline (P4-L-17).
	 *
	 * @param code - The code to be sent to the server
	 * @param data - The reason to be sent to the server
	 */
	public disconnect(code?: number, data?: string): void {
		WebSocketProvider._assertCloseArguments(code, data);
		super.disconnect(code, data);
	}

	private static _assertCloseArguments(code?: number, data?: string): void {
		if (
			!isNullish(code) &&
			!(Number.isInteger(code) && (code === 1000 || (code >= 3000 && code <= 4999)))
		) {
			throw new Web3WSProviderError(
				`Invalid WebSocket close code ${BaseWeb3Error.convertToString(
					code,
				)}: expected 1000 or a code in the range 3000-4999`,
			);
		}
		if (isNullish(data)) {
			return;
		}
		if (typeof data !== 'string') {
			throw new Web3WSProviderError('Invalid WebSocket close reason: expected a string');
		}
		const bytes = new TextEncoder().encode(data).length;
		if (bytes > 123) {
			throw new Web3WSProviderError(
				`Invalid WebSocket close reason: ${bytes} UTF-8 bytes exceed the 123-byte limit of a close frame`,
			);
		}
	}

	protected _sendToSocket<Method extends Web3APIMethod<API>>(
		payload: Web3APIPayload<API, Method>,
	): void {
		if (this.getStatus() === 'disconnected') {
			throw new ConnectionNotOpenError();
		}
		this._socketConnection?.send(serializePayload(payload));
	}

	protected _parseResponses(event: WebSocket.MessageEvent) {
		return this.chunkResponseParser.parseResponse(
			WebSocketProvider._messageEventDataToString(event.data),
		);
	}

	/**
	 * `ws` delivers text frames as strings and binary frames as a `Buffer`, an `ArrayBuffer` or
	 * an array of `Buffer`s (fragmented). JSON-RPC is a text protocol, but a peer that sends a
	 * binary frame must end up with a reported error, not with a `TypeError` thrown from inside
	 * the socket callback.
	 */
	private static _messageEventDataToString(data: unknown): string {
		if (typeof data === 'string') {
			return data;
		}
		if (data instanceof ArrayBuffer) {
			return toUtf8(new Uint8Array(data));
		}
		if (data instanceof Uint8Array) {
			return toUtf8(data);
		}
		if (Array.isArray(data) && data.every(part => part instanceof Uint8Array)) {
			return toUtf8(uint8ArrayConcat(...(data as Uint8Array[])));
		}
		throw new ProviderError(`Unsupported WebSocket message data type: ${typeof data}`);
	}

	protected _addSocketListeners(): void {
		this._socketConnection?.addEventListener('open', this._onOpenHandler);
		this._socketConnection?.addEventListener('message', this._onMessageHandler);
		this._socketConnection?.addEventListener('close', this._onCloseHandler);
		this._socketConnection?.addEventListener('error', this._onErrorHandler);
	}

	protected _removeSocketListeners(): void {
		this._socketConnection?.removeEventListener('message', this._onMessageHandler);
		this._socketConnection?.removeEventListener('open', this._onOpenHandler);
		this._socketConnection?.removeEventListener('close', this._onCloseHandler);
		// note: we intentionally keep the error event listener to be able to emit it in case an error happens when closing the connection
	}

	protected _onCloseEvent(event: CloseEvent): void {
		// A close reported by a socket this provider has already replaced says nothing about
		// the current connection (P4-L-18).
		if (!isNullish(event.target) && event.target !== this._socketConnection) {
			return;
		}
		if (event.code === 1009) {
			const error = new ResponseTooLargeError(this._providerBounds.maxResponseBytes);
			this._rejectAllRequests(error);
			this._emitError(error);
		}
		if (
			this._reconnectOptions.autoReconnect &&
			(![1000, 1001].includes(event.code) || !event.wasClean)
		) {
			this._reconnect();
			return;
		}
		this._clearQueues(event);
		this._removeSocketListeners();
		this._onDisconnect(event.code, event.reason);
		// disconnect was successful and can safely remove error listener
		this._socketConnection?.removeEventListener('error', this._onErrorHandler);
	}

	protected _onError(event: WebSocket.ErrorEvent): void {
		if (
			(event.error as { code?: string } | undefined)?.code ===
			'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
		) {
			const error = new ResponseTooLargeError(this._providerBounds.maxResponseBytes);
			this._rejectAllRequests(error);
			this._emitError(error);
			return;
		}
		super._onError(event);
	}
}

export { WebSocketProvider };
