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
	BaseWeb3Error,
	ContractExecutionError,
	InvalidProviderError,
	InvalidResponseError,
	ProviderError,
	ResponseError,
	redactClientUrl,
} from '@theqrl/web3-errors';
import HttpProvider from '@theqrl/web3-providers-http';
import WSProvider from '@theqrl/web3-providers-ws';
import {
	QRLExecutionAPI,
	JsonRpcBatchRequest,
	JsonRpcBatchResponse,
	JsonRpcPayload,
	JsonRpcResponse,
	JsonRpcError,
	JsonRpcResponseWithResult,
	JsonRpcResponseWithError,
	SupportedProviders,
	Web3APIMethod,
	Web3APIPayload,
	Web3APIRequest,
	Web3APIReturnType,
	Web3APISpec,
	Web3BaseProvider,
	Web3BaseProviderConstructor,
} from '@theqrl/web3-types';
import { isNullish, isPromise, jsonRpc, isResponseRpcError } from '@theqrl/web3-utils';
import {
	isEIP1193Provider,
	isLegacyRequestProvider,
	isLegacySendAsyncProvider,
	isLegacySendProvider,
	isWeb3Provider,
} from './utils.js';
import {
	isEip1193ProviderErrorCode,
	isRevertError,
	toEip1193ProviderError,
	toRpcSpecificationError,
} from './rpc_error_mapping.js';
import { Web3EventEmitter } from './web3_event_emitter.js';

export enum Web3RequestManagerEvent {
	PROVIDER_CHANGED = 'PROVIDER_CHANGED',
	BEFORE_PROVIDER_CHANGE = 'BEFORE_PROVIDER_CHANGE',
}

const availableProviders: {
	HttpProvider: Web3BaseProviderConstructor;
	WebsocketProvider: Web3BaseProviderConstructor;
} = {
	HttpProvider: HttpProvider as unknown as Web3BaseProviderConstructor,
	WebsocketProvider: WSProvider as unknown as Web3BaseProviderConstructor,
};

const NULLISH_RESPONSE_MESSAGE = 'Got a "nullish" response from provider.';

export class Web3RequestManager<
	API extends Web3APISpec = QRLExecutionAPI,
