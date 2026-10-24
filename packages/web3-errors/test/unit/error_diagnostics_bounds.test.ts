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

/* eslint-disable no-null/no-null -- exercise JSON null diagnostics */
import { BaseWeb3Error, toJsonSafe } from '../../src/web3_error_base';
import {
	TransactionRevertWithCustomError,
	TransactionRevertedWithoutReasonError,
	RevertInstructionError,
} from '../../src/errors/transaction_errors';
import { Eip838ExecutionError } from '../../src/errors/contract_errors';
import { HttpStatusError } from '../../src/errors/connection_errors';
import { RpcError } from '../../src/errors/rpc_errors';
import { ResponseError } from '../../src/errors/response_errors';

describe('error diagnostics bounds (pass-5 audit)', () => {
	it('serializes receipts, decoded arguments and nested RPC/request diagnostics with bigint values', () => {
		const receipt = { status: BigInt(0), blockNumber: BigInt(2) };
		const execution = new Eip838ExecutionError({ code: 3, message: 'revert', data: '0x' });
		execution.setDecodedProperties('Failure', 'Failure(uint512)', { amount: BigInt(3) });
		const errors = [
			new TransactionRevertedWithoutReasonError(receipt),
			new TransactionRevertWithCustomError(
				'revert',
				'Failure',
				'Failure(uint512)',
				{ amount: BigInt(3) },
				'0x',
				receipt,
			),
			execution,
			new RpcError({
				jsonrpc: '2.0',
				id: 1,
				error: { code: 3, message: 'revert', data: { amount: BigInt(3) } },
			}),
			new ResponseError(
				{
					jsonrpc: '2.0',
					id: 1,
					error: { code: 3, message: 'revert', data: { amount: BigInt(3) } },
				},
				undefined,
				{ params: [BigInt(4)] } as never,
			),
		];
		for (const error of errors) expect(() => JSON.stringify(error)).not.toThrow();
		expect(JSON.parse(JSON.stringify(errors[0])).receipt).toEqual({
			status: '0',
			blockNumber: '2',
		});
		expect(JSON.parse(JSON.stringify(errors[1])).customErrorArguments).toEqual({ amount: '3' });
		expect(JSON.parse(JSON.stringify(execution)).errorArgs).toEqual({ amount: '3' });
	});
	it('bounds remote messages and receipts without discarding the original fields', () => {
		const large = 'x'.repeat(100_000);
		const receipt = { logs: [large] };
		const errors = [
			new TransactionRevertedWithoutReasonError(receipt),
			new RevertInstructionError(large, '0x'),
			new Eip838ExecutionError({ code: 3, message: large }),
			new RpcError({ jsonrpc: '2.0', id: 1, error: { code: 3, message: large } }, large),
			new HttpStatusError(503, large),
		];
		for (const error of errors) expect(error.message.length).toBeLessThan(1000);
		expect(errors[0].toJSON()).toHaveProperty('receipt', receipt);
	});
	it('handles cycles and never invokes untrusted serialization hooks', () => {
		const value: Record<string, unknown> = {
			amount: BigInt(5),
			toJSON: () => {
				throw new Error('unsafe');
			},
		};
		value.self = value;
		expect(toJsonSafe(value)).toEqual({ amount: '5', self: '[Circular]' });
		expect(BaseWeb3Error.convertToString(null)).toBe('null');
	});
});
