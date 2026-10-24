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
import { Bytes, TransactionReceipt } from '@theqrl/web3-types';
import { bytesToHex, hexToBytes } from '@theqrl/web3-utils';
import { FeeMarketEIP1559Transaction } from '@theqrl/web3-qrl-accounts';

export const expectedTransactionHash =
	'0xe21194c9509beb01be7e90c2bcefff2804cd85836ae12134f22ad4acda0fc547';
export const expectedTransactionReceipt: TransactionReceipt = {
	transactionHash: '0xe21194c9509beb01be7e90c2bcefff2804cd85836ae12134f22ad4acda0fc547',
	transactionIndex: '0x41',
	blockHash: '0x1d59ff54b1eb26b013ce3cb5fc9dab3705b415a67127a003c3e61eb445bb8df2',
	blockNumber: '0x5daf3b',
	from: 'Qf42b04CB86843A969dA2F400Df7692853Aa19902F584DA5323a5C0dE9b631a610A28bA36bC3ff4D9C9878D08C75ba2e38E893D20209FbFE710068081152F835D',
	to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
	cumulativeGasUsed: '0x33bc', // 13244
	effectiveGasPrice: '0x13a21bc946', // 84324108614
	gasUsed: '0x4dc', // 1244
	contractAddress:
		'QD8F502CC8badCef9404bd264433E127071f782BDb9A6667CbE04e038578886D806C425E62d4Fcdf3819F4fA124c5C3F7e72b7A36558b030B9DD9ff48f2559825',
	logs: [],
	logsBloom: '0xe21194c9509beb01be7e90c2bcefff2804cd85836ae12134f22ad4acda0fc547',
	status: '0x1',
};

// ML-DSA-87 signing is hedged (non-deterministic, per TOB-QRLLIB-6), so a signed
// transaction cannot be a fixed fixture. Generate a valid signed tx from a known
// seed at load time — this test only sends the raw and asserts the emitted /
// forwarded bytes, so any valid decodable signed tx works. The seed's derived
// address is cross-validated against go-qrllib.
const TEST_SEED =
	'0x01000032c89a84a46859934c42dec330511fd3642e98f00575e74a44c486c8d112dbf19d7129cd61d3e6bd72c4f2f66e5556f3';
const signedTransaction = bytesToHex(
	FeeMarketEIP1559Transaction.fromTxData({
		chainId: '0x1',
		nonce: '0x0',
		maxFeePerGas: '0x3b9aca01',
		maxPriorityFeePerGas: '0x0',
		gasLimit: '0x5208',
		to: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
		value: '0x1',
		data: '0x',
	} as unknown as Parameters<typeof FeeMarketEIP1559Transaction.fromTxData>[0])
		.sign(hexToBytes(TEST_SEED.slice(2)))
		.serialize(),
);

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 *     - signedTransaction
 */
export const testData: [string, Bytes][] = [
	['signedTransaction = HexString', signedTransaction],
	['signedTransaction = Uint8Array', hexToBytes(signedTransaction)],
];
