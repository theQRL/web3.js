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
 * Structural schema of a v1 keystore (the go-qrl `encryptedKeyJSONV1` layout).
 *
 * The schema establishes presence and primitive types only. The web3-validator engine has no
 * `pattern` support, so the hex encoding and lengths of `cipherparams.iv`, `ciphertext` and
 * `kdfparams.salt`, the exact `cipher`/`kdf` names and the Argon2id parameter ranges are
 * enforced in `decrypt` with the dedicated typed errors (`IVLengthError`,
 * `KeyStoreDecryptionError`, `InvalidCipherError`, `InvalidKdfError`).
 */
export const keyStoreSchema = {
	type: 'object',
	required: ['crypto', 'id', 'version', 'address'],
	properties: {
		crypto: {
			type: 'object',
			required: ['cipher', 'ciphertext', 'cipherparams', 'kdf', 'kdfparams'],
			properties: {
				cipher: { type: 'string' },
				ciphertext: { type: 'string' },
				cipherparams: {
					type: 'object',
					required: ['iv'],
					properties: {
						iv: { type: 'string' },
					},
				},
				kdf: { type: 'string' },
				kdfparams: {
					type: 'object',
					required: ['m', 't', 'p', 'dklen', 'salt'],
					properties: {
						m: { type: 'number' },
						t: { type: 'number' },
						p: { type: 'number' },
						dklen: { type: 'number' },
						// go-qrl writes the salt as unprefixed hex; byte arrays are accepted for
						// keystores built in JavaScript.
						salt: { oneOf: [{ type: 'string' }, { format: 'bytes' }] },
					},
				},
			},
		},
		id: { type: 'string' },
		version: { type: 'number' },
		address: { type: 'string' },
	},
};
