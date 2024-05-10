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
import { hexToBytes } from '@theqrl/web3-utils';
import { Chain, Common, Hardfork } from '../../../src/common';

import {
	AccessListEIP2930Transaction,
	FeeMarketEIP1559Transaction,
	Transaction,
	TransactionFactory,
} from '../../../src';

const common = new Common({
	chain: Chain.Mainnet,
	hardfork: Hardfork.Shanghai,
});

const seed = hexToBytes('d00fd401dc076020ab57f52becab30305bbfc5b3bd7334287c06cdb500c860c54e54b5bd2c5c137d601ef6e8a9e9fac8');

const unsignedTx = Transaction.fromTxData({});
const signedTx = unsignedTx.sign(seed);

const unsignedEIP2930Tx = AccessListEIP2930Transaction.fromTxData(
	{ chainId: BigInt(1) },
	{ common },
);
const signedEIP2930Tx = unsignedEIP2930Tx.sign(seed);

const unsignedEIP1559Tx = FeeMarketEIP1559Transaction.fromTxData(
	{ chainId: BigInt(1) },
	{ common },
);
const signedEIP1559Tx = unsignedEIP1559Tx.sign(seed);

const txTypes = [
	{
		class: Transaction,
		name: 'Transaction',
		unsigned: unsignedTx,
		signed: signedTx,
		eip2718: false,
		type: 0,
	},
	{
		class: AccessListEIP2930Transaction,
		name: 'AccessListEIP2930Transaction',
		unsigned: unsignedEIP2930Tx,
		signed: signedEIP2930Tx,
		eip2718: true,
		type: 1,
	},
	{
		class: FeeMarketEIP1559Transaction,
		name: 'FeeMarketEIP1559Transaction',
		unsigned: unsignedEIP1559Tx,
		signed: signedEIP1559Tx,
		eip2718: true,
		type: 2,
	},
];

describe('[TransactionFactory]: Basic functions', () => {
	it('fromSerializedData() -> success cases', () => {
		for (const txType of txTypes) {
			const serialized = txType.unsigned.serialize();
			const factoryTx = TransactionFactory.fromSerializedData(serialized, { common });
			expect(factoryTx.constructor.name).toEqual(txType.class.name);
		}
	});

	it('fromSerializedData() -> error cases', () => {
		for (const txType of txTypes) {
			if (!txType.eip2718) {
				continue;
			}
			const unsupportedCommon = new Common({
				chain: Chain.Mainnet,
				hardfork: Hardfork.Shanghai,
			});
			expect(() => {
				TransactionFactory.fromSerializedData(txType.unsigned.serialize(), {
					common: unsupportedCommon,
				});
			}).toThrow();

			expect(() => {
				const serialized = txType.unsigned.serialize();
				serialized[0] = 99; // edit the transaction type
				TransactionFactory.fromSerializedData(serialized, { common });
			}).toThrow();
		}
	});

	it('fromBlockBodyData() -> success cases', () => {
		for (const txType of txTypes) {
			let rawTx;
			if (txType.eip2718) {
				rawTx = txType.signed.serialize();
			} else {
				rawTx = txType.signed.raw() as Uint8Array[];
			}
			const tx = TransactionFactory.fromBlockBodyData(rawTx, { common });
			expect(tx.constructor.name).toEqual(txType.name);
			expect(txType.eip2718 ? tx.serialize() : tx.raw()).toEqual(rawTx);
		}
	});

	it('fromTxData() -> success cases', () => {
		for (const txType of txTypes) {
			const tx = TransactionFactory.fromTxData({ type: txType.type }, { common });
			expect(tx.constructor.name).toEqual(txType.class.name);
			if (txType.eip2718) {
				continue;
			}
			const _tx = TransactionFactory.fromTxData({});
			expect(_tx.constructor.name).toEqual(txType.class.name);
		}
	});

	it('fromTxData() -> error cases', () => {
		const unsupportedCommon = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai });
		expect(() => {
			TransactionFactory.fromTxData({ type: 1 }, { common: unsupportedCommon });
		}).toThrow();

		expect(() => {
			TransactionFactory.fromTxData({ type: 999 });
		}).toThrow();

		expect(() => {
			TransactionFactory.fromTxData({ value: BigInt('-100') });
		}).toThrow();
	});
});
