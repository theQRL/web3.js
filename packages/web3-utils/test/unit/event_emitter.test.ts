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
import { EventEmitter } from '../../src/event_emitter';

describe('EventEmitter', () => {
	it('calls listeners in registration order with every argument and reports whether any ran', () => {
		const emitter = new EventEmitter();
		const calls: string[] = [];
		emitter.on('data', (a: number, b: string) => calls.push(`first:${a}:${b}`));
		emitter.addListener('data', (a: number, b: string) => calls.push(`second:${a}:${b}`));
		emitter.prependListener('data', (a: number, b: string) => calls.push(`zero:${a}:${b}`));

		expect(emitter.emit('data', 1, 'x')).toBe(true);
		expect(calls).toEqual(['zero:1:x', 'first:1:x', 'second:1:x']);
		expect(emitter.emit('nothing')).toBe(false);
	});

	it('drops an error event without a listener instead of throwing', () => {
		const emitter = new EventEmitter();
		expect(() => emitter.emit('error', new Error('boom'))).not.toThrow();
		expect(emitter.emit('error', new Error('boom'))).toBe(false);

		const seen: unknown[] = [];
		emitter.on('error', (e: unknown) => seen.push(e));
		const error = new Error('observed');
		expect(emitter.emit('error', error)).toBe(true);
		expect(seen).toEqual([error]);
	});

	it('runs once listeners a single time and lets them be removed before they fire', () => {
		const emitter = new EventEmitter();
		const onceCalls: number[] = [];
		const listener = (v: number) => onceCalls.push(v);
		emitter.once('tick', listener);
		emitter.prependOnceListener('tick', (v: number) => onceCalls.push(v * 10));
		expect(emitter.listenerCount('tick')).toBe(2);
		expect(emitter.listeners('tick')).toEqual([expect.any(Function), listener]);

		emitter.emit('tick', 1);
		emitter.emit('tick', 2);
		expect(onceCalls).toEqual([10, 1]);
		expect(emitter.listenerCount('tick')).toBe(0);

		emitter.once('later', listener);
		emitter.off('later', listener);
		expect(emitter.emit('later', 3)).toBe(false);
	});

	it('removes the most recently added matching listener and supports removeAllListeners', () => {
		const emitter = new EventEmitter();
		const calls: string[] = [];
		const a = () => calls.push('a');
		emitter.on('e', a);
		emitter.on('e', a);
		emitter.removeListener('e', a);
		expect(emitter.listenerCount('e')).toBe(1);
		emitter.on('f', a);
		expect(emitter.eventNames()).toEqual(['e', 'f']);

		emitter.removeAllListeners('e');
		expect(emitter.eventNames()).toEqual(['f']);
		emitter.removeAllListeners();
		expect(emitter.eventNames()).toEqual([]);
		expect(emitter.rawListeners('f')).toEqual([]);
	});

	it('removes only the fired once registration of a function also registered with on (P4-L-22)', () => {
		const countPerEmit = (emitter: EventEmitter, emits: number) => {
			let calls = 0;
			const listener = () => {
				calls += 1;
			};
			return {
				listener,
				run: () => {
					const perEmit: number[] = [];
					for (let index = 0; index < emits; index += 1) {
						const before = calls;
						emitter.emit('x');
						perEmit.push(calls - before);
					}
					return perEmit;
				},
			};
		};

		const onceFirst = new EventEmitter();
		const first = countPerEmit(onceFirst, 4);
		onceFirst.once('x', first.listener);
		onceFirst.on('x', first.listener);
		// Node's emitter: 2,1,1,1. The `on()` entry used to be the one removed (2,1,0,0).
		expect(first.run()).toEqual([2, 1, 1, 1]);
		expect(onceFirst.listenerCount('x')).toBe(1);

		const onFirst = new EventEmitter();
		const second = countPerEmit(onFirst, 3);
		onFirst.on('x', second.listener);
		onFirst.once('x', second.listener);
		expect(second.run()).toEqual([2, 1, 1]);
		expect(onFirst.listenerCount('x')).toBe(1);

		// A once entry that an earlier listener removed during the same emit still runs from
		// the snapshot, once, and leaves nothing behind.
		const removedMidEmit = new EventEmitter();
		const calls: string[] = [];
		const late = () => calls.push('late');
		removedMidEmit.on('x', () => {
			calls.push('early');
			removedMidEmit.off('x', late);
		});
		removedMidEmit.once('x', late);
		removedMidEmit.emit('x');
		removedMidEmit.emit('x');
		expect(calls).toEqual(['early', 'late', 'early']);
		expect(removedMidEmit.listenerCount('x')).toBe(1);
	});

	it('tolerates listeners that add or remove listeners while emitting', () => {
		const emitter = new EventEmitter();
		const calls: string[] = [];
		const second = () => calls.push('second');
		emitter.on('e', () => {
			calls.push('first');
			emitter.off('e', second);
			emitter.on('e', () => calls.push('added'));
		});
		emitter.on('e', second);

		emitter.emit('e');
		expect(calls).toEqual(['first', 'second']);
		emitter.emit('e');
		expect(calls).toEqual(['first', 'second', 'first', 'added']);
	});

	it('warns once per event name when the listener threshold is exceeded and validates the threshold', () => {
		const emitter = new EventEmitter();
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		try {
			expect(emitter.getMaxListeners()).toBe(EventEmitter.defaultMaxListeners);
			emitter.setMaxListeners(2);
			expect(emitter.getMaxListeners()).toBe(2);
			for (let i = 0; i < 5; i += 1) emitter.on('many', () => undefined);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0][0]).toContain('3 many listeners added');

			emitter.setMaxListeners(0);
			for (let i = 0; i < 20; i += 1) emitter.on('unbounded', () => undefined);
			expect(warn).toHaveBeenCalledTimes(1);

			expect(() => emitter.setMaxListeners(-1)).toThrow(RangeError);
			expect(() => emitter.setMaxListeners(Number.NaN)).toThrow(RangeError);
			expect(() => emitter.on('e', 'not a function' as unknown as () => void)).toThrow(TypeError);
		} finally {
			warn.mockRestore();
		}
	});
});
