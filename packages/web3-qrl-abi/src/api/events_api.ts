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

import { rightPad, sha3Raw } from '@theqrl/web3-utils';
import { AbiError } from '@theqrl/web3-errors';
import { AbiEventFragment } from '@theqrl/web3-types';
import {
	canonicalizeSignature,
	jsonInterfaceMethodToString,
	isAbiEventFragment,
} from '../utils.js';

/** Length, in hex characters, of a QRVM log topic (64 bytes; go-qrl's `common.LogTopicLength`). */
const TOPIC_HEX_LENGTH = 128;

/**
 * Encodes the event name to its log topic: the keccak256 hash of the canonical event signature
 * (name and input types) in the high 32 bytes of a 64-byte QRVM topic, the low 32 bytes zero.
 * That is the `topics[0]` Hyperion emits for the event and the form go-qrl's `ParseLogTopic`
 * accepts in a `qrl_getLogs` / `logs` filter; a 32-byte value is rejected by the node.
 * @param functionName - The event name to encode, or the {@link AbiEventFragment} object of the event. If string, it has to be in the form of `eventName(param1Type,param2Type,...)`. eg: myEvent(uint256,bytes32).
 * @returns - The 64-byte log topic of the event as a hex string.
 *
 * @example
 * ```ts
 * const event = web3.qrl.abi.encodeEventSignature({
 *   name: "myEvent",
 *   type: "event",
 *   inputs: [
 *     {
 *       type: "uint256",
 *       name: "myNumber",
 *     },
 *     {
 *       type: "bytes32",
 *       name: "myBytes",
 *     },
 *   ],
 * });
 * console.log(event);
 * > 0xf2eeb729e636a8cb783be044acf6b7b1e2c5863735b60d6daae84c366ee87d970000000000000000000000000000000000000000000000000000000000000000
 *
 *  const event = web3.qrl.abi.encodeEventSignature({
 *   inputs: [
 *     {
 *       indexed: true,
 *       name: "from",
 *       type: "address",
 *     },
 *     {
 *       indexed: true,
 *       name: "to",
 *       type: "address",
 *     },
 *     {
 *       indexed: false,
 *       name: "value",
 *       type: "uint256",
 *     },
 *   ],
 *   name: "Transfer",
 *   type: "event",
 * });
 * console.log(event);
 * > 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef0000000000000000000000000000000000000000000000000000000000000000
 * ```
 */
export const encodeEventSignature = (functionName: string | AbiEventFragment): string => {
	if (typeof functionName !== 'string' && !isAbiEventFragment(functionName)) {
		throw new AbiError('Invalid parameter value in encodeEventSignature');
	}

	let name: string;

	if (typeof functionName === 'string') {
		name = canonicalizeSignature(functionName);
	} else {
		name = jsonInterfaceMethodToString(functionName);
	}

	return rightPad(sha3Raw(name), TOPIC_HEX_LENGTH);
};
