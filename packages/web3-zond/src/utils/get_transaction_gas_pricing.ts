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
import {
	ZondExecutionAPI,
	Numbers,
	Transaction,
	DataFormat,
	FormatType,
	ZOND_DATA_FORMAT,
} from '@theqrl/web3-types';
import { isNullish } from '@theqrl/web3-validator';
import { UnsupportedTransactionTypeError } from '@theqrl/web3-errors';
import { format } from '@theqrl/web3-utils';
// eslint-disable-next-line import/no-cycle
import { getBlock } from '../rpc_method_wrappers.js';
import { InternalTransaction } from '../types.js';
// eslint-disable-next-line import/no-cycle
import { getTransactionType } from './transaction_builder.js';

async function getEip1559GasPricing<ReturnFormat extends DataFormat>(
	transaction: FormatType<Transaction, typeof ZOND_DATA_FORMAT>,
	web3Context: Web3Context<ZondExecutionAPI>,
	returnFormat: ReturnFormat,
): Promise<FormatType<{ maxPriorityFeePerGas?: Numbers; maxFeePerGas?: Numbers }, ReturnFormat>> {
	const block = await getBlock(web3Context, web3Context.defaultBlock, false, returnFormat);

	return {
		maxPriorityFeePerGas: format(
			{ format: 'uint' },
			transaction.maxPriorityFeePerGas ?? web3Context.defaultMaxPriorityFeePerGas,
			returnFormat,
		),
		maxFeePerGas: format(
			{ format: 'uint' },
			(transaction.maxFeePerGas ??
				BigInt(block.baseFeePerGas) * BigInt(2) +
					BigInt(
						transaction.maxPriorityFeePerGas ?? web3Context.defaultMaxPriorityFeePerGas,
					)) as Numbers,
			returnFormat,
		),
	};
}

export async function getTransactionGasPricing<ReturnFormat extends DataFormat>(
	transaction: InternalTransaction,
	web3Context: Web3Context<ZondExecutionAPI>,
	returnFormat: ReturnFormat,
): Promise<
	| FormatType<
			{ maxPriorityFeePerGas?: Numbers; maxFeePerGas?: Numbers },
			ReturnFormat
	  >
	| undefined
> {
	const transactionType = getTransactionType(transaction, web3Context);
	if (!isNullish(transactionType)) {
		if (transactionType.startsWith('-'))
			throw new UnsupportedTransactionTypeError(transactionType);

		if (transactionType !== '0x2')
			throw new UnsupportedTransactionTypeError(transactionType);

		return {
			...(await getEip1559GasPricing(transaction, web3Context, returnFormat)),
		};
	}

	return undefined;
}
