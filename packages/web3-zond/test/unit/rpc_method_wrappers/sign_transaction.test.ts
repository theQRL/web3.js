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
	DEFAULT_RETURN_FORMAT,
	ZOND_DATA_FORMAT,
	SignedTransactionInfoAPI,
	Web3ZondExecutionAPI,
} from '@theqrl/web3-types';
import { isString } from '@theqrl/web3-validator';
import { zondRpcMethods } from '@theqrl/web3-rpc-methods';

import { signTransaction } from '../../../src/rpc_method_wrappers';
import { returnFormat, testData } from './fixtures/sign_transaction';
import { formatTransaction } from '../../../src';

jest.mock('@theqrl/web3-rpc-methods');

describe('signTransaction', () => {
	let web3Context: Web3Context<Web3ZondExecutionAPI>;

	beforeAll(() => {
		web3Context = new Web3Context('http://127.0.0.1:8545');
	});

	it.each(testData)(
		`should call rpcMethods.signTransaction with expected parameters\nTitle: %s\nInput parameters: %s\n`,
		async (_, inputParameters) => {
			const [inputTransaction, signedTransactionInfo] = inputParameters;
			const inputTransactionFormatted = formatTransaction(inputTransaction, ZOND_DATA_FORMAT);

			(zondRpcMethods.signTransaction as jest.Mock).mockResolvedValueOnce(
				isString(signedTransactionInfo as string)
					? signedTransactionInfo
					: (signedTransactionInfo as SignedTransactionInfoAPI).raw,
			);

			await signTransaction(web3Context, inputTransaction, DEFAULT_RETURN_FORMAT);
			expect(zondRpcMethods.signTransaction).toHaveBeenCalledWith(
				web3Context.requestManager,
				inputTransactionFormatted,
			);
		},
	);

	it.each(testData)(
		`should format mockRpcResponse using provided return format\nTitle: %s\nInput parameters: %s\n`,
		async (_, inputParameters) => {
			const [inputTransaction, signedTransactionInfo, expectedFormattedResult] =
				inputParameters;
			(zondRpcMethods.signTransaction as jest.Mock).mockResolvedValueOnce(
				isString(signedTransactionInfo as string)
					? signedTransactionInfo
					: (signedTransactionInfo as SignedTransactionInfoAPI).raw,
			);

			const result = await signTransaction(web3Context, inputTransaction, returnFormat);
			expect(result).toStrictEqual(expectedFormattedResult);
		},
	);
});
