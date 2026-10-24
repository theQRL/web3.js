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

/**
 * string is the test title
 * QRLTypedData is the entire QRL Typed Structured Data object
 * boolean is whether the QRL typed data is Keccak-256 hashed
 * string is the encoded data expected from getEncodedQRLTypedData
 */
export const testData: [string, QRLTypedData, boolean | undefined, string][] = [
	[
		'should get encoded message without hashing, hash = undefined',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				Person: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'wallet',
						type: 'address',
					},
				],
				Mail: [
					{
						name: 'from',
						type: 'Person',
					},
					{
						name: 'to',
						type: 'Person',
					},
					{
						name: 'contents',
						type: 'string',
					},
				],
			},
			primaryType: 'Mail',
			domain: {
				name: 'Ether Mail',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				from: {
					name: 'Cow',
					wallet: 'Q5bBAb228de3fAfa50Fd6cCefAA75d5da361a8a2A82F75CC29B257669F6EeCc4ec9303597D0b9b6C2B4eF70EFdCeE40209Ac5e440969cD005CB40F7739a96C1cD',
				},
				to: {
					name: 'Bob',
					wallet: 'Q2d09d65e6aC14659798fA27AC2aee81eC03a4Bde0aF4FdeeAee42ABc1fF2BDBDc32EaD5509D9E8426Cb1C6C48942557717d85EFf4AE7aB148f56FcAB0164B324',
				},
				contents: 'Hello, Bob!',
			},
		},
		undefined,
		'0x190155139f67c1d0af6956fd6bd6034376c6d4fbb03729dca2b2c3ab0e1b1737ce62f74d278ada62d6a9af2e969813f67b02a0959443b427f4f3f2d7a1d3a8b7b9bc',
	],
	[
		'should get encoded message without hashing, hash = false',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				Person: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'wallet',
						type: 'address',
					},
				],
				Mail: [
					{
						name: 'from',
						type: 'Person',
					},
					{
						name: 'to',
						type: 'Person',
					},
					{
						name: 'contents',
						type: 'string',
					},
				],
			},
			primaryType: 'Mail',
			domain: {
				name: 'Ether Mail',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				from: {
					name: 'Cow',
					wallet: 'Q5bBAb228de3fAfa50Fd6cCefAA75d5da361a8a2A82F75CC29B257669F6EeCc4ec9303597D0b9b6C2B4eF70EFdCeE40209Ac5e440969cD005CB40F7739a96C1cD',
				},
				to: {
					name: 'Bob',
					wallet: 'Q2d09d65e6aC14659798fA27AC2aee81eC03a4Bde0aF4FdeeAee42ABc1fF2BDBDc32EaD5509D9E8426Cb1C6C48942557717d85EFf4AE7aB148f56FcAB0164B324',
				},
				contents: 'Hello, Bob!',
			},
		},
		false,
		'0x190155139f67c1d0af6956fd6bd6034376c6d4fbb03729dca2b2c3ab0e1b1737ce62f74d278ada62d6a9af2e969813f67b02a0959443b427f4f3f2d7a1d3a8b7b9bc',
	],
	[
		'should get the hashed encoded message, hash = true',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				Person: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'wallet',
						type: 'address',
					},
				],
				Mail: [
					{
						name: 'from',
						type: 'Person',
					},
					{
						name: 'to',
						type: 'Person',
					},
					{
						name: 'contents',
						type: 'string',
					},
				],
			},
			primaryType: 'Mail',
			domain: {
				name: 'Ether Mail',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				from: {
					name: 'Cow',
					wallet: 'Q5bBAb228de3fAfa50Fd6cCefAA75d5da361a8a2A82F75CC29B257669F6EeCc4ec9303597D0b9b6C2B4eF70EFdCeE40209Ac5e440969cD005CB40F7739a96C1cD',
				},
				to: {
					name: 'Bob',
					wallet: 'Q2d09d65e6aC14659798fA27AC2aee81eC03a4Bde0aF4FdeeAee42ABc1fF2BDBDc32EaD5509D9E8426Cb1C6C48942557717d85EFf4AE7aB148f56FcAB0164B324',
				},
				contents: 'Hello, Bob!',
			},
		},
		true,
		'0x40ef869167a9c0410e0c2aa6e0560f1ef2042740aaa30ad604624016c6c14df0',
	],
	[
		'should get encoded message with array types',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				ArrayData: [
					{
						name: 'array1',
						type: 'string[]',
					},
					{
						name: 'array2',
						type: 'address[]',
					},
					{
						name: 'array3',
						type: 'uint256[]',
					},
				],
			},
			primaryType: 'ArrayData',
			domain: {
				name: 'Array Data',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				array1: ['string', 'string2', 'string3'],
				array2: [
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
					'Q5bBAb228de3fAfa50Fd6cCefAA75d5da361a8a2A82F75CC29B257669F6EeCc4ec9303597D0b9b6C2B4eF70EFdCeE40209Ac5e440969cD005CB40F7739a96C1cD',
					'Q2d09d65e6aC14659798fA27AC2aee81eC03a4Bde0aF4FdeeAee42ABc1fF2BDBDc32EaD5509D9E8426Cb1C6C48942557717d85EFf4AE7aB148f56FcAB0164B324',
				],
				array3: [123456, 654321, 42],
			},
		},
		false,
		'0x190117fa7042b8aa94b9ef86e1eb0846d9dbe945d7a2901618f7137c2849ce8370605c59b9659cf7843220e18df18a71d1599af1dc6461808d18d15c29381fc69a73',
	],
	[
		'should get encoded message with array types',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				ArrayData: [
					{
						name: 'array1',
						type: 'string[]',
					},
					{
						name: 'array2',
						type: 'address[]',
					},
					{
						name: 'array3',
						type: 'uint256[]',
					},
				],
			},
			primaryType: 'ArrayData',
			domain: {
				name: 'Array Data',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				array1: ['string', 'string2', 'string3'],
				array2: [
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
					'Q5bBAb228de3fAfa50Fd6cCefAA75d5da361a8a2A82F75CC29B257669F6EeCc4ec9303597D0b9b6C2B4eF70EFdCeE40209Ac5e440969cD005CB40F7739a96C1cD',
					'Q2d09d65e6aC14659798fA27AC2aee81eC03a4Bde0aF4FdeeAee42ABc1fF2BDBDc32EaD5509D9E8426Cb1C6C48942557717d85EFf4AE7aB148f56FcAB0164B324',
				],
				array3: [123456, 654321, 42],
			},
		},
		true,
		'0x910c79f4dc6ed873523316d07c5f502b39412fd07eb1aa627a8f2c07d6faff2d',
	],
	[
		'should get encoded message with bytes32',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				ArrayData: [
					{
						name: 'bytes32',
						type: 'bytes32',
					},
				],
			},
			primaryType: 'ArrayData',
			domain: {
				name: 'Array Data',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				bytes32: '0x133d00e67f2390ce846a631aeb6718a674a3923f5320b79b6d3e2f5bf146319e',
			},
		},
		false,
		'0x190117fa7042b8aa94b9ef86e1eb0846d9dbe945d7a2901618f7137c2849ce837060bc5be4b6d5ef8cde54a896425544471fbba4990dee3749713466ec82f1a412dc',
	],
	[
		'should get encoded message with bytes32',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				ArrayData: [
					{
						name: 'bytes32',
						type: 'bytes',
					},
				],
			},
			primaryType: 'ArrayData',
			domain: {
				name: 'Array Data',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				bytes32: '0x133d00e67f2390ce846a631aeb6718a674a3923f5320b79b6d3e2f5bf146319e',
			},
		},
		false,
		'0x190117fa7042b8aa94b9ef86e1eb0846d9dbe945d7a2901618f7137c2849ce8370605823e155044288a8c7aeea2e0c77e8469c23cf6b13fd48c98da0d4bd6561221c',
	],
	[
		'should get encoded message with bytes32',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				ArrayData: [
					{
						name: 'bytes32',
						type: 'bytes32',
					},
				],
			},
			primaryType: 'ArrayData',
			domain: {
				name: 'Array Data',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				bytes32: '0x133d00e67f2390ce846a631aeb6718a674a3923f5320b79b6d3e2f5bf146319e',
			},
		},
		true,
		'0x6e45f6f8417505d964ae9ebc9ca2c50e2588f3547a7189d4fdde938f26b64e31',
	],
	[
		'should hash a hex-looking string value as UTF-8 text',
		{
			types: {
				QRLTypedDataDomain: [{ name: 'name', type: 'string' }],
				Message: [{ name: 'value', type: 'string' }],
			},
			primaryType: 'Message',
			domain: { name: 'Test' },
			message: { value: '0x1234' },
		},
		true,
		'0x1d209d6d7f729d7de4c7001ffddcc0c9e01fb789d42133690bc6829a7a242501',
	],
];

