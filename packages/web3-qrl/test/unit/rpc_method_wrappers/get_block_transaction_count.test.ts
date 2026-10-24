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
import { format } from '@theqrl/web3-utils';
import {
	QRL_DATA_FORMAT,
	DEFAULT_RETURN_FORMAT,
	FMT_NUMBER,
	FMT_BYTES,
	Bytes,
	Web3QRLExecutionAPI,
} from '@theqrl/web3-types';
import { isBytes, isNullish } from '@theqrl/web3-validator';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import { getBlockTransactionCount } from '../../../src/rpc_method_wrappers';
import { mockRpcResponse, testData } from './fixtures/get_block_transaction_count';

jest.mock('@theqrl/web3-rpc-methods');

describe('getBlockTransactionCount', () => {
	let web3Context: Web3Context<Web3QRLExecutionAPI>;

	beforeAll(() => {
		web3Context = new Web3Context('http://127.0.0.1:8545');
	});

	it.each(testData)(
		`should call rpcMethods.getBlock with expected parameters\nTitle: %s\nInput parameters: %s\n`,
		async (_, inputParameters) => {
			const [inputBlock] = inputParameters;
			// Only a 32-byte value is a block hash (P4-L-11).
			const inputBlockIsBytes = isBytes(inputBlock as Bytes, { size: 32 });

			let inputBlockFormatted;

			if (inputBlockIsBytes) {
				inputBlockFormatted = format({ format: 'bytes32' }, inputBlock, QRL_DATA_FORMAT);
			} else if (isNullish(inputBlock)) {
				inputBlockFormatted = web3Context.defaultBlock;
			} else {
				inputBlockFormatted = format({ format: 'uint' }, inputBlock, QRL_DATA_FORMAT);
			}

			(qrlRpcMethods.getBlockTransactionCountByHash as jest.Mock).mockResolvedValueOnce(
				mockRpcResponse,
			);
			(qrlRpcMethods.getBlockTransactionCountByNumber as jest.Mock).mockResolvedValueOnce(
				mockRpcResponse,
			);
			await getBlockTransactionCount(web3Context, ...inputParameters, DEFAULT_RETURN_FORMAT);
			expect(
				inputBlockIsBytes
					? qrlRpcMethods.getBlockTransactionCountByHash
					: qrlRpcMethods.getBlockTransactionCountByNumber,
			).toHaveBeenCalledWith(web3Context.requestManager, inputBlockFormatted);
		},
	);

	it.each(testData)(
		`should format mockRpcResponse using provided return format\nTitle: %s\nInput parameters: %s\n`,
		async (_, inputParameters) => {
			const [inputBlock] = inputParameters;
			const expectedReturnFormat = { number: FMT_NUMBER.STR, bytes: FMT_BYTES.UINT8ARRAY };
			const expectedFormattedResult = format(
				{ format: 'uint' },
				mockRpcResponse,
				expectedReturnFormat,
			);
			// Only a 32-byte value is a block hash (P4-L-11).
			const inputBlockIsBytes = isBytes(inputBlock as Bytes, { size: 32 });
			(
				(inputBlockIsBytes
					? qrlRpcMethods.getBlockTransactionCountByHash
					: qrlRpcMethods.getBlockTransactionCountByNumber) as jest.Mock
			).mockResolvedValueOnce(mockRpcResponse);

			const result = await getBlockTransactionCount(
				web3Context,
				inputBlock,
				expectedReturnFormat,
			);
			expect(result).toStrictEqual(expectedFormattedResult);
		},
	);
});
