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

import { TransactionError } from '@theqrl/web3-errors';

const MAX_SERIALIZED_BYTES = 16 * 1024 * 1024;
const MAX_RLP_DEPTH = 4; // transaction -> access list -> entry -> storage keys
const MAX_RLP_ITEMS = 65536;

/** Bound strings and array-buffer views from any realm before conversion; other types reach the validator. */
export const assertSerializedTransactionSize = (data: string | Uint8Array): void => {
	if (typeof data !== 'string' && !ArrayBuffer.isView(data)) return;
	const length =
		typeof data === 'string'
			? (data.length - (/^0x/i.test(data) ? 2 : 0)) / 2
			: data.byteLength;
	if (length > MAX_SERIALIZED_BYTES) {
		throw new TransactionError(
			`Serialized transaction exceeds maximum size ${MAX_SERIALIZED_BYTES} bytes`,
		);
	}
};

/** Scan only RLP headers, without recursion or payload copies, before the bundled decoder runs. */
export const assertTransactionRlpBounds = (data: Uint8Array): void => {
	const fail = (reason: string): never => {
		throw new TransactionError(`Invalid EIP-1559 transaction: ${reason}`);
	};
	const ends: number[] = [];
	let offset = 0;
	let items = 0;
	while (offset < data.length) {
		while (ends.length > 0 && offset === ends[ends.length - 1]) ends.pop();
		const parentEnd = ends[ends.length - 1] ?? data.length;
		if (++items > MAX_RLP_ITEMS) fail(`RLP exceeds maximum item count ${MAX_RLP_ITEMS}`);
		const prefix = data[offset];
		const list = prefix >= 0xc0;
		let start = offset + 1;
		let length = 0;
		if (prefix <= 0x7f) {
			start = offset;
			length = 1;
		} else if (prefix <= 0xb7) length = prefix - 0x80;
		else if (prefix <= 0xbf || prefix >= 0xf8) {
			const lengthBytes = prefix - (list ? 0xf7 : 0xb7);
			if (start + lengthBytes > parentEnd || data[start] === 0) fail('Invalid RLP length');
			for (let i = 0; i < lengthBytes; i += 1) {
				length = length * 256 + data[start + i];
				if (!Number.isSafeInteger(length) || length > data.length)
					fail('Invalid RLP length');
			}
			start += lengthBytes;
			if (length < 56) fail('Invalid RLP long encoding');
		} else length = prefix - 0xc0;
		const end = start + length;
		if (end > parentEnd) fail('RLP payload exceeds its containing list');
		if (list) {
			if (ends.length >= MAX_RLP_DEPTH)
				fail(`RLP exceeds maximum nesting depth ${MAX_RLP_DEPTH}`);
			if (length > 0) ends.push(end);
			offset = start;
		} else offset = end;
	}
};
