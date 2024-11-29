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

import { keccak256 } from 'ethereum-cryptography/keccak.js';
import { utf8ToBytes } from 'ethereum-cryptography/utils.js';
import { uint8ArrayToHexString } from '../utils.js';

/**
 * Checks the checksum of a given address. Will also return false on non-checksum addresses.
 */
export const checkAddressCheckSum = (data: string): boolean => {
	if (!/^Z[0-9a-f]{40}$/i.test(data)) return false;
	const address = data.slice(1);
	const updatedData = utf8ToBytes(address.toLowerCase());

	const addressHash = uint8ArrayToHexString(keccak256(updatedData)).slice(2);

	for (let i = 0; i < 40; i += 1) {
		// the nth letter should be uppercase if the nth digit of casemap is 1
		if (
			(parseInt(addressHash[i], 16) > 7 && address[i].toUpperCase() !== address[i]) ||
			(parseInt(addressHash[i], 16) <= 7 && address[i].toLowerCase() !== address[i])
		) {
			return false;
		}
	}
	return true;
};

/**
 * Checks if a given string is a valid Zond address. It will also check the checksum, if the address has upper and lowercase letters.
 */
export const isAddressString = (value: string, checkChecksum = true) => {
	if (typeof value !== 'string') {
		return false;
	}

	// check if it has the basic requirements of an address
	if (!/^Z[0-9a-f]{40}$/i.test(value)) {
		return false;
	}
	// If it's ALL lowercase or ALL upppercase
	if (
		/^Z[0-9a-f]{40}$/.test(value) ||
		/^Z[0-9A-F]{40}$/.test(value)
	) {
		return true;
		// Otherwise check each case
	}
	return checkChecksum ? checkAddressCheckSum(value) : true;
};
