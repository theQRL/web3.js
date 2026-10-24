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

import { format } from '@theqrl/web3-utils';
import { Web3Context, createInvalidResponseError } from '@theqrl/web3-core';
import { DataFormat, Web3NetAPI } from '@theqrl/web3-types';
import { netRpcMethods } from '@theqrl/web3-rpc-methods';

/**
 * `net_version` is a decimal string (`"1"`, go-qrl echoes `strconv.Itoa(networkId)`) and
 * `net_peerCount` a hex quantity (`"0x2"`); a numeric reply is tolerated as well. Anything else
 * (`"abc"`, `""`, `null`, `{}`, `[]`, `true`, `"1.5"`, `"-1"`, `"0x"`, `"1e3"`) is a malformed
 * or hostile reply: the formatter would hand it back unchanged and a consumer keying on the
 * network id or the peer count would act on garbage (L-40).
 */
const isUnsignedQuantity = (value: unknown): value is string | number | bigint =>
	(typeof value === 'string' && /^(0x[0-9a-f]+|[0-9]+)$/i.test(value)) ||
	(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
	(typeof value === 'bigint' && value >= BigInt(0));

/** The typed error (an `InvalidResponseError`) for a reply that is not what the method's specification allows. */
const invalidReply = createInvalidResponseError;

/**
 * Gets the current network ID, validated before it is formatted: a reply that is not a
 * non-negative integer rejects with an `InvalidResponseError` (L-40).
 */
export async function getId<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<Web3NetAPI>,
	returnFormat: ReturnFormat,
) {
	const response = await netRpcMethods.getId(web3Context.requestManager);
	if (!isUnsignedQuantity(response)) {
		throw invalidReply('net_version', 'a non-negative integer', response);
	}

	return format({ format: 'uint' }, response as unknown as number, returnFormat);
}

/**
 * Gets the number of connected peers, validated before it is formatted: a reply that is not a
 * non-negative integer rejects with an `InvalidResponseError` (L-40).
 */
export async function getPeerCount<ReturnFormat extends DataFormat>(
	web3Context: Web3Context<Web3NetAPI>,
	returnFormat: ReturnFormat,
) {
	const response = await netRpcMethods.getPeerCount(web3Context.requestManager);
	if (!isUnsignedQuantity(response)) {
		throw invalidReply('net_peerCount', 'a non-negative integer', response);
	}

	// Data returned is number in hex format
	return format({ format: 'uint' }, response as unknown as number, returnFormat);
}

/**
 * Checks whether the node is listening for peers. A reply that is not a boolean rejects with an
 * {@link InvalidResponseError} instead of being returned as is (L-40).
 */
export const isListening = async (web3Context: Web3Context<Web3NetAPI>) => {
	const response = await netRpcMethods.isListening(web3Context.requestManager);
	if (typeof response !== 'boolean') {
		throw invalidReply('net_listening', 'a boolean', response);
	}

	return response;
};
