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

import {
	InvalidKdfError,
	InvalidPasswordError,
	InvalidSeedError,
	SeedLengthError,
	KeyStoreDecryptionError,
} from '@theqrl/web3-errors';
import { CipherOptions, KeyStore } from '@theqrl/web3-types';
import { hexToBytes } from '@theqrl/web3-utils';
import { FeeMarketEIP1559TxData } from '../../src/tx/types';
import { sign, signTransaction, encrypt } from '../../src/account';

export const validSeedtoAccountData: [any, any][] = [
	[
		{
			address:
				'0x010000034da61fe50c659a3285549dc395571e2bf6891c462c041e3c6b9061fc73eb3687d03f940e5e65d582019ef10ce1327f',
			ignoreLength: false,
		},
		{
			address:
				'QA467d314BBB1E36687FfC9B277d3E163787E59641390075162BDd080E28Ddf6Ca810e1eA17308d3bec9300f85dF4F3dE54C647b4f7F02e0c9821478ac20491A1',
			seed: '0x010000034da61fe50c659a3285549dc395571e2bf6891c462c041e3c6b9061fc73eb3687d03f940e5e65d582019ef10ce1327f',
			sign,
			signTransaction,
			encrypt,
		},
	],
	[
		{
			address:
				'0x0100007fc43a2ccb557f900d4ca924c187b4438a7f8185b8edbfbabdd26b87f125594495268f55ceac9c9eb23efaab76b0d4c5',
		},
		{
			address:
				'Q50d1766d3113D213131A20d97CcC89190Ef68ea3e34F6E797A402c2E18119f718f05898f2F47100b37375795f56b6F16b7a1F358f833c49DC4dDD64c3FDdb052',
			seed: '0x0100007fc43a2ccb557f900d4ca924c187b4438a7f8185b8edbfbabdd26b87f125594495268f55ceac9c9eb23efaab76b0d4c5',
			sign,
			signTransaction,
			encrypt,
		},
	],
	[
		{
			address:
				'0x010000c902ea9bbf1dd51aaa2ee9bed126aba921f6a6afac9cf09a21f3d915b057bace6787a894a71d1d103992aca0a6a4250c', // ignoreLength parameter set true
			ignoreLength: true,
		},
		{
			address:
				'Q68eD7F1481bb2CDA83A0A0D55F1f54c3a6eaef4e45c93D7925b42537c61057B7A0F42E1627beafC0A2DE9d1437183e49c47fA79274cc640D051adBaE9d9aDa12',
			seed: '0x010000c902ea9bbf1dd51aaa2ee9bed126aba921f6a6afac9cf09a21f3d915b057bace6787a894a71d1d103992aca0a6a4250c',
			sign,
			signTransaction,
			encrypt,
		},
	],
];

export const signatureRecoverData: [string, any][] = [
	[
		'Some long text with integers 1233 and special characters and unicode \u1234 as well.',
		{
			address:
				'Q6b280D443f44Ade78601E6A2cf9e75594BE76C3F9E1941B8Be97A60415cb4bCA3C077246E4bc03EfC1A84f46aDE9C0b2b923C89e19955F60a7198BeDa4C04EF7',
			seed: '0x01000077eda0d9c08a5a7134c79973c8fa16a1191f21c29a85f4d913b8d1289d0d1c3944d63d11d7e1c35a51925216de64e052',
			data: 'Some long text with integers 1233 and special characters and unicode \u1234 as well.',
		},
	],
	[
		'Some data',
		{
			address:
				'Q0b72449C712f42f412ae3B68C570e65c5359F8aBF1c78596467581386EF2Ae4e113D01605cdE601914DFB9a79A872366f4f1994c18546a1F996548dC16A46a89',
			seed: '0x010000ef3a996efd6133a749a1cb9a15e7679adf68d240d9eaba3349e679969068e5f83ed6f1f7506eeb0d87e2d94f8ebcd914',
			data: 'Some data',
		},
	],
	[
		'Some data!%$$%&@*',
		{
			address:
				'Q44a6F1e51985544AE8Ef9A382D9fcdDb040Ce93c31311DBdE491751a59B12A36aa8164D2C61b27AFD90E304D2120e338483c0f4F8e2159d97C577431Dd5e380e',
			seed: '0x0100006ca868b6b469e210b079f6742d2e149b6db46f4ed416c11f5d9636e1bd7f35f14d5b5daa84f0a69e54052bcff1897ba2',
			data: 'Some data!%$$%&@*',
		},
	],
	[
		'102',
		{
			address:
				'Q76859ADB3A9010889cD6408bC8cF8a27964021189a07b27E2E70e49014B167512e6C979c1eAE6498E9CC9B3380ACBc437a2d534ade22658ad63786f84a88d124',
			seed: '0x0100007815f4ef272b06985c8089e2c28ff8076fdfa9feed8cefdcecbfbee3d0b52cbddc59fdb1226b95292464567b9fca978e',
			data: '102',
		},
	],
];

