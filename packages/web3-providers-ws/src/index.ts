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

import { ClientRequestArgs } from 'http';
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
import { ConnectionNotOpenError, ProviderError } from '@theqrl/web3-errors';

export { ClientRequestArgs } from 'http';

export { ClientOptions } from 'isomorphic-ws';

/**
 * Use WebSocketProvider to connect to a Node using a WebSocket connection, i.e. over the `ws` or `wss` protocol.
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

	// eslint-disable-next-line class-methods-use-this
	protected _validateProviderPath(providerUrl: string): boolean {
		return typeof providerUrl === 'string' ? /^ws(s)?:\/\//i.test(providerUrl) : false;
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
		const host = socketPath.replace(/^ws:\/\//i, '').split(/[/?#]/)[0].split(':')[0];
		const loopbacks = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
		if (loopbacks.has(host.toLowerCase())) return;
		console.warn(
			`web3-providers-ws: cleartext ws:// URL to non-loopback host "${host}". Use wss:// for production.`,
		);
	}

	public getStatus(): Web3ProviderStatus {
		if (this._socketConnection && !isNullish(this._socketConnection)) {
			switch (this._socketConnection.readyState) {
				case this._socketConnection.CONNECTING: {
					return 'connecting';
				}
				case this._socketConnection.OPEN: {
					return 'connected';
				}
				default: {
					return 'disconnected';
				}
			}
		}
		return 'disconnected';
	}

	protected _openSocketConnection() {
		const defaults: ClientOptions = {
			maxPayload: 10 * 1024 * 1024,
			perMessageDeflate: false,
		};
		const userOptions =
			this._socketOptions && Object.keys(this._socketOptions).length === 0
				? undefined
				: this._socketOptions;
		const merged = { ...defaults, ...(userOptions ?? {}) } as ClientOptions;
		this._socketConnection = new WebSocket(this._socketPath, undefined, merged);
	}

	protected _closeSocketConnection(code?: number, data?: string) {
		this._socketConnection?.close(code, data);
	}

	protected _sendToSocket<Method extends Web3APIMethod<API>>(
		payload: Web3APIPayload<API, Method>,
	): void {
		if (this.getStatus() === 'disconnected') {
			throw new ConnectionNotOpenError();
		}
		this._socketConnection?.send(JSON.stringify(payload));
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
}

export { WebSocketProvider };
