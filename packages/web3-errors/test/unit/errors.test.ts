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

import { JsonRpcError } from '@theqrl/web3-types';
import * as accountErrors from '../../src/errors/account_errors';
import * as connectionErrors from '../../src/errors/connection_errors';
import * as contractErrors from '../../src/errors/contract_errors';
import * as qrnsErrors from '../../src/errors/qrns_errors';
import * as genericErrors from '../../src/errors/generic_errors';
import * as providerErrors from '../../src/errors/provider_errors';
import * as signatureErrors from '../../src/errors/signature_errors';
import * as transactionErrors from '../../src/errors/transaction_errors';
import * as utilsErrors from '../../src/errors/utils_errors';
import * as responseErrors from '../../src/errors/response_errors';
import * as coreErrors from '../../src/errors/core_errors';
import * as rpcErrors from '../../src/errors/rpc_errors';

import { ConvertValueToString } from '../fixtures/errors';
import {
	BaseWeb3Error,
	InvalidValueError,
	MAX_ECHOED_VALUE_LENGTH,
	redactClientUrl,
} from '../../src/web3_error_base';
import {
	ERR_CONN_HTTP_STATUS,
	ERR_CORE_CHAIN_MISMATCH,
	ERR_REQUEST_SERIALIZATION,
} from '../../src/error_codes';