export const transactionsTestData: [FeeMarketEIP1559TxData][] = [
	[
		// 'Tx1559'
		{
			type: 2,
			to: 'QF9504EC0843B646d49b6254a93A65Ab5006Baf582Ab741997F7be4954Bbbcbbd7e3D3423f55162Fe0Ad36Daa758593338292c8744426e5f027c4dcaD0BeFc292',
			maxPriorityFeePerGas: '0x3B9ACA00',
			maxFeePerGas: '0xB2D05E00',
			gasLimit: '0x6A4012',
			value: '0x186A0',
			data: '',
			chainId: 1,
			nonce: 0,
		},
	],
];

export const invalidSeedtoAccountData: [any, Error][] = [
	['', new InvalidSeedError()],
	[new Uint8Array([]), new SeedLengthError()],
	[
		'0X010000034da61fe50c659a3285549dc395571e2bf6891c462c041e3c6b9061fc73eb3687d03f940e5e65d582019ef10ce1327f',
		new InvalidSeedError(),
	],
	// Lenient spellings that the underlying wallet library would normalise are rejected at
	// this entry point: surrounding whitespace, separators, a missing 0x prefix.
	[
		' 0x010000034da61fe50c659a3285549dc395571e2bf6891c462c041e3c6b9061fc73eb3687d03f940e5e65d582019ef10ce1327f',
		new InvalidSeedError(),
	],
	[
		'01:00:00:03:4d:a6:1f:e5:0c:65:9a:32:85:54:9d:c3:95:57:1e:2b:f6:89:1c:46:2c:04:1e:3c:6b:90:61:fc:73:eb:36:87:d0:3f:94:0e:5e:65:d5:82:01:9e:f1:0c:e1:32:7f',
		new InvalidSeedError(),
	],
	[
		'010000034da61fe50c659a3285549dc395571e2bf6891c462c041e3c6b9061fc73eb3687d03f940e5e65d582019ef10ce1327f',
		new InvalidSeedError(),
	],
	[
		'0x010000034da61fe50c659a3285549dc395571e2bf6891c462c041e3c6b9061fc73eb3687d03f940e5e65d582019ef10ce13',
		new SeedLengthError(),
	],
	[new Uint8Array(52), new SeedLengthError()],
];

