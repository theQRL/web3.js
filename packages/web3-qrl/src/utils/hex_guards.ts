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

/**
 * Whether a node-supplied value is an unsigned quantity that `BigInt()` accepts: a non-negative
 * integer `number`, a non-negative `bigint` or an unsigned `0x` hex string with at least one digit
 * (`isHexStrict` also accepts `'0x'`, which `BigInt` rejects). Shared by the block watchers, so a
 * malformed `newHeads` header is skipped instead of throwing out of a `data` listener (L-54,
 * P4-L-14).
 */
export const isValidUnsignedHexNumber = (value: unknown): value is string | number | bigint => {
	if (typeof value === 'bigint') {
		return value >= 0;
	}
	if (typeof value === 'number') {
		return Number.isSafeInteger(value) && value >= 0;
	}
	return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value);
};

/** Whether a value is a 32-byte hash as the node encodes it: `0x` followed by exactly 64 hex digits. */
export const isHash32 = (value: unknown): value is string =>
	typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

/**
 * Whether a caller-supplied block identifier is a block hash: a 32-byte value, as a 66-character
 * hex string or a 32-byte `Uint8Array`. Anything else (`'0x10'`, a 20-byte hex string, a number,
 * a tag) is a block number or tag. `isBytes` was used before and accepts every even-length hex
 * string, so `getBlock('0x10')` was sent as `qrl_getBlockByHash` and returned `null` (P4-L-11).
 */
export const isBlockHash = (value: unknown): boolean =>
	isHash32(value) || (value instanceof Uint8Array && value.length === 32);
