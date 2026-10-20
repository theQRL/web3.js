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

import { AbiError } from '@theqrl/web3-errors';
import { sha3Raw } from '@theqrl/web3-utils';
import { AbiFunctionFragment } from '@theqrl/web3-types';
import {
	canonicalizeSignature,
	isAbiFunctionFragment,
	jsonInterfaceMethodToString,
} from '../utils.js';
import { encodeParameters } from './parameters_api.js';

// todo Add link to JSON interface documentation
/**
 * Encodes the function name to its ABI representation, which are the first 4 bytes of the sha3 of the function name including  types.
 * @param functionName - The function name to encode or the `JSON interface` object of the function.
 * If the passed parameter is a string, it has to be in the form of `functionName(param1Type,param2Type,...)`. eg: myFunction(uint256,uint32[],bytes10,bytes)
 * @returns - The ABI signature of the function.
 * @example
 * ```ts
 * const signature = web3.qrl.abi.encodeFunctionSignature({
 *   name: "myMethod",
 *   type: "function",
 *   inputs: [
 *     {
 *       type: "uint256",
 *       name: "myNumber",
 *     },
 *     {
 *       type: "string",
 *       name: "myString",
 *     },
 *   ],
 * });
 * console.log(signature);
 * > 0x24ee0097
 *
 * const signature = web3.qrl.abi.encodeFunctionSignature('myMethod(uint256,string)')
 * console.log(signature);
 * > 0x24ee0097
 *
 * const signature = web3.qrl.abi.encodeFunctionSignature('safeTransferFrom(address,address,uint256,bytes)');
 * console.log(signature);
 * > 0xb88d4fde
 * ```
 */
export const encodeFunctionSignature = (functionName: string | AbiFunctionFragment): string => {
	if (typeof functionName !== 'string' && !isAbiFunctionFragment(functionName)) {
		throw new AbiError('Invalid parameter value in encodeFunctionSignature');
	}

	let name: string;

	if (typeof functionName === 'string') {
		name = canonicalizeSignature(functionName);
	} else {
		name = jsonInterfaceMethodToString(functionName);
	}

	return sha3Raw(name).slice(0, 10);
};

// todo Add link to JSON interface documentation
/**
 * Encodes a function call using its `JSON interface` object and given parameters.
 * @param jsonInterface - The `JSON interface` object of the function.
 * @param params - The parameters to encode
 * @returns - The ABI encoded function call, which, means the function signature and the parameters passed.
 * @example
 * ```ts
 * const sig = web3.qrl.abi.encodeFunctionCall(
 *   {
 *     name: "myMethod",
 *     type: "function",
 *     inputs: [
 *       {
 *         type: "uint256",
 *         name: "myNumber",
 *       },
 *       {
 *         type: "string",
 *         name: "myString",
 *       },
 *     ],
 *   },
 *   ["2345675643", "Hello!%"]
 * );
 * console.log(sig);
 * > 0x24ee00970000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008bd02b7b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000748656c6c6f2125000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
 *
 *
 *
 * const sig = web3.qrl.abi.encodeFunctionCall(
 *   {
 *     inputs: [
 *       {
 *         name: "account",
 *         type: "address",
 *       },
 *     ],
 *     name: "balanceOf",
 *     outputs: [
 *       {
 *         name: "",
 *         type: "uint256",
 *       },
 *     ],
 *     stateMutability: "view",
 *     type: "function",
 *   },
 *   ["Qd5812F6Cf4a0f645aa620cd57319a0Ed649dd8f5519A9dde7770ae5b0E49e547985f35eB972A2a07041561aa39c65A3991478f9B1e6749e05277dcf58A9A8B72"]
 * );
 *
 * console.log(sig);
 * > 0x70a08231d5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72
 * ```
 */
export const encodeFunctionCall = (
	jsonInterface: AbiFunctionFragment,
	params: unknown[],
): string => {
	if (!isAbiFunctionFragment(jsonInterface)) {
		throw new AbiError('Invalid parameter value in encodeFunctionCall');
	}

	return `${encodeFunctionSignature(jsonInterface)}${encodeParameters(
		jsonInterface.inputs ?? [],
		params ?? [],
	).replace('0x', '')}`;
};
