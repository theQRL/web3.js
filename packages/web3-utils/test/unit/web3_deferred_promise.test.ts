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

import { Web3DeferredPromise } from '../../src/web3_deferred_promise';

describe('Web3DeferredPromise', () => {
	describe('getState Web3DeferredPromise', () => {
		it('%s', () => {
			const promise = new Web3DeferredPromise();
			expect(promise.state).toBe('pending');
		});
	});
	describe('Web3DeferredPromise resolves promise', () => {
		it('%s', () => {
			const promise = new Web3DeferredPromise();
			promise.resolve('mockValue');
			expect(promise.state).toBe('fulfilled');
		});
	});
	describe('Web3DeferredPromise reject promise', () => {
		it('%s', async () => {
			const promise = new Web3DeferredPromise();
			promise.reject(new Error('fail'));
			// eslint-disable-next-line jest/no-conditional-expect
			await promise.catch(val => expect(val).toEqual(new Error('fail')));
			expect(promise.state).toBe('rejected');
		});
	});

	describe('Web3DeferredPromise timeout', () => {
		it('%s', async () => {
			const promise = new Web3DeferredPromise({
				timeout: 100,
				eagerStart: true,
				timeoutMessage: 'DeferredPromise timed out',
			});
			// eslint-disable-next-line jest/no-conditional-expect
			await promise.catch(val => expect(val).toEqual(new Error('DeferredPromise timed out')));
			expect(promise.state).toBe('rejected');
		});
	});

	describe('settles once (I-11)', () => {
		it('keeps the fulfilled state when reject() follows resolve()', async () => {
			const promise = new Web3DeferredPromise<number>();
			promise.resolve(1);
			promise.reject(new Error('late'));
			expect(promise.state).toBe('fulfilled');
			await expect(promise).resolves.toBe(1);
		});

		it('keeps the rejected state when resolve() follows reject()', async () => {
			const promise = new Web3DeferredPromise<number>();
			promise.reject(new Error('first'));
			promise.resolve(1);
			expect(promise.state).toBe('rejected');
			await expect(promise).rejects.toThrow('first');
		});

		it('arms a single timer across repeated startTimer() calls and clears it on settle', () => {
			jest.useFakeTimers();
			try {
				const promise = new Web3DeferredPromise<number>({
					timeout: 1_000,
					eagerStart: false,
					timeoutMessage: 'x',
				});
				promise.startTimer();
				promise.startTimer();
				expect(jest.getTimerCount()).toBe(1);
				promise.resolve(1);
				expect(jest.getTimerCount()).toBe(0);
				promise.startTimer();
				expect(jest.getTimerCount()).toBe(0);
			} finally {
				jest.useRealTimers();
			}
		});
	});
});
