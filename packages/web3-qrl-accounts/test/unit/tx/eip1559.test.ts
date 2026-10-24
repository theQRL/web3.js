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
import { RLP } from '@ethereumjs/rlp';
import { TransactionSigningError } from '@theqrl/web3-errors';
import { hexToBytes, uint8ArrayConcat } from '@theqrl/web3-utils';
import { Chain, Common, Hardfork } from '../../../src/common';

import { FeeMarketEIP1559Transaction } from '../../../src';
import { newMLDSA87Descriptor } from '../../../src/qrl_wallet';

import testdata from '../../fixtures/json/eip1559.json';

const common = new Common({
	chain: 1,
	hardfork: Hardfork.Zond,
});
// @ts-expect-error set private property
common._chainParams.chainId = 4;
const TWO_POW256 = BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');

const validAddress = hexToBytes('01'.repeat(64));
const validSlot = hexToBytes('01'.repeat(32));
const chainId = BigInt(4);

describe('[FeeMarketEIP1559Transaction]', () => {
	it('cannot input decimal or negative values %s', () => {
		const values = [
			'maxFeePerGas',
			'maxPriorityFeePerGas',
			'chainId',
			'nonce',
			'gasLimit',
			'value',
			'descriptor',
			'extraParams',
			'signature',
			'publicKey',
		];
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

	it('getUpfrontCost()', () => {
		const tx = FeeMarketEIP1559Transaction.fromTxData(
			{
				maxFeePerGas: 10,
				maxPriorityFeePerGas: 8,
				gasLimit: 100,
				value: 6,
			},
			{ common },
		);
		expect(tx.getUpfrontCost()).toEqual(BigInt(806));
		let baseFee = BigInt(0);
		expect(tx.getUpfrontCost(baseFee)).toEqual(BigInt(806));
		baseFee = BigInt(4);
		expect(tx.getUpfrontCost(baseFee)).toEqual(BigInt(1006));
	});

	it('sign()', () => {
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let index = 0; index < testdata.length; index += 1) {
			const data = testdata[index];
			const seed = hexToBytes(data.seed.slice(2));
			const txn = FeeMarketEIP1559Transaction.fromTxData(data, { common });
			const signed = txn.sign(seed);
			const decoded = FeeMarketEIP1559Transaction.fromSerializedTx(signed.serialize(), {
				common,
			});
			expect(decoded.verifySignature()).toBe(true);
			expect(decoded.toJSON()).toEqual(signed.toJSON());
		}
	});

	it('hash()', () => {
		const data = testdata[0];
		const seed = hexToBytes(data.seed.slice(2));
		let txn = FeeMarketEIP1559Transaction.fromTxData(data, { common });
		let signed = txn.sign(seed);
		expect(signed.hash()).toHaveLength(32);
		expect(signed.hash()).toEqual(signed.hash());
		txn = FeeMarketEIP1559Transaction.fromTxData(data, { common, freeze: false });
		signed = txn.sign(seed);
		expect(signed.hash()).toHaveLength(32);
	});

	it('freeze property propagates from unsigned tx to signed tx', () => {
		const data = testdata[0];
		const seed = hexToBytes(data.seed.slice(2));
		const txn = FeeMarketEIP1559Transaction.fromTxData(data, { common, freeze: false });
		expect(Object.isFrozen(txn)).toBe(false);
		const signedTxn = txn.sign(seed);
		expect(Object.isFrozen(signedTxn)).toBe(false);
	});

	// NOTE(rgeraldes24): test not valid atm: no qips available
	it.skip('common propagates from the common of tx, not the common in TxOptions', () => {
		const data = testdata[0];
		const seed = hexToBytes(data.seed.slice(2));
		const txn = FeeMarketEIP1559Transaction.fromTxData(data, { common, freeze: false });
		const newCommon = new Common({
			chain: Chain.Mainnet,
			hardfork: Hardfork.Zond,
			qips: [2537],
		});
		expect(Object.isFrozen(newCommon)).not.toEqual(common);
		Object.defineProperty(txn, 'common', {
			get() {
				return newCommon;
			},
		});
		const signedTxn = txn.sign(seed);
		expect(signedTxn.common.qips()).toContain(2537);
	});

	it('unsigned tx -> getMessageToSign()', () => {
		const unsignedTx = FeeMarketEIP1559Transaction.fromTxData(
			{
				data: hexToBytes('010200'),
				to: validAddress,
				accessList: [[validAddress, [validSlot]]],
				chainId,
			},
			{ common },
		);
		const desc = newMLDSA87Descriptor();
		const extraParams = Uint8Array.from([]);
		const messageHash = unsignedTx.getMessageToSign(desc.toBytes(), extraParams, true);
		expect(messageHash).toHaveLength(32);
		expect(messageHash).toEqual(
			unsignedTx.getMessageToSign(desc.toBytes(), extraParams, true),
		);
		const message = unsignedTx.getMessageToSign(desc.toBytes(), extraParams, false);
		expect(message[0]).toBe(2);
		expect(message.length).toBeGreaterThan(64);
	});

	it('toJSON()', () => {
		const data = testdata[0];
		const seed = hexToBytes(data.seed.slice(2));
		const txn = FeeMarketEIP1559Transaction.fromTxData(data, { common });
		const signed = txn.sign(seed);

		const json = signed.toJSON();
		expect(json).toMatchObject({
			chainId: '0x4',
			nonce: '0x333',
			maxPriorityFeePerGas: '0x1284d',
			maxFeePerGas: '0x1d97c',
			gasLimit: '0x8ae0',
			to: 'Q0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000aaaa',
			value: '0x2933bc9',
			data: '0x',
			accessList: [],
			descriptor: '0x010000',
			extraParams: undefined,
		});
		expect(json.signature?.startsWith('0x')).toBe(true);
		expect(json.signature?.length).toBeGreaterThan(2);
		expect(json.publicKey?.startsWith('0x')).toBe(true);
		expect(json.publicKey?.length).toBeGreaterThan(2);
	});

	it('fromValuesArray() rejects a non-minimal (leading-zero-padded) chainId encoding', () => {
		const buildValues = (cid: Uint8Array) =>
			[
				cid, // chainId
				Uint8Array.from([]), // nonce
				Uint8Array.from([]), // maxPriorityFeePerGas
				Uint8Array.from([]), // maxFeePerGas
				Uint8Array.from([]), // gasLimit
				Uint8Array.from([]), // to
				Uint8Array.from([]), // value
				Uint8Array.from([]), // data
				[], // accessList
				Uint8Array.from([]), // descriptor
				Uint8Array.from([]), // extraParams
			] as any;

		// canonical (minimal) chainId encoding 0x04 is accepted
		expect(() => {
			FeeMarketEIP1559Transaction.fromValuesArray(buildValues(Uint8Array.from([4])), {
				common,
			});
		}).not.toThrow();

		// non-minimal chainId encoding 0x0004 is rejected
		expect(() => {
			FeeMarketEIP1559Transaction.fromValuesArray(buildValues(Uint8Array.from([0, 4])), {
				common,
			});
		}).toThrow();
	});

	it('Fee validation', () => {
		expect(() => {
			FeeMarketEIP1559Transaction.fromTxData(
				{
					maxFeePerGas: TWO_POW256 - BigInt(1),
					maxPriorityFeePerGas: 100,
					gasLimit: 1,
					value: 6,
				},
				{ common },
			);
		}).not.toThrow();
		expect(() => {
			FeeMarketEIP1559Transaction.fromTxData(
				{
					maxFeePerGas: TWO_POW256 - BigInt(1),
					maxPriorityFeePerGas: 100,
					gasLimit: 100,
					value: 6,
				},
				{ common },
			);
		}).toThrow();
		expect(() => {
			FeeMarketEIP1559Transaction.fromTxData(
				{
					maxFeePerGas: 1,
					maxPriorityFeePerGas: 2,
					gasLimit: 100,
					value: 6,
				},
				{ common },
			);
		}).toThrow();
	});
});

describe('[FeeMarketEIP1559Transaction] strict RLP decoding (L-13)', () => {
	const seed = hexToBytes(testdata[0].seed.slice(2));
	const signedValues = (): unknown[] =>
		FeeMarketEIP1559Transaction.fromTxData(testdata[0], { common }).sign(seed).raw() as unknown[];
	const serialize = (values: unknown[]) =>
		uint8ArrayConcat(Uint8Array.from([2]), RLP.encode(values as Parameters<typeof RLP.encode>[0]));
	// Each byte as its own one-byte RLP string: the generic byte conversion would flatten this
	// back into the original bytes.
	const perByteList = (bytes: Uint8Array) => Array.from(bytes, b => Uint8Array.from([b]));
	const fieldNames = [
		'chainId',
		'nonce',
		'maxPriorityFeePerGas',
		'maxFeePerGas',
		'gasLimit',
		'to',
		'value',
		'data',
		'accessList',
		'descriptor',
		'extraParams',
		'signature',
		'publicKey',
	];
	const scalarFields = fieldNames
		.map((name, index) => [name, index] as [string, number])
		.filter(([name]) => name !== 'accessList');

	it('decodes the canonical encoding and re-encodes it byte for byte', () => {
		const values = signedValues();
		const serialized = serialize(values);
		const decoded = FeeMarketEIP1559Transaction.fromSerializedTx(serialized, { common });
		expect(decoded.verifySignature()).toBe(true);
		expect(decoded.serialize()).toEqual(serialized);
	});

	it.each(scalarFields)(
		'rejects %s encoded as an RLP list of one-byte strings',
		(name, index) => {
			const values = signedValues();
			values[index] = perByteList(values[index] as Uint8Array);
			expect(() =>
				FeeMarketEIP1559Transaction.fromSerializedTx(serialize(values), { common }),
			).toThrow(`${name} must be a byte string`);
			expect(() =>
				FeeMarketEIP1559Transaction.fromValuesArray(
					values as unknown as Parameters<typeof FeeMarketEIP1559Transaction.fromValuesArray>[0],
					{ common },
				),
			).toThrow(`${name} must be a byte string`);
		},
	);

	it('rejects an unsigned (11-value) transaction with a list in place of a byte string', () => {
		const values = signedValues().slice(0, 11);
		values[10] = []; // extraParams as an empty RLP list instead of an empty string
		expect(() =>
			FeeMarketEIP1559Transaction.fromSerializedTx(serialize(values), { common }),
		).toThrow('extraParams must be a byte string');
	});

	it('rejects an access list that is not a list of [address, [storageKeys]] byte strings', () => {
		const cases: [string, unknown][] = [
			['a byte string instead of a list', Uint8Array.from([1])],
			['an address encoded as a list', [[perByteList(validAddress), [validSlot]]]],
			['storage keys that are not a list', [[validAddress, validSlot]]],
			['a storage key encoded as a list', [[validAddress, [perByteList(validSlot)]]]],
			['an item that is a byte string', [validAddress]],
		];
		for (const [, accessList] of cases) {
			const values = signedValues();
			values[8] = accessList;
			expect(() =>
				FeeMarketEIP1559Transaction.fromSerializedTx(serialize(values), { common }),
			).toThrow('Invalid EIP-1559 transaction');
		}
	});

	it('rejects maxPriorityFeePerGas and the authentication fields given as arrays in fromTxData', () => {
		for (const field of ['maxPriorityFeePerGas', 'descriptor', 'extraParams', 'signature', 'publicKey']) {
			// A non-empty extraParams value is refused earlier (L-15); the empty array still
			// reaches the array rule.
			const value = field === 'extraParams' ? [] : [1];
			expect(() =>
				FeeMarketEIP1559Transaction.fromTxData({ [field]: value } as never, { common }),
			).toThrow(`${field} cannot be an array`);
		}
	});
});

describe('[FeeMarketEIP1559Transaction] extraParams must be empty (L-15)', () => {
	const seed = hexToBytes(testdata[0].seed.slice(2));

	it('fromTxData rejects a non-empty extraParams', () => {
		expect(() =>
			FeeMarketEIP1559Transaction.fromTxData(
				{ ...testdata[0], extraParams: '0xdeadbeef' },
				{ common },
			),
		).toThrow('non-empty extraParams not supported');
		expect(() =>
			FeeMarketEIP1559Transaction.fromTxData(
				{ ...testdata[0], extraParams: Uint8Array.from([0]) },
				{ common },
			),
		).toThrow('non-empty extraParams not supported');
	});

	it('accepts every spelling of empty extraParams', () => {
		for (const extraParams of ['0x', '', undefined, new Uint8Array(0)]) {
			const tx = FeeMarketEIP1559Transaction.fromTxData(
				{ ...testdata[0], extraParams },
				{ common },
			);
			expect(tx.extraParams).toBeUndefined();
			expect(tx.sign(seed).verifySignature()).toBe(true);
		}
	});

	it('rejects a raw transaction that carries extraParams', () => {
		const values = FeeMarketEIP1559Transaction.fromTxData(testdata[0], { common })
			.sign(seed)
			.raw() as unknown[];
		values[10] = hexToBytes('1234');
		const serialized = uint8ArrayConcat(
			Uint8Array.from([2]),
			RLP.encode(values as Parameters<typeof RLP.encode>[0]),
		);
		expect(() =>
			FeeMarketEIP1559Transaction.fromSerializedTx(serialized, { common }),
		).toThrow('non-empty extraParams not supported');
	});

	it('sign() refuses a transaction holding extraParams instead of dropping them, and validate()/verifySignature() reject it', () => {
		const tx = FeeMarketEIP1559Transaction.fromTxData(testdata[0], { common, freeze: false });
		(tx as unknown as { extraParams?: Uint8Array }).extraParams = hexToBytes('1234');

		expect(() => tx.sign(seed)).toThrow(TransactionSigningError);
		expect(tx.validate(true)).toContain('non-empty extraParams not supported');
		expect(tx.validate()).toBe(false);
		expect(tx.verifySignature()).toBe(false);
	});
});
