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
import { Chain, Common, Hardfork } from '../../../src/common';
import { Address } from '../../../src/tx/address';
import { TransactionFactory } from '../../../src';

const common = new Common({
	chain: Chain.Mainnet,
	hardfork: Hardfork.Zond,
	qips: [],
});

const maxInitCodeSize = common.param('vm', 'maxInitCodeSize');
const txTypes = [2];
const addressZero = Address.zero();

describe('[EIP3860 tests]', () => {
	// go-qrl/core.IntrinsicGas charges 2 gas per 64-byte initcode word.
	it.each([
		[0, 0],
		[1, 2],
		[31, 2],
		[32, 2],
		[33, 2],
		[63, 2],
		[64, 2],
		[65, 4],
		[127, 4],
		[128, 4],
		[129, 6],
		[49152, 1536],
	])('charges the correct intrinsic gas for %i bytes of initcode', (length, initCodeGas) => {
		const dataFee = BigInt(length * 4 + initCodeGas);
		const gasLimit = BigInt(53000) + dataFee;
		const tx = TransactionFactory.fromTxData(
			{ data: new Uint8Array(length), type: 2, gasLimit },
			{ common },
		);
		expect(tx.getDataFee()).toBe(dataFee);
		expect(tx.getBaseFee()).toBe(gasLimit);
		expect(tx.validate()).toBe(true);
	});

	it('rejects a deployment one gas below the 64-byte-word intrinsic gas requirement', () => {
		const tx = TransactionFactory.fromTxData(
			{ data: new Uint8Array(65), type: 2, gasLimit: 53263 },
			{ common },
		);
		expect(tx.validate(true)).toEqual([
			'gasLimit is too low. given 53263, need at least 53264',
		]);
	});

	it('adds initcode gas to mixed zero/nonzero data only for contract creation', () => {
		const data = new Uint8Array(65);
		data[0] = 0xff;
		data[64] = 0xff;
		const creation = TransactionFactory.fromTxData({ data, type: 2 }, { common });
		const call = TransactionFactory.fromTxData({ data, type: 2, to: addressZero }, { common });
		// Two nonzero bytes (16 gas each), 63 zero bytes (4 each), and
		// two initcode words (2 each) for creation only.
		expect(creation.getDataFee()).toBe(BigInt(288));
		expect(creation.getBaseFee()).toBe(BigInt(53288));
		expect(call.getDataFee()).toBe(BigInt(284));
		expect(call.getBaseFee()).toBe(BigInt(21284));
	});

	it('still charges 64-byte-word initcode gas when the size limit is disabled', () => {
		const tx = TransactionFactory.fromTxData(
			{ data: new Uint8Array(49153), type: 2 },
			{ common, allowUnlimitedInitCodeSize: true },
		);
		expect(tx.getDataFee()).toBe(BigInt(198150));
	});

	it('Should instantiate create txs with MAX_INITCODE_SIZE', () => {
		const data = new Uint8Array(Number(maxInitCodeSize));
		for (const txType of txTypes) {
			expect(TransactionFactory.fromTxData({ data, type: txType }, { common })).toBeTruthy();
		}
	});

	it('Should instantiate txs with MAX_INITCODE_SIZE data', () => {
		const data = new Uint8Array(Number(maxInitCodeSize));
		for (const txType of txTypes) {
			expect(
				TransactionFactory.fromTxData({ data, type: txType, to: addressZero }, { common }),
			).toBeTruthy();
		}
	});

	it('Should not instantiate create txs with MAX_INITCODE_SIZE+1 data', () => {
		const data = new Uint8Array(Number(maxInitCodeSize) + 1);
		for (const txType of txTypes) {
			expect(() =>
				TransactionFactory.fromTxData({ data, type: txType }, { common }),
			).toThrow();
		}
	});

	it('Should instantiate txs with MAX_INITCODE_SIZE+1 data', () => {
		const data = new Uint8Array(Number(maxInitCodeSize) + 1);
		for (const txType of txTypes) {
			expect(
				TransactionFactory.fromTxData({ data, type: txType, to: addressZero }, { common }),
			).toBeTruthy();
		}
	});

	it('Should allow txs with MAX_INITCODE_SIZE+1 data if allowUnlimitedInitCodeSize is active', () => {
		const data = new Uint8Array(Number(maxInitCodeSize) + 1);
		for (const txType of txTypes) {
			expect(
				TransactionFactory.fromTxData(
					{ data, type: txType },
					{ common, allowUnlimitedInitCodeSize: true },
				),
			).toBeTruthy();
		}
	});

	it('Should charge initcode analysis gas is allowUnlimitedInitCodeSize is active', () => {
		const data = new Uint8Array(Number(maxInitCodeSize));
		for (const txType of txTypes) {
			const eip3860ActiveTx = TransactionFactory.fromTxData(
				{ data, type: txType },
				{ common, allowUnlimitedInitCodeSize: true },
			);
			const eip3860DeactivedTx = TransactionFactory.fromTxData(
				{ data, type: txType },
				{ common, allowUnlimitedInitCodeSize: false },
			);
			expect(eip3860ActiveTx.getDataFee() === eip3860DeactivedTx.getDataFee()).toBeTruthy();
		}
	});
});
