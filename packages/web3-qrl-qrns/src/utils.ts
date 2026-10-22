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

import { InvalidStringError } from '@theqrl/web3-errors';
import { bytesToHex, hexToBytes, isNullish, keccak256 } from '@theqrl/web3-utils';
import { ens_normalize } from '@adraffy/ens-normalize';

export const normalize = (name: string) => ens_normalize(name);

const HASH_BYTES = 32;

/** keccak256 of UTF-8 text, as bytes. Never hashes a hex-looking label as bytes (M-11). */
const keccak256Text = (text: string): Uint8Array =>
	hexToBytes(keccak256(new TextEncoder().encode(text)));

/**
 * Computes the QRNS node (the ENS `namehash`) of a name: every label is normalized and hashed
 * as UTF-8 text, so `0x6162.qrl` and `ab.qrl` are different names and an odd-length
 * hex-looking label is just a label (M-11). An empty, `undefined` or `null` name is the root
 * node (32 zero bytes).
 *
 * @param inputName - The name, for example `web3js.qrl`.
 * @returns The 32-byte node as a `0x`-prefixed hex string.
 * @throws InvalidStringError - when the name is not a string.
 */
export const namehash = (inputName: string) => {
	let node: Uint8Array = new Uint8Array(HASH_BYTES);

	if (isNullish(inputName) || inputName === '') {
		return bytesToHex(node);
	}
	if (typeof inputName !== 'string') {
		throw new InvalidStringError(inputName);
	}

	const name = normalize(inputName);
	const labels = name.split('.');

	for (let i = labels.length - 1; i >= 0; i -= 1) {
		const combined = new Uint8Array(HASH_BYTES * 2);
		combined.set(node, 0);
		combined.set(keccak256Text(labels[i]), HASH_BYTES);
		node = hexToBytes(keccak256(combined));
	}

	return bytesToHex(node);
};
