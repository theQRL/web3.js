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
import { format } from '@theqrl/web3-utils';
import { DEFAULT_RETURN_FORMAT } from '@theqrl/web3-types';

import {
	accessListResultSchema,
	accountSchema,
	blockHeaderSchema,
	blockSchema,
	syncSchema,
	withdrawalsSchema,
} from '../../src/schemas';
import { formatTransaction } from '../../src/utils/format_transaction';

const Q_ADDRESS = `Q${'00'.repeat(64)}`;
const B32 = `0x${'11'.repeat(32)}`;

describe('schemas keep every go-qrl reply field (L-73)', () => {
	it('blockSchema keeps withdrawals and withdrawalsRoot', () => {
		const block = format(
			blockSchema,
			{
				number: '0x10',
				hash: B32,
				withdrawalsRoot: B32,
				withdrawals: [
					{ index: '0x1', validatorIndex: '0x2', address: Q_ADDRESS, amount: '0x3' },
				],
			},
			DEFAULT_RETURN_FORMAT,
		);
		expect(block.withdrawalsRoot).toBe(B32);
		expect(block.withdrawals).toStrictEqual([
			{ index: BigInt(1), validatorIndex: BigInt(2), address: Q_ADDRESS, amount: BigInt(3) },
		]);
	});

	it('transactionInfoSchema keeps the gasPrice of a mined transaction', () => {
		const transaction = formatTransaction(
			{ hash: B32, gasPrice: '0x3b9aca00', value: '0x1' } as never,
			DEFAULT_RETURN_FORMAT,
			{ fillInputAndData: true },
		) as unknown as { gasPrice: bigint };
		expect(transaction.gasPrice).toBe(BigInt(1000000000));
	});

	it('accessListResultSchema keeps the error of a failed simulation', () => {
		const result = format(
			accessListResultSchema,
			{ accessList: [], gasUsed: '0x7671', error: 'execution reverted' },
			DEFAULT_RETURN_FORMAT,
		);
		expect(result.error).toBe('execution reverted');
	});

	it('accountSchema keeps the proof address', () => {
		const account = format(
			accountSchema,
			{ address: Q_ADDRESS, balance: '0x1', nonce: '0x0', accountProof: [], storageProof: [] },
			DEFAULT_RETURN_FORMAT,
		);
		expect(account.address).toBe(Q_ADDRESS);
		expect(account.balance).toBe(BigInt(1));
	});

	it('syncSchema keeps the go-qrl syncing fields and drops the Ethereum state counters', () => {
		const goQrlStatus = {
			startingBlock: '0x1',
			currentBlock: '0x2',
			highestBlock: '0x3',
			syncedAccounts: '0x4',
			syncedAccountBytes: '0x5',
			syncedBytecodes: '0x6',
			syncedBytecodeBytes: '0x7',
			syncedStorage: '0x8',
			syncedStorageBytes: '0x9',
			healedTrienodes: '0xa',
			healedTrienodeBytes: '0xb',
			healedBytecodes: '0xc',
			healedBytecodeBytes: '0xd',
			healingTrienodes: '0xe',
			healingBytecode: '0xf',
		};
		const status = format(
			syncSchema,
			{ ...goQrlStatus, knownStates: '0x10', pulledStates: '0x11' },
			DEFAULT_RETURN_FORMAT,
		);
		expect(status).toStrictEqual(goQrlStatus);
	});

	it('types withdrawals.address and blockHeader.miner as addresses', () => {
		expect(withdrawalsSchema.properties.address.format).toBe('address');
		expect(blockHeaderSchema.properties.miner.format).toBe('address');
		expect(blockSchema.properties.miner.format).toBe('address');
	});
});
