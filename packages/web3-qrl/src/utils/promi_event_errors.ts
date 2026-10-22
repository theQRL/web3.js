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
import { BaseWeb3Error, TransactionError } from '@theqrl/web3-errors';
import { DataFormat, TransactionReceipt } from '@theqrl/web3-types';
import { SendSignedTransactionEvents, SendTransactionEvents } from '../types.js';

/** The PromiEvent returned by `sendTransaction` and `sendSignedTransaction`. */
export type SendPromiEvent<
	ReturnFormat extends DataFormat,
	ResolveType = TransactionReceipt,
> = Web3PromiEvent<
	ResolveType,
	SendTransactionEvents<ReturnFormat> | SendSignedTransactionEvents<ReturnFormat>
>;

/**
 * The typed error carried by an `error` event. Errors raised by the library are already
 * {@link BaseWeb3Error}s and are passed through; anything else (a `TypeError` from a malformed
 * reply, a plain `Error` thrown by a dependency) is wrapped in a {@link TransactionError} with
 * the original as `innerError`, so listeners always receive a typed error (M-7b).
 */
export const toTransactionError = (error: unknown): BaseWeb3Error => {
	if (error instanceof BaseWeb3Error) return error;
	const wrapped = new TransactionError(
		error instanceof Error ? error.message : BaseWeb3Error.convertToString(error),
	);
	if (error instanceof Error) wrapped.innerError = error;
	return wrapped;
};

/**
 * Reports a failure of a confirmation watcher. The watcher runs after the send promise has
 * settled, so the `error` event is the only channel left: the error is emitted when a listener
 * is attached and logged otherwise, so that the failure stays observable instead of being
 * dropped (M-7c, L-54).
 */
export const reportWatcherError = <ReturnFormat extends DataFormat, ResolveType>(
	promiEvent: SendPromiEvent<ReturnFormat, ResolveType>,
	error: unknown,
): void => {
	if (promiEvent.listenerCount('error') > 0) {
		promiEvent.emit('error', toTransactionError(error));
		return;
	}
	console.warn(
		'An error happened while watching a transaction for confirmations; attach an "error" listener to the PromiEvent to receive it',
		error,
	);
};
