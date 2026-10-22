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
import Web3 from '@theqrl/web3';
import { DEFAULT_RETURN_FORMAT } from '@theqrl/web3-types';

import { ContractMethodWrappersPlugin } from '../../src/contract_method_wrappers';
import { SQRCTF1TokenAbi } from '../../src/SQRCTF1Token';

declare module '../web3_export_helper' {
	interface Web3 {
		contractMethodWrappersPlugin: ContractMethodWrappersPlugin;
	}
}

describe('ContractMethodWrappersPlugin', () => {
	it('should register the plugin', () => {
		const web3 = new Web3('http://127.0.0.1:8545');
		web3.registerPlugin(
			new ContractMethodWrappersPlugin(
				SQRCTF1TokenAbi,
				'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
			),
		);
		expect(web3.contractMethodWrappersPlugin).toBeDefined();
	});

	describe('methods', () => {
		const contractAddress =
			'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40';
		const checksumContractAddress =
			'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40';
		const sender =
			'Q33380cd8b47eed92b0dcd1ccca2ee84efd0c8b87a4fe6ee4a918969cdd454c0b04ac9f03ffaafa765af0cbeab572d8c9dd514044aa94adee50fa5d361a3e4629';
		const recipient =
			'Q73308de47979b11dbd527534db611180102646126787ac70a6a9004483efc254d15c688ee61c92db7d644ceebc43d43363e06233dee730cbc78f46ad564cf39b';
		const amount = BigInt(42);
		const expectedSenderBalance = `0x${'0'.repeat(125)}280`;
		const expectedRecipientBalance = `0x${'0'.repeat(125)}120`;
		let requestManagerSendSpy: jest.Mock;

		let web3: Web3;

		beforeAll(() => {
			web3 = new Web3('http://127.0.0.1:8545');
			web3.registerPlugin(new ContractMethodWrappersPlugin(SQRCTF1TokenAbi, contractAddress));
		});

		beforeEach(() => {
			requestManagerSendSpy = jest.fn();
			web3.contractMethodWrappersPlugin._contract.requestManager.send = requestManagerSendSpy;
		});

		it('should call `getFormattedBalance` with expected RPC object', async () => {
			requestManagerSendSpy.mockResolvedValueOnce(expectedSenderBalance);

			await web3.contractMethodWrappersPlugin.getFormattedBalance(
				sender,
				DEFAULT_RETURN_FORMAT,
			);
			expect(requestManagerSendSpy).toHaveBeenCalledWith({
				method: 'qrl_call',
				params: [
					expect.objectContaining({
						input: `0x70a08231${sender.slice(1)}`,
						to: checksumContractAddress,
					}),
					'latest',
				],
			});
		});

		it('should call `transferAndGetBalances` with expected RPC object', async () => {
			const expectedMaxFeePerGas = '0x10c388d00';
			const expectedMaxPriorityFeePerGas = '0x9502f900';
			const expectedTransactionHash =
				'0xc41b9a4f654c44552e135f770945916f57c069b80326f9a5f843e613491ab6b1';

			// Mocking getBlockByNumber for getEip1559GasPricing
			requestManagerSendSpy.mockResolvedValueOnce({ baseFeePerGas: '1000000000' });
			// Mocking block number for trySendTransaction call
			requestManagerSendSpy.mockResolvedValueOnce('0x1');
			requestManagerSendSpy.mockResolvedValueOnce(expectedTransactionHash);
			// Mocking response for getTransactionReceipt for waitForTransactionReceipt; only a
			// receipt with status 1 counts as success, anything else is treated as a revert (H-1)
			requestManagerSendSpy.mockResolvedValueOnce({ status: '0x1' });
			// Mocking getBlockNumber for waitForTransactionReceipt
			requestManagerSendSpy.mockResolvedValueOnce('0x2');
			requestManagerSendSpy.mockResolvedValueOnce(expectedSenderBalance);
			requestManagerSendSpy.mockResolvedValueOnce(expectedRecipientBalance);

			const balances = await web3.contractMethodWrappersPlugin.transferAndGetBalances(
				sender,
				recipient,
				amount,
			);
			// The first call will be to `qrl_getBlockByNumber` and the second is to `qrl_blockNumber`. And the third one will be to `qrl_sendTransaction`:
			expect(requestManagerSendSpy).toHaveBeenNthCalledWith(3, {
				method: 'qrl_sendTransaction',
				params: [
					expect.objectContaining({
						input: `0xa9059cbb${recipient.slice(1)}${'0'.repeat(126)}2a`,
						from: sender,
						maxFeePerGas: expectedMaxFeePerGas,
						maxPriorityFeePerGas: expectedMaxPriorityFeePerGas,
						to: checksumContractAddress,
					}),
				],
			});

			expect(balances).toStrictEqual({
				sender: {
					address: sender,
					balance: BigInt(expectedSenderBalance),
				},
				recipient: {
					address: recipient,
					balance: BigInt(expectedRecipientBalance),
				},
			});
		});
	});
});
