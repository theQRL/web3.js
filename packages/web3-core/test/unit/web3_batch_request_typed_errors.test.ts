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

import { JsonRpcBatchRequest, JsonRpcRequest, SupportedProviders } from '@theqrl/web3-types';
import {
	ContractExecutionError,
	EIP1193ProviderRpcError,
	InvalidMethodParamsError,
	MethodNotFoundError,
	OperationAbortError,
	ResponseError,
	RpcError,
} from '@theqrl/web3-errors';
import { Web3BatchRequest } from '../../src/web3_batch_request';
import { Web3RequestManager } from '../../src/web3_request_manager';

/* eslint-disable no-null/no-null */

type Reply = (payload: JsonRpcBatchRequest) => unknown;

// Carries the web3 provider symbol, so the request manager takes the HTTP-style path.
const web3Provider = (reply: Reply) =>
	({
		[Symbol.for('web3/base-provider')]: true,
				// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
		request: async (payload: JsonRpcBatchRequest) => reply(payload),
	}) as unknown as SupportedProviders;

// `request` is an AsyncFunction without the symbol: the EIP-1193 path.
const eip1193Provider = (reply: Reply) =>
	({
				// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
		request: async (payload: JsonRpcBatchRequest) => reply(payload),
	}) as unknown as SupportedProviders;

const legacyRequestProvider = (reply: Reply) =>
	({
		request: (payload: JsonRpcBatchRequest, cb: (err?: unknown, res?: unknown) => void) => {
			setImmediate(() => cb(undefined, reply(payload)));
		},
	}) as unknown as SupportedProviders;

const legacySendProvider = (reply: Reply) =>
	({
		send: (payload: JsonRpcBatchRequest, cb: (err?: unknown, res?: unknown) => void) => {
			setImmediate(() => cb(undefined, reply(payload)));
		},
	}) as unknown as SupportedProviders;

const sendAsyncProvider = (reply: Reply) =>
	({
				// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
		sendAsync: async (payload: JsonRpcBatchRequest) => reply(payload),
	}) as unknown as SupportedProviders;

const flush = async () => {
	// Unhandled rejections are reported once the microtask queue has drained.
	await new Promise(resolve => setImmediate(resolve));
	await new Promise(resolve => setImmediate(resolve));
};

const oneErrorMember = (error: Record<string, unknown>): Reply => payload =>
	payload.map((request: JsonRpcRequest) =>
		request.id === 1
			? { jsonrpc: '2.0', id: request.id, result: '0x1' }
			: { jsonrpc: '2.0', id: request.id, error },
	);

