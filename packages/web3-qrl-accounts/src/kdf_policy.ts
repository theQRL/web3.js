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

export const ARGON2ID_BOUNDS = {
	m: { min: 19456, max: 1_048_576 },
	t: { min: 2, max: 50 },
	p: { min: 1, max: 16 },
	dklen: { min: 16, max: 64 },
} as const;

const isInt = (v: unknown): v is number =>
	typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v);

export const validateArgon2idParams = (params: {
	m: unknown;
	t: unknown;
	p: unknown;
	dklen: unknown;
}): void => {
	const { m, t, p, dklen } = params;
	if (!isInt(m) || m < ARGON2ID_BOUNDS.m.min || m > ARGON2ID_BOUNDS.m.max) {
		throw new InvalidKdfError(
			`Argon2id m out of range [${ARGON2ID_BOUNDS.m.min}, ${ARGON2ID_BOUNDS.m.max}]`,
		);
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
	if (!isInt(dklen) || dklen < ARGON2ID_BOUNDS.dklen.min || dklen > ARGON2ID_BOUNDS.dklen.max) {
		throw new InvalidKdfError(
			`Argon2id dklen out of range [${ARGON2ID_BOUNDS.dklen.min}, ${ARGON2ID_BOUNDS.dklen.max}]`,
		);
	}
};

export const validateArgon2idSalt = (salt: Uint8Array): void => {
	if (salt.length < 8 || salt.length > 0xffffffff) {
		throw new InvalidKdfError('Argon2id salt must contain between 8 and 4294967295 bytes');
	}
};
