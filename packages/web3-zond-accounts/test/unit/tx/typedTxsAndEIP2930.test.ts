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
import { bytesToHex, hexToBytes, uint8ArrayEquals, uint8ArrayConcat, addressToBytes } from '@theqrl/web3-utils';
import {
	FeeMarketEIP1559Transaction,
} from '../../../src';
import { Chain, Common, Hardfork/*, uint8ArrayToBigInt*/ } from '../../../src/common';

import type { AccessList } from '../../../src';

const seed = hexToBytes('0xec3077d539c7b333e596b9e6c0b5f5952d26469ab9a60d1fd54c329ef9959593850a2daf60369e434a7c55939f99e149');
const address = addressToBytes('Z20982e08c8b5b4d007e4f6c4a637033ce90aa352');

const common = new Common({
	chain: Chain.Mainnet,
	hardfork: Hardfork.Shanghai,
});

const txTypes = [
	{
		class: FeeMarketEIP1559Transaction,
		name: 'FeeMarketEIP1559Transaction',
		type: 2,
	},
];

const validAddress = hexToBytes('01'.repeat(20));
const validSlot = hexToBytes('01'.repeat(32));
const chainId = BigInt(1);

describe('[FeeMarketEIP1559Transaction] -> EIP-2930 Compatibility', () => {
	it('Initialization / Getter -> fromTxData()', () => {
		for (const txType of txTypes) {
			let tx = txType.class.fromTxData({}, { common });
			expect(tx).toBeTruthy();

			tx = txType.class.fromTxData({
				chainId: 5,
			});
			expect(tx.common.chainId() === BigInt(5)).toBeTruthy();

			tx = txType.class.fromTxData({
				chainId: 99999,
			});
			expect(tx.common.chainId() === BigInt(99999)).toBeTruthy();

			expect(() => {
				txType.class.fromTxData(
					{
						chainId: chainId + BigInt(1),
					},
					{ common },
				);
			}).toThrow();

			// expect(() => {
			// 	txType.class.fromTxData(
			// 		{
			// 			v: 2,
			// 		},
			// 		{ common },
			// 	);
			// }).toThrow();
		}
	});

	
	it('cannot input decimal values', () => {
		const values = ['chainId', 'nonce', 'maxFeePerGas', 'maxPriorityFeePerGas', 'gasLimit', 'value', 'publicKey', 'signature'];
		const cases = [
			10.1,
			'10.1',
			'0xaa.1',
			-10.1,
			-1,
			BigInt(-10),
			'-100',
			'-10.1',
			'-0xaa',
			Infinity,
			-Infinity,
			NaN,
			{},
			true,
			false,
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			() => {},
			Number.MAX_SAFE_INTEGER + 1,
		];
		for (const value of values) {
			const txData: any = {};
			for (const testCase of cases) {
				if (
					value === 'chainId' &&
					((typeof testCase === 'number' && Number.isNaN(testCase)) || testCase === false)
				) {
					continue;
				}
				txData[value] = testCase;
				expect(() => {
					FeeMarketEIP1559Transaction.fromTxData(txData);
				}).toThrow();
			}
		}
	});

	it('Initialization / Getter -> fromSerializedTx()', () => {
		for (const txType of txTypes) {
			expect(() => {
				txType.class.fromSerializedTx(new Uint8Array([99]), {});
			}).toThrow('wrong tx type');

			expect(() => {
				// Correct tx type + RLP-encoded 5
				const serialized = uint8ArrayConcat(
					new Uint8Array([txType.type]),
					new Uint8Array([5]),
				);
				txType.class.fromSerializedTx(serialized, {});
			}).toThrow('must be array');

			expect(() => {
				const serialized = uint8ArrayConcat(
					new Uint8Array([txType.type]),
					hexToBytes('c0'),
				);
				txType.class.fromSerializedTx(serialized, {});
			}).toThrow('values (for unsigned tx)');
		}
	});

	it('Access Lists -> success cases', () => {
		for (const txType of txTypes) {
			const access: AccessList = [
				{
					address: bytesToHex(validAddress),
					storageKeys: [bytesToHex(validSlot)],
				},
			];
			const txn = txType.class.fromTxData(
				{
					accessList: access,
					chainId: 1,
				},
				{ common },
			);

			// Check if everything is converted

			const Uint8Array = txn.accessList;
			const JSON = txn.AccessListJSON;

			expect(uint8ArrayEquals(Uint8Array[0][0], validAddress)).toBeTruthy();
			expect(uint8ArrayEquals(Uint8Array[0][1][0], validSlot)).toBeTruthy();

			expect(JSON).toEqual(access);

			// also verify that we can always get the json access list, even if we don't provide one.

			const txnRaw = txType.class.fromTxData(
				{
					accessList: Uint8Array,
					chainId: 1,
				},
				{ common },
			);

			const JSONRaw = txnRaw.AccessListJSON;

			expect(JSONRaw).toEqual(access);
		}
	});

	it('Access Lists -> error cases', () => {
		for (const txType of txTypes) {
			let accessList: any[] = [
				[
					hexToBytes('01'.repeat(21)), // Address of 21 bytes instead of 20
					[],
				],
			];

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [
				[
					validAddress,
					[
						hexToBytes('01'.repeat(31)), // Slot of 31 bytes instead of 32
					],
				],
			];

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [[]]; // Address does not exist

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [[validAddress]]; // Slots does not exist

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [[validAddress, validSlot]]; // Slots is not an array

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [[validAddress, [], []]]; // 3 items where 2 are expected

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();
		}
	});

	it('sign()', () => {
		for (const txType of txTypes) {
			let tx = txType.class.fromTxData(
				{
					data: hexToBytes('010200'),
					to: validAddress,
					accessList: [[validAddress, [validSlot]]],
					chainId,
				},
				{ common },
			);
			let signed = tx.sign(seed);
			const signedAddress = signed.getSenderAddress();
			expect(uint8ArrayEquals(signedAddress.buf, address)).toBeTruthy();
			// expect(signedAddress).toEqual(Address.publicToAddress(Buffer.from(address)));
			signed.verifySignature(); // If this throws, test will not end.

			tx = txType.class.fromTxData({}, { common });
			signed = tx.sign(seed);

			expect(tx.accessList).toEqual([]);
			expect(signed.accessList).toEqual([]);

			tx = txType.class.fromTxData({}, { common });

			expect(() => {
				tx.hash();
			}).toThrow();

			expect(() => {
				tx.getSenderPublicKey();
			}).toThrow();

			// expect(() => {
			// 	const high = SECP256K1_ORDER_DIV_2 + BigInt(1);
			// 	const _tx = txType.class.fromTxData({ s: high, r: 1, v: 1 }, { common });
			// 	const _signed = _tx.sign(secretKey, publicKey);
			// 	_signed.getSenderPublicKey();
			// }).toThrow();
		}
	});

	it('getDataFee()', () => {
		for (const txType of txTypes) {
			let tx = txType.class.fromTxData({}, { common });
			expect(tx.getDataFee()).toEqual(BigInt(0));

			tx = txType.class.fromTxData({}, { common, freeze: false });
			expect(tx.getDataFee()).toEqual(BigInt(0));

			const mutableCommon = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai });
			tx = txType.class.fromTxData({}, { common: mutableCommon });
			tx.common.setHardfork(Hardfork.Shanghai);
			expect(tx.getDataFee()).toEqual(BigInt(0));
		}
	});
});