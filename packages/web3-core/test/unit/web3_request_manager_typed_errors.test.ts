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

import { JsonRpcRequest, SupportedProviders } from '@theqrl/web3-types';
import {
	ContractExecutionError,
	EIP1193ProviderRpcError,
	InvalidProviderError,
	InvalidResponseError,
	MethodNotFoundError,
	ProviderError,
	ResponseError,
} from '@theqrl/web3-errors';
import { Web3RequestManager, Web3RequestManagerEvent } from '../../src/web3_request_manager';

/* eslint-disable no-null/no-null */

const SYMBOL = Symbol.for('web3/base-provider');
type Reply = (payload: JsonRpcRequest) => unknown;
type Callback = (err?: unknown, res?: unknown) => void;

const replying: Record<string, (reply: Reply) => SupportedProviders> = {
	web3: reply =>
		({
			[SYMBOL]: true,
						// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
			request: async (p: JsonRpcRequest) => reply(p),
		}) as unknown as SupportedProviders,
	eip1193: reply =>
		({
						// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
			request: async (p: JsonRpcRequest) => reply(p),
		}) as unknown as SupportedProviders,
	'legacy request': reply =>
		({
			request: (p: JsonRpcRequest, cb: Callback) => {
				setImmediate(() => cb(undefined, reply(p)));
			},
		}) as unknown as SupportedProviders,
	'legacy send': reply =>
		({
			send: (p: JsonRpcRequest, cb: Callback) => {
				setImmediate(() => cb(undefined, reply(p)));
			},
		}) as unknown as SupportedProviders,
	sendAsync: reply =>
		({
						// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
			sendAsync: async (p: JsonRpcRequest) => reply(p),
		}) as unknown as SupportedProviders,
};

const rejecting: Record<string, (value: unknown) => SupportedProviders> = {
	web3: value =>
		({
			[SYMBOL]: true,
						// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
			request: async () => {
				throw value;
			},
		}) as unknown as SupportedProviders,
	eip1193: value =>
		({
						// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
			request: async () => {
				throw value;
			},
		}) as unknown as SupportedProviders,
	'legacy request returning a promise': value =>
		({
			// A plain function returning a promise is the early-draft EIP-1193 shape under test.
			// eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/prefer-promise-reject-errors -- the rejection value is the subject of the test
			request: () => Promise.reject(value),
		}) as unknown as SupportedProviders,
	sendAsync: value =>
		({
						// eslint-disable-next-line @typescript-eslint/require-await -- an AsyncFunction is what marks an EIP-1193 provider
			sendAsync: async () => {
				throw value;
			},
		}) as unknown as SupportedProviders,
};

const callingBack: Record<string, (...args: unknown[]) => SupportedProviders> = {
	'legacy request': (...args) =>
		({
			request: (_p: JsonRpcRequest, cb: Callback) => {
				setImmediate(() => cb(...args));
			},
		}) as unknown as SupportedProviders,
	'legacy send': (...args) =>
		({
			send: (_p: JsonRpcRequest, cb: Callback) => {
				setImmediate(() => cb(...args));
			},
		}) as unknown as SupportedProviders,
};

const send = async (provider: SupportedProviders, specification?: boolean) =>
	new Web3RequestManager(provider, specification).send({ method: 'qrl_blockNumber', params: [] });

