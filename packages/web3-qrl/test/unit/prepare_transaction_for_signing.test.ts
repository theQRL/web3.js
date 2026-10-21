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

import { QRLExecutionAPI } from '@theqrl/web3-types';
import { Web3Context } from '@theqrl/web3-core';
import HttpProvider from '@theqrl/web3-providers-http';
import { isNullish } from '@theqrl/web3-validator';
import { FeeMarketEIP1559Transaction } from '@theqrl/web3-qrl-accounts';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';

import { bytesToHex, hexToBytes } from '@theqrl/web3-utils';
import { TransactionSigningError } from '@theqrl/web3-errors';
import { Common } from '@theqrl/web3-types';
import { prepareTransactionForSigning } from '../../src/utils/prepare_transaction_for_signing';
import { validTransactions } from '../fixtures/prepare_transaction_for_signing';

describe('prepareTransactionForSigning', () => {
	const web3Context = new Web3Context<QRLExecutionAPI>({
		provider: new HttpProvider('http://127.0.0.1'),
		config: { defaultNetworkId: '0x1' },
	});

	describe('web3Context.defaultCommon', () => {
		it('signs with a Common built from defaultCommon and never mutates it', async () => {
			const [mockBlock, expectedTransaction, expectedSeed] = validTransactions[0];
			const defaultCommon: Common = {
				customChain: { name: 'custom', networkId: 1, chainId: 1 },
			};
			const snapshot = JSON.parse(JSON.stringify(defaultCommon)) as Common;
			const context = new Web3Context<QRLExecutionAPI>({
				provider: new HttpProvider('http://127.0.0.1'),
				config: { defaultNetworkId: '0x1', defaultCommon },
			});
			jest.spyOn(qrlRpcMethods, 'estimateGas').mockImplementation(
				// @ts-expect-error - Mocked implementation doesn't have correct method signature
				() => expectedTransaction.gas,
			);
			// @ts-expect-error - Mocked implementation doesn't have correct method signature
			jest.spyOn(qrlRpcMethods, 'getBlockByNumber').mockImplementation(() => mockBlock);

			// The fixture carries its own `common` and `chainId`; drop both so the context
			// default supplies the chain the transaction is signed for.
			const transaction = { ...expectedTransaction };
			delete transaction.common;
			delete transaction.chainId;

			const qrljsTx = await prepareTransactionForSigning(
				transaction,
				context,
				expectedSeed,
				true,
			);

			expect(qrljsTx instanceof FeeMarketEIP1559Transaction).toBeTruthy();
			expect(qrljsTx.common.chainId()).toBe(BigInt(1));
			expect(qrljsTx.chainId).toBe(BigInt(1));
			expect(qrljsTx.common.hardfork()).toBe('zond');
			expect(qrljsTx.sign(hexToBytes(expectedSeed)).verifySignature()).toBe(true);
			expect(context.defaultCommon).toStrictEqual(snapshot);
		});
	});

	describe('should return an web3-utils/tx instance with expected properties', () => {
		it.each(validTransactions)(
			'mockBlock: %s\nexpectedTransaction: %s\nexpectedSeed: %s\nexpectedAddress: %s\nexpectedRlpEncodedTransaction: %s\nexpectedTransactionHash: %s\nexpectedMessageToSign: %s\nnexpectedDescriptor: %s\nexpectedExtraParams: %s\nexpectedSignature: %s\nexpectedPublicKey: %s',
			async (
				mockBlock,
				expectedTransaction,
				expectedSeed,
				expectedAddress,
				// RLP, hash and signature are non-deterministic (hedged ML-DSA) — no longer asserted
				_expectedRlpEncodedTransaction,
				_expectedTransactionHash,
				_expectedMessageToSign,
				expectedDescriptor,
				expectedExtraParams,
				_expectedSignature,
				_expectedPublicKey,
			) => {
				// (i.e. requestManager, blockNumber, hydrated params), but that doesn't matter for the test
				jest.spyOn(qrlRpcMethods, 'estimateGas').mockImplementation(
					// @ts-expect-error - Mocked implementation doesn't have correct method signature
					() => expectedTransaction.gas,
				);
				// @ts-expect-error - Mocked implementation doesn't have correct method signature
				jest.spyOn(qrlRpcMethods, 'getBlockByNumber').mockImplementation(() => mockBlock);

				const qrljsTx = await prepareTransactionForSigning(
					expectedTransaction,
					web3Context,
					expectedSeed,
					true,
				);

				// should produce an web3-utils/tx instance
				expect(qrljsTx instanceof FeeMarketEIP1559Transaction).toBeTruthy();
				expect(qrljsTx.sign).toBeDefined();

				// should sign transaction. ML-DSA-87 signing is hedged (non-deterministic,
				// per TOB-QRLLIB-6), so the signature — and therefore the serialized RLP and
				// the transaction hash — cannot be matched against a fixed fixture. Verify the
				// signature's validity and a decode round-trip instead of comparing bytes.
				const signedTransaction = qrljsTx.sign(hexToBytes(expectedSeed.substring(2)));

				const senderAddress = signedTransaction.getSenderAddress().toString();
				expect(senderAddress).toBe(`Q${expectedAddress.slice(1).toLowerCase()}`);

				expect(signedTransaction.verifySignature()).toBe(true);

				// serialized signed tx must round-trip through decode and still verify
				const decoded = FeeMarketEIP1559Transaction.fromSerializedTx(signedTransaction.serialize());
				expect(decoded.verifySignature()).toBe(true);
				expect(decoded.getSenderAddress().toString()).toBe(senderAddress);

				// descriptor and extraParams are deterministic constants for ML-DSA-87.
				// messageToSign and publicKey correctness are covered transitively by
				// verifySignature() above (the signature only verifies if it was produced
				// over the correct message under the correct public key), so they are not
				// re-compared here as brittle, encoding-tied fixtures.
				const descriptor = !isNullish(signedTransaction.descriptor)
					? bytesToHex(signedTransaction.descriptor)
					: '';
				const extraParams = !isNullish(signedTransaction.extraParams)
					? bytesToHex(signedTransaction.extraParams)
					: '';
				expect(descriptor).toBe(expectedDescriptor);
				expect(extraParams).toBe(expectedExtraParams);
			},
		);
	});

	describe('from / signer seed consistency', () => {
		it('throws when the supplied "from" does not match the address derived from the seed', async () => {
			const [, expectedTransaction, expectedSeed] = validTransactions[0];

			// A valid QRL address that is NOT the address derived from expectedSeed.
			const mismatchedFrom =
				'Q5f279a4668d52e544a5fdf0c6212236c693e7b760377adc0754066a409c30effd2472bf229ea506ea693c01386b8a2b73c22d7e375e20e1ce8d104dade60ff2a';

			// The assertion runs before any RPC/transaction building, so no mocks
			// are required — it must reject up front.
			await expect(
				prepareTransactionForSigning(
					{ ...expectedTransaction, from: mismatchedFrom },
					web3Context,
					expectedSeed,
					true,
				),
			).rejects.toThrow(TransactionSigningError);
		});
	});
});
