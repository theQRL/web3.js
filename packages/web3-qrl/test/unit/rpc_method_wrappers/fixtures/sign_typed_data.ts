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
import { Address, QRLTypedData } from '@theqrl/web3-types';

const address = 'Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3';

const typedData = {
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
		verifyingContract: 'Qf66D63eB29f937925bAB98a28d5AC0effBC421Ca2fd96dE918352648ca79f678faebaCB5209D52949AAf01F849AA087A42995c1c6996C3a5504960Eb88943556',
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
};

export const mockRpcResponse =
	'0xf326421b6b34e1e59a8a34c986861e8790a9402a9e51e012718872cd51dad4e23c590bd170be23c51cff4b44d8d4eba54120431ca6a04940098dae62d97677da1c';

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - address
 *     - message
 */
type TestData = [string, [Address, QRLTypedData]];
export const testData: TestData[] = [['typed data', [address, typedData]]];
