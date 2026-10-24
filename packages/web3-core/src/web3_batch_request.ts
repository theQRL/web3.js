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
	JsonRpcBatchResponse,
	JsonRpcId,
	JsonRpcOptionalRequest,
	JsonRpcRequest,
	JsonRpcResponse,
} from '@theqrl/web3-types';
import { jsonRpc, Web3DeferredPromise } from '@theqrl/web3-utils';
import {
	InvalidMethodParamsError,
	OperationAbortError,
	OperationTimeoutError,
	ResponseError,
} from '@theqrl/web3-errors';
import { toBatchEntryError } from './rpc_error_mapping.js';
import { Web3RequestManager } from './web3_request_manager.js';

export const DEFAULT_BATCH_REQUEST_TIMEOUT = 1000;

/**
 * Collects JSON-RPC requests and sends them as one batch.
 *
 * `add()` returns a promise per request and `execute()` sends the batch. `execute()` resolves
 * with the complete array of replies **including the error replies**: a node that answers one
 * member with a JSON-RPC error does not fail the batch. The promise of that member is rejected
 * with a typed error ({@link ResponseError}, the EIP-1474 class of the code, an
 * `EIP1193ProviderRpcError` or a `ContractExecutionError` for a revert) and is marked as handled,
 * so a caller that follows the documented `batch.add(request); await batch.execute()` pattern
 * and never retains the entry promise is not terminated by an unhandled rejection (M-7a). The
 * array `execute()` resolves with is therefore the mandatory place to look for per-request
 * errors; the entry promises are a convenience for callers that keep them.
 *
 * `execute()` itself rejects only when the batch as a whole failed (transport error, timeout, a
 * reply that is not an array of result/error replies, size or id mismatch), and then every
 * pending entry promise is rejected with a typed error as well.
 *
 * @example
 * ```ts
 * const batch = new web3.BatchRequest();
 * batch.add({ id: 1, method: 'qrl_blockNumber', params: [] });
 * const balance = batch.add({ id: 2, method: 'qrl_getBalance', params: [address, 'latest'] });
 * const replies = await batch.execute(); // [{ id: 1, result }, { id: 2, result | error }]
 * ```
 */
export class Web3BatchRequest {
	private readonly _requestManager: Web3RequestManager;
	private readonly _requests: Map<
		JsonRpcId,
		{ payload: JsonRpcRequest; promise: Web3DeferredPromise<unknown> }
	>;

	public constructor(requestManager: Web3RequestManager) {
		this._requestManager = requestManager;
		this._requests = new Map();
	}

	public get requests() {
		return [...this._requests.values()].map(r => r.payload);
	}

	/**
	 * Adds a request to the batch and returns the promise of its reply.
	 *
	 * An explicit `id` that is already used by another entry of the batch throws an
	 * {@link InvalidMethodParamsError}: the earlier entry used to be silently replaced and its
	 * promise never settled (I-14).
	 */
	public add<ResponseType = unknown>(request: JsonRpcOptionalRequest<unknown>) {
		const payload = jsonRpc.toPayload(request) as JsonRpcRequest;
		if (this._requests.has(payload.id)) {
			throw new InvalidMethodParamsError(
				`Batch request id "${String(payload.id)}" is already used by another entry`,
			);
		}

		const promise = new Web3DeferredPromise<ResponseType>();
		// The reply of every entry is also reported through the array `execute()` resolves
		// with, so a rejection the caller never attaches a handler to must not terminate the
		// process (M-7a).
		void promise.catch(() => undefined);

		// Batch entries are heterogeneous; the returned promise keeps the caller's response type.
		this._requests.set(payload.id, {
			payload,
			promise: promise as unknown as Web3DeferredPromise<unknown>,
		});

		return promise;
	}

	/**
	 * Sends the batch. See the class documentation for what the result carries and when this
	 * rejects.
	 */
	public async execute(options?: {
		timeout?: number;
	}): Promise<JsonRpcBatchResponse<unknown, unknown>> {
		if (this.requests.length === 0) {
			return Promise.resolve([]);
		}

		const request = new Web3DeferredPromise<JsonRpcBatchResponse<unknown, unknown>>({
			timeout: options?.timeout ?? DEFAULT_BATCH_REQUEST_TIMEOUT,
			eagerStart: true,
			timeoutMessage: 'Batch request timeout',
		});

		this._processBatchRequest(request).catch(err => request.reject(err));

		void request.catch((err: unknown) => {
			this._abortAllRequests(
				err instanceof OperationTimeoutError
					? new OperationAbortError('Batch request timeout')
					: err,
			);
		});

		return request;
	}

	private async _processBatchRequest(
		promise: Web3DeferredPromise<JsonRpcBatchResponse<unknown, unknown>>,
	) {
		const response = await this._requestManager.sendBatch(
			[...this._requests.values()].map(r => r.payload),
		);
		// A late reply must not change entries that were already rejected on timeout.
		if (promise.state !== 'pending') return;

		if (!Array.isArray(response)) {
			this._abortAllRequests(new OperationAbortError('Invalid batch response'));

			throw new ResponseError(
				response as JsonRpcResponse,
				'Invalid batch response: expected an array of JSON-RPC replies',
			);
		}

		if (response.length !== this._requests.size) {
			this._abortAllRequests(new OperationAbortError('Invalid batch response'));

			throw new ResponseError(
				response,
				`Batch request size mismatch the results size. Requests: ${this._requests.size}, Responses: ${response.length}`,
			);
		}

		// Every member must be a result or an error reply; anything else (`null`, an envelope
		// with neither member) would leave its entry pending forever or be dereferenced (L-38).
		if (!jsonRpc.isBatchResponse(response)) {
			this._abortAllRequests(new OperationAbortError('Invalid batch response'));

			throw new ResponseError(
				response,
				'Invalid batch response: every member must be a JSON-RPC result or error reply',
			);
		}

		const remainingIds = new Set(this._requests.keys());
		const responseIds = response.map(r => r.id);
		// Deleting each ID checks both membership and uniqueness without coercing UUIDs
		// or treating a numeric ID as equal to a string containing the same digits.
		if (!responseIds.every(id => remainingIds.delete(id))) {
			this._abortAllRequests(new OperationAbortError('Invalid batch response'));
			const requestIdLabels = [...this._requests.keys()].map(String).sort();
			const responseIdLabels = responseIds.map(String).sort();

			throw new ResponseError(
				response,
				`Batch request mismatch the results. Requests: [${requestIdLabels.join()}], Responses: [${responseIdLabels.join()}]`,
			);
		}

		for (const res of response) {
			if (jsonRpc.isResponseWithResult(res)) {
				this._requests.get(res.id)?.promise.resolve(res.result);
			} else if (jsonRpc.isResponseWithError(res)) {
				this._requests.get(res.id)?.promise.reject(toBatchEntryError(res));
			}
		}

		promise.resolve(response);
	}

	/**
	 * Rejects every pending entry. The reason is always an `Error`: a value that is not one
	 * (a raw reply object from a mocked request manager, for example) is wrapped in a
	 * {@link ResponseError} so that entry promises never reject with a bare object (M-7a).
	 */
	private _abortAllRequests(error: unknown) {
		const reason =
			error instanceof Error
				? error
				: new ResponseError(error as JsonRpcResponse, 'Batch request failed');
		for (const { promise } of this._requests.values()) {
			if (promise.state === 'pending') promise.reject(reason);
		}
	}
}
