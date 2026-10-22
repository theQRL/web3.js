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

import { Eip838ExecutionError } from '@theqrl/web3-errors';
import { AbiErrorFragment } from '@theqrl/web3-types';

import { encodeErrorSignature } from './api/errors_api.js';
import { decodeParameters } from './api/parameters_api.js';
import { jsonInterfaceMethodToString } from './utils.js';

// These errors are emitted by the compiler and need not appear in a contract ABI.
const builtinErrors: AbiErrorFragment[] = [
	{ type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] },
	{ type: 'error', name: 'Panic', inputs: [{ name: 'code', type: 'uint256' }] },
];

// Revert data starts with the 4-byte selector of the error that was raised.
const SELECTOR_LENGTH = 10;
const REVERT_DATA_WITH_SELECTOR = /^0x[0-9a-f]{8}/i;

/**
 * Decodes the EIP-838 revert data carried by `error.data` against the custom errors of a
 * contract ABI (plus the compiler's builtin `Error(string)` and `Panic(uint256)`), and sets
 * `errorName`, `errorSignature` and `errorArgs` on the error.
 *
 * The data is node-supplied and is never trusted: it must be a hex string carrying a full
 * 4-byte selector, the selector is matched exactly (case-insensitively) and the properties are
 * only set once the arguments decoded successfully. Anything else (a bare `revert()` with
 * `data: '0x'`, a truncated selector, an unknown selector, malformed arguments or a non-string
 * `data`) leaves the error undecoded, with `data` still holding the raw payload. Nothing is
 * logged. (L-33)
 */
export const decodeContractErrorData = (
	errorsAbi: AbiErrorFragment[],
	error: Eip838ExecutionError,
) => {
	const data: unknown = error?.data;
	if (typeof data !== 'string' || !REVERT_DATA_WITH_SELECTOR.test(data)) {
		return;
	}

	const errorSha = data.slice(0, SELECTOR_LENGTH).toLowerCase();
	let decoded:
		| { name: string; signature: string; args: { [K in string]: unknown } }
		| undefined;
	try {
		const errorAbi = [...errorsAbi, ...builtinErrors].find(
			abi => encodeErrorSignature(abi).slice(0, SELECTOR_LENGTH) === errorSha,
		);

		if (errorAbi?.inputs) {
			decoded = {
				name: errorAbi.name,
				signature: jsonInterfaceMethodToString(errorAbi),
				// decode abi.inputs according to EIP-838
				args: decodeParameters([...errorAbi.inputs], `0x${data.substring(SELECTOR_LENGTH)}`),
			};
		}
	} catch {
		// The ABI entry or the revert payload is malformed: leave the error undecoded.
		decoded = undefined;
	}

	if (decoded) {
		error.setDecodedProperties(decoded.name, decoded.signature, decoded.args);
	}
};