/**
 * string is the test title
 * QRLTypedData is the entire QRL Typed Structured Data object
 * boolean is whether the QRL typed data is Keccak-256 hashed
 * string is the encoded data expected from getEncodedQRLTypedData
 */
export const erroneousTestData: [string, QRLTypedData, boolean | undefined, Error][] = [
	[
		'should throw error: Cannot encode data: value is not of array type',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				ArrayData: [
					{
						name: 'array1',
						type: 'string[]',
					},
					{
						name: 'array2',
						type: 'address[]',
					},
					{
						name: 'array3',
						type: 'uint256[]',
					},
				],
			},
			primaryType: 'ArrayData',
			domain: {
				name: 'Array Data',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				array1: ['string', 'string2', 'string3'],
				array2: 'Q2d09d65e6aC14659798fA27AC2aee81eC03a4Bde0aF4FdeeAee42ABc1fF2BDBDc32EaD5509D9E8426Cb1C6C48942557717d85EFf4AE7aB148f56FcAB0164B324',
				array3: [123456, 654321, 42],
			},
		},
		false,
		new Error('Cannot encode data: value is not of array type'),
	],
	[
		'rejects fixed arrays unsupported by the go-qrl typed-data signer',
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				ArrayData: [
					{
						name: 'array1',
						type: 'string[]',
					},
					{
						name: 'array2',
						type: 'address[3]',
					},
					{
						name: 'array3',
						type: 'uint256[]',
					},
				],
			},
			primaryType: 'ArrayData',
			domain: {
				name: 'Array Data',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				array1: ['string', 'string2', 'string3'],
				array2: [
					'Q2d09d65e6aC14659798fA27AC2aee81eC03a4Bde0aF4FdeeAee42ABc1fF2BDBDc32EaD5509D9E8426Cb1C6C48942557717d85EFf4AE7aB148f56FcAB0164B324',
				],
				array3: [123456, 654321, 42],
			},
		},
		false,
		new Error("Invalid typed data: invalid field 'array2' in 'ArrayData'"),
	],
	[
		"should throw error: Cannot encode data: missing data for 'array3'",
		{
			types: {
				QRLTypedDataDomain: [
					{
						name: 'name',
						type: 'string',
					},
					{
						name: 'version',
						type: 'string',
					},
					{
						name: 'chainId',
						type: 'uint256',
					},
					{
						name: 'verifyingContract',
						type: 'address',
					},
				],
				ArrayData: [
					{
						name: 'array1',
						type: 'string[]',
					},
					{
						name: 'array2',
						type: 'address[]',
					},
					{
						name: 'array3',
						type: 'uint256[]',
					},
				],
			},
			primaryType: 'ArrayData',
			domain: {
				name: 'Array Data',
				version: '1',
				chainId: 1,
				verifyingContract:
					'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
			},
			message: {
				array1: ['string', 'string2', 'string3'],
				array2: [
					'Q2d09d65e6aC14659798fA27AC2aee81eC03a4Bde0aF4FdeeAee42ABc1fF2BDBDc32EaD5509D9E8426Cb1C6C48942557717d85EFf4AE7aB148f56FcAB0164B324',
				],
				array3: undefined,
			},
		},
		false,
		new Error("Cannot encode data: missing data for 'array3'"),
	],
];
