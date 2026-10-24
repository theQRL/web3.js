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
import { BaseWeb3Error, ContractExecutionError, TransactionError } from '@theqrl/web3-errors';
import { decodeContractErrorData, isAbiErrorFragment } from '@theqrl/web3-qrl-abi';
import { ContractAbi, DataFormat, TransactionReceipt } from '@theqrl/web3-types';
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

/**
 * Reports a terminal failure of the send pipeline on the event channel. It is called right after
 * the PromiEvent has been rejected, so neither a failing custom-error decode nor a throwing
 * `error` listener can leave the PromiEvent pending any more (P4-L-10): the rejection is the
 * primary report and anything that goes wrong here is logged.
 *
 * With an `error` listener attached (the documented event form) the failure is delivered there as
 * a typed error and the internal promise is marked as handled, so an event-only consumer is not
 * terminated by an unhandled rejection; without one the rejection is the only report, so the
 * PromiEvent has to be awaited or `.catch`ed (M-7b). Custom errors are decoded against the
 * caller's error ABI first, so contract wrappers need no internal `error` listener of their own.
 */
export const reportSendFailure = <ReturnFormat extends DataFormat, ResolveType>(
	promiEvent: SendPromiEvent<ReturnFormat, ResolveType>,
	error: unknown,
	contractAbi?: ContractAbi,
): void => {
	const hasErrorListener = promiEvent.listenerCount('error') > 0;
	if (hasErrorListener) {
		void promiEvent.catch(() => undefined);
	}
	try {
		if (error instanceof ContractExecutionError && contractAbi) {
			decodeContractErrorData(contractAbi.filter(isAbiErrorFragment), error.innerError);
		}
		if (hasErrorListener) {
			promiEvent.emit('error', toTransactionError(error));
		}
	} catch (listenerError) {
		console.warn(
			'An "error" listener of the transaction PromiEvent threw; the PromiEvent was already rejected with the original failure',
			listenerError,
		);
	}
};

/**
 * Reports an exception thrown by a listener of `sent`, `transactionHash` or `receipt` once the
 * transaction has been broadcast. The transaction is in the node's hands by then, so the
 * listener's failure must not reject the PromiEvent as if the send had failed: like a watcher
 * error it is delivered to an `error` listener when there is one and logged otherwise (P4-L-10).
 */
export const reportListenerError = <ReturnFormat extends DataFormat, ResolveType>(
	promiEvent: SendPromiEvent<ReturnFormat, ResolveType>,
	event: string,
	error: unknown,
): void => {
	if (promiEvent.listenerCount('error') > 0) {
		try {
			promiEvent.emit('error', toTransactionError(error));
		} catch (errorListenerError) {
			console.warn(
				'An "error" listener of the transaction PromiEvent threw while a listener failure was being reported',
				errorListenerError,
			);
		}
		return;
	}
	console.warn(
		`A "${event}" listener of the transaction PromiEvent threw after the transaction was broadcast; the transaction itself is unaffected. Attach an "error" listener to receive such failures`,
		error,
	);
};

/** Listener failures are reported without interrupting confirmation counting or cleanup. */
export const emitConfirmation = <ReturnFormat extends DataFormat, ResolveType>(
	promiEvent: SendPromiEvent<ReturnFormat, ResolveType>,
	confirmation: SendTransactionEvents<ReturnFormat>['confirmation'],
): void => {
	try {
		promiEvent.emit('confirmation', confirmation);
	} catch (error) {
		reportListenerError(promiEvent, 'confirmation', error);
	}
};
