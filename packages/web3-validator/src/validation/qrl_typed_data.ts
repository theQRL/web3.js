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

import { QRLTypedData } from '@theqrl/web3-types';
import { isNullish } from './object.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	!isNullish(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Checks that a value satisfies the structural contract required to encode QRL typed data.
 *
 * The contract mirrors `getEncodedQRLTypedData` (`@theqrl/web3-qrl-abi`) — the encoder this
 * library and the QRL wallet share — rather than any node-side implementation. Typed-data signing
 * is answered by a wallet provider, which encodes with that same function, so these are precisely
 * the preconditions that must hold before a request is worth sending.
 *
 * Each check below corresponds to a value the encoder dereferences unconditionally; without them
 * a malformed request fails deep inside the encoder with an opaque `TypeError` (for example
 * "Cannot read properties of undefined (reading 'reduce')") instead of a typed validation error.
 *
 * Field-level data (that every member declared in a type is present in `domain`/`message`) is
 * deliberately NOT checked here: the encoder already reports that precisely
 * ("Cannot encode data: missing data for 'x'"), and duplicating it would mean re-implementing
 * type resolution.
 */
export const isQRLTypedData = (value: unknown): boolean => {
	if (!isPlainObject(value)) return false;

	const { types, primaryType, domain, message } = value as Partial<QRLTypedData>;

	// `types` is indexed for every type encountered, and `types.QRLTypedDataDomain` is read
	// unconditionally by `getEncodedQRLTypedData` to build the domain separator.
	if (!isPlainObject(types)) return false;
	if (!Array.isArray((types as Record<string, unknown>).QRLTypedDataDomain)) return false;

	// Every declared type is a list of `{ name, type }` members; `encodeType` reads both fields
	// of every member of every type it depends on.
	for (const members of Object.values(types as Record<string, unknown>)) {
		if (!Array.isArray(members)) return false;
		for (const member of members) {
			if (!isPlainObject(member)) return false;
			if (typeof member.name !== 'string' || member.name.length === 0) return false;
			if (typeof member.type !== 'string' || member.type.length === 0) return false;
		}
	}

	// `primaryType` must name a declared type: `encodeData` does `types[primaryType].reduce(...)`.
	if (typeof primaryType !== 'string' || primaryType.length === 0) return false;
	if (!Array.isArray((types as Record<string, unknown>)[primaryType])) return false;

	// Both are indexed per declared member by `encodeData`.
	if (!isPlainObject(domain)) return false;
	if (!isPlainObject(message)) return false;

	return true;
};
