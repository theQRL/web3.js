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
import { JsonRpcResponse } from '@theqrl/web3-types';
import { InvalidResponseError } from '@theqrl/web3-errors';
import { EventEmitter } from 'events';
import { isNullish } from './validation.js';

const MAX_CHUNK_BYTES = 10 * 1024 * 1024;
const CHUNK_TIMEOUT_MS = 15 * 1000;

export interface ChunkResponseParserOptions {
	/**
	 * `true` for transports that deliver whole messages (WebSocket frames). Input is then never
	 * carried over between calls: a frame that is not valid JSON is reported and dropped, so one
	 * bad frame cannot corrupt the parsing of every frame that follows it.
	 *
	 * `false` (the default) for byte-stream transports (IPC), where one message may arrive split
	 * across several `data` events and the partial text has to be kept until it completes.
	 */
	framed?: boolean;
}

export class ChunkResponseParser {
	private lastChunk: string | undefined;
	private lastChunkTimeout: NodeJS.Timeout | undefined;
	private _clearQueues: ((error: InvalidResponseError) => void) | undefined;
	private readonly eventEmitter: EventEmitter;
	private readonly autoReconnect: boolean;
	private readonly framed: boolean;

	public constructor(
		eventEmitter: EventEmitter,
		autoReconnect: boolean,
		options: ChunkResponseParserOptions = {},
	) {
		this.eventEmitter = eventEmitter;
		this.autoReconnect = autoReconnect;
		this.framed = options.framed ?? false;
	}
	public onError(clearQueues?: (error: InvalidResponseError) => void) {
		this._clearQueues = clearQueues;
	}

	/**
	 * Drops any partial chunk and its completion timer.
	 *
	 * Must be called whenever the underlying connection is reset, reconnected or closed: bytes
	 * left over from a previous connection must never be prepended to the first message of the
	 * next one.
	 */
	public reset(): void {
		if (this.lastChunkTimeout) {
			clearTimeout(this.lastChunkTimeout);
			this.lastChunkTimeout = undefined;
		}
		this.lastChunk = undefined;
	}

	/**
	 * Emitting `error` on an `EventEmitter` that has no `error` listener throws. Inside a socket
	 * `message`/`data` callback that exception is uncaught and terminates the process, so a
	 * malformed message from the peer is only reported when someone is listening.
	 */
	private emitError(message: string, clearQueues = false): void {
		const error = new InvalidResponseError({
			id: 1,
			jsonrpc: '2.0',
			error: { code: 2, message },
		});
		if (clearQueues) this._clearQueues?.(error);
		if (this.eventEmitter.listenerCount('error') > 0) {
			this.eventEmitter.emit('error', error);
		}
	}

	public parseResponse(data: string): JsonRpcResponse[] {
		const returnValues: JsonRpcResponse[] = [];

		// DE-CHUNKER
		const dechunkedData = this.framed
			? [data]
			: data
					.replace(/\}[\n\r]?\{/g, '}|--|{') // }{
					.replace(/\}\][\n\r]?\[\{/g, '}]|--|[{') // }][{
					.replace(/\}[\n\r]?\[\{/g, '}|--|[{') // }[{
					.replace(/\}\][\n\r]?\{/g, '}]|--|{') // }]{
					.split('|--|');

		dechunkedData.forEach(_chunkData => {
			// prepend the last chunk
			let chunkData = _chunkData;
			if (this.lastChunk) {
				chunkData = this.lastChunk + chunkData;
			}

			if (chunkData.length > MAX_CHUNK_BYTES) {
				this.reset();
				this.emitError('Chunk size exceeds maximum', true);
				return;
			}

			let result: unknown;
			try {
				result = JSON.parse(chunkData);
			} catch {
				if (this.framed) {
					// A whole-message transport delivered something that is not JSON. It is not
					// the prefix of a later message, so it is reported and dropped here rather
					// than kept and prepended to everything that follows.
					this.emitError('Malformed JSON-RPC message received from the node');
					return;
				}

				this.lastChunk = chunkData;

				// Bound the lifetime of the incomplete message, not the idle time between
				// chunks. Subsequent traffic must not keep a poisoned prefix alive forever.
				this.lastChunkTimeout ??= setTimeout(() => {
					this.reset();
					this.emitError('Chunk timeout', !this.autoReconnect);
				}, CHUNK_TIMEOUT_MS);
				return;
			}

			// cancel timeout and set chunk to null
			this.reset();

			// A JSON-RPC message is an object (or a batch array of objects). Any other JSON
			// value (`null`, a number, a string, ...) is malformed input from the peer, never a
			// response, and must not be handed to the response handlers.
			if (typeof result !== 'object' || isNullish(result)) {
				this.emitError('Non-object JSON-RPC message received from the node');
				return;
			}

			returnValues.push(result as JsonRpcResponse);
		});

		return returnValues;
	}
}
