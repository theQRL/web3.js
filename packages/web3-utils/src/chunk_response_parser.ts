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
import type { EventEmitterLike } from './event_emitter.js';
import { isNullish } from './validation.js';

const MAX_CHUNK_BYTES = 10 * 1024 * 1024;
const CHUNK_TIMEOUT_MS = 15 * 1000;

// Character codes the stream scanner needs. JSON structure is pure ASCII, so scanning
// UTF-16 code units is exact: no multi-byte sequence can contain one of these.
const QUOTE = 0x22; // "
const BACKSLASH = 0x5c; // \
const OPEN_BRACE = 0x7b; // {
const CLOSE_BRACE = 0x7d; // }
const OPEN_BRACKET = 0x5b; // [
const CLOSE_BRACKET = 0x5d; // ]
const SPACE = 0x20;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;

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

/**
 * Splits the text a transport delivers into JSON-RPC messages.
 *
 * Stream mode finds message boundaries with a single linear scan that tracks string
 * literals (with escapes) and bracket depth: a message is complete exactly when the depth
 * returns to zero. `JSON.parse` runs once per complete message, never on a growing prefix,
 * so the cost is linear in the number of bytes received whatever the peer sends. An earlier
 * version split on `}{`-like delimiters and re-parsed the accumulated text after every
 * fragment, which let a peer block the event loop for minutes with a few hundred KB of
 * unparseable output.
 */
export class ChunkResponseParser {
	// Stream mode: the pieces (in arrival order) of the message that was still open at the end
	// of the previous call, and the scanner state at the end of the last piece.
	private pendingParts: string[] = [];
	private pendingLength = 0;
	private depth = 0;
	private inString = false;
	private escaped = false;
	private lastChunkTimeout: NodeJS.Timeout | undefined;
	private _clearQueues: ((error: InvalidResponseError) => void) | undefined;
	private readonly eventEmitter: EventEmitterLike;
	private readonly autoReconnect: boolean;
	private readonly framed: boolean;

	public constructor(
		eventEmitter: EventEmitterLike,
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
	 * Drops any partial message and its completion timer.
	 *
	 * Must be called whenever the underlying connection is reset, reconnected or closed: bytes
	 * left over from a previous connection must never be prepended to the first message of the
	 * next one.
	 */
	public reset(): void {
		this.clearChunkTimeout();
		this.pendingParts = [];
		this.pendingLength = 0;
		this.depth = 0;
		this.inString = false;
		this.escaped = false;
	}

	public parseResponse(data: string): JsonRpcResponse[] {
		return this.framed ? this.parseFrame(data) : this.parseStream(data);
	}

	private clearChunkTimeout(): void {
		if (this.lastChunkTimeout) {
			clearTimeout(this.lastChunkTimeout);
			this.lastChunkTimeout = undefined;
		}
	}

	/**
	 * A malformed message from the peer is only reported when someone is listening: emitting
	 * `error` on a Node `EventEmitter` without a listener throws, and the library's own emitter
	 * drops it, so an unobserved parser error must never turn into an uncaught exception inside a
	 * socket `message`/`data` callback.
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

	private parseFrame(data: string): JsonRpcResponse[] {
		if (data.length > MAX_CHUNK_BYTES) {
			this.emitError('Chunk size exceeds maximum', true);
			return [];
		}
		let result: unknown;
		try {
			result = JSON.parse(data);
		} catch {
			// A whole-message transport delivered something that is not JSON. It is not the
			// prefix of a later message, so it is reported and dropped here rather than kept
			// and prepended to everything that follows.
			this.emitError('Malformed JSON-RPC message received from the node');
			return [];
		}
		// A JSON-RPC message is an object (or a batch array of objects). Any other JSON value
		// (`null`, a number, a string, ...) is malformed input from the peer, never a response,
		// and must not be handed to the response handlers.
		if (typeof result !== 'object' || isNullish(result)) {
			this.emitError('Non-object JSON-RPC message received from the node');
			return [];
		}
		return [result as JsonRpcResponse];
	}

	private parseStream(data: string): JsonRpcResponse[] {
		const results: JsonRpcResponse[] = [];
		// Index in `data` where the current piece of the open message starts. While a message
		// carried over from an earlier call is still open this stays 0.
		let start = 0;
		let garbage = false;
		let malformed = false;
		let oversized = false;

		for (let i = 0; i < data.length; i += 1) {
			const c = data.charCodeAt(i);
			if (this.depth === 0) {
				// Between messages only whitespace is allowed. Anything else (a bare literal, a
				// stray bracket, text) cannot start a JSON-RPC message and is skipped.
				if (c === OPEN_BRACE || c === OPEN_BRACKET) {
					start = i;
					this.depth = 1;
				} else if (c !== SPACE && c !== TAB && c !== LINE_FEED && c !== CARRIAGE_RETURN) {
					garbage = true;
				}
			} else if (this.inString) {
				if (this.escaped) {
					this.escaped = false;
				} else if (c === BACKSLASH) {
					this.escaped = true;
				} else if (c === QUOTE) {
					this.inString = false;
				}
			} else if (c === QUOTE) {
				this.inString = true;
			} else if (c === OPEN_BRACE || c === OPEN_BRACKET) {
				this.depth += 1;
			} else if (c === CLOSE_BRACE || c === CLOSE_BRACKET) {
				this.depth -= 1;
				if (this.depth === 0) {
					const piece = data.slice(start, i + 1);
					if (this.pendingLength + piece.length > MAX_CHUNK_BYTES) {
						oversized = true;
					} else {
						const text =
							this.pendingParts.length > 0
								? this.pendingParts.join('') + piece
								: piece;
						try {
							// The text is bracket balanced and starts with `{` or `[`, so a
							// successful parse is always an object or an array.
							results.push(JSON.parse(text) as JsonRpcResponse);
						} catch {
							malformed = true;
						}
					}
					// The message that owned the timer is finished either way. A message that
					// opens later in this call gets a fresh deadline below.
					this.clearChunkTimeout();
					this.pendingParts = [];
					this.pendingLength = 0;
				}
			}
		}

		if (this.depth > 0) {
			const piece = data.slice(start);
			this.pendingParts.push(piece);
			this.pendingLength += piece.length;
			if (this.pendingLength > MAX_CHUNK_BYTES) {
				this.reset();
				this.emitError('Chunk size exceeds maximum', true);
				return results;
			}
			// Bound the lifetime of the incomplete message, not the idle time between chunks.
			// Subsequent traffic must not keep a poisoned prefix alive forever.
			if (this.lastChunkTimeout === undefined) {
				this.lastChunkTimeout = setTimeout(() => {
					this.reset();
					this.emitError('Chunk timeout', !this.autoReconnect);
				}, CHUNK_TIMEOUT_MS);
				// A half-received message must not, by itself, keep a Node process alive (I-11).
				if (typeof this.lastChunkTimeout.unref === 'function') {
					this.lastChunkTimeout.unref();
				}
			}
		} else {
			this.reset();
		}

		// Report each kind of problem once per call: a peer that streams garbage must not be
		// able to turn every byte into an `error` event with its own stack trace.
		if (oversized) this.emitError('Chunk size exceeds maximum', true);
		if (malformed) this.emitError('Malformed JSON-RPC message received from the node');
		if (garbage) this.emitError('Non-object JSON-RPC message received from the node');
		return results;
	}
}
