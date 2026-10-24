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

import { shake256 } from '@theqrl/qrl-cryptography/keccak.js';
import { bytesToHex, utf8ToBytes } from '@theqrl/qrl-cryptography/utils.js';

const QRL_ADDRESS_HEX_LENGTH = 128;
// The prefix is a capital `Q`, exactly as go-qrl's `hasQPrefix` requires: with the `i` flag a
// lowercase `q` passed every address check here while every node rejected it (P4-L-44).
const QRL_ADDRESS_REGEX = /^Q[0-9a-fA-F]{128}$/;
const QRL_CHECKSUM_BITS = 512;

/**
 * Returns the EIP-55-style mixed-case representation of a QRL address.
 * The checksum uses SHAKE256 over the lowercase ASCII hex address body,
 * not Keccak.
 */
export const toChecksumAddress = (data: string): string => {
	if (!QRL_ADDRESS_REGEX.test(data)) {
		throw new Error('invalid qrl address');
	}

	const lowerBody = data.slice(1).toLowerCase();
	// SHAKE256 over the ASCII hex body, QRL_CHECKSUM_BITS/8 bytes of output,
	// rendered as hex so each address nibble maps to one hash nibble (EIP-55 style).
	const hashHex = bytesToHex(shake256(utf8ToBytes(lowerBody), { dkLen: QRL_CHECKSUM_BITS / 8 }));

	let checksummed = 'Q';
	for (let i = 0; i < QRL_ADDRESS_HEX_LENGTH; i += 1) {
		const char = lowerBody[i];
		checksummed +=
			char >= 'a' && char <= 'f' && Number.parseInt(hashHex[i], 16) >= 8
				? char.toUpperCase()
				: char;
	}

	return checksummed;
};

/**
 * Checks the structural validity and optional SHAKE256 mixed-case checksum of
 * a QRL address. All-lowercase and all-uppercase address bodies are accepted as
 * non-checksummed compatibility forms. Mixed-case address bodies must match the
 * checksum exactly.
 */
export const checkAddressCheckSum = (data: string): boolean => {
	if (!QRL_ADDRESS_REGEX.test(data)) {
		return false;
	}

	const body = data.slice(1);
	if (body === body.toLowerCase() || body === body.toUpperCase()) {
		return true;
	}

	return data === toChecksumAddress(data);
};

/**
 * Checks if a given string is a valid QRL address.
 * If `checkChecksum` is false, only the Q + 128 hex structure is checked.
 * Otherwise lowercase/uppercase compatibility forms are accepted and mixed-case
 * inputs must match the SHAKE256 checksum.
 */
export const isAddressString = (value: string, checkChecksum = true) => {
	if (typeof value !== 'string') {
		return false;
	}

	if (!QRL_ADDRESS_REGEX.test(value)) {
		return false;
	}

	return checkChecksum ? checkAddressCheckSum(value) : true;
};