describe('Web3RequestManager typed errors', () => {
	describe('a provider that fails with a nullish value (L-42)', () => {
		it.each(
			Object.keys(rejecting).flatMap(kind => [
				[kind, undefined],
				[kind, null],
			]),
		)(
			'rejects with a ProviderError, not a null result, when a %s provider rejects with %p (L-42)',
			async (kind, value) => {
				const outcome = send(rejecting[kind](value));
				await expect(outcome).rejects.toBeInstanceOf(ProviderError);
				await expect(outcome).rejects.toThrow('Provider rejected the request without an error value');
			},
		);

		it.each(Object.keys(callingBack))(
			'rejects with a typed error when a %s provider calls back with neither an error nor a response (L-42)',
			async kind => {
				const outcome = send(callingBack[kind]());
				await expect(outcome).rejects.toBeInstanceOf(ResponseError);
				await expect(outcome).rejects.toThrow('Got a "nullish" response from provider.');
			},
		);

		it.each([0, '', false])(
			'treats the falsy error %p of a legacy request callback as an error (L-42)',
			async value => {
				const outcome = send(callingBack['legacy request'](value, undefined));
				await expect(outcome).rejects.toBeInstanceOf(ProviderError);
				await expect(outcome).rejects.toThrow('not a valid JSON-RPC response');
			},
		);

		it.each(['eip1193', 'legacy request returning a promise', 'sendAsync', 'web3'])(
			'still resolves a null result that a %s provider returns on its success path',
			async kind => {
				const provider =
					kind === 'legacy request returning a promise'
						? ({
								// eslint-disable-next-line @typescript-eslint/promise-function-async -- the early-draft EIP-1193 shape
								request: () => Promise.resolve(null),
							} as unknown as SupportedProviders)
						: replying[kind](() => null);
				await expect(send(provider)).resolves.toBeNull();
			},
		);
	});

	describe.each([false, true])(
		'error replies with useRpcCallSpecification = %s (I-14)',
		specification => {
			const errorReply =
				(error: Record<string, unknown>): Reply =>
				payload => ({ jsonrpc: '2.0', id: payload.id, error });

			it('maps "-32000 execution reverted" with data to ContractExecutionError (I-14)', async () => {
				const outcome = send(
					replying.web3(
						errorReply({ code: -32000, message: 'execution reverted', data: '0xdead' }),
					),
					specification,
				);
				await expect(outcome).rejects.toBeInstanceOf(ContractExecutionError);
				await expect(outcome).rejects.toMatchObject({
					innerError: expect.objectContaining({ data: '0xdead' }),
				});
			});

			it('maps a code 3 reply to ContractExecutionError even without "revert" in the message (I-14)', async () => {
				const outcome = send(
					replying.web3(errorReply({ code: 3, message: 'boom', data: '0x08c379a0' })),
					specification,
				);
				await expect(outcome).rejects.toBeInstanceOf(ContractExecutionError);
			});

			it.each([4001, 4100, 4200, 4900, 4901])(
				'maps an EIP-1193 provider error %i to EIP1193ProviderRpcError keeping the code (I-14)',
				async code => {
					const error = { code, message: 'provider says no', data: { reason: 'x' } };
					const outcome = send(replying.eip1193(errorReply(error)), specification);
					await expect(outcome).rejects.toBeInstanceOf(EIP1193ProviderRpcError);
					await expect(outcome).rejects.toMatchObject({
						code,
						data: { reason: 'x' },
						innerError: error,
					});
				},
			);

			it(`maps -32601 to ${specification ? 'MethodNotFoundError' : 'InvalidResponseError'}`, async () => {
				const outcome = send(
					replying.web3(errorReply({ code: -32601, message: 'method not found' })),
					specification,
				);
				await expect(outcome).rejects.toBeInstanceOf(
					specification ? MethodNotFoundError : InvalidResponseError,
				);
			});
		},
	);

	describe('batch replies over legacy and EIP-1193 providers (L-38)', () => {
		const batch = [
			{ id: 1, method: 'qrl_blockNumber', params: [] },
			{ id: 2, method: 'qrl_chainId', params: [] },
		] as never;

		it.each(
			['eip1193', 'legacy request', 'legacy send', 'sendAsync'].flatMap(kind => [
				[kind, 'a member without result and error', () => [
					{ jsonrpc: '2.0', id: 1, result: '0x1' },
					{ jsonrpc: '2.0', id: 2 },
				]],
				[kind, '[null, null]', () => [null, null]],
				[kind, '[]', () => []],
				[kind, 'a string', () => 'str'],
				[kind, 'a single parse-error object', () => ({
					jsonrpc: '2.0',
					id: null,
					error: { code: -32700, message: 'parse error' },
				})],
			]),
		)(
			'rejects a %s provider batch reply that is %s with a ResponseError (L-38)',
			async (kind, _, reply) => {
				const manager = new Web3RequestManager(replying[kind](reply as Reply));
				const outcome = manager.sendBatch(batch);
				await expect(outcome).rejects.toBeInstanceOf(ResponseError);
				await expect(outcome).rejects.not.toBeInstanceOf(TypeError);
			},
		);

		it.each(['eip1193', 'legacy request', 'legacy send', 'sendAsync'])(
			'returns a well-formed batch reply with error members from a %s provider (L-38)',
			async kind => {
				const reply: Reply = () => [
					{ jsonrpc: '2.0', id: 1, result: '0x1' },
					{ jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'nope' } },
				];
				const manager = new Web3RequestManager(replying[kind](reply));
				await expect(manager.sendBatch(batch)).resolves.toEqual(reply({} as never));
			},
		);
	});

	describe('setProvider() (I-14, L-36)', () => {
		it.each(['', '   ', '\n'])('rejects the blank URL %p with an InvalidProviderError (I-14)', url => {
			const manager = new Web3RequestManager();
			expect(() => manager.setProvider(url)).toThrow(InvalidProviderError);
			expect(() => new Web3RequestManager(url)).toThrow(InvalidProviderError);
			expect(manager.provider).toBeUndefined();
		});

		it.each([true, 5, Symbol('x')])(
			'rejects the non-object value %p with a ProviderError instead of a TypeError (I-14)',
			value => {
				const manager = new Web3RequestManager();
				expect(() => manager.setProvider(value as never)).toThrow(ProviderError);
				expect(() => manager.setProvider(value as never)).not.toThrow(TypeError);
				expect(manager.provider).toBeUndefined();
			},
		);

		it('redacts credentials from the autodetection error message', () => {
			const manager = new Web3RequestManager();
			expect(() => manager.setProvider('ftp://alice:hunter2@node.example:1234/v3/KEY')).toThrow(
				ProviderError,
			);
			expect(() => manager.setProvider('ftp://alice:hunter2@node.example:1234/v3/KEY')).toThrow(
				'Can\'t autodetect provider for "ftp://***@node.example:1234/[redacted]"',
			);
		});

		it('does not emit the change events when the same provider is set again (L-36)', () => {
			const provider = replying.eip1193(() => null);
			const manager = new Web3RequestManager(provider);
			const before = jest.fn();
			const changed = jest.fn();
			manager.on(Web3RequestManagerEvent.BEFORE_PROVIDER_CHANGE, before);
			manager.on(Web3RequestManagerEvent.PROVIDER_CHANGED, changed);

			expect(manager.setProvider(provider)).toBe(true);
			expect(before).not.toHaveBeenCalled();
			expect(changed).not.toHaveBeenCalled();

			const other = replying.eip1193(() => null);
			manager.setProvider(other);
			expect(before).toHaveBeenCalledTimes(1);
			expect(changed).toHaveBeenCalledTimes(1);
			expect(manager.provider).toBe(other);
		});

		it('does not emit the change events when unsetting an unset provider (L-36)', () => {
			const manager = new Web3RequestManager();
			const changed = jest.fn();
			manager.on(Web3RequestManagerEvent.PROVIDER_CHANGED, changed);
			manager.setProvider(undefined);
			expect(changed).not.toHaveBeenCalled();
		});
	});
});
