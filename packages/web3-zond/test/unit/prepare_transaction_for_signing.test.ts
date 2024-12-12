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

import { ZondExecutionAPI } from '@theqrl/web3-types';
import { Web3Context } from '@theqrl/web3-core';
import HttpProvider from '@theqrl/web3-providers-http';
import { isNullish } from '@theqrl/web3-validator';
import {
	FeeMarketEIP1559Transaction,
} from '@theqrl/web3-zond-accounts';
import { zondRpcMethods } from '@theqrl/web3-rpc-methods';

import { bytesToHex, hexToBytes } from '@theqrl/web3-utils';
import { prepareTransactionForSigning } from '../../src/utils/prepare_transaction_for_signing';
import { validTransactions } from '../fixtures/prepare_transaction_for_signing';


describe('prepareTransactionForSigning', () => {
	const web3Context = new Web3Context<ZondExecutionAPI>({
		provider: new HttpProvider('http://127.0.0.1'),
		config: { defaultNetworkId: '0x1' },
	});

	describe('should return an web3-utils/tx instance with expected properties', () => {
		it.each(validTransactions)(
			'mockBlock: %s\nexpectedTransaction: %s\nexpectedSeed: %s\nexpectedAddress: %s\nexpectedRlpEncodedTransaction: %s\nexpectedTransactionHash: %s\nexpectedMessageToSign: %s\nexpectedPublicKey: %s\nexpectedSignature: %s',
			async (
				mockBlock,
				expectedTransaction,
				expectedSeed,
				expectedAddress,
				expectedRlpEncodedTransaction,
				expectedTransactionHash,
				expectedMessageToSign,
				expectedPublicKey,
				expectedSignature,
			) => {
				// (i.e. requestManager, blockNumber, hydrated params), but that doesn't matter for the test
				jest.spyOn(zondRpcMethods, 'estimateGas').mockImplementation(
					// @ts-expect-error - Mocked implementation doesn't have correct method signature
					() => expectedTransaction.gas,
				);
				// @ts-expect-error - Mocked implementation doesn't have correct method signature
				jest.spyOn(zondRpcMethods, 'getBlockByNumber').mockImplementation(() => mockBlock);

				const zondjsTx = await prepareTransactionForSigning(
					expectedTransaction,
					web3Context,
					expectedSeed,
					true,
				);

				// should produce an web3-utils/tx instance
				expect(
					zondjsTx instanceof FeeMarketEIP1559Transaction,
				).toBeTruthy();
				expect(zondjsTx.sign).toBeDefined();

				// should sign transaction
				const signedTransaction = zondjsTx.sign(
					hexToBytes(expectedSeed.substring(2)),
				);

				const senderAddress = signedTransaction.getSenderAddress().toString();
				expect(senderAddress).toBe(`Z${expectedAddress.slice(1).toLowerCase()}`);

				// should be able to obtain expectedRlpEncodedTransaction
				const rlpEncodedTransaction = bytesToHex(signedTransaction.serialize());
				expect(rlpEncodedTransaction).toBe(expectedRlpEncodedTransaction);

				// should be able to obtain expectedTransactionHash
				const transactionHash = bytesToHex(signedTransaction.hash());
				expect(transactionHash).toBe(expectedTransactionHash);

				// should be able to obtain expectedMessageToSign
				const messageToSign = bytesToHex(signedTransaction.getMessageToSign());
				expect(messageToSign).toBe(expectedMessageToSign);
				
				// should have expected public key and signature
				const publicKey = !isNullish(signedTransaction.publicKey)
					? bytesToHex(signedTransaction.publicKey!)
					: '';
				const signature = !isNullish(signedTransaction.signature)
					? bytesToHex(signedTransaction.signature!)
					: '';
				expect(publicKey).toBe(expectedPublicKey);
				expect(signature).toBe(expectedSignature);
			},
		);
	});
});