describe('Web3BatchRequest typed entry errors', () => {
	describe('an error reply for one member (M-7a)', () => {
		// jest-circus reports an unhandled rejection raised while a test runs as a failure of
		// that test, so this test fails on its own when the entry rejection is left unhandled.
		it('does not produce an unhandled rejection when the entry promise is not retained (M-7a)', async () => {
			const manager = new Web3RequestManager(
				web3Provider(
					oneErrorMember({ code: -32601, message: 'the method qrl_foo does not exist' }),
				),
			);
			const batch = new Web3BatchRequest(manager);
			// The documented pattern: the promises returned by add() are not retained.
			batch.add({ id: 1, method: 'qrl_blockNumber', params: [] });
			batch.add({ id: 2, method: 'qrl_foo', params: [] });

			const replies = await batch.execute();
			await flush();

			expect(replies).toEqual([
				{ jsonrpc: '2.0', id: 1, result: '0x1' },
				{
					jsonrpc: '2.0',
					id: 2,
					error: { code: -32601, message: 'the method qrl_foo does not exist' },
				},
			]);
		});

		it.each([
			[
				'an EIP-1474 method-not-found reply',
				{ code: -32601, message: 'the method qrl_foo does not exist' },
				MethodNotFoundError,
				{ code: -32601 },
			],
			[
				'a revert reply',
				{ code: -32000, message: 'execution reverted', data: '0xdead' },
				ContractExecutionError,
				{ innerError: expect.objectContaining({ data: '0xdead' }) },
			],
			[
				'a code 3 revert reply',
				{ code: 3, message: 'execution reverted: nope', data: '0x08c379a0' },
				ContractExecutionError,
				{ innerError: expect.objectContaining({ data: '0x08c379a0' }) },
			],
			[
				'an EIP-1193 user-rejected reply',
				{ code: 4001, message: 'User rejected the request.' },
				EIP1193ProviderRpcError,
				{ code: 4001 },
			],
			[
				'a server-error-range reply without a dedicated class',
				{ code: -32050, message: 'server error' },
				RpcError,
				{ code: -32050 },
			],
			[
				'an unknown error code',
				{ code: 12, message: 'RPC responded with error response' },
				ResponseError,
				{ message: 'Returned error: RPC responded with error response' },
			],
		])(
			'rejects the entry of %s with its typed error and resolves execute() with the reply (M-7a)',
			async (_, error, errorClass, expected) => {
				const manager = new Web3RequestManager(web3Provider(oneErrorMember(error)));
				const batch = new Web3BatchRequest(manager);
				const ok = batch.add({ id: 1, method: 'qrl_blockNumber', params: [] });
				const failed = batch.add({ id: 2, method: 'qrl_foo', params: [] });

				await expect(batch.execute()).resolves.toEqual([
					{ jsonrpc: '2.0', id: 1, result: '0x1' },
					{ jsonrpc: '2.0', id: 2, error },
				]);
				await expect(ok).resolves.toBe('0x1');
				await expect(failed).rejects.toBeInstanceOf(errorClass);
				await expect(failed).rejects.toMatchObject(expected);
			},
		);
	});

	describe('malformed batch replies (L-38)', () => {
		const malformedMember: Reply = payload => [
			{ jsonrpc: '2.0', id: payload[0].id, result: '0x1' },
			// Neither a result nor an error reply: its entry used to stay pending forever.
			{ jsonrpc: '2.0', id: payload[1].id },
		];

		it.each([
			['EIP-1193', eip1193Provider],
			['legacy request', legacyRequestProvider],
			['legacy send', legacySendProvider],
			['sendAsync', sendAsyncProvider],
			['web3', web3Provider],
		])(
			'rejects execute() and every entry with a typed error for a member that is neither result nor error over a %s provider (L-38)',
			async (_, makeProvider) => {
				const manager = new Web3RequestManager(makeProvider(malformedMember));
				const batch = new Web3BatchRequest(manager);
				const first = batch.add({ id: 1, method: 'qrl_blockNumber', params: [] });
				const second = batch.add({ id: 2, method: 'qrl_blockNumber', params: [] });

				await expect(batch.execute()).rejects.toBeInstanceOf(ResponseError);
				await expect(first).rejects.toBeInstanceOf(ResponseError);
				await expect(second).rejects.toBeInstanceOf(ResponseError);
				expect(first.state).toBe('rejected');
				expect(second.state).toBe('rejected');
			},
		);

		it.each([
			['[null, null]', () => [null, null]],
			['[]', () => []],
			['a string', () => 'str'],
			['a single object', (payload: JsonRpcBatchRequest) => ({ jsonrpc: '2.0', id: payload[0].id, result: '0x1' })],
			['a single parse-error object', () => ({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })],
		])(
			'rejects execute() and every entry with a typed error for the reply %s over an EIP-1193 provider (L-38)',
			async (_, reply) => {
				const manager = new Web3RequestManager(eip1193Provider(reply as Reply));
				const batch = new Web3BatchRequest(manager);
				const first = batch.add({ id: 1, method: 'qrl_blockNumber', params: [] });
				const second = batch.add({ id: 2, method: 'qrl_blockNumber', params: [] });

				await expect(batch.execute()).rejects.toBeInstanceOf(ResponseError);
				await expect(batch.execute()).rejects.not.toBeInstanceOf(TypeError);
				await expect(first).rejects.toBeInstanceOf(ResponseError);
				await expect(second).rejects.toBeInstanceOf(ResponseError);
			},
		);

		it('names the parse error a node answers a batch with (L-38)', async () => {
			const manager = new Web3RequestManager(
				eip1193Provider(() => ({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })),
			);
			const batch = new Web3BatchRequest(manager);
			batch.add({ id: 1, method: 'qrl_blockNumber', params: [] });
			await expect(batch.execute()).rejects.toThrow('Batch request failed: parse error');
		});

		it('rejects every entry when a request manager hands back a member that is neither result nor error (L-38)', async () => {
			const manager = new Web3RequestManager();
			jest.spyOn(manager, 'sendBatch').mockResolvedValue([
				{ jsonrpc: '2.0', id: 1, result: '0x1' },
				{ jsonrpc: '2.0', id: 2 } as never,
			]);
			const batch = new Web3BatchRequest(manager);
			const first = batch.add({ id: 1, method: 'qrl_blockNumber', params: [] });
			const second = batch.add({ id: 2, method: 'qrl_blockNumber', params: [] });

			await expect(batch.execute()).rejects.toThrow(
				'Invalid batch response: every member must be a JSON-RPC result or error reply',
			);
			await expect(first).rejects.toBeInstanceOf(OperationAbortError);
			await expect(second).rejects.toBeInstanceOf(OperationAbortError);
		});

		it('rejects every entry with a typed error when a request manager hands back a non-array (L-38)', async () => {
			const manager = new Web3RequestManager();
			jest.spyOn(manager, 'sendBatch').mockResolvedValue('garbage' as never);
			const batch = new Web3BatchRequest(manager);
			const entry = batch.add({ id: 1, method: 'qrl_blockNumber', params: [] });

			await expect(batch.execute()).rejects.toThrow(
				'Invalid batch response: expected an array of JSON-RPC replies',
			);
			await expect(entry).rejects.toBeInstanceOf(OperationAbortError);
		});

		it('wraps a non-Error batch failure in a ResponseError for the entries (M-7a)', async () => {
			const manager = new Web3RequestManager();
			const rawFailure = { jsonrpc: '2.0', id: 1, error: { code: -32700, message: 'parse error' } };
			jest.spyOn(manager, 'sendBatch').mockRejectedValue(rawFailure as never);
			const batch = new Web3BatchRequest(manager);
			const entry = batch.add({ id: 1, method: 'qrl_blockNumber', params: [] });

			await expect(batch.execute()).rejects.toBe(rawFailure);
			await expect(entry).rejects.toBeInstanceOf(ResponseError);
			await expect(entry).rejects.toMatchObject({ message: 'Batch request failed' });
		});
	});

	describe('duplicate explicit ids (I-14)', () => {
		it('throws an InvalidMethodParamsError and keeps the first entry (I-14)', async () => {
			const manager = new Web3RequestManager(
				web3Provider(payload =>
					payload.map((request: JsonRpcRequest) => ({
						jsonrpc: '2.0',
						id: request.id,
						result: request.method,
					})),
				),
			);
			const batch = new Web3BatchRequest(manager);
			const first = batch.add({ id: 7, method: 'qrl_blockNumber', params: [] });

			expect(() => batch.add({ id: 7, method: 'qrl_gasPrice', params: [] })).toThrow(
				InvalidMethodParamsError,
			);
			expect(() => batch.add({ id: 7, method: 'qrl_gasPrice', params: [] })).toThrow(
				'Batch request id "7" is already used by another entry',
			);
			expect(batch.requests).toEqual([
				{ jsonrpc: '2.0', id: 7, method: 'qrl_blockNumber', params: [] },
			]);

			await expect(batch.execute()).resolves.toEqual([
				{ jsonrpc: '2.0', id: 7, result: 'qrl_blockNumber' },
			]);
			await expect(first).resolves.toBe('qrl_blockNumber');
		});
	});
});
