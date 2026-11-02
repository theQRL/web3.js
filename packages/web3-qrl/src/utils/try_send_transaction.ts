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
import { Web3Context } from '@theqrl/web3-core';
import { QRLExecutionAPI, Bytes } from '@theqrl/web3-types';
import { AsyncFunction, rejectIfTimeout } from '@theqrl/web3-utils';
import { TransactionSendTimeoutError } from '@theqrl/web3-errors';

/**
 * Sends a transaction with a wall-clock deadline. Block deadlines start after the broadcast reply.
 * @param web3Context - the context to read the configurations from
 * @param sendTransactionFunc - the function that will send the transaction (could be sendTransaction or sendRawTransaction)
 * @param transactionHash - to be used inside the exception message if there will be any exceptions.
 * @returns the Promise<string> returned by the `sendTransactionFunc`.
 */
export async function trySendTransaction(
	web3Context: Web3Context<QRLExecutionAPI>,
	sendTransactionFunc: AsyncFunction<string>,
	transactionHash?: Bytes,
): Promise<string> {
	const [timeoutId, rejectOnTimeout] = rejectIfTimeout(
		web3Context.transactionSendTimeout,
		new TransactionSendTimeoutError({
			numberOfSeconds: web3Context.transactionSendTimeout / 1000,
			transactionHash,
		}),
	);

	try {
		// Block inclusion deadlines belong to waitForTransactionReceipt, after the node
		// returns a hash. A header during broadcast cannot establish that sending failed.
		return await Promise.race([Promise.resolve().then(sendTransactionFunc), rejectOnTimeout]);
	} finally {
		clearTimeout(timeoutId);
	}
}
