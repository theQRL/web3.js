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
import { netRpcMethods } from '@theqrl/web3-rpc-methods';
import { DEFAULT_RETURN_FORMAT, FMT_BYTES, FMT_NUMBER } from '@theqrl/web3-types';
import { InvalidResponseError } from '@theqrl/web3-errors';

import { Net } from '../../src';
import { getId, getPeerCount, isListening } from '../../src/rpc_method_wrappers';

jest.mock('@theqrl/web3-rpc-methods');

/* eslint-disable no-null/no-null */

// Replies a node (or a man in the middle) could send that are not what the method specifies.
const garbageQuantities: unknown[] = [
	'abc',
	'',
	null,
	undefined,
	{},
	[],
	true,
	'1.5',
	'-1',
	'0x',
	'1e3',
	'constructor',
	1.5,
	-1,
	2 ** 53,
	BigInt(-1),
	' 1',
];

describe('web3-net reply validation (L-40)', () => {
	let web3Net: Net;

	beforeAll(() => {
		web3Net = new Net('http://127.0.0.1:8545');
	});

	describe.each([
		['getId', 'net_version', getId, netRpcMethods.getId as jest.Mock],
		['getPeerCount', 'net_peerCount', getPeerCount, netRpcMethods.getPeerCount as jest.Mock],
	])('%s', (_, method, wrapper, rpcMethod) => {
		it.each(garbageQuantities)(
			`rejects the ${method} reply %p with an InvalidResponseError (L-40)`,
			async reply => {
				rpcMethod.mockResolvedValueOnce(reply);
				const outcome = wrapper(web3Net, DEFAULT_RETURN_FORMAT);
				await expect(outcome).rejects.toBeInstanceOf(InvalidResponseError);
				await expect(outcome).rejects.toThrow(
					`Invalid JSON-RPC response: ${method} must return a non-negative integer`,
				);
			},
		);

		it.each([
			['1', BigInt(1)],
			['0x2', BigInt(2)],
			['0', BigInt(0)],
			[3, BigInt(3)],
			[BigInt(4), BigInt(4)],
		])(`formats the valid ${method} reply %p`, async (reply, expected) => {
			rpcMethod.mockResolvedValueOnce(reply);
			await expect(wrapper(web3Net, DEFAULT_RETURN_FORMAT)).resolves.toBe(expected);
		});

		it('keeps the caller return format for a valid reply', async () => {
			rpcMethod.mockResolvedValueOnce('0x10');
			await expect(
				wrapper(web3Net, { number: FMT_NUMBER.NUMBER, bytes: FMT_BYTES.HEX }),
			).resolves.toBe(16);
		});

		it('truncates a long reply in the error message', async () => {
			rpcMethod.mockResolvedValueOnce('x'.repeat(500));
			const outcome = wrapper(web3Net, DEFAULT_RETURN_FORMAT);
			await expect(outcome).rejects.toThrow('...');
			await expect(outcome).rejects.not.toThrow('x'.repeat(100));
		});
	});

	describe('isListening', () => {
		it.each(['yes', 'true', 1, 0, null, undefined, {}, [true]])(
			'rejects the net_listening reply %p with an InvalidResponseError (L-40)',
			async reply => {
				(netRpcMethods.isListening as jest.Mock).mockResolvedValueOnce(reply);
				const outcome = isListening(web3Net);
				await expect(outcome).rejects.toBeInstanceOf(InvalidResponseError);
				await expect(outcome).rejects.toThrow(
					'Invalid JSON-RPC response: net_listening must return a boolean',
				);
			},
		);

		it.each([true, false])('returns the boolean reply %p', async reply => {
			(netRpcMethods.isListening as jest.Mock).mockResolvedValueOnce(reply);
			await expect(isListening(web3Net)).resolves.toBe(reply);
		});
	});
});
