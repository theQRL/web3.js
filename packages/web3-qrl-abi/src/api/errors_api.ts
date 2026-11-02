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

import { sha3Raw } from '@theqrl/web3-utils';
import { AbiError } from '@theqrl/web3-errors';
import { AbiErrorFragment } from '@theqrl/web3-types';
import {
	canonicalizeSignature,
	jsonInterfaceMethodToString,
	isAbiErrorFragment,
} from '../utils.js';

/**
 * Encodes the error name to its ABI signature: the 32-byte keccak256 hash of the canonical error
 * signature (name and input types). Revert data starts with the first 4 bytes of it, the
 * selector. Unlike an event signature this is not a log topic, so it keeps the 32-byte form
 * (`encodeEventSignature` returns the 64-byte QRVM topic).
 */
export const encodeErrorSignature = (functionName: string | AbiErrorFragment): string => {
	if (typeof functionName !== 'string' && !isAbiErrorFragment(functionName)) {
		throw new AbiError('Invalid parameter value in encodeErrorSignature');
	}

	let name: string;

	if (typeof functionName === 'string') {
		name = canonicalizeSignature(functionName);
	} else {
		name = jsonInterfaceMethodToString(functionName);
	}

	return sha3Raw(name);
};
