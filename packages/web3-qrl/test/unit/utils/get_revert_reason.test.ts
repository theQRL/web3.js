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
import { Web3Context } from '@theqrl/web3-core';
import { ContractExecutionError, InvalidResponseError } from '@theqrl/web3-errors';
import { DEFAULT_RETURN_FORMAT } from '@theqrl/web3-types';

// `call` now lives in the leaf reader module (get_revert_reason imports it from there), so the
// spy must target that module — spying on the re-export in rpc_method_wrappers would not intercept.
import * as RpcMethodWrappersReaders from '../../../src/utils/rpc_method_wrappers_readers';
import * as GetRevertReason from '../../../src/utils/get_revert_reason';
import { SimpleRevertAbi } from '../../shared_fixtures/build/SimpleRevert';

describe('getRevertReason', () => {
	const web3Context = new Web3Context();

	it('should use the call rpc wrapper', async () => {
		const callSpy = jest.spyOn(RpcMethodWrappersReaders, 'call').mockImplementation();

		const transaction = {
			from: 'Q2CCeCC72b4C8C0d943bEcFb1E67c4d8996D2F24d138E62dd19Dde2dA366C4faFff063A86501141d64AC7f273CCAE5053fD059722A4E9453170cb40F569872A02',
			to: 'Q224D6a535f8991Cf611b3447F8DfE1059dbEd07c540A53e9E36D37b2ecEEA19013F66E973b207B0467a5A793203b27456B7aa1CEE00dF1e385D1eC5272718eb7',
			data: '0x819f48fe',
			maxPriorityFeePerGas: '0x0',
			maxFeePerGas: '0x15ab8f14',
		};

		await GetRevertReason.getRevertReason(web3Context, transaction);

		expect(callSpy).toHaveBeenCalledWith(
			web3Context,
			transaction,
			web3Context.defaultBlock,
			DEFAULT_RETURN_FORMAT,
		);
	});

	it('simulates at the given block and falls back to defaultBlock when that state is gone (round 2)', async () => {
		const transaction = {
			from: 'Q2CCeCC72b4C8C0d943bEcFb1E67c4d8996D2F24d138E62dd19Dde2dA366C4faFff063A86501141d64AC7f273CCAE5053fD059722A4E9453170cb40F569872A02',
			to: 'Q224D6a535f8991Cf611b3447F8DfE1059dbEd07c540A53e9E36D37b2ecEEA19013F66E973b207B0467a5A793203b27456B7aa1CEE00dF1e385D1eC5272718eb7',
			data: '0x819f48fe',
		};

		// Pinned to the receipt's block.
		const callSpy = jest.spyOn(RpcMethodWrappersReaders, 'call').mockResolvedValue('0x');
		await GetRevertReason.getRevertReason(
			web3Context,
			transaction,
			undefined,
			DEFAULT_RETURN_FORMAT,
			BigInt(42),
		);
		expect(callSpy).toHaveBeenCalledTimes(1);
		expect(callSpy).toHaveBeenLastCalledWith(
			web3Context,
			transaction,
			BigInt(42),
			DEFAULT_RETURN_FORMAT,
		);

		// A pruned state answers with an error that is not a revert: the lookup is retried at
		// defaultBlock, where a revert is reported as usual.
		callSpy.mockReset();
		callSpy
			.mockRejectedValueOnce(new Error('missing trie node'))
			.mockRejectedValueOnce(
				new ContractExecutionError({
					code: 3,
					message: 'execution reverted: nope',
					data: '0x',
				} as never),
			);
		const reason = await GetRevertReason.getRevertReason(
			web3Context,
			transaction,
			undefined,
			DEFAULT_RETURN_FORMAT,
			BigInt(42),
		);
		expect(callSpy).toHaveBeenCalledTimes(2);
		expect(callSpy.mock.calls[1][2]).toBe(web3Context.defaultBlock);
		expect(reason).toMatchObject({ reason: 'execution reverted: nope' });
	});

	it('should return undefined', async () => {
		jest.spyOn(RpcMethodWrappersReaders, 'call').mockResolvedValueOnce(
			'0x000000000000000000000000000000000000000000000000000000000000000a',
		);

		const transaction = {
			from: 'Q2CCeCC72b4C8C0d943bEcFb1E67c4d8996D2F24d138E62dd19Dde2dA366C4faFff063A86501141d64AC7f273CCAE5053fD059722A4E9453170cb40F569872A02',
			to: 'Q224D6a535f8991Cf611b3447F8DfE1059dbEd07c540A53e9E36D37b2ecEEA19013F66E973b207B0467a5A793203b27456B7aa1CEE00dF1e385D1eC5272718eb7',
			data: '0x819f48fe',
			maxPriorityFeePerGas: '0x0',
			maxFeePerGas: '0x15ab8f14',
		};

		const result = await GetRevertReason.getRevertReason(web3Context, transaction);

		expect(result).toBeUndefined();
	});

	it('should call parseTransactionError without contractAbi', async () => {
		const expectedError = {
			jsonrpc: '2.0',
			id: 1,
			error: {
				code: -32000,
				message:
					'err: insufficient funds for gas * price + value: address Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 have 66 want 9983799287684 (supplied gas 26827)',
			},
		};
		const parseTransactionErrorSpy = jest
			.spyOn(GetRevertReason, 'parseTransactionError')
			.mockImplementation();
		jest.spyOn(RpcMethodWrappersReaders, 'call').mockRejectedValueOnce(expectedError);

		const transaction = {
			from: 'Q2CCeCC72b4C8C0d943bEcFb1E67c4d8996D2F24d138E62dd19Dde2dA366C4faFff063A86501141d64AC7f273CCAE5053fD059722A4E9453170cb40F569872A02',
			to: 'Q224D6a535f8991Cf611b3447F8DfE1059dbEd07c540A53e9E36D37b2ecEEA19013F66E973b207B0467a5A793203b27456B7aa1CEE00dF1e385D1eC5272718eb7',
			data: '0x819f48fe',
			maxPriorityFeePerGas: '0x0',
			maxFeePerGas: '0x15ab8f14',
		};

		await GetRevertReason.getRevertReason(web3Context, transaction);

		expect(parseTransactionErrorSpy).toHaveBeenCalledWith(expectedError, undefined);
	});

	describe('non-revert call failures (L-52)', () => {
		const transaction = {
			from: 'Q2CCeCC72b4C8C0d943bEcFb1E67c4d8996D2F24d138E62dd19Dde2dA366C4faFff063A86501141d64AC7f273CCAE5053fD059722A4E9453170cb40F569872A02',
			to: 'Q224D6a535f8991Cf611b3447F8DfE1059dbEd07c540A53e9E36D37b2ecEEA19013F66E973b207B0467a5A793203b27456B7aa1CEE00dF1e385D1eC5272718eb7',
			data: '0x819f48fe',
		};

		it.each([
			[-32000, 'insufficient funds for gas * price + value'],
			[-32601, 'the method qrl_call does not exist'],
		])('rethrows an error reply with code %i instead of reporting a revert', async (code, message) => {
			const callError = new InvalidResponseError({
				jsonrpc: '2.0',
				id: 1,
				error: { code, message },
			});
			jest.spyOn(RpcMethodWrappersReaders, 'call').mockRejectedValueOnce(callError);

			await expect(GetRevertReason.getRevertReason(web3Context, transaction)).rejects.toBe(
				callError,
			);
		});

		it('returns the message of an execution error (code 3) reply as the reason', async () => {
			jest.spyOn(RpcMethodWrappersReaders, 'call').mockRejectedValueOnce(
				new InvalidResponseError({
					jsonrpc: '2.0',
					id: 1,
					error: { code: 3, message: 'execution failed' },
				}),
			);

			await expect(GetRevertReason.getRevertReason(web3Context, transaction)).resolves.toBe(
				'execution failed',
			);
		});

		it('returns a revert reason object for a ContractExecutionError', async () => {
			jest.spyOn(RpcMethodWrappersReaders, 'call').mockRejectedValueOnce(
				new ContractExecutionError({ code: 3, message: 'execution reverted: boom' }),
			);

			await expect(GetRevertReason.getRevertReason(web3Context, transaction)).resolves.toMatchObject({
				reason: 'execution reverted: boom',
			});
		});
	});

	it('should call parseTransactionError with contractAbi', async () => {
		const expectedError = {
			jsonrpc: '2.0',
			id: 1,
			error: {
				code: -32000,
				message:
					'err: insufficient funds for gas * price + value: address Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 have 66 want 9983799287684 (supplied gas 26827)',
			},
		};
		const parseTransactionErrorSpy = jest
			.spyOn(GetRevertReason, 'parseTransactionError')
			.mockImplementation();
		jest.spyOn(RpcMethodWrappersReaders, 'call').mockRejectedValueOnce(expectedError);

		const transaction = {
			from: 'Q2CCeCC72b4C8C0d943bEcFb1E67c4d8996D2F24d138E62dd19Dde2dA366C4faFff063A86501141d64AC7f273CCAE5053fD059722A4E9453170cb40F569872A02',
			to: 'Q224D6a535f8991Cf611b3447F8DfE1059dbEd07c540A53e9E36D37b2ecEEA19013F66E973b207B0467a5A793203b27456B7aa1CEE00dF1e385D1eC5272718eb7',
			data: '0x819f48fe',
			maxPriorityFeePerGas: '0x0',
			maxFeePerGas: '0x15ab8f14',
		};

		await GetRevertReason.getRevertReason(web3Context, transaction, SimpleRevertAbi);

		expect(parseTransactionErrorSpy).toHaveBeenCalledWith(expectedError, SimpleRevertAbi);
	});
});
