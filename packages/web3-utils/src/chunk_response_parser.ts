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
import { JsonRpcId, JsonRpcResponse } from '@theqrl/web3-types';
import { InvalidResponseError, ResponseTooLargeError } from '@theqrl/web3-errors';
import type { EventEmitterLike } from './event_emitter.js';
import { DEFAULT_MAX_RESPONSE_BYTES, validatePositiveInteger } from './provider_bounds.js';
import { isNullish } from './validation.js';

const CHUNK_TIMEOUT_MS = 15 * 1000;

/**
 * Longest prefix of an oversized message that is searched for request ids. JSON-RPC servers
 * (go-qrl among them) write `jsonrpc` and `id` ahead of `result`, so the ids of a reply sit in
 * its first few hundred characters; bounding the scan keeps the cost of a hostile message
 * constant, and in stream mode the prefix is all that is kept of a message being discarded.
 */
const ID_SCAN_LIMIT = 64 * 1024;

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

/** Inspect only envelope members in a bounded prefix, never ids nested in result data. */
const inspectEnvelopePrefix = (text: string): { ids: JsonRpcId[]; notification: boolean } => {
	const scanned = text.slice(0, ID_SCAN_LIMIT);
	const stack: string[] = [];
	const ids = new Set<JsonRpcId>();
	let rootArray = false;
	let hasMethod = false;
	let hasId = false;
	for (let index = 0; index < scanned.length; index += 1) {
		const char = scanned[index];
		if (char === '{' || char === '[') {
			if (stack.length === 0) rootArray = char === '[';
			stack.push(char);
		} else if (char === '}' || char === ']') {
			stack.pop();
		} else if (char === '"') {
			const start = index;
			index += 1;
			for (; index < scanned.length; index += 1) {
				if (scanned[index] === '\\') index += 1;
				else if (scanned[index] === '"') break;
			}
			if (index >= scanned.length) break;
			const isEnvelope =
				stack.length === (rootArray ? 2 : 1) && stack[stack.length - 1] === '{';
			if (!isEnvelope) continue;
			let cursor = index + 1;
			while (/\s/.test(scanned[cursor] ?? '') && cursor < scanned.length) cursor += 1;
			if (scanned[cursor] !== ':') continue;
			let key: string;
			try {
				key = JSON.parse(scanned.slice(start, index + 1)) as string;
			} catch {
				continue;
			}
			if (key === 'method' && !rootArray) hasMethod = true;
			if (key !== 'id') continue;
			hasId = true;
			const match = /^:\s*("(?:[^"\\]|\\.){0,128}"|-?(?:0|[1-9][0-9]*))(?=\s*[,}])/.exec(
				scanned.slice(cursor),
			);
			if (!match) continue;
			try {
				const value: unknown = JSON.parse(match[1]);
				if (
					typeof value === 'string' ||
					(typeof value === 'number' && Number.isSafeInteger(value))
				)
					ids.add(value);
			} catch {
				/* An incomplete prefix cannot establish a response id. */
			}
		}
	}
	return { ids: [...ids], notification: !rootArray && hasMethod && !hasId };
};

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
	/**
	 * Largest message accepted, measured in UTF-16 code units of the decoded text. That count
	 * never exceeds the text's UTF-8 byte count, so a reply within the provider's
	 * `maxResponseBytes` is never refused; the WebSocket transport enforces the same bound on
	 * the wire through `maxPayload`.
	 * @defaultValue {@link DEFAULT_MAX_RESPONSE_BYTES} (10 MiB)
	 */
	maxResponseBytes?: number;
}

/**
 * Receives every protocol error the parser detects. `requestIds` is given for an oversized
 * message and lists the ids it carried: the owner fails exactly those requests. Without ids
 * (or with none found) the owner fails every outstanding request, since it cannot tell which
 * reply was lost.
 */
export type ChunkResponseParserErrorHandler = (
	error: InvalidResponseError | ResponseTooLargeError,
	requestIds?: JsonRpcId[],
) => void;

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
 *
 * A message above `maxResponseBytes` is never parsed. It is reported as a
 * `ResponseTooLargeError` against the request ids found in its text, so an unrelated request
 * in flight on the same connection is unaffected (P4-M-5). In stream mode the structure of an
 * oversized message is still followed while its text is dropped, so that the bytes completing
 * it are not mistaken for the start of the next message; a message that never completes is
 * bounded by the chunk timeout like any other.
 */
