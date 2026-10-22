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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventEmitterListener = (...args: any[]) => void;
export type EventEmitterEventName = string | symbol;

/**
 * Subset of the event-emitter contract that the library relies on. Node's `events.EventEmitter`
 * satisfies it, which keeps test doubles built on the Node class usable.
 */
export interface EventEmitterLike {
	on(eventName: EventEmitterEventName, listener: EventEmitterListener): this;
	once(eventName: EventEmitterEventName, listener: EventEmitterListener): this;
	off(eventName: EventEmitterEventName, listener: EventEmitterListener): this;
	removeListener(eventName: EventEmitterEventName, listener: EventEmitterListener): this;
	removeAllListeners(eventName?: EventEmitterEventName): this;
	emit(eventName: EventEmitterEventName, ...args: unknown[]): boolean;
	listenerCount(eventName: EventEmitterEventName): number;
}

interface RegisteredListener {
	listener: EventEmitterListener;
	once: boolean;
}

/**
 * A dependency-free event emitter with the Node `events.EventEmitter` API surface the library
 * uses. It is used instead of the Node core module so that browser bundles do not need an
 * `events` polyfill, and it differs from Node in one deliberate way: emitting `error` without a
 * listener returns `false` instead of throwing. Several internal paths report failures through
 * `error` events from inside promise callbacks and socket handlers; with the Node semantics a
 * consumer that never attached an `error` listener would be terminated by an unhandled exception
 * triggered by a remote peer.
 */
export class EventEmitter implements EventEmitterLike {
	public static defaultMaxListeners = 10;

	private _events = new Map<EventEmitterEventName, RegisteredListener[]>();
	private readonly _warned = new Set<EventEmitterEventName>();
	private _maxListeners: number | undefined;

	public on(eventName: EventEmitterEventName, listener: EventEmitterListener): this {
		return this._addListener(eventName, listener, false, false);
	}

	public addListener(eventName: EventEmitterEventName, listener: EventEmitterListener): this {
		return this.on(eventName, listener);
	}

	public prependListener(eventName: EventEmitterEventName, listener: EventEmitterListener): this {
		return this._addListener(eventName, listener, false, true);
	}

	public once(eventName: EventEmitterEventName, listener: EventEmitterListener): this {
		return this._addListener(eventName, listener, true, false);
	}

	public prependOnceListener(eventName: EventEmitterEventName, listener: EventEmitterListener): this {
		return this._addListener(eventName, listener, true, true);
	}

	public off(eventName: EventEmitterEventName, listener: EventEmitterListener): this {
		const registered = this._events.get(eventName);
		if (!registered) return this;
		// Remove the most recently added matching entry, like Node does.
		for (let i = registered.length - 1; i >= 0; i -= 1) {
			if (registered[i].listener === listener) {
				registered.splice(i, 1);
				break;
			}
		}
		if (registered.length === 0) this._events.delete(eventName);
		return this;
	}

	public removeListener(eventName: EventEmitterEventName, listener: EventEmitterListener): this {
		return this.off(eventName, listener);
	}

	public removeAllListeners(eventName?: EventEmitterEventName): this {
		if (eventName === undefined) {
			// A fresh map (not `clear()`), so a shallow copy of an emitter made with `Object.assign`
			// can drop its listeners without touching the original's, as with Node's emitter.
			this._events = new Map();
		} else {
			this._events.delete(eventName);
		}
		return this;
	}

	/**
	 * Calls every listener registered for `eventName` with `args`. Returns `true` when at least
	 * one listener was called. Unlike Node, an `error` event without a listener is dropped
	 * (returns `false`) instead of being thrown.
	 */
	public emit(eventName: EventEmitterEventName, ...args: unknown[]): boolean {
		const registered = this._events.get(eventName);
		if (!registered || registered.length === 0) return false;
		// Iterate over a snapshot so listeners may add or remove listeners while emitting.
		for (const entry of [...registered]) {
			if (entry.once) this.off(eventName, entry.listener);
			entry.listener(...args);
		}
		return true;
	}

	public listenerCount(eventName: EventEmitterEventName): number {
		return this._events.get(eventName)?.length ?? 0;
	}

	public listeners(eventName: EventEmitterEventName): EventEmitterListener[] {
		return (this._events.get(eventName) ?? []).map(entry => entry.listener);
	}

	public rawListeners(eventName: EventEmitterEventName): EventEmitterListener[] {
		return this.listeners(eventName);
	}

	public eventNames(): EventEmitterEventName[] {
		return [...this._events.keys()];
	}

	public setMaxListeners(n: number): this {
		if (typeof n !== 'number' || n < 0 || Number.isNaN(n)) {
			throw new RangeError(
				`The value of "n" is out of range. It must be a non-negative number. Received ${String(n)}`,
			);
		}
		this._maxListeners = n;
		return this;
	}

	public getMaxListeners(): number {
		return this._maxListeners ?? EventEmitter.defaultMaxListeners;
	}

	private _addListener(
		eventName: EventEmitterEventName,
		listener: EventEmitterListener,
		once: boolean,
		prepend: boolean,
	): this {
		if (typeof listener !== 'function') {
			throw new TypeError(
				`The "listener" argument must be of type function. Received ${typeof listener}`,
			);
		}
		let registered = this._events.get(eventName);
		if (!registered) {
			registered = [];
			this._events.set(eventName, registered);
		}
		if (prepend) {
			registered.unshift({ listener, once });
		} else {
			registered.push({ listener, once });
		}
		const max = this.getMaxListeners();
		if (max > 0 && registered.length > max && !this._warned.has(eventName)) {
			this._warned.add(eventName);
			// Same signal Node gives for a probable listener leak; the emitter keeps working.
			console.warn(
				`MaxListenersExceededWarning: Possible EventEmitter memory leak detected. ${
					registered.length
				} ${String(eventName)} listeners added. Use setMaxListeners() to increase limit`,
			);
		}
		return this;
	}
}
