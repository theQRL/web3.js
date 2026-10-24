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
	HexStringBytes,
	SignedTransactionInfoAPI,
	Transaction,
	FMT_BYTES,
	FMT_NUMBER,
} from '@theqrl/web3-types';
import { FeeMarketEIP1559Transaction } from '@theqrl/web3-qrl-accounts';
import { bytesToHex, hexToBytes } from '@theqrl/web3-utils';
import { decodeSignedTransaction } from '../../../../src/utils/decode_signed_transaction';

const rawType0x2Transaction: Transaction = {
	from: 'QE88f16C4370E976c3678FbC681C28d9cc32e8194060b13eF0da86bF3D825c3eF2b32E9E80aA5D6B2756Ce92627015E644E1f6F2f58814Add8C47C0F90060A46E',
	type: '0x2',
	nonce: '0x0',
	maxFeePerGas: '0x3b9aca01',
	maxPriorityFeePerGas: '0x0',
	gasLimit: '0x5208',
	value: '0x1',
	input: '0x',
	to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
	accessList: [
		{
			address:
				'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
			storageKeys: [
				'0x0000000000000000000000000000000000000000000000000000000000000003',
				'0x0000000000000000000000000000000000000000000000000000000000000007',
			],
		},
		{
			address:
				'QB3b091f7c2b7Efa718d48a28d47B2aF2c08e0eA2f7d5b0aD685b6D6938b9fFB90A0f91F67dAF58900C802e7574CC004b7a8446CB79FF70630956829b11459989',
			storageKeys: [],
		},
	],
};

export const returnFormat = { number: FMT_NUMBER.STR, bytes: FMT_BYTES.UINT8ARRAY };

// ML-DSA-87 signing is hedged (non-deterministic, per TOB-QRLLIB-6), so a signed
// transaction cannot be pinned as a fixed fixture. Generate a valid signed tx from
// a known seed at load time — this test only needs a *decodable* raw, since it
// compares signTransaction's decode+format output against decodeSignedTransaction
// on the same raw. The seed's derived address is cross-validated against go-qrllib.
const TEST_SEED =
	'0x01000032c89a84a46859934c42dec330511fd3642e98f00575e74a44c486c8d112dbf19d7129cd61d3e6bd72c4f2f66e5556f3';
const generatedRaw = bytesToHex(
	FeeMarketEIP1559Transaction.fromTxData({
		chainId: '0x1',
		nonce: rawType0x2Transaction.nonce,
		maxFeePerGas: rawType0x2Transaction.maxFeePerGas,
		maxPriorityFeePerGas: rawType0x2Transaction.maxPriorityFeePerGas,
		gasLimit: rawType0x2Transaction.gasLimit,
		to: rawType0x2Transaction.to,
		value: rawType0x2Transaction.value,
		data: rawType0x2Transaction.input,
		accessList: rawType0x2Transaction.accessList,
	} as unknown as Parameters<typeof FeeMarketEIP1559Transaction.fromTxData>[0])
		.sign(hexToBytes(TEST_SEED.slice(2)))
		.serialize(),
);

const type0x2SignedTransactionInfo = {
	raw: generatedRaw,
	tx: decodeSignedTransaction(generatedRaw, returnFormat, { fillInputAndData: true }).tx,
};

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - transaction
 * 	   - SignedTransactionInfoAPI or HexStringBytes (i.e. SignedTransactionInfoAPI.raw)
 *     - Formatted SignedTransactionInfoAPI
 */
type TestData = [
	string,
	[Transaction, SignedTransactionInfoAPI | HexStringBytes, SignedTransactionInfoAPI],
];
export const testData: TestData[] = [
	[
		JSON.stringify(rawType0x2Transaction),
		[
			rawType0x2Transaction,
			type0x2SignedTransactionInfo,
			decodeSignedTransaction(type0x2SignedTransactionInfo.raw, returnFormat, {
				fillInputAndData: true,
			}),
		],
	],
	[
		JSON.stringify(rawType0x2Transaction),
		[
			rawType0x2Transaction,
			type0x2SignedTransactionInfo.raw,
			decodeSignedTransaction(type0x2SignedTransactionInfo.raw, returnFormat, {
				fillInputAndData: true,
			}),
		],
	],
];
