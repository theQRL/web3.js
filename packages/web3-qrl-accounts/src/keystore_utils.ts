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

import { hexToBytes } from '@theqrl/web3-utils';
import { Web3ValidatorError } from '@theqrl/web3-validator';

/**
 * Decodes a hex field of a keystore. go-qrl writes these fields unprefixed
 * (`hex.EncodeToString`); a `0x` prefix is tolerated for keystores produced by JavaScript
 * tooling. Returns `undefined` for anything that is not well-formed, even-length hex, so the
 * caller can raise its own typed error instead of a validator error that echoes the value.
 */
export const keystoreHexToBytes = (value: unknown): Uint8Array | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}
	const hex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
	if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) {
		return undefined;
	}
	return hexToBytes(hex);
};

/**
 * Builds the typed error used when the *container* of a keystore is malformed (not valid
 * JSON, or not the expected object/array shape). It is the same error class the schema
 * validation of a keystore object raises, so callers can handle every malformed-keystore case
 * uniformly, and its message never includes the offending content.
 */
export const keystoreContainerError = (message: string, cause?: unknown): Web3ValidatorError => {
	const error = new Web3ValidatorError([
		{
			keyword: 'type',
			instancePath: '',
			schemaPath: '#/type',
			params: {},
			message,
		},
	]);
	if (cause instanceof Error) {
		error.innerError = cause;
	}
	return error;
};
