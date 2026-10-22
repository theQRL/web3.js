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

import { InvalidKdfError } from '@theqrl/web3-errors';

/**
 * Argon2id parameter bounds applied when a keystore is *created* (`encrypt`).
 *
 * - `m` (KiB) floor is the OWASP Argon2id minimum (19 MiB); the ceiling keeps a keystore from
 *   demanding more than 1 GiB on decrypt.
 * - `dklen` is pinned to 32: the keystore cipher is AES-256-GCM, whose key is 32 bytes, and
 *   go-qrl hard-codes `argon2idDKLen = 32`. Any other value can never produce a usable
 *   keystore, so it is rejected before the (expensive) key derivation runs.
 */
export const ARGON2ID_BOUNDS = {
	m: { min: 19456, max: 1_048_576 },
	t: { min: 2, max: 50 },
	p: { min: 1, max: 16 },
	dklen: { min: 32, max: 32 },
} as const;

/**
 * Memory floor (KiB) accepted when an *existing* keystore is decrypted.
 *
 * go-qrl writes keystores with `LightArgon2idM = 1 << 12` (4096 KiB) when started with
 * `--lightkdf`, and its own keystore tests use that profile. Those files are weaker than the
 * {@link ARGON2ID_BOUNDS} floor but they are the user's own, already-written keystores, so
 * refusing to read them would only break interoperability without protecting anything.
 * `encrypt` keeps the stronger floor: this library never *creates* a light keystore.
 */
export const ARGON2ID_DECRYPT_MEMORY_MIN = 4096;

/**
 * Which operation the Argon2id parameters are validated for. `encrypt` applies the full
 * {@link ARGON2ID_BOUNDS}; `decrypt` lowers the memory floor to
 * {@link ARGON2ID_DECRYPT_MEMORY_MIN} so go-qrl `--lightkdf` keystores can be read.
 */
export type Argon2idPurpose = 'encrypt' | 'decrypt';

const isInt = (v: unknown): v is number =>
	typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v);

export const validateArgon2idParams = (
	params: {
		m: unknown;
		t: unknown;
		p: unknown;
		dklen: unknown;
	},
	purpose: Argon2idPurpose = 'encrypt',
): void => {
	const { m, t, p, dklen } = params;
	const mMin = purpose === 'decrypt' ? ARGON2ID_DECRYPT_MEMORY_MIN : ARGON2ID_BOUNDS.m.min;
	if (!isInt(m) || m < mMin || m > ARGON2ID_BOUNDS.m.max) {
		throw new InvalidKdfError(`Argon2id m out of range [${mMin}, ${ARGON2ID_BOUNDS.m.max}]`);
	}
	if (!isInt(t) || t < ARGON2ID_BOUNDS.t.min || t > ARGON2ID_BOUNDS.t.max) {
		throw new InvalidKdfError(
			`Argon2id t out of range [${ARGON2ID_BOUNDS.t.min}, ${ARGON2ID_BOUNDS.t.max}]`,
		);
	}
	if (!isInt(p) || p < ARGON2ID_BOUNDS.p.min || p > ARGON2ID_BOUNDS.p.max) {
		throw new InvalidKdfError(
			`Argon2id p out of range [${ARGON2ID_BOUNDS.p.min}, ${ARGON2ID_BOUNDS.p.max}]`,
		);
	}
	if (!isInt(dklen) || dklen !== ARGON2ID_BOUNDS.dklen.min) {
		throw new InvalidKdfError(
			`Argon2id dklen must be ${ARGON2ID_BOUNDS.dklen.min} (the AES-256-GCM key length)`,
		);
	}
};

export const validateArgon2idSalt = (salt: Uint8Array): void => {
	if (salt.length < 8 || salt.length > 0xffffffff) {
		throw new InvalidKdfError('Argon2id salt must contain between 8 and 4294967295 bytes');
	}
};
