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

import { JsonRpcRequest, JsonRpcResponse, SupportedProviders } from '@theqrl/web3-types';
import { ContractExecutionError, InternalError, InvalidResponseError } from '@theqrl/web3-errors';
import { jsonRpc } from '@theqrl/web3-utils';
import HttpProvider from '@theqrl/web3-providers-http';
import { Web3RequestManager } from '../../src/web3_request_manager';

describe.each(['send', 'request'])('asynchronous legacy %s callbacks', transport => {
	it.each([
		{
			name: 'RPC error response',
			errorArgument: false,
			message: 'internal failure',
			specification: false,
			expected: InvalidResponseError,
		},
		{
			name: 'RPC error argument',
			errorArgument: true,
			message: 'internal failure',
			specification: false,
			expected: InvalidResponseError,
		},
		{
			name: 'revert response',
			errorArgument: false,
			message: 'execution reverted',
			specification: false,
			expected: ContractExecutionError,
		},
		{
			name: 'revert error argument',
			errorArgument: true,
			message: 'execution reverted',
			specification: false,
			expected: ContractExecutionError,
		},
		{
			name: 'mapped RPC error',
			errorArgument: false,
			message: 'internal failure',
			specification: true,
			expected: InternalError,
		},
	])(
		'rejects the promise without throwing for $name',
		async ({ errorArgument, message, specification, expected }) => {
			let deliver!: () => void;
			const provider = {
				[transport]: (
					payload: JsonRpcRequest,
					callback: (error?: unknown, response?: JsonRpcResponse) => void,
				) => {
					const response = {
						jsonrpc: '2.0' as const,
						id: payload.id,
						error: { code: -32603, message },
					};
					deliver = () => {
						if (errorArgument) callback(response);
						else callback(undefined, response);
					};
				},
			} as unknown as SupportedProviders;
			const manager = new Web3RequestManager(provider, specification);
			const outcome = manager
				.send({ method: 'qrl_blockNumber' })
				.catch((error: unknown) => error);

			// Deliver after the Promise executor has returned, as a real provider does.
			await new Promise<void>(resolve => setImmediate(resolve));
			expect(deliver).not.toThrow();
			await expect(outcome).resolves.toBeInstanceOf(expected);
		},
	);
});

describe('single JSON-RPC response IDs', () => {
	const makeManager = (requestId: string | number, response: JsonRpcResponse) => {
		jest.spyOn(jsonRpc, 'toPayload').mockReturnValue({
			jsonrpc: '2.0',
			id: requestId,
			method: 'qrl_blockNumber',
			params: [],
		});
		const provider = new HttpProvider('http://localhost:8545');
		jest.spyOn(provider, 'request').mockResolvedValue(response as never);
		return new Web3RequestManager(provider, true);
	};

	it.each([0, '', 7, '7', '00000000-0000-4000-8000-000000000001'])(
		'accepts the matching ID %p',
		async id => {
			const manager = makeManager(id, { jsonrpc: '2.0', id, result: '0x7' });
			await expect(manager.send({ method: 'qrl_blockNumber' })).resolves.toBe('0x7');
		},
	);

	describe.each(['result', 'error'])('%s responses', kind => {
		it.each([
			{ requestId: 1, responseId: 0 },
			{ requestId: 0, responseId: 1 },
			{ requestId: 'expected', responseId: '' },
			{ requestId: '', responseId: 'unrelated' },
			{
				requestId: '00000000-0000-4000-8000-000000000001',
				responseId: '00000000-0000-4000-8000-000000000002',
			},
			{ requestId: 7, responseId: '7' },
			{ requestId: '7', responseId: 7 },
		])('rejects ID $responseId for request $requestId', async ({ requestId, responseId }) => {
			const response: JsonRpcResponse =
				kind === 'result'
					? { jsonrpc: '2.0' as const, id: responseId, result: '0x7' }
					: {
							jsonrpc: '2.0' as const,
							id: responseId,
							error: { code: -32603, message: 'internal failure' },
						};
			const manager = makeManager(requestId, response);
			await expect(manager.send({ method: 'qrl_blockNumber' })).rejects.toBeInstanceOf(
				InvalidResponseError,
			);
		});
	});

	it('preserves raw results from promise-based providers', async () => {
		const manager = new Web3RequestManager({
			request: async () => Promise.resolve('0x7'),
		} as unknown as SupportedProviders);
		await expect(manager.send({ method: 'qrl_blockNumber' })).resolves.toBe('0x7');
	});
});