describe('errors', () => {
	describe('error convertToString', () => {
		it.each(ConvertValueToString)('%s', (input, output) => {
			expect(BaseWeb3Error.convertToString(input, true)).toEqual(output);
		});
	});

	it('preserves the default KDF error and includes optional validation details', () => {
		expect(new accountErrors.InvalidKdfError().message).toBe('Invalid key derivation function');
		expect(
			new accountErrors.InvalidKdfError('Argon2id salt is too short').toJSON(),
		).toMatchObject({
			name: 'InvalidKdfError',
			code: new accountErrors.InvalidKdfError().code,
			message: 'Invalid key derivation function: Argon2id salt is too short',
		});
	});

	it('should have unique codes for each error', () => {
		const errorCodes: number[] = [];

		for (const ErrorClass of Object.values({
			...accountErrors,
			...connectionErrors,
			...contractErrors,
			...qrnsErrors,
			...genericErrors,
			...providerErrors,
			...signatureErrors,
			...transactionErrors,
			...utilsErrors,
		})) {
			if (ErrorClass === transactionErrors.InvalidPropertiesForTransactionTypeError) break;
			// To disable error for the abstract class

			const err = new ErrorClass({} as never, {} as never, {} as never, {} as never);
			errorCodes.push(err.code);
		}

		expect(errorCodes.filter((x, y) => errorCodes.indexOf(x) === y)).toHaveLength(
			errorCodes.length,
		);
	});

	describe('InvalidNumberOfParamsError', () => {
		it('should have valid json structure', () => {
			const got = 10;
			const expected = 20;

			expect(
				new genericErrors.InvalidNumberOfParamsError(got, expected, 'method').toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ConnectionError', () => {
		it('should have valid json structure', () => {
			expect(
				new connectionErrors.ConnectionError('error message', {
					code: 10,
					reason: 'reason',
				}).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('InvalidConnectionError', () => {
		it('should have valid json structure', () => {
			expect(
				new connectionErrors.InvalidConnectionError('my host', {
					code: 10,
					reason: 'reason',
				}).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ConnectionTimeoutError', () => {
		it('should have valid json structure', () => {
			const timeoutValue = 5000;

			expect(
				new connectionErrors.ConnectionTimeoutError(timeoutValue).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ConnectionNotOpenError', () => {
		it('should have valid json structure', () => {
			expect(
				new connectionErrors.ConnectionNotOpenError({
					code: 10,
					reason: 'reason',
				}).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ConnectionCloseError', () => {
		it('should have valid json structure', () => {
			expect(
				new connectionErrors.ConnectionCloseError({ code: 10, reason: 'reason' }).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('MaxAttemptsReachedOnReconnectingError', () => {
		it('should have valid json structure', () => {
			expect(
				new connectionErrors.MaxAttemptsReachedOnReconnectingError(5).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('PendingRequestsOnReconnectingError', () => {
		it('should have valid json structure', () => {
			expect(
				new connectionErrors.PendingRequestsOnReconnectingError().toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('InvalidProviderError', () => {
		it('should have valid json structure', () => {
			expect(new providerErrors.InvalidProviderError('my url').toJSON()).toMatchSnapshot();
		});
	});

	describe('TransactionError', () => {
		it('should have valid json structure', () => {
			expect(
				new transactionErrors.TransactionError('message', { attr1: 'attr1' }).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('RevertInstructionError', () => {
		it('should have valid json structure', () => {
			expect(
				new transactionErrors.RevertInstructionError('message', 'signature').toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('TransactionRevertInstructionError', () => {
		it('should have valid json structure', () => {
			expect(
				new transactionErrors.TransactionRevertInstructionError('message', 'signature', {
					attr1: 'attr1',
				} as any).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('TransactionRevertWithCustomError', () => {
		it('should have valid json structure', () => {
			expect(
				new transactionErrors.TransactionRevertWithCustomError(
					'reason',
					'customErrorName',
					'customErrorDecodedSignature',
					{ customErrorArgument: 'customErrorArgument' },
					'signature',
					{
						attr1: 'attr1',
					} as any,
					'data',
				).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('InvalidPropertiesForTransactionTypeError', () => {
		it('should have valid json structure', () => {
			expect(
				new transactionErrors.InvalidPropertiesForTransactionTypeError(
					[
						{
							keyword: 'property',
							instancePath: '',
							schemaPath: '',
							params: {},
						},
					],
					'0x2',
				).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('NoContractAddressFoundError', () => {
		it('should have valid json structure', () => {
			expect(
				new transactionErrors.NoContractAddressFoundError({
					attr1: 'attr1',
				} as any).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ContractCodeNotStoredError', () => {
		it('should have valid json structure', () => {
			expect(
				new transactionErrors.ContractCodeNotStoredError({
					attr1: 'attr1',
				} as any).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('TransactionRevertedWithoutReasonError', () => {
		it('should have valid json structure', () => {
			expect(
				new transactionErrors.TransactionRevertedWithoutReasonError({
					attr1: 'attr1',
				} as any).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('TransactionOutOfGasError', () => {
		it('should have valid json structure', () => {
			expect(
				new transactionErrors.TransactionOutOfGasError({ attr1: 'attr1' } as any).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ResolverMethodMissingError', () => {
		it('should have valid json structure', () => {
			expect(
				new contractErrors.ResolverMethodMissingError('address', 'name').toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ContractMissingABIError', () => {
		it('should have valid json structure', () => {
			expect(new contractErrors.ContractMissingABIError().toJSON()).toMatchSnapshot();
		});
	});

	describe('ContractOnceRequiresCallbackError', () => {
		it('should have valid json structure', () => {
			expect(
				new contractErrors.ContractOnceRequiresCallbackError().toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ContractEventDoesNotExistError', () => {
		it('should have valid json structure', () => {
			expect(
				new contractErrors.ContractEventDoesNotExistError('eventName').toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ContractReservedEventError', () => {
		it('should have valid json structure', () => {
			expect(
				new contractErrors.ContractReservedEventError('type').toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ContractMissingDeployDataError', () => {
		it('should have valid json structure', () => {
			expect(new contractErrors.ContractMissingDeployDataError().toJSON()).toMatchSnapshot();
		});
	});

	describe('ContractNoAddressDefinedError', () => {
		it('should have valid json structure', () => {
			expect(new contractErrors.ContractNoAddressDefinedError().toJSON()).toMatchSnapshot();
		});
	});

	describe('ContractNoFromAddressDefinedError', () => {
		it('should have valid json structure', () => {
			expect(
				new contractErrors.ContractNoFromAddressDefinedError().toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('Eip838ExecutionError', () => {
		it('should get the data from error.data.data', () => {
			expect(
				new contractErrors.Eip838ExecutionError({
					data: {
						data: '0x0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000001800000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001610000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000016300000000000000000000000000000000000000000000000000000000000000',
					},
				} as JsonRpcError<contractErrors.ProviderErrorData>).toJSON(),
			).toMatchSnapshot();
		});
		it('should get the data from error.data.originalError.data', () => {
			expect(
				new contractErrors.Eip838ExecutionError({
					data: {
						originalError: {
							data: '0x0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000001800000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001610000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000016300000000000000000000000000000000000000000000000000000000000000',
						},
					},
				} as JsonRpcError<contractErrors.ProviderErrorData>).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ResponseError', () => {
		it('should have valid json structure with data', () => {
			expect(
				new responseErrors.ResponseError({
					id: 1,
					jsonrpc: '2.0',
					error: { code: 123, message: 'error message', data: { a: '10', b: '20' } },
				}).toJSON(),
			).toMatchSnapshot();
		});

		it('should have valid json structure without data', () => {
			expect(
				new responseErrors.ResponseError({
					id: 1,
					jsonrpc: '2.0',
					error: { code: 123, message: 'error message', data: undefined },
				}).toJSON(),
			).toMatchSnapshot();
		});

		it('should include the array of inner errors', () => {
			expect(
				new responseErrors.ResponseError([
					{
						id: 1,
						jsonrpc: '2.0',
						error: { code: 123, message: 'error message', data: { a: '10', b: '20' } },
					},
					{
						id: 2,
						jsonrpc: '2.0',
						error: { code: 124, message: 'error message', data: { c: '30', d: '40' } },
					},
				]).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('ResponseError with malformed batch entries', () => {
		it('tolerates null entries instead of throwing', () => {
			expect(
				() =>
					new responseErrors.ResponseError([
						// eslint-disable-next-line no-null/no-null
						null,
						{ id: 1, jsonrpc: '2.0', error: { code: 1, message: 'm' } },
					] as never),
			).not.toThrow();

			// eslint-disable-next-line no-null/no-null
			const error = new responseErrors.ResponseError([null] as never, 'batch with null');
			expect(error.innerError).toEqual([undefined]);
			// eslint-disable-next-line no-null/no-null
			expect(() => new responseErrors.InvalidResponseError([null] as never)).not.toThrow();
			// eslint-disable-next-line no-null/no-null
			expect(() => new responseErrors.ResponseError(null as never)).not.toThrow();
		});
	});

	describe('InvalidResponseError', () => {
		it('should have valid json structure', () => {
			expect(
				new responseErrors.InvalidResponseError({
					id: 1,
					jsonrpc: '2.0',
					error: { code: 123, message: 'error message', data: { a: '10', b: '20' } },
				}).toJSON(),
			).toMatchSnapshot();
		});
	});

	describe('null members inside error replies', () => {
		/* eslint-disable no-null/no-null */
		it.each([
			['data: null', { code: 3, message: 'execution reverted', data: null }],
			[
				'data.originalError: null',
				{ code: 3, message: 'execution reverted', data: { originalError: null } },
			],
			['data: {}', { code: 3, message: 'execution reverted', data: {} }],
		])('Eip838ExecutionError does not throw for %s', (_, error) => {
			const instance = new contractErrors.Eip838ExecutionError(
				error as unknown as JsonRpcError<contractErrors.ProviderErrorData>,
			);
			expect(instance.message).toBe('execution reverted');
			expect(instance.data).toBeUndefined();
			expect(instance.toJSON()).toMatchObject({ name: 'Eip838ExecutionError', code: 3 });
		});

		it('ContractExecutionError wraps a revert whose data is null', () => {
			const instance = new contractErrors.ContractExecutionError({
				code: 3,
				message: 'execution reverted',
				data: null,
			} as unknown as JsonRpcError<contractErrors.ProviderErrorData>);
			expect(instance.innerError).toBeInstanceOf(contractErrors.Eip838ExecutionError);
			expect(instance.innerError.data).toBeUndefined();
		});

		it('ResponseError and InvalidResponseError accept an error member that is null', () => {
			const reply = { jsonrpc: '2.0', id: 1, error: null } as never;
			expect(new responseErrors.ResponseError(reply).message).toContain('Returned error');
			expect(new responseErrors.InvalidResponseError(reply).message).toContain(
				'Returned error',
			);
		});
		/* eslint-enable no-null/no-null */
	});

	describe('Eip838ExecutionError on provider-controlled input (L-45)', () => {
		const nest = (depth: number, key: 'data' | 'originalError') => {
			let value: unknown = key === 'data' ? '0x' : { data: '0x' };
			for (let i = 0; i < depth; i += 1) value = { [key]: value };
			return value;
		};

		it.each(['data', 'originalError'] as const)(
			'does not recurse into %s nested 100000 levels deep',
			key => {
				const error = new contractErrors.ContractExecutionError({
					code: 3,
					message: 'execution reverted',
					data: nest(100_000, key),
				} as never);
				expect(error).toBeInstanceOf(contractErrors.ContractExecutionError);
				expect(error.innerError).toBeInstanceOf(contractErrors.Eip838ExecutionError);
				// Only the documented level is unwrapped: deeper nesting is not data.
				expect(error.innerError.innerError).toBeInstanceOf(
					contractErrors.Eip838ExecutionError,
				);
				expect(error.innerError.innerError?.innerError).toBeUndefined();
			},
		);

		it('still reads the two documented shapes', () => {
			expect(
				new contractErrors.Eip838ExecutionError({ code: 3, message: 'm', data: '0xab' })
					.data,
			).toBe('0xab');
			expect(
				new contractErrors.Eip838ExecutionError({
					code: 3,
					message: 'm',
					data: { data: '0xcd' },
				}).data,
			).toBe('0xcd');
			expect(
				new contractErrors.Eip838ExecutionError({
					code: 3,
					message: 'm',
					data: { originalError: { data: '0xef' } },
				}).data,
			).toBe('0xef');
		});

		it.each([5, true, ['0x'], { data: 5 }, { originalError: { data: ['0x'] } }])(
			'accepts data only when it is a string (%p)',
			data => {
				const error = new contractErrors.Eip838ExecutionError({
					code: 3,
					message: 'm',
					data,
				} as never);
				expect(error.data).toBeUndefined();
			},
		);

		it('never copies a provider-supplied name or stack and keeps its own trace', () => {
			const error = new contractErrors.Eip838ExecutionError({
				code: 3,
				message: 'execution reverted',
				name: 'RangeError',
				stack: 'INJECTED\n    at evil.js:1:1',
				data: '0x08c379a0',
			} as never);
			expect(error.name).toBe('Eip838ExecutionError');
			expect(error.stack).toEqual(expect.stringContaining('Eip838ExecutionError'));
			expect(error.stack).not.toContain('INJECTED');
			expect(error.message).toBe('execution reverted');

			const withoutStack = new contractErrors.Eip838ExecutionError({
				code: 3,
				message: 'execution reverted',
				data: '0x',
			});
			expect(typeof withoutStack.stack).toBe('string');
			expect(withoutStack.stack).toEqual(expect.stringContaining('errors.test'));
		});
	});

	describe('BigInt values in error constructors (L-46)', () => {
		const receipt = {
			blockNumber: BigInt(1),
			status: BigInt(1),
			gasUsed: BigInt(21000),
		} as never;

		it.each([
			[
				'ChainIdMismatchError',
				() =>
					new transactionErrors.ChainIdMismatchError({
						txChainId: BigInt(1),
						customChainId: BigInt(2),
					}),
			],
			[
				'ChainMismatchError',
				() =>
					new transactionErrors.ChainMismatchError({
						txChain: BigInt(1),
						baseChain: 'mainnet',
					}),
			],
			[
				'HardforkMismatchError',
				() =>
					new transactionErrors.HardforkMismatchError({
						txHardfork: BigInt(1),
						commonHardfork: 'x',
					}),
			],
			[
				'TransactionOutOfGasError',
				() => new transactionErrors.TransactionOutOfGasError(receipt),
			],
			[
				'TransactionMissingReceiptOrBlockHashError',
				() =>
					new transactionErrors.TransactionMissingReceiptOrBlockHashError({
						receipt,
						blockHash: undefined as never,
						transactionHash: '0xab',
					}),
			],
			[
				'TransactionReceiptMissingBlockNumberError',
				() => new transactionErrors.TransactionReceiptMissingBlockNumberError({ receipt }),
			],
		])('%s renders a bigint instead of throwing a TypeError', (_name, build) => {
			expect(build).not.toThrow();
			expect(build().message).toEqual(expect.stringContaining('1'));
		});
	});

	describe('HttpStatusError (L-47)', () => {
		it('carries the status line, the retry-after delay and a JSON-RPC error body', () => {
			const body = new responseErrors.ResponseError({
				jsonrpc: '2.0',
				id: 1,
				error: { code: -32000, message: 'unauthorized', data: '0x08c379a0' },
			});
			const error = new connectionErrors.HttpStatusError(429, 'Too Many Requests', 30, body);
			expect(error.data).toBe('0x08c379a0');
			expect(error.toJSON()).toMatchObject({ data: '0x08c379a0' });
			expect(error).toBeInstanceOf(connectionErrors.ConnectionError);
			expect(error.code).toBe(ERR_CONN_HTTP_STATUS);
			expect(error.status).toBe(429);
			expect(error.statusText).toBe('Too Many Requests');
			expect(error.retryAfter).toBe(30);
			expect(error.retryable).toBe(true);
			expect(error.errorCode).toBe(429);
			expect(error.errorReason).toBe('Too Many Requests');
			expect(error.innerError).toBe(body);
			expect(error.message).toBe(
				'HTTP STATUS ERROR: the JSON-RPC endpoint answered with HTTP 429 (Too Many Requests), retry after 30s. Returned error: unauthorized',
			);
			expect(error.toJSON()).toMatchObject({
				name: 'HttpStatusError',
				status: 429,
				statusText: 'Too Many Requests',
				retryAfter: 30,
				retryable: true,
			});
		});

		it.each([
			[401, false],
			[403, false],
			[404, false],
			[408, true],
			[429, true],
			[500, true],
			[502, true],
			[503, true],
			[504, true],
		])('marks HTTP %i retryable=%p', (status, retryable) => {
			const error = new connectionErrors.HttpStatusError(status);
			expect(error.retryable).toBe(retryable);
			expect(error.message).toBe(
				`HTTP STATUS ERROR: the JSON-RPC endpoint answered with HTTP ${status}`,
			);
		});
	});

	describe('client URL redaction (L-48)', () => {
		it.each([
			['http://user:s3cret@127.0.0.1:8545/v3/KEY', 'http://***@127.0.0.1:8545/[redacted]'],
			['https://host.example/v3/API-KEY?token=x#f', 'https://host.example/[redacted]'],
			['wss://user:pw@node.example:8546', 'wss://***@node.example:8546'],
			['http://localhost:8545/', 'http://localhost:8545/'],
			['http://localhost:8545', 'http://localhost:8545'],
			['htt://localhost:8545', 'htt://localhost:8545'],
			['http//localhost:8545', 'http//localhost:8545'],
			['/var/run/gqrl.ipc', '/var/run/gqrl.ipc'],
			['', ''],
		])('redacts %s to %s', (url, redacted) => {
			expect(redactClientUrl(url)).toBe(redacted);
		});

		it('renders non-strings with String()', () => {
			// eslint-disable-next-line no-null/no-null
			expect(redactClientUrl(null)).toBe('null');
			expect(redactClientUrl(undefined)).toBe('undefined');
			expect(redactClientUrl(42)).toBe('42');
		});

		it('keeps credentials and paths out of InvalidClientError and InvalidProviderError', () => {
			const url = 'http://alice:hunter2@127.0.0.1:1/v3/API-KEY-0123456789abcdef';
			const client = new providerErrors.InvalidClientError(url);
			expect(client.message).toBe(
				'Client URL "http://***@127.0.0.1:1/[redacted]" is invalid.',
			);
			expect(client.message).not.toContain('hunter2');
			expect(client.message).not.toContain('API-KEY');
			const provider = new providerErrors.InvalidProviderError(url);
			expect(provider.message).not.toContain('hunter2');
			expect(provider.message).not.toContain('API-KEY');
		});

		it('appends the transport reason to InvalidConnectionError', () => {
			const error = new connectionErrors.InvalidConnectionError('127.0.0.1:1', {
				reason: 'ECONNREFUSED',
			});
			expect(error.message).toBe(
				"CONNECTION ERROR: Couldn't connect to node 127.0.0.1:1. Reason: ECONNREFUSED",
			);
			expect(error.errorReason).toBe('ECONNREFUSED');
			expect(error.errorCode).toBeUndefined();
		});
	});

	describe('base error hygiene (I-15)', () => {
		it('captures the stack trace onto the instance, not onto the global Function', () => {
			expect(Object.getOwnPropertyDescriptor(Function, 'stack')).toBeUndefined();
			const error = new responseErrors.ResponseError({
				jsonrpc: '2.0',
				id: 1,
				error: { code: 1, message: 'x' },
			});
			expect(Object.getOwnPropertyDescriptor(Function, 'stack')).toBeUndefined();
			expect(error.stack).toEqual(
				expect.stringContaining('ResponseError: Returned error: x'),
			);
			expect(error.stack).toEqual(expect.stringContaining('errors.test'));
		});

		it('ConfigChainMismatchError uses the chain mismatch code', () => {
			expect(new coreErrors.ConfigChainMismatchError('a', 'b').code).toBe(
				ERR_CORE_CHAIN_MISMATCH,
			);
			expect(new coreErrors.ConfigChainMismatchError('a', 'b').code).not.toBe(
				new coreErrors.ConfigHardforkMismatchError('a', 'b').code,
			);
		});

		it.each([
			['missing', { jsonrpc: '2.0', id: 1, error: { message: 'x' } }],
			// eslint-disable-next-line no-null/no-null
			['null', { jsonrpc: '2.0', id: 1, error: { code: null, message: 'x' } }],
			['no error member', { jsonrpc: '2.0', id: 1 }],
		])('RpcError tolerates a %s error code', (_label, reply) => {
			let error: rpcErrors.RpcError | undefined;
			expect(() => {
				error = new rpcErrors.RpcError(reply as never);
			}).not.toThrow();
			expect(error?.message).toEqual(expect.stringContaining('An Rpc error has occured'));
			expect(error?.id).toBe(1);
		});

		it('RpcError keeps rendering a present code', () => {
			expect(
				new rpcErrors.RpcError({
					jsonrpc: '2.0',
					id: 1,
					error: { code: 123, message: 'x' },
				}).message,
			).toBe('An Rpc error has occured with a code of 123');
		});

		class SomeInvalidValueError extends InvalidValueError {
			public code = 0;
		}

		it('bounds the value echoed by InvalidValueError', () => {
			const error = new SomeInvalidValueError('a'.repeat(4_000_000), 'too long');
			expect(error.message.length).toBeLessThan(MAX_ECHOED_VALUE_LENGTH + 100);
			expect(error.message).toEqual(
				expect.stringContaining('... [truncated, 4000000 characters]'),
			);
			expect(new SomeInvalidValueError('a'.repeat(256), 'fits').message).toBe(
				`Invalid value given "${'a'.repeat(256)}". Error: fits.`,
			);
		});

		it('survives circular values and a throwing toJSON', () => {
			const circular: Record<string, unknown> = {};
			circular.self = circular;
			expect(() => new SomeInvalidValueError(circular, 'circular')).not.toThrow();
			expect(new SomeInvalidValueError(circular, 'circular').message).toBe(
				'Invalid value given "[unserialisable object]". Error: circular.',
			);
			const throwing = {
				toJSON() {
					throw new Error('boom');
				},
			};
			expect(() => new SomeInvalidValueError(throwing, 'throws')).not.toThrow();
			expect(BaseWeb3Error.convertToString(circular)).toBe('[unserialisable object]');
			expect(BaseWeb3Error.convertToString(() => 1)).toBe('undefined');
			expect(BaseWeb3Error.convertToString(Symbol('s'), true)).toBe('undefined');
		});

		it('InvalidResponseError names an id mismatch', () => {
			const request = { jsonrpc: '2.0', id: 1, method: 'qrl_blockNumber', params: [] };
			const mismatch = new responseErrors.InvalidResponseError(
				{ jsonrpc: '2.0', id: 999, result: '0x1' },
				request as never,
			);
			expect(mismatch.message).toBe(
				'Invalid JSON-RPC response: response id 999 does not match request id 1',
			);
			const mismatchWithError = new responseErrors.InvalidResponseError(
				{ jsonrpc: '2.0', id: '7', error: { code: 1, message: 'boom', data: '0x' } },
				request as never,
			);
			expect(mismatchWithError.message).toBe(
				'Invalid JSON-RPC response: response id "7" does not match request id 1. Returned error: boom',
			);
			expect(mismatchWithError.data).toBe('0x');
			// Matching ids and batches keep the historical message.
			expect(
				new responseErrors.InvalidResponseError(
					{ jsonrpc: '2.0', id: 1, error: { code: 1, message: 'boom' } },
					request as never,
				).message,
			).toBe('Returned error: boom');
			expect(
				new responseErrors.InvalidResponseError(
					[{ jsonrpc: '2.0', id: 2, result: '0x1' }] as never,
					[request] as never,
				).message,
			).toBe('Returned error: ');
		});

		it('RequestSerializationError is typed and does not echo the payload', () => {
			const error = new providerErrors.RequestSerializationError(
				'Do not know how to serialize a BigInt',
			);
			expect(error.code).toBe(ERR_REQUEST_SERIALIZATION);
			expect(error.message).toBe(
				'REQUEST SERIALIZATION FAILED: the JSON-RPC payload could not be serialised as JSON (Do not know how to serialize a BigInt)',
			);
			expect(error.toJSON()).toMatchObject({
				reason: 'Do not know how to serialize a BigInt',
			});
		});
	});
});
