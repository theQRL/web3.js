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
import { Web3PromiEvent } from '@theqrl/web3-core';
import { InvalidResponseError, TransactionError } from '@theqrl/web3-errors';
import { DEFAULT_RETURN_FORMAT, TransactionReceipt } from '@theqrl/web3-types';

import { reportWatcherError, toTransactionError } from '../../../src/utils/promi_event_errors';
import { SendTransactionEvents } from '../../../src/types';

describe('PromiEvent error helpers', () => {
	describe('toTransactionError (M-7b)', () => {
		it('passes a web3 error through unchanged', () => {
			const error = new InvalidResponseError({
				jsonrpc: '2.0',
				id: 1,
				error: { code: -32000, message: 'nonce too low' },
			});
			expect(toTransactionError(error)).toBe(error);
		});

		it('wraps a plain Error in a TransactionError that keeps it as innerError', () => {
			const error = new TypeError("Cannot read properties of null (reading 'raw')");
			const wrapped = toTransactionError(error);
			expect(wrapped).toBeInstanceOf(TransactionError);
			expect(wrapped.message).toBe(error.message);
			expect(wrapped.innerError).toBe(error);
		});

		it('wraps a non-Error value', () => {
			const wrapped = toTransactionError('boom');
			expect(wrapped).toBeInstanceOf(TransactionError);
			expect(wrapped.message).toBe('"boom"');
			expect(wrapped.innerError).toBeUndefined();
		});
	});

	describe('reportWatcherError (M-7c)', () => {
		let promiEvent: Web3PromiEvent<
			TransactionReceipt,
			SendTransactionEvents<typeof DEFAULT_RETURN_FORMAT>
		>;

		beforeEach(() => {
			promiEvent = new Web3PromiEvent(() => undefined);
		});

		it('emits the typed error when an error listener is attached', () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
			const listener = jest.fn();
			promiEvent.on('error', listener);

			reportWatcherError(promiEvent, new Error('header not found'));

			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener.mock.calls[0][0]).toBeInstanceOf(TransactionError);
			expect(warn).not.toHaveBeenCalled();
		});

		it('warns instead of throwing when no error listener is attached', () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
			const error = new Error('header not found');

			expect(() => reportWatcherError(promiEvent, error)).not.toThrow();

			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0][1]).toBe(error);
		});
	});
});
