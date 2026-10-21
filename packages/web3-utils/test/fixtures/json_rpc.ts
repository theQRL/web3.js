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
/* eslint-disable no-null/no-null */
import { JsonRpcNotification, SubscriptionParams } from '@theqrl/web3-types';

const responseWithResult = { jsonrpc: '2.0', id: 1, result: '' };
const responseWithError = { jsonrpc: '2.0', id: 1, error: { code: 1, message: 'string' } };
const responseWithSubscription = { id: 1, jsonrpc: '2.0', result: '' };
const responseWithNotfication = {
	jsonrpc: '2.0',
	method: 'subscribe',
	params: { subscription: '', result: '' } as SubscriptionParams,
} as JsonRpcNotification;
// Values a peer can put on the wire that are not JSON-RPC objects. Every predicate must reject
// them without dereferencing them.
const nonObjects: [any, boolean][] = [
	[null, false],
	[undefined, false],
	[1, false],
	['1', false],
	[true, false],
];

export const isResponseWithResultValidTest: [any, boolean][] = [
	[responseWithResult, true],
	[responseWithError, false],
	[[responseWithResult], false],
	...nonObjects,
];

export const isResponseWithErrorValidTest: [any, boolean][] = [
	[responseWithResult, false],
	[responseWithError, true],
	[[responseWithError], false],
	...nonObjects,
];

export const isResponseWithNotificationValidTest: [JsonRpcNotification, boolean][] = [
	[responseWithNotfication, true],
	...(nonObjects as [JsonRpcNotification, boolean][]),
];

export const isSubscriptionResultValidTest: [any, boolean][] = [
	[responseWithSubscription, true],
	[[], false],
	...nonObjects,
];

export const isValidResponseValidTest: [any, boolean][] = [
	[responseWithResult, true],
	[responseWithError, true],
	[[null], false],
	[[responseWithResult, null], false],
	...nonObjects,
];

export const isBatchResponseValidTest: [any, boolean][] = [
	[[responseWithResult, responseWithError], true],
	[[responseWithNotfication], false],
	[[null], false],
	[[responseWithResult, null], false],
	[[], false],
	...nonObjects,
];

export const toPayloadValidTest: [any, any][] = [
	[
		{ method: 'delete' },
		{
			method: 'delete',
			id: expect.stringMatching(
				// Uuid
				'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
			),
			jsonrpc: '2.0',
			params: undefined,
		},
	],
];
