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
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
	getSystemTestProvider,
	closeOpenConnection,
	isWs,
} from '../../shared_fixtures/system_tests_utils';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Web3 = require('@theqrl/web3').default;

describe('CJS - Black Box Unit Tests - web3.BatchRequest', () => {
	let web3: typeof Web3;

	beforeAll(() => {
		web3 = new Web3(getSystemTestProvider());
	});

	afterAll(async () => {
		if (isWs) await closeOpenConnection(web3);
	});

	it('should make a batch request', async () => {
		const request1 = {
			id: 42,
			method: 'qrl_getBalance',
			params: ['Q3FB31Fc85e37591c3E9446C14Ca0fFC2F04EF1B4FDfE3338F85C628Ba458dea30fA8A49Bc21721c7cE517129dDDd976fb39c6FD828A0fE69D8F704AaF304d0f3', 'latest'],
		};
		const request2 = {
			id: 24,
			method: 'qrl_getBalance',
			params: ['QD1fcb72f994b92A5fa025f17C7473bA30c648a5F266c887b774cd59767dD3aA4DE240349078874fDF5c27ba4C6A31e76c3Df9b8Fa4BEA7fE09b6106ADFE78cA4', 'latest'],
		};

		const batch = new web3.BatchRequest();
		const request1Promise = batch.add(request1);
		const request2Promise = batch.add(request2);

		const executePromise = batch.execute();
		const response = await Promise.all([request1Promise, request2Promise, executePromise]);

		const expectedResponse = [
			'0x0',
			'0x0',
			[
				{ jsonrpc: '2.0', id: 42, result: '0x0' },
				{ jsonrpc: '2.0', id: 24, result: '0x0' },
			],
		];
		expect(response).toStrictEqual(expectedResponse);
	});
});
