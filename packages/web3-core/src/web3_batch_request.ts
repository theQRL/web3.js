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
} from '@theqrl/web3-types';
import { jsonRpc, Web3DeferredPromise } from '@theqrl/web3-utils';
import { OperationAbortError, OperationTimeoutError, ResponseError } from '@theqrl/web3-errors';
import { Web3RequestManager } from './web3_request_manager.js';

export const DEFAULT_BATCH_REQUEST_TIMEOUT = 1000;

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

	public add<ResponseType = unknown>(request: JsonRpcOptionalRequest<unknown>) {
		const payload = jsonRpc.toPayload(request) as JsonRpcRequest;
		const promise = new Web3DeferredPromise<ResponseType>();

		// Batch entries are heterogeneous; the returned promise keeps the caller's response type.
		this._requests.set(payload.id, {
			payload,
			promise: promise as unknown as Web3DeferredPromise<unknown>,
		});

		return promise;
	}

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

		if (response.length !== this._requests.size) {
			this._abortAllRequests(new OperationAbortError('Invalid batch response'));

			throw new ResponseError(
				response,
				`Batch request size mismatch the results size. Requests: ${this._requests.size}, Responses: ${response.length}`,
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
				this._requests.get(res.id)?.promise.reject(res.error);
			}
		}

		promise.resolve(response);
	}

	private _abortAllRequests(error: unknown) {
		for (const { promise } of this._requests.values()) {
			if (promise.state === 'pending') promise.reject(error);
		}
	}
}
