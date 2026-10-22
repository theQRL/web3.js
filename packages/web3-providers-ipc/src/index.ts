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

import { Socket, SocketConstructorOpts } from 'net';
import {
	ConnectionError,
	ConnectionNotOpenError,
	InvalidClientError,
	RequestSerializationError,
} from '@theqrl/web3-errors';
import { ReconnectOptions, SocketProvider, SocketProviderOptions } from '@theqrl/web3-utils';
import {
	QRLExecutionAPI,
	Web3APIMethod,
	Web3APIPayload,
	Web3APISpec,
	Web3ProviderStatus,
} from '@theqrl/web3-types';
import { statSync } from 'fs';

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
 * The sockets that carry this module's `error` listener. Kept outside the instance: a field
 * declared on the subclass is (re)initialised only after the base constructor has already
 * connected and attached the listeners, so it could not remember that first attachment.
 */
const socketsWithErrorListener = new WeakSet<Socket>();

/**
 * The IPC Provider could be used in node.js dapps when running a local node. And it provide the most secure connection.
 *
 * The path must name an existing Unix domain socket (on Windows, a named pipe): a missing
 * path, a regular file, a directory or a FIFO at the path is refused at construction with a
 * typed error instead of being connected to and failing later (L-43).
 *
 * When the node goes away the provider reconnects according to `reconnectOptions`: both a
 * peer that ends the connection and a connection attempt that fails (`ECONNREFUSED` on a
 * stale socket file) count as a lost connection, so the attempts are bounded by
 * `maxAttempts` and end in a `MaxAttemptsReachedOnReconnectingError`, after which the next
 * `request()` tries to connect again (L-43).
 *
 * @example
 * ```ts
 * const provider = new IpcProvider(
 * 		`path.ipc`,
 * 		{
 * 			writable: false,
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
 * const provider = new IpcProvider(
 * 		`path.ipc`,
 * 		{},
 * 		{
 * 			delay: 500,
 * 			autoReconnect: true,
 * 			maxAttempts: 10,
 * 		},
 * 	);
 * ```
 */
export default class IpcProvider<API extends Web3APISpec = QRLExecutionAPI> extends SocketProvider<
	Uint8Array | string,
	// `net` reports a lost connection through `'end'` (no argument) and `'close'` (`hadError`).
	boolean | undefined,
	Error,
	API