export const validEncryptData: [[any, string | Uint8Array, CipherOptions], KeyStore][] = [
	// Test taken from https://github.com/theQRL/go-qrl/tree/main/accounts/keystore/testdata/v1_test_vector.json
	[
		[
			'0x0100005dfdcad4f721fe41d1bdf632de24ba60ba7cfab9c9a79287fa007b6a0dec8200b1fa35d2575bb15bd44d59b8d878828b',
			'1234567890',
			{
				// Salt is fixed so kdfparams stay deterministic. The IV is NOT
				// supplied: encrypt always generates a fresh random one
				// so the ciphertext is verified via a round-trip decrypt rather
				// than an exact-value assertion.
				t: 2,
				m: 19456,
				p: 1,
				salt: hexToBytes(
					'6140afd0defbcc3fe45d2166969adf5fb45479da880c6cc10d4510b5dfa9908b',
				),
			},
		],
		{
			version: 1,
			address:
				'Q5f279a4668d52e544a5fdf0c6212236c693e7b760377adc0754066a409c30effd2472bf229ea506ea693c01386b8a2b73c22d7e375e20e1ce8d104dade60ff2a',
			crypto: {
				// ciphertext + cipherparams.iv are non-deterministic now
				// (random IV); the encrypt test round-trips through decrypt
				// instead of asserting these exactly.
				ciphertext:
					'e2bc64af24e98a5405e5481164d353598d5d953d8e55386f2d2f64e43ce091727f07c770679a01df15964ea22fff4da3b5e16bc129efe02c04436925e05a4c70c4a41b',
				cipherparams: { iv: 'f59185068e4cbe729dd0000c' },
				cipher: 'aes-256-gcm',
				kdf: 'argon2id',
				kdfparams: {
					m: 19456,
					t: 2,
					p: 1,
					dklen: 32,
					salt: '6140afd0defbcc3fe45d2166969adf5fb45479da880c6cc10d4510b5dfa9908b',
				},
			},
			id: 'e59590d4-3ef3-4a8d-829e-790b83bbf4da7',
		},
	],
];

export const invalidEncryptData: [
	[any, any, any],
	SeedLengthError | InvalidKdfError | InvalidSeedError | InvalidPasswordError,
][] = [
	[
		['0x01000067f476289210e3bef3c1c75e4de993ff0a00663df00def84e73aa7411eac18a', '123', {}],
		new SeedLengthError(),
	],
	[
		[
			'0x01000032c89a84a46859934c42dec330511fd3642e98f00575e74a44c486c8d112dbf19d7129cd61d3e6bd72c4f2f66e5556f3',
			'123',
			{
				iv: 'bfb43120ae00e9de110f8325',
				salt: '210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd',
				kdf: 'hkdf',
			},
		],
		new InvalidKdfError(),
	],
	[
		[undefined, '123', {}], // no private key provided
		new InvalidSeedError(),
	],
	[
		// no password provided
		[
			'0x01000032c89a84a46859934c42dec330511fd3642e98f00575e74a44c486c8d112dbf19d7129cd61d3e6bd72c4f2f66e5556f3',
			undefined,
			{},
		],
		new InvalidPasswordError(),
	],
	// NOTE: the former IVLengthError case was removed. encrypt no longer
	// accepts a caller-supplied iv (finding C18a) — it always generates a
	// fresh random 12-byte IV, so a bad-length iv can no longer be passed.
];

export const invalidKeyStore: [[any, string]][] = [
	[
		// invalid keystore error, missing id field
		[
			{
				// invalid kdf
				version: 1,
				address:
					'Q5f279a4668d52e544a5fdf0c6212236c693e7b760377adc0754066a409c30effd2472bf229ea506ea693c01386b8a2b73c22d7e375e20e1ce8d104dade60ff2a',
				crypto: {
					ciphertext:
						'f833f12f6cb57f6961fb34bbf4ff5019c9fd70e1ab98bf0f1ba164f1b4bc773e853f973b708a4ec1b5e1148de96437ac5fc75da87c6b7293628e9d45b4bc2ab7',
					cipherparams: { iv: 'f59185068e4cbe729dd0000c' },
					cipher: 'aes-256-gcm',
					kdf: 'hkdf',
					kdfparams: {
						m: 4096,
						t: 8,
						p: 1,
						dklen: 32,
						salt: '6140afd0defbcc3fe45d2166969adf5fb45479da880c6cc10d4510b5dfa9908b',
					},
				},
			},
			'1234567890',
		],
	],
];

