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

import { isNullish } from '@theqrl/web3-validator';

export type Timer = ReturnType<typeof setInterval>;
export type Timeout = ReturnType<typeof setTimeout>;

/**
 * An alternative to the node function `isPromise` that exists in `util/types` because it is not available on the browser.
 * @param object - to check if it is a `Promise`
 * @returns `true` if it is an `object` or a `function` that has a `then` function. And returns `false` otherwise.
 */
export function isPromise(object: unknown): boolean {
	return (
		(typeof object === 'object' || typeof object === 'function') &&
		// `typeof null` is `'object'` (L-25).
		!isNullish(object) &&
		typeof (object as { then: unknown }).then === 'function'
	);
}

export type AsyncFunction<T, K = unknown> = (...args: K[]) => Promise<T>;

export function waitWithTimeout<T>(
	awaitable: Promise<T> | AsyncFunction<T>,
	timeout: number,
	error: Error,
): Promise<T>;
export function waitWithTimeout<T>(
	awaitable: Promise<T> | AsyncFunction<T>,
	timeout: number,
): Promise<T | undefined>;

/**
 * Wait for a promise but interrupt it if it did not resolve within a given timeout.
 * If the timeout reached, before the promise code resolve, either throw an error if an error object was provided, or return `undefined`.
 * @param awaitable - The promise or function to wait for.
 * @param timeout - The timeout in milliseconds.
 * @param error - (Optional) The error to throw if the timeout reached.
 */
export async function waitWithTimeout<T>(
	awaitable: Promise<T> | AsyncFunction<T>,
	timeout: number,
	error?: Error,
): Promise<T | undefined> {
	let timeoutId: Timeout | undefined;
	let result: T | undefined | Error;
	try {
		result = await Promise.race([
			awaitable instanceof Promise ? awaitable : awaitable(),
			new Promise<undefined | Error>((resolve, reject) => {
				timeoutId = setTimeout(() => (error ? reject(error) : resolve(undefined)), timeout);
				if (typeof timeoutId === 'object') timeoutId.unref?.();
			}),
		]);
	} finally {
		// The timer is dropped however the race ends: a rejected awaitable used to leave it
		// armed and keep the process alive for the full timeout (L-25).
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
	if (result instanceof Error) {
		throw result;
	}
	return result;
}
/**
 * Repeatedly calls an async function with a given interval until the result of the function is defined (not undefined or null),
 * or until a timeout is reached. It returns promise and intervalId.
 *
 * Each call is awaited in full: a call that takes longer than `interval` is neither abandoned
 * nor overlapped by the next tick (ticks that fall while a call is in flight are skipped), so a
 * slow node cannot make the poll discard every reply it receives (P4-M-3). Terminating the poll
 * is the caller's business (a polling or block timeout, or `clearInterval` on the returned id).
 *
 * @param func - The function to call.
 * @param interval - The interval in milliseconds.
 */
export function pollTillDefinedAndReturnIntervalId<T>(
	func: AsyncFunction<T>,
	interval: number,
): [Promise<Exclude<T, undefined>>, Timer] {
	let intervalId: Timer | undefined;
	let inFlight = false;
	let settled = false;
	const polledRes = new Promise<Exclude<T, undefined>>((resolve, reject) => {
		const poll = () => {
			if (inFlight || settled) {
				return;
			}
			inFlight = true;
			(async () => {
				try {
					const res = await func();

					if (!settled && !isNullish(res)) {
						settled = true;
						clearInterval(intervalId);
						resolve(res as unknown as Exclude<T, undefined>);
					}
				} catch (error) {
					if (!settled) {
						settled = true;
						clearInterval(intervalId);
						reject(error);
					}
				} finally {
					inFlight = false;
				}
			})() as unknown;
		};

		intervalId = setInterval(poll, interval);
		// The first attempt is made immediately.
		poll();
	});

	return [polledRes as unknown as Promise<Exclude<T, undefined>>, intervalId!];
}

/**
 * Repeatedly calls an async function with a given interval until the result of the function is defined (not undefined or null),
 * or until a timeout is reached.
 * pollTillDefinedAndReturnIntervalId() function should be used instead of pollTillDefined if you need IntervalId in result.
 * This function will be deprecated in next major release so use pollTillDefinedAndReturnIntervalId().
 * @param func - The function to call.
 * @param interval - The interval in milliseconds.
 */
export async function pollTillDefined<T>(
	func: AsyncFunction<T>,
	interval: number,
): Promise<Exclude<T, undefined>> {
	return pollTillDefinedAndReturnIntervalId(func, interval)[0];
}

/**
 * Enforce a timeout on a promise, so that it can be rejected if it takes too long to complete
 * @param timeout - The timeout to enforced in milliseconds.
 * @param error - The error to throw if the timeout is reached.
 * @returns A tuple of the timeout id and the promise that will be rejected if the timeout is reached.
 *
 * @example
 * ```ts
 * const [timerId, promise] = web3.utils.rejectIfTimeout(100, new Error('time out'));
 * ```
 */
export function rejectIfTimeout(timeout: number, error: Error): [Timer, Promise<never>] {
	let timeoutId: Timer | undefined;
	const rejectOnTimeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(error);
		}, timeout);
	});
	return [timeoutId!, rejectOnTimeout];
}
/**
 * Sets an interval that repeatedly executes the given cond function with the specified interval between each call.
 * If the condition is met, the interval is cleared and a Promise that rejects with the returned value is returned.
 * @param cond - The function/confition to call.
 * @param interval - The interval in milliseconds.
 * @returns - an array with the interval ID and the Promise.
 */
export function rejectIfConditionAtInterval<T>(
	cond: AsyncFunction<T | undefined>,
	interval: number,
): [Timer, Promise<never>] {
	let intervalId: Timer | undefined;
	let checking = false;
	const rejectIfCondition = new Promise<never>((_, reject) => {
		intervalId = setInterval(() => {
			if (checking) return;
			checking = true;
			(async () => {
				try {
					const error = await cond();
					if (error) {
						clearInterval(intervalId);
						reject(error);
					}
				} catch (error) {
					// A throwing condition settles the promise instead of producing one unhandled
					// rejection per tick while the promise stays pending forever (L-25).
					clearInterval(intervalId);
					// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- whatever `cond` threw is propagated as is
					reject(error);
				} finally {
					checking = false;
				}
			})() as unknown;
		}, interval);
	});
	return [intervalId!, rejectIfCondition];
}
