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
	waitWithTimeout,
	rejectIfTimeout,
	isPromise,
	pollTillDefined,
	rejectIfConditionAtInterval,
} from '../../src/promise_helpers';

describe('promise helpers', () => {
	describe('isPromise', () => {
		it('detect Promise objects', () => {
			// eslint-disable-next-line  @typescript-eslint/no-empty-function
			expect(isPromise(new Promise(() => {}))).toBe(true);
		});
		it('detect Promise functions', () => {
			// eslint-disable-next-line  @typescript-eslint/no-empty-function
			const func = () => {};
			// eslint-disable-next-line  @typescript-eslint/no-empty-function
			func.then = () => {};
			expect(isPromise(func)).toBe(true);
		});
	});

	describe('waitWithTimeout', () => {
		it('resolve', async () => {
			await waitWithTimeout(
				new Promise(resolve => {
					resolve('resolved');
				}),
				1000,
			).then(val => expect(val).toBe('resolved'));
		});
		it('timeout', async () => {
			const asyncHelper = async () => {
				await new Promise(resolve => {
					setTimeout(() => {
						resolve('resolved');
					}, 200);
				});
			};
			await expect(waitWithTimeout(asyncHelper, 100, new Error('time out'))).rejects.toThrow(
				new Error('time out'),
			);
		});
	});
	describe('rejectIfTimeout', () => {
		it('%s', async () => {
			const [timerId, promise] = rejectIfTimeout(100, new Error('value'));
			// eslint-disable-next-line jest/no-conditional-expect
			await promise.catch(value => expect(value).toEqual(new Error('value')));
			clearTimeout(timerId);
		});
	});

	describe('rejectIfTimeout throw', () => {
		it('%s', async () => {
			const dummyError = new Error('error');
			const asyncHelper = async () => {
				await new Promise((_, reject) => {
					reject(dummyError);
				});
			};
			await expect(waitWithTimeout(asyncHelper, 100, new Error('time out'))).rejects.toThrow(
				dummyError,
			);
		});
	});

	describe('pollTillDefined', () => {
		it('returns when immediately resolved', async () => {
			const asyncHelper = async () =>
				new Promise(resolve => {
					resolve('resolved');
				});
			await expect(pollTillDefined(asyncHelper, 100)).resolves.toBe('resolved');
		});
		it('returns if later resolved', async () => {
			let counter = 0;
			const asyncHelper = async () => {
				if (counter === 0) {
					counter += 1;
					return undefined;
				}
				return new Promise(resolve => {
					resolve('resolved');
				});
			};

			await expect(pollTillDefined(asyncHelper, 100)).resolves.toBe('resolved');
		});
		it('throws if later throws', async () => {
			const dummyError = new Error('error');
			let counter = 0;
			const asyncHelper = async () => {
				if (counter === 0) {
					counter += 1;
					return undefined;
				}
				return new Promise((_, reject) => {
					reject(dummyError);
				});
			};
			await expect(pollTillDefined(asyncHelper, 100)).rejects.toThrow(dummyError);
		});
	});

	describe('rejectIfConditionAtInterval', () => {
		it('reject if later throws', async () => {
			const dummyError = new Error('error');
			let counter = 0;
			const asyncHelper = async () => {
				if (counter === 0) {
					counter += 1;
					return undefined;
				}
				return dummyError;
			};
			const [intervalId, promiseToError] = rejectIfConditionAtInterval(asyncHelper, 100);
			await expect(promiseToError).rejects.toThrow(dummyError);

			clearInterval(intervalId);
		});
	});

	describe('third audit pass regressions (L-25)', () => {
		afterEach(() => {
			jest.useRealTimers();
		});

		it('isPromise is false for null and undefined', () => {
			// eslint-disable-next-line no-null/no-null
			expect(isPromise(null)).toBe(false);
			expect(isPromise(undefined)).toBe(false);
		});

		it('rejectIfConditionAtInterval rejects when the condition throws and stops polling', async () => {
			jest.useFakeTimers();
			let calls = 0;
			const [intervalId, promise] = rejectIfConditionAtInterval(async () => {
				calls += 1;
				await Promise.resolve();
				throw new Error(`cond failed #${calls}`);
			}, 100);
			const assertion = expect(promise).rejects.toThrow('cond failed #1');

			await jest.advanceTimersByTimeAsync(100);
			await assertion;

			await jest.advanceTimersByTimeAsync(1_000);
			expect(calls).toBe(1);
			clearInterval(intervalId);
		});

		it('waitWithTimeout clears its timer when the awaitable rejects', async () => {
			jest.useFakeTimers();
			await expect(
				waitWithTimeout(Promise.reject(new Error('boom')), 60_000, new Error('timeout')),
			).rejects.toThrow('boom');
			expect(jest.getTimerCount()).toBe(0);
		});
	});
});