export const validDecryptData: [[string, string, CipherOptions, string]][] = [
	[
		[
			'0x0100005dfdcad4f721fe41d1bdf632de24ba60ba7cfab9c9a79287fa007b6a0dec8200b1fa35d2575bb15bd44d59b8d878828b',
			'1234567890',
			{
				t: 2,
				m: 19456,
				p: 1,
				iv: hexToBytes('0xf59185068e4cbe729dd0000c'),
				salt: hexToBytes(
					'6140afd0defbcc3fe45d2166969adf5fb45479da880c6cc10d4510b5dfa9908b',
				),
			},
			'0x0100005dfdcad4f721fe41d1bdf632de24ba60ba7cfab9c9a79287fa007b6a0dec8200b1fa35d2575bb15bd44d59b8d878828b',
		],
	],
];

export const invalidDecryptData: [
	[any, string],
	InvalidKdfError | KeyStoreDecryptionError | string,
][] = [
	[
		[
			{
				// invalid kdf
				version: 1,
				address:
					'Q5f279a4668d52e544a5fdf0c6212236c693e7b760377adc0754066a409c30effd2472bf229ea506ea693c01386b8a2b73c22d7e375e20e1ce8d104dade60ff2a',
				crypto: {
					ciphertext:
						'c42ac873cf649cf61970f0ec1b382d25495a77ed4865f1366cfa10b2560514b0b618ea6e2c83c1473baf619897c9495b8e97e4c16e0cc5c92c00d2c3f3940d2e40a460',
					cipherparams: { iv: 'f59185068e4cbe729dd0000c' },
					cipher: 'aes-256-gcm',
					kdf: 'hkdf',
					kdfparams: {
						m: 4096,
						t: 8,
						p: 1,
						dklen: 32,
						salt: '6140afd0defbcc3fe45d2166969adf5fb45479da880c6cc10d4510b5dfa9908b',
					},
				},
				id: 'e59590d4-3ef3-4a8d-829e-790b83bbf4da7',
			},
			'1234567890',
		],
		new InvalidKdfError(),
	],
	[
		[
			{
				// wrong password
				version: 1,
				address:
					'Q5f279a4668d52e544a5fdf0c6212236c693e7b760377adc0754066a409c30effd2472bf229ea506ea693c01386b8a2b73c22d7e375e20e1ce8d104dade60ff2a',
				crypto: {
					ciphertext:
						'c42ac873cf649cf61970f0ec1b382d25495a77ed4865f1366cfa10b2560514b0b618ea6e2c83c1473baf619897c9495b8e97e4c16e0cc5c92c00d2c3f3940d2e40a460',
					cipherparams: { iv: 'f59185068e4cbe729dd0000c' },
					cipher: 'aes-256-gcm',
					kdf: 'argon2id',
					kdfparams: {
						m: 19456,
						t: 2,
						p: 1,
						dklen: 32,
						salt: '6140afd0defbcc3fe45d2166969adf5fb45479da880c6cc10d4510b5dfa9908b',
					},
				},
				id: 'e59590d4-3ef3-4a8d-829e-790b83bbf4da7',
			},
			'12',
		],
		new KeyStoreDecryptionError(),
	],
];

export const validHashMessageData: [string, string][] = [
	['🤗', '0xcae553ad3d0ab274e62944105dee942352692738f79f48c55e3c4235ca82c274'],
	[
		'Some long text with integers 1233 and special characters and unicode \u1234 as well.',
		'0xca5dd6e9cb2f27051ef4a23dc5ba62a4cdb98369355a1d9c9121100e68576d5d',
	],
	['non utf8 string', '0x3bbc26183e34d9f0c27fb7af8c9dcb2cfb32cdd55335aa01abab191bc540d18c'],
	['', '0xd1e20245c66f2cc8733c0a25cf6136279aab0d4e4d5eb18ede8759cd83b69516'],
];