> {
	protected readonly _socketOptions?: SocketConstructorOpts;

	protected _socketConnection?: Socket;

	/**
	 * Decoder for a binary chunk, kept across chunks so that a multi-byte character split
	 * over two `data` events is reassembled; replaced for every connection (L-24). Created
	 * lazily: the base constructor connects before this class's fields are initialised.
	 */
	private _decoder?: TextDecoder;

	/**
	 * This is a class used for IPC connections. It extends the abstract class SocketProvider {@link SocketProvider} that extends the EIP-1193 provider {@link EIP1193Provider}.
	 * @param socketPath - The path to the IPC socket.
	 * @param socketOptions - The options for the IPC socket connection.
	 * @param reconnectOptions - The options for the socket reconnection {@link ReconnectOptions}
	 * @param providerOptions - Timeout and queue bounds {@link SocketProviderOptions}
	 */
	// this constructor is to specify the type for `socketOptions` for a better intellisense.
	public constructor(
		socketPath: string,
		socketOptions?: SocketConstructorOpts,
		reconnectOptions?: Partial<ReconnectOptions>,
		providerOptions?: SocketProviderOptions,
	) {
		super(socketPath, socketOptions, reconnectOptions, providerOptions);
	}

	public getStatus(): Web3ProviderStatus {
		if (this._socketConnection?.connecting) {
			return 'connecting';
		}
		return this._connectionStatus;
	}

	/**
	 * `existsSync` alone let a regular file, a directory or a FIFO at the path pass, after
	 * which `net` reported `ECONNREFUSED` and the provider never recovered (L-43). The socket
	 * check is skipped on Windows, where a named pipe is not a socket inode. The check is a
	 * better error, not a guarantee: the path can still change before `connect`.
	 */
	private static _assertSocketPath(socketPath: string): void {
		let isSocket: boolean;
		try {
			isSocket = statSync(socketPath).isSocket();
		} catch {
			throw new InvalidClientError(socketPath);
		}
		if (process.platform !== 'win32' && !isSocket) {
			throw new ConnectionError(
				`IPC path "${socketPath}" exists but is not a Unix domain socket`,
			);
		}
	}

	protected _openSocketConnection() {
		IpcProvider._assertSocketPath(this._socketPath);
		if (!this._socketConnection || this.getStatus() === 'disconnected') {
			this._socketConnection = new Socket(this._socketOptions);
		}
		// The socket decodes its own byte stream, so a character split across two `data`
		// events survives; a fresh decoder for the (rare) binary chunk as well (L-24).
		this._decoder = new TextDecoder('utf-8');
		this._socketConnection.setEncoding('utf8');
		this._socketConnection.connect({ path: this._socketPath });
	}

	protected _closeSocketConnection(code: number, data?: string) {
		this._socketConnection?.end(() => {
			this._onDisconnect(code, data);
		});
	}

	protected _sendToSocket<Method extends Web3APIMethod<API>>(
		payload: Web3APIPayload<API, Method>,
	): void {
		if (this.getStatus() === 'disconnected') {
			throw new ConnectionNotOpenError();
		}
		this._socketConnection?.write(serializePayload(payload));
	}

	protected _parseResponses(e: Uint8Array | string) {
		this._decoder ??= new TextDecoder('utf-8');
		const text = typeof e === 'string' ? e : this._decoder.decode(e, { stream: true });
		return this.chunkResponseParser.parseResponse(text);
	}

	protected _addSocketListeners(): void {
		const socket = this._socketConnection;
		if (!socket) {
			return;
		}
		socket.on('data', this._onMessageHandler);
		socket.on('connect', this._onOpenHandler);
		// A failed connection attempt emits `'error'` and then `'close'`, never `'end'`;
		// both events mean the connection is gone and lead to the same handler (L-43).
		socket.on('close', this._onCloseHandler);
		socket.on('end', this._onCloseHandler);
		// `reset()` re-adds the listeners while `_removeSocketListeners` keeps `error`: added
		// only when absent, every socket error is reported exactly once (L-24).
		if (!socketsWithErrorListener.has(socket)) {
			socket.on('error', this._onErrorHandler);
			socketsWithErrorListener.add(socket);
		}
	}

	protected _removeSocketListeners(): void {
		this._socketConnection?.removeAllListeners('connect');
		this._socketConnection?.removeAllListeners('end');
		this._socketConnection?.removeAllListeners('close');
		this._socketConnection?.removeAllListeners('data');
		// note: we intentionally keep the error event listener to be able to emit it in case an error happens when closing the connection
	}

	/**
	 * The connection is gone, whether the peer ended it (`'end'`, then `'close'`) or an
	 * attempt failed (`'error'`, then `'close'`). With `autoReconnect` the provider is marked
	 * disconnected and a reconnect scheduled (idempotent while one is pending, so the two
	 * events of one closure schedule one attempt); otherwise the queues are cleared and the
	 * disconnect reported, so the status never stays `'connecting'` for good (L-43).
	 */
	protected _onCloseEvent(): void {
		if (this._reconnectOptions.autoReconnect) {
			this._connectionStatus = 'disconnected';
			this._reconnect();
			return;
		}

		this._clearQueues();
		this._removeSocketListeners();
		// A Node socket carries neither a close code nor a reason.
		this._onDisconnect(undefined as unknown as number, undefined);
		// disconnect was successful and can safely remove error listener
		if (this._socketConnection) {
			this._socketConnection.removeAllListeners('error');
			socketsWithErrorListener.delete(this._socketConnection);
		}
	}
}

export { IpcProvider };