export class ChunkResponseParser {
	// Stream mode: the text kept of the message that was still open at the end of the previous
	// call (all of it, or a bounded prefix while discarding), and the scanner state at the end
	// of the last piece.
	private pendingParts: string[] = [];
	/** Code units of the open message seen so far, kept or not. */
	private messageLength = 0;
	/** The open message exceeded the bound: only its boundaries are tracked, its text dropped. */
	private discarding = false;
	private depth = 0;
	private inString = false;
	private escaped = false;
	private lastChunkTimeout: NodeJS.Timeout | undefined;
	private _onProtocolError: ChunkResponseParserErrorHandler | undefined;
	private readonly eventEmitter: EventEmitterLike;
	private readonly framed: boolean;
	private readonly maxBytes: number;

	public constructor(
		eventEmitter: EventEmitterLike,
		_autoReconnect: boolean,
		options: ChunkResponseParserOptions = {},
	) {
		this.eventEmitter = eventEmitter;
		this.framed = options.framed ?? false;
		// Validated here as well: an unusable bound must fail loudly, not disable the check.
		this.maxBytes = validatePositiveInteger(
			options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
			'maxResponseBytes',
		);
	}

	/**
	 * Registers the handler that fails requests on a protocol error; see
	 * {@link ChunkResponseParserErrorHandler} for when it receives request ids.
	 */
	public onError(handler?: ChunkResponseParserErrorHandler) {
		this._onProtocolError = handler;
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
		this.messageLength = 0;
		this.discarding = false;
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
		if (clearQueues) this._onProtocolError?.(error);
		if (this.eventEmitter.listenerCount('error') > 0) {
			this.eventEmitter.emit('error', error);
		}
	}

	/**
	 * An oversized message is dropped unparsed and the requests it answers are failed by the
	 * ids found in `text`; the handler falls back to failing every request when there is none.
	 * `length` is the size of the whole message, in code units, kept or not.
	 */
	private reportOversized(text: string, length: number): void {
		const error = new ResponseTooLargeError(this.maxBytes, length);
		const { ids, notification } = inspectEnvelopePrefix(text);
		if (!notification) this._onProtocolError?.(error, ids);
		if (this.eventEmitter.listenerCount('error') > 0) {
			this.eventEmitter.emit('error', error);
		}
	}

	private parseFrame(data: string): JsonRpcResponse[] {
		if (data.length > this.maxBytes) {
			this.reportOversized(data, data.length);
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
					const length = this.messageLength + piece.length;
					if (this.discarding) {
						// Only the retained prefix can still name the requests it answers.
						this.reportOversized(this.pendingParts.join(''), length);
					} else if (length > this.maxBytes) {
						this.reportOversized(this.pendingParts.join('') + piece, length);
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
					this.messageLength = 0;
					this.discarding = false;
				}
			}
		}

		if (this.depth > 0) {
			const piece = data.slice(start);
			this.messageLength += piece.length;
			if (this.discarding) {
				// Only the boundary of the message is still of interest.
			} else if (this.messageLength > this.maxBytes) {
				// The open message is over the bound. It is not abandoned: its structure is still
				// followed so that the bytes completing it are not taken for the start of the next
				// message (the stream would otherwise be out of step until the peer happened to
				// resynchronise it), but its text is dropped apart from the prefix that may name
				// the requests it answers.
				this.discarding = true;
				this.pendingParts = [(this.pendingParts.join('') + piece).slice(0, ID_SCAN_LIMIT)];
			} else {
				this.pendingParts.push(piece);
			}
			// Bound the lifetime of the incomplete message, not the idle time between chunks.
			// Subsequent traffic must not keep a poisoned prefix alive forever.
			if (this.lastChunkTimeout === undefined) {
				this.lastChunkTimeout = setTimeout(() => {
					this.reset();
					this.emitError('Chunk timeout', true);
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
		if (malformed) this.emitError('Malformed JSON-RPC message received from the node');
		if (garbage) this.emitError('Non-object JSON-RPC message received from the node');
		return results;
	}
}
