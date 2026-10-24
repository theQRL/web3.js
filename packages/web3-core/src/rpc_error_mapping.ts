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

import { JsonRpcError, JsonRpcResponseWithError } from '@theqrl/web3-types';
import { isNullish, isResponseRpcError } from '@theqrl/web3-utils';
import {
	BaseWeb3Error,
	ContractExecutionError,
	EIP1193ProviderRpcError,
	JSONRPC_ERR_CHAIN_DISCONNECTED,
	JSONRPC_ERR_DISCONNECTED,
	JSONRPC_ERR_REJECTED_REQUEST,
	JSONRPC_ERR_UNAUTHORIZED,
	JSONRPC_ERR_UNSUPPORTED_METHOD,
	ResponseError,
	RpcError,
	rpcErrorsMap,
} from '@theqrl/web3-errors';

/**
 * The EIP-1474 error code a node answers with for a reverted execution
 * (`{ code: 3, message: 'execution reverted', data: '0x…' }`).
 */
export const RPC_ERR_EXECUTION_REVERTED = 3;

const EIP1193_PROVIDER_ERROR_CODES: ReadonlySet<number> = new Set([
	JSONRPC_ERR_REJECTED_REQUEST,
	JSONRPC_ERR_UNAUTHORIZED,
	JSONRPC_ERR_UNSUPPORTED_METHOD,
	JSONRPC_ERR_DISCONNECTED,
	JSONRPC_ERR_CHAIN_DISCONNECTED,
]);

/**
 * True for a JSON-RPC error object that describes a reverted execution: the EIP-1474 code 3, or
 * any code whose message mentions a revert (go-qrl answers `-32000 execution reverted` with the
 * revert data). The caller decodes `error.data` from the resulting {@link ContractExecutionError}
 * according to the error ABI (EIP-838).
 *
 * `error` is provider supplied and is not guaranteed to carry a string `message`, so the type is
 * checked first: a bare `error.message.includes(...)` throws a misleading `TypeError` for an
 * otherwise well-formed reply such as `{ error: { code: -1 } }`.
 */
export const isRevertError = (error: JsonRpcError | undefined): boolean =>
	!isNullish(error) &&
	typeof error === 'object' &&
	(error.code === RPC_ERR_EXECUTION_REVERTED ||
		(typeof error.message === 'string' && error.message.includes('revert')));

/**
 * True for the provider error codes EIP-1193 reserves (4001 user rejected, 4100 unauthorized,
 * 4200 unsupported method, 4900 disconnected, 4901 chain disconnected).
 */
export const isEip1193ProviderErrorCode = (code: unknown): code is number =>
	typeof code === 'number' && EIP1193_PROVIDER_ERROR_CODES.has(code);

/**
 * The typed error for an EIP-1193 provider error reply. The provider's code is kept as the
 * error's `code` (I-14) and the original error object travels as `innerError`.
 */
export const toEip1193ProviderError = (
	response: JsonRpcResponseWithError,
): EIP1193ProviderRpcError => {
	const error = new EIP1193ProviderRpcError(response.error.code, response.error.data);
	error.innerError = response.error as unknown as Error;
	return error;
};

/**
 * The EIP-1474 error class registered for the reply's code, or a bare {@link RpcError} for a
 * code in the server-error range (`-32099..-32000`) that has no dedicated class.
 */
export const toRpcSpecificationError = (response: JsonRpcResponseWithError): RpcError => {
	const Err = rpcErrorsMap.get(response.error.code)?.error;
	return Err ? new Err(response) : new RpcError(response);
};

/**
 * The typed error a batch entry is rejected with for an error reply (M-7a): a revert decodes as
 * a {@link ContractExecutionError}, an EIP-1193 provider error keeps its code, a standard
 * EIP-1474 code maps to its class, and anything else is a {@link ResponseError} carrying the
 * reply's `error` as `innerError` and its `data` as `data`.
 */
export const toBatchEntryError = (response: JsonRpcResponseWithError): BaseWeb3Error => {
	if (isRevertError(response.error)) {
		return new ContractExecutionError(response.error);
	}
	if (isEip1193ProviderErrorCode(response.error.code)) {
		return toEip1193ProviderError(response);
	}
	if (isResponseRpcError(response)) {
		return toRpcSpecificationError(response);
	}
	return new ResponseError(response);
};