> extends Web3EventEmitter<{
	[key in Web3RequestManagerEvent]: SupportedProviders<API> | undefined;
}> {
	private _provider?: SupportedProviders<API>;
	private readonly useRpcCallSpecification?: boolean;
	public constructor(
		provider?: SupportedProviders<API> | string,
		useRpcCallSpecification?: boolean,
	) {
		super();

		if (!isNullish(provider)) {
			this.setProvider(provider);
		}
		this.useRpcCallSpecification = useRpcCallSpecification;
	}

	/**
	 * Will return all available providers
	 */
	public static get providers() {
		return availableProviders;
	}

	/**
	 * Will return the current provider.
	 *
	 * @returns Returns the current provider
	 */
	public get provider() {
		return this._provider;
	}

	/**
	 * Will return all available providers
	 */
	// eslint-disable-next-line class-methods-use-this
	public get providers() {
		return availableProviders;
	}

	/**
	 * Use to set provider. Provider can be a provider instance or a string.
	 *
	 * A `http(s)://` or `ws(s)://` URL is turned into the matching built-in provider; any other
	 * string (an IPC path included: construct an `IpcProvider` from `@theqrl/web3-providers-ipc`
	 * and pass the instance) throws a {@link ProviderError}. An empty or blank string throws an
	 * {@link InvalidProviderError} instead of being stored and failing on the first request, and a
	 * value that is neither a string nor an object throws a {@link ProviderError} (I-14).
	 *
	 * Setting the provider instance that is already set is a no-op: the change events are not
	 * emitted, so live subscriptions are kept (L-36).
	 *
	 * @param provider - The provider to set
	 */
	public setProvider(provider?: SupportedProviders<API> | string): boolean {
		let newProvider: SupportedProviders<API> | undefined;

		if (typeof provider === 'string') {
			if (provider.trim() === '') {
				throw new InvalidProviderError(provider);
			}

			// autodetect provider
			if (/^http(s)?:\/\//i.test(provider)) {
				// HTTP
				newProvider = new this.providers.HttpProvider<API>(provider);
			} else if (/^ws(s)?:\/\//i.test(provider)) {
				// WS
				newProvider = new this.providers.WebsocketProvider<API>(provider);
			} else {
				throw new ProviderError(
					`Can't autodetect provider for "${redactClientUrl(provider)}"`,
				);
			}
		} else if (isNullish(provider)) {
			// In case want to unset the provider
			newProvider = undefined;
		} else if (typeof provider !== 'object' && typeof provider !== 'function') {
			throw new ProviderError(
				`Invalid provider: expected a provider URL or a provider instance, got ${typeof provider}`,
			);
		} else {
			newProvider = provider;
		}

		if (newProvider === this._provider) {
			return true;
		}

		this.emit(Web3RequestManagerEvent.BEFORE_PROVIDER_CHANGE, this._provider);
		this._provider = newProvider;
		this.emit(Web3RequestManagerEvent.PROVIDER_CHANGED, this._provider);
		return true;
	}

	/**
	 *
	 * Will execute a request
	 *
	 * @param request - {@link Web3APIRequest} The request to send
	 *
	 * @returns The response of the request {@link ResponseType}. If there is error
	 * in the response, will throw an error
	 */
	public async send<
		Method extends Web3APIMethod<API>,
		ResponseType = Web3APIReturnType<API, Method>,
	>(request: Web3APIRequest<API, Method>): Promise<ResponseType> {
		const response = await this._sendRequest<Method, ResponseType>(request);
		if (jsonRpc.isResponseWithResult(response)) {
			return response.result;
		}

		throw new ResponseError(response);
	}

	/**
	 * Same as send, but, will execute a batch of requests
	 *
	 * Resolves with the array of replies, which may contain error replies next to result
	 * replies; a reply that is not an array of result/error replies (a `null` member, a member
	 * without `result` and `error`, a bare value) rejects with a {@link ResponseError} on every
	 * provider kind (L-38).
	 *
	 * @param request {@link JsonRpcBatchRequest} The batch request to send
	 */
	public async sendBatch(request: JsonRpcBatchRequest): Promise<JsonRpcBatchResponse<unknown>> {
		const response = await this._sendRequest<never, never>(request);

		return response as JsonRpcBatchResponse<unknown>;
	}

	private async _sendRequest<
		Method extends Web3APIMethod<API>,
		ResponseType = Web3APIReturnType<API, Method>,
	>(
		request: Web3APIRequest<API, Method> | JsonRpcBatchRequest,
	): Promise<JsonRpcResponse<ResponseType>> {
		const { provider } = this;

		if (isNullish(provider)) {
			throw new ProviderError(
				'Provider not available. Use `.setProvider` or `.provider=` to initialize the provider.',
			);
		}

		const payload = jsonRpc.isBatchRequest(request)
			? jsonRpc.toBatchPayload(request)
			: jsonRpc.toPayload(request);

		if (isWeb3Provider(provider)) {
			let response;

			try {
				response = await provider.request<Method, ResponseType>(
					payload as Web3APIPayload<API, Method>,
				);
			} catch (error) {
				// Check if the provider throw an error instead of reject with error.
				// Only a value that really is a JSON-RPC response may be processed as one;
				// anything else is the real failure and is surfaced as such.
				if (!Web3RequestManager._isJsonRpcResponse<ResponseType>(error)) {
					throw Web3RequestManager._buildNonJsonRpcError(error);
				}
				response = error;
			}
			return this._processJsonRpcResponse(payload, response, { legacy: false, error: false });
		}

		if (isEIP1193Provider(provider)) {
			return (provider as Web3BaseProvider<API>)
				.request<Method, ResponseType>(payload as Web3APIPayload<API, Method>)
				.then(
					res =>
						this._processJsonRpcResponse(payload, res, {
							legacy: true,
							error: false,
						}) as JsonRpcResponseWithResult<ResponseType>,
				)
				.catch(error => {
					if (!Web3RequestManager._isJsonRpcResponse<ResponseType>(error)) {
						throw Web3RequestManager._buildNonJsonRpcError(error);
					}

					return this._processJsonRpcResponse(payload, error, {
						legacy: true,
						error: true,
					});
				});
		}

		// NOTE(rgeraldes24): there are unit/integration tests that depend on the legacy providers
		// TODO: This could be deprecated and removed.
		if (isLegacyRequestProvider(provider)) {
			return new Promise<JsonRpcResponse<ResponseType>>((resolve, reject) => {
				const rejectWithError = (err: unknown) => {
					if (!Web3RequestManager._isJsonRpcResponse<ResponseType>(err)) {
						reject(Web3RequestManager._buildNonJsonRpcError(err));
						return;
					}

					reject(
						this._processJsonRpcResponse(payload, err, {
							legacy: true,
							error: true,
						}),
					);
				};

				const resolveWithResponse = (response: JsonRpcResponse<ResponseType>) =>
					resolve(
						this._processJsonRpcResponse(payload, response, {
							legacy: true,
							error: false,
						}),
					);
				const result = provider.request<ResponseType>(
					payload,
					// a callback that is expected to be called after getting the response:
					(err, response) => {
						try {
							// A falsy error such as `0` or `''` is still an error; only a nullish
							// one means "no error" (L-42).
							if (!isNullish(err)) {
								return rejectWithError(err);
							}

							// A callback that carries neither an error nor a response reported a
							// failure the provider could not describe; it is not a `null` result
							// (L-42).
							if (isNullish(response)) {
								return reject(
									new ResponseError({} as never, NULLISH_RESPONSE_MESSAGE),
								);
							}

							return resolveWithResponse(response);
						} catch (processingError) {
							// An asynchronous callback runs outside the Promise executor.
							// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Preserve JSON-RPC batch rejection values.
							return reject(processingError);
						}
					},
				);
				// Some providers, that follow a previous drafted version of EIP1193, has a `request` function
				//	that is not defined as `async`, but it returns a promise.
				// Such providers would not be picked with if(isEIP1193Provider(provider)) above
				//	because the `request` function was not defined with `async` and so the function definition is not `AsyncFunction`.
				// Like this provider: https://github.dev/NomicFoundation/hardhat/blob/62bea2600785595ba36f2105564076cf5cdf0fd8/packages/hardhat-core/src/internal/core/providers/backwards-compatibility.ts#L19
				// So check if the returned result is a Promise, and resolve with it accordingly.
				// Note: in this case we expect the callback provided above to never be called.
				if (isPromise(result)) {
					const responsePromise = result as unknown as Promise<
						JsonRpcResponse<ResponseType>
					>;
					responsePromise.then(resolveWithResponse).catch(error => {
						if (!Web3RequestManager._isJsonRpcResponse<ResponseType>(error)) {
							reject(Web3RequestManager._buildNonJsonRpcError(error));
							return;
						}

						try {
							// Attempt to process the error response
							const processedError = this._processJsonRpcResponse(payload, error, {
								legacy: true,
								error: true,
							});
							reject(processedError);
						} catch (processingError) {
							// Catch any errors that occur during the error processing
							reject(processingError);
						}
					});
				}
			});
		}

		// TODO: This could be deprecated and removed.
		if (isLegacySendProvider(provider)) {
			return new Promise<JsonRpcResponse<ResponseType>>((resolve, reject): void => {
				provider.send<ResponseType>(payload, (err, response) => {
					try {
						if (!isNullish(err)) {
							if (!Web3RequestManager._isJsonRpcResponse<ResponseType>(err)) {
								return reject(Web3RequestManager._buildNonJsonRpcError(err));
							}

							return reject(
								this._processJsonRpcResponse(payload, err, {
									legacy: true,
									error: true,
								}),
							);
						}

						if (isNullish(response)) {
							return reject(new ResponseError({} as never, NULLISH_RESPONSE_MESSAGE));
						}

						return resolve(
							this._processJsonRpcResponse(payload, response, {
								legacy: true,
								error: false,
							}),
						);
					} catch (processingError) {
						// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Preserve JSON-RPC batch rejection values.
						return reject(processingError);
					}
				});
			});
		}

		// TODO: This could be deprecated and removed.
		if (isLegacySendAsyncProvider(provider)) {
			return provider
				.sendAsync<ResponseType>(payload)
				.then(response =>
					this._processJsonRpcResponse(payload, response, { legacy: true, error: false }),
				)
				.catch(error => {
					if (!Web3RequestManager._isJsonRpcResponse<ResponseType>(error)) {
						throw Web3RequestManager._buildNonJsonRpcError(error);
					}

					return this._processJsonRpcResponse(payload, error, {
						legacy: true,
						error: true,
					});
				});
		}

		throw new ProviderError('Provider does not have a request method to use.');
	}

	/**
	 * A value thrown by (or rejected from) a provider is not necessarily a JSON-RPC
	 * response: it can be a `TypeError`, a network `Error`, a string, or any other
	 * value. Verify the shape with the shared JSON-RPC predicates before treating it
	 * as a response, instead of casting it blindly.
	 *
	 * A nullish value is not a response either: `throw undefined` / `reject()` is a failure the
	 * provider could not describe and must not become a successful `null` result (L-42).
	 */
	private static _isJsonRpcResponse<ResultType, ErrorType = unknown>(
		value: unknown,
	): value is JsonRpcResponse<ResultType, ErrorType> {
		if (isNullish(value)) {
			return false;
		}

		const response = value as JsonRpcResponse<ResultType, ErrorType>;

		return (
			jsonRpc.isBatchResponse<ResultType, ErrorType>(response) ||
			jsonRpc.isResponseWithError<ErrorType, ResultType>(response) ||
			jsonRpc.isResponseWithResult<ResultType, ErrorType>(response)
		);
	}

	/**
	 * Builds the error to surface for a value that came out of a provider's error path
	 * but is not a JSON-RPC response. Always returns an `Error`, so callers can `throw`
	 * or `reject` with it without risking a second, unrelated failure.
	 */
	private static _buildNonJsonRpcError(value: unknown): Error {
		if (value instanceof Error) {
			// A real `Error` already is the real failure, so surface it unchanged. The
			// revert check is kept because `_processJsonRpcResponse` used to apply it to
			// `Error` instances, and an EIP-838 revert must still decode as one.
			try {
				Web3RequestManager._isReverted(value as unknown as JsonRpcResponse<never, never>);
			} catch (revertError) {
				return revertError as Error;
			}

			return value;
		}

		if (isNullish(value)) {
			return new ProviderError(
				`Provider rejected the request without an error value (got ${
					value === undefined ? 'undefined' : 'null'
				})`,
			);
		}

		let description: string;
		try {
			description = BaseWeb3Error.convertToString(value);
		} catch {
			// e.g. a circular structure
			description = typeof value;
		}

		const error = new ProviderError(
			`Provider returned a value that is not a valid JSON-RPC response: ${description}`,
		);
		// Preserve the original value so the real failure is not lost.
		error.innerError = value as Error;
		(error as { cause?: unknown }).cause = value;

		return error;
	}

	private _processJsonRpcResponse<ResultType, ErrorType, RequestType>(
		payload: JsonRpcPayload<RequestType>,
		response: JsonRpcResponse<ResultType, ErrorType>,
		{ legacy, error }: { legacy: boolean; error: boolean },
	): JsonRpcResponse<ResultType> | never {
		if (jsonRpc.isBatchRequest(payload)) {
			return Web3RequestManager._processBatchJsonRpcResponse(response);
		}

		if (isNullish(response)) {
			return this._buildResponse(
				payload,
				// Some providers uses "null" as valid empty response
				// eslint-disable-next-line no-null/no-null
				null as unknown as JsonRpcResponse<ResultType, ErrorType>,
				error,
			);
		}

		// Check correlation before returning a result or interpreting a remote error.
		// IDs retain their type, and zero and the empty string are valid IDs.
		if (
			!jsonRpc.isBatchRequest(payload) &&
			(jsonRpc.isResponseWithResult(response) || jsonRpc.isResponseWithError(response)) &&
			payload.id !== response.id
		) {
			throw new InvalidResponseError<ErrorType, RequestType>(response, payload);
		}

		// This is the majority of the cases so check these first
		// A valid JSON-RPC response with error object
		if (jsonRpc.isResponseWithError<ErrorType>(response)) {
			const rpcErrorResponse = response as JsonRpcResponseWithError;

			// A revert is a revert in both modes: the contract layer decodes `error.data` from
			// the ContractExecutionError, which `useRpcCallSpecification` used to replace with
			// an InvalidInputError (-32000) or a bare RpcError (code 3) (I-14).
			Web3RequestManager._isReverted(response);

			// An EIP-1193 provider error (4001 user rejected, ...) keeps its code instead of
			// being reported as an InvalidResponseError with the code buried in innerError (I-14).
			if (isEip1193ProviderErrorCode(rpcErrorResponse.error.code)) {
				throw toEip1193ProviderError(rpcErrorResponse);
			}

			// check if rpc error flag is on and response error code match an EIP-1474 or a standard rpc error code
			if (this.useRpcCallSpecification && isResponseRpcError(rpcErrorResponse)) {
				throw toRpcSpecificationError(rpcErrorResponse);
			}

			throw new InvalidResponseError<ErrorType, RequestType>(response, payload);
		}

		// This is the majority of the cases so check these first
		// A valid JSON-RPC response with result object
		if (jsonRpc.isResponseWithResult<ResultType>(response)) {
			return response;
		}

		if ((response as unknown) instanceof Error) {
			Web3RequestManager._isReverted(response);
			throw response;
		}

		if (
			legacy &&
			!jsonRpc.isResponseWithError(response) &&
			!jsonRpc.isResponseWithResult(response)
		) {
			// A legacy provider may hand back a bare result, which is wrapped into an envelope
			// here. A reply that already is an envelope (`jsonrpc` and `id` present) but carries
			// neither a result nor an error object, such as `"error": null`, is malformed and
			// must not be returned to the caller as data.
			if (!error && Web3RequestManager._isJsonRpcEnvelope(response)) {
				throw new ResponseError(response, 'Invalid response');
			}
			return this._buildResponse(payload, response, error);
		}

		if (Array.isArray(response)) {
			throw new ResponseError(response, 'Got batch response for a normal request.');
		}

		throw new ResponseError(response, 'Invalid response');
	}

	/**
	 * The reply to a batch request is held to one shape on every provider path, whether the
	 * provider returned it or threw it: an array in which every member is a result or an error
	 * reply. A member without either would leave its batch entry pending forever, a `null`
	 * member would be dereferenced, and a single object (the one error reply a node sends for a
	 * batch it could not parse, JSON-RPC 2.0 section 6) is not a batch result (L-38). A thrown
	 * batch response is still a batch response: its error members are reported per entry.
	 */
	private static _processBatchJsonRpcResponse<ResultType, ErrorType>(
		response: JsonRpcResponse<ResultType, ErrorType>,
	): JsonRpcBatchResponse<ResultType> | never {
		if ((response as unknown) instanceof Error) {
			Web3RequestManager._isReverted(response);
			throw response;
		}

		if (isNullish(response)) {
			throw new ResponseError(response, 'Got a "nullish" response for a batch request.');
		}

		if (!Array.isArray(response)) {
			const message = (response as { error?: { message?: unknown } }).error?.message;
			throw new ResponseError(
				response,
				typeof message === 'string'
					? `Batch request failed: ${message}`
					: 'Got normal response for a batch request.',
			);
		}

		if (jsonRpc.isBatchResponse(response)) {
			return response as JsonRpcBatchResponse<ResultType>;
		}

		throw new ResponseError(
			response,
			'Invalid batch response: expected an array of JSON-RPC result or error replies',
		);
	}

	private static _isJsonRpcEnvelope(response: unknown): boolean {
		return (
			typeof response === 'object' &&
			!isNullish(response) &&
			!Array.isArray(response) &&
			(response as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
			'id' in response
		);
	}

	private static _isReverted<ResultType, ErrorType>(
		response: JsonRpcResponse<ResultType, ErrorType>,
	): boolean {
		let error: JsonRpcError | undefined;

		if (jsonRpc.isResponseWithError<ErrorType>(response)) {
			error = (response as JsonRpcResponseWithError).error;
		} else if ((response as unknown) instanceof Error) {
			error = response as unknown as JsonRpcError;
		}

		// This message means that there was an error while executing the code of the smart contract
		// However, more processing will happen at a higher level to decode the error data,
		//	according to the Error ABI, if it was available as of EIP-838.
		if (isRevertError(error)) throw new ContractExecutionError(error as JsonRpcError);

		return false;
	}
	// Need to use same types as _processJsonRpcResponse so have to declare as instance method
	// eslint-disable-next-line class-methods-use-this
	private _buildResponse<ResultType, ErrorType, RequestType>(
		payload: JsonRpcPayload<RequestType>,
		response: JsonRpcResponse<ResultType, ErrorType>,
		error: boolean,
	): JsonRpcResponse<ResultType> {
		const res = {
			jsonrpc: '2.0',
			id: jsonRpc.isBatchRequest(payload)
				? payload[0].id
				: 'id' in payload
					? payload.id
					: // Have to use the null here explicitly
						// eslint-disable-next-line no-null/no-null
						null,
		};

		if (error) {
			return {
				...res,
				error: response as unknown,
			} as JsonRpcResponse<ResultType>;
		}

		return {
			...res,
			result: response as unknown,
		} as JsonRpcResponse<ResultType>;
	}
}
