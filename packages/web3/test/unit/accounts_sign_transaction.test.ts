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

import { FeeMarketEIP1559Transaction, seedToAccount } from '@theqrl/web3-qrl-accounts';
import { TransactionSigningError } from '@theqrl/web3-errors';
import { Transaction } from '@theqrl/web3-types';
import { hexToBytes } from '@theqrl/web3-utils';
import { Web3 } from '../../src';

const seed = `0x010000${'01'.repeat(48)}`;
const signerAddress = seedToAccount(seed).address;
const otherAddress = seedToAccount(`0x010000${'02'.repeat(48)}`).address;
const transaction: Transaction = {
	to: otherAddress,
	value: 1,
	gas: 21000,
	maxFeePerGas: 1,
	maxPriorityFeePerGas: 1,
	chainId: 1,
	networkId: 1,
	type: 2,
};

describe.each([
	{
		name: 'accounts.signTransaction with a hex seed',
		sign: async (web3: Web3, tx: Transaction) => web3.qrl.accounts.signTransaction(tx, seed),
	},
	{
		name: 'accounts.signTransaction with a byte seed',
		sign: async (web3: Web3, tx: Transaction) =>
			web3.qrl.accounts.signTransaction(tx, hexToBytes(seed)),
	},
	{
		name: 'account.signTransaction',
		sign: async (web3: Web3, tx: Transaction) =>
			web3.qrl.accounts.seedToAccount(seed).signTransaction(tx),
	},
])('$name sender consistency', ({ sign }) => {
	let web3: Web3;
	const request = jest.fn();

	beforeEach(() => {
		request.mockReset().mockResolvedValue('0x7');
		web3 = new Web3({ provider: { request } });
	});

	it('rejects a mismatched from address before making any RPC requests', async () => {
		await expect(
			sign(web3, { ...transaction, from: otherAddress, nonce: 0 }).then(() => undefined),
		).rejects.toThrow(TransactionSigningError);
		expect(request).not.toHaveBeenCalled();
	});

	it('signs a matching from address and an explicit nonce without RPC requests', async () => {
		const signed = await sign(web3, { ...transaction, from: signerAddress, nonce: 0 });
		const decoded = FeeMarketEIP1559Transaction.fromSerializedTx(
			hexToBytes(signed.rawTransaction),
		);

		expect(decoded.nonce).toBe(BigInt(0));
		expect(decoded.verifySignature()).toBe(true);
		expect(decoded.getSenderAddress().toString().toLowerCase()).toBe(
			signerAddress.toLowerCase(),
		);
		expect(request).not.toHaveBeenCalled();
	});

	it.each([
		{ name: 'no default account', defaultAccount: undefined },
		{ name: 'a different default account', defaultAccount: otherAddress },
	])('populates the signer nonce with $name and no from address', async ({ defaultAccount }) => {
		if (defaultAccount !== undefined) {
			web3.defaultAccount = defaultAccount;
		}

		const signed = await sign(web3, { ...transaction });

		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][0]).toMatchObject({
			method: 'qrl_getTransactionCount',
			params: [signerAddress, 'latest'],
		});

		const decoded = FeeMarketEIP1559Transaction.fromSerializedTx(
			hexToBytes(signed.rawTransaction),
		);
		expect(decoded.nonce).toBe(BigInt(7));
		expect(decoded.verifySignature()).toBe(true);
		expect(decoded.getSenderAddress().toString().toLowerCase()).toBe(
			signerAddress.toLowerCase(),
		);
	});
});
