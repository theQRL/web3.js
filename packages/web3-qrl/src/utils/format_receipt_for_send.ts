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

import { DataFormat, FormatType, FMT_NUMBER, TransactionReceipt } from '@theqrl/web3-types';
import { FormatterError } from '@theqrl/web3-errors';
import { format } from '@theqrl/web3-utils';
import { transactionReceiptSchema } from '../schemas.js';
import { reportWatcherError, SendPromiEvent } from './promi_event_errors.js';

/** A presentation failure after mining must not replace the transaction's wire verdict. */
export const formatReceiptForSend = <ReturnFormat extends DataFormat, ResolveType>(
	receipt: TransactionReceipt,
	returnFormat: ReturnFormat,
	promiEvent: SendPromiEvent<ReturnFormat, ResolveType>,
): { receipt: FormatType<TransactionReceipt, ReturnFormat>; receiptFormat: ReturnFormat } => {
	try {
		return {
			receipt: format(transactionReceiptSchema, receipt, returnFormat),
			receiptFormat: returnFormat,
		};
	} catch (error) {
		if (!(error instanceof FormatterError)) throw error;
		// Keep an exact receipt available both on the error and on the successful send result.
		const receiptFormat = { number: FMT_NUMBER.HEX, bytes: returnFormat.bytes };
		const wireReceipt = format(transactionReceiptSchema, receipt, receiptFormat);
		reportWatcherError(promiEvent, Object.assign(error, { receipt: wireReceipt }));
		return {
			receipt: wireReceipt as FormatType<TransactionReceipt, ReturnFormat>,
			receiptFormat: receiptFormat as ReturnFormat,
		};
	}
};
