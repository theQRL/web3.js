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
import {
	ARGON2ID_BOUNDS,
	validateArgon2idParams,
	validateArgon2idSalt,
} from '../../src/kdf_policy';

describe('kdf_policy', () => {
	describe('validateArgon2idParams', () => {
		it('exposes an OWASP-compliant Argon2id memory floor', () => {
			// OWASP Argon2id floor: m >= 19456 (19 MiB), t >= 2.
			expect(ARGON2ID_BOUNDS.m.min).toBe(19456);
			expect(ARGON2ID_BOUNDS.t.min).toBeGreaterThanOrEqual(2);
		});

		it('rejects m below the OWASP floor', () => {
			expect(() => validateArgon2idParams({ m: 8192, t: 8, p: 1, dklen: 32 })).toThrow(
				/Argon2id m out of range/,
			);
		});

		it('rejects m at the previous 4096 minimum', () => {
			expect(() => validateArgon2idParams({ m: 4096, t: 8, p: 1, dklen: 32 })).toThrow(
				/Argon2id m out of range/,
			);
		});

		it('accepts m at the OWASP floor', () => {
			expect(() => validateArgon2idParams({ m: 19456, t: 8, p: 1, dklen: 32 })).not.toThrow();
		});

		it('accepts the strong encrypt defaults', () => {
			expect(() =>
				validateArgon2idParams({ m: 262144, t: 8, p: 1, dklen: 32 }),
			).not.toThrow();
		});

		it.each([
			['m', 1],
			['m', 1_048_577],
			['t', 0],
			['t', 51],
			['p', 0],
			['p', 17],
			['dklen', 0],
			['dklen', 65],
			['m', '19456'],
			['t', 2.5],
		])('rejects %s=%s with a typed KDF error', (field, value) => {
			expect(() =>
				validateArgon2idParams({ m: 19456, t: 2, p: 1, dklen: 32, [field]: value }),
			).toThrow(InvalidKdfError);
		});
	});

	describe('validateArgon2idSalt', () => {
		it.each([0, 1, 7])('rejects a %s-byte salt with a typed KDF error', length => {
			expect(() => validateArgon2idSalt(new Uint8Array(length))).toThrow(InvalidKdfError);
		});

		it.each([8, 32])('accepts a %s-byte salt', length => {
			expect(() => validateArgon2idSalt(new Uint8Array(length))).not.toThrow();
		});
	});
});
