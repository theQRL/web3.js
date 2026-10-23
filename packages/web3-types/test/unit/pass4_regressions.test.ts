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
import {
	QRLExecutionAPI,
	JsonRpcResponseWithResult,
	Web3APIMethod,
	Web3APIPayload,
	Web3APIReturnType,
	Web3BaseProvider,
} from '../../src/index.js';

// @ts-expect-error mock class for testing. The abstract methods are not implemented.
class ProviderReadingThis extends Web3BaseProvider {
	private readonly bounds = { requestTimeout: 1 };

	public async request<
		Method extends Web3APIMethod<QRLExecutionAPI>,
		ResultType = Web3APIReturnType<QRLExecutionAPI, Method>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
	>(_: Web3APIPayload<QRLExecutionAPI, Method>): Promise<JsonRpcResponseWithResult<ResultType>> {
		// A real provider reads its own state: unbound, `this` was undefined (P4-L-38).
		return Promise.resolve({
			jsonrpc: '2.0',
			id: 1,
			result: this.bounds.requestTimeout as unknown as ResultType,
		});
	}
}

describe('pass-4 regressions (web3-types)', () => {
	it('asEIP1193Provider calls the original request with the provider as this (P4-L-38)', async () => {
		const provider = new ProviderReadingThis();
		const eip1193 = provider.asEIP1193Provider();
		await expect(eip1193.request({ method: 'qrl_blockNumber' })).resolves.toBe(1);
	});
});
