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

// These need to be imported first in order for cross-fetch to be mocked correctly
import fetchMock from 'jest-fetch-mock';

jest.setMock('cross-fetch', fetchMock);

import { Web3APIPayload, QRLExecutionAPI } from '@theqrl/web3-types';
import { ResponseError } from '@theqrl/web3-errors';
import HttpProvider from '../../src/index';
import { mockGetBalanceResponse } from '../fixtures/test_data';

describe('HttpProvider - implemented methods', () => {
	const testAddress =
		'Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3';
	const jsonRpcPayload = {
		jsonrpc: '2.0',
		id: 42,
		method: 'qrl_getBalance',
		params: [testAddress, 'latest'],
	} as Web3APIPayload<QRLExecutionAPI, 'qrl_getBalance'>;

	let httpProvider: HttpProvider;

	beforeAll(() => {
		httpProvider = new HttpProvider('http://localhost:8545');
	});

	describe('httpProvider.supportsSubscriptions', () => {
		it('should return false', () => {
			expect(httpProvider.supportsSubscriptions()).toBe(false);
		});
	});

	describe('httpProvider.request', () => {
		it('should return expected response', async () => {
			fetchMock.mockResponseOnce(JSON.stringify(mockGetBalanceResponse));

			expect(await httpProvider.request(jsonRpcPayload)).toStrictEqual(
				mockGetBalanceResponse,
			);
		});

		it('should return ResponseError', async () => {
			fetchMock.mockResponseOnce(JSON.stringify(mockGetBalanceResponse), { status: 400 });

			await expect(httpProvider.request(jsonRpcPayload)).rejects.toThrow(ResponseError);
		});

		it('refuses redirects by default', async () => {
			fetchMock.mockResponseOnce(JSON.stringify(mockGetBalanceResponse));

			await httpProvider.request(jsonRpcPayload);

			const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
				string,
				RequestInit,
			];
			expect(init.redirect).toBe('error');
		});

		it('lets the caller opt in to following redirects', async () => {
			const provider = new HttpProvider('http://localhost:8545', {
				providerOptions: { redirect: 'follow' },
			});
			fetchMock.mockResponseOnce(JSON.stringify(mockGetBalanceResponse));

			await provider.request(jsonRpcPayload);

			const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
				string,
				RequestInit,
			];
			expect(init.redirect).toBe('follow');
		});
	});
});
