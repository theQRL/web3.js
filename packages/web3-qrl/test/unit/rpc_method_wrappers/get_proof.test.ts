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
	Web3QRLExecutionAPI,
} from '@theqrl/web3-types';
import { isNullish } from '@theqrl/web3-validator';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import { getProof } from '../../../src/rpc_method_wrappers';
import { mockRpcResponse, testData } from './fixtures/get_proof';
import { accountSchema } from '../../../src/schemas';

jest.mock('@theqrl/web3-rpc-methods');

describe('getProof', () => {
	let web3Context: Web3Context<Web3QRLExecutionAPI>;

	beforeAll(() => {
		web3Context = new Web3Context('http://127.0.0.1:8545');
	});

	beforeEach(() => {
		(qrlRpcMethods.getProof as jest.Mock).mockResolvedValue(mockRpcResponse);
	});

	it.each(testData)(
		`should call rpcMethods.getProof with expected parameters\nTitle: %s\nInput parameters: %s\n`,
		async (_, inputParameters) => {
			const [inputAddress, inputStorageKey, inputBlockNumber] = inputParameters;
			const inputStorageKeyFormatted = inputStorageKey.map(s =>
				format({ format: 'bytes' }, s, QRL_DATA_FORMAT),
			);

			let inputBlockNumberFormatted;

			if (isNullish(inputBlockNumber)) {
				inputBlockNumberFormatted = web3Context.defaultBlock;
			} else {
				inputBlockNumberFormatted = format(
					{ format: 'uint' },
					inputBlockNumber,
					QRL_DATA_FORMAT,
				);
			}

			await getProof(web3Context, ...inputParameters, DEFAULT_RETURN_FORMAT);
			expect(qrlRpcMethods.getProof).toHaveBeenCalledWith(
				web3Context.requestManager,
				inputAddress,
				inputStorageKeyFormatted,
				inputBlockNumberFormatted,
			);
		},
	);

	it.each(testData)(
		`should format mockRpcResponse using provided return format\nTitle: %s\nInput parameters: %s\n`,
		async (_, inputParameters) => {
			const expectedReturnFormat = { number: FMT_NUMBER.STR, bytes: FMT_BYTES.UINT8ARRAY };
			const expectedFormattedResult = format(
				accountSchema,
				mockRpcResponse,
				expectedReturnFormat,
			);
			(qrlRpcMethods.getProof as jest.Mock).mockResolvedValueOnce(mockRpcResponse);

			const result = await getProof(web3Context, ...inputParameters, expectedReturnFormat);
			expect(result).toStrictEqual(expectedFormattedResult);
		},
	);
	it.each([BigInt(2) ** BigInt(256), BigInt(2) ** BigInt(512) - BigInt(1)])(
		'accepts a VM64 storage value: %s',
		async value => {
			(qrlRpcMethods.getProof as jest.Mock).mockResolvedValue({
				...mockRpcResponse,
				storageProof: [
					{ ...mockRpcResponse.storageProof[0], value: `0x${value.toString(16)}` },
				],
			});
			const result = await getProof(web3Context, ...testData[0][1], DEFAULT_RETURN_FORMAT);
			expect(result.storageProof[0].value).toBe(value);
		},
	);
	it('rejects a storage quantity beyond 512 bits', async () => {
		(qrlRpcMethods.getProof as jest.Mock).mockResolvedValue({
			...mockRpcResponse,
			storageProof: [{ ...mockRpcResponse.storageProof[0], value: `0x1${'0'.repeat(128)}` }],
		});
		await expect(
			getProof(web3Context, ...testData[0][1], DEFAULT_RETURN_FORMAT),
		).rejects.toThrow();
	});
});
