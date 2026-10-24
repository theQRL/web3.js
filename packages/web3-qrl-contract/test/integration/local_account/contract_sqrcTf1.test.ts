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
import { Web3Account } from '@theqrl/web3-qrl-accounts';
import { Contract } from '../../../src';
import { SQRCTF1TokenAbi, SQRCTF1TokenBytecode } from '../../shared_fixtures/build/SQRCTF1Token';
import { getSystemTestProvider, createLocalAccount } from '../../fixtures/system_test_utils';

const initialSupply = BigInt('5000000000');

describe('contract', () => {
	describe('sqrcTf1', () => {
		let contract: Contract<typeof SQRCTF1TokenAbi>;
		let sendOptions: Record<string, unknown>;
		let deployOptions: Record<string, unknown>;
		let localAccount: Web3Account;
		let web3: Web3;
		let contractDeployed: Contract<typeof SQRCTF1TokenAbi>;

		beforeAll(async () => {
			web3 = new Web3(getSystemTestProvider());
			localAccount = await createLocalAccount(web3);
			contract = new web3.qrl.Contract(SQRCTF1TokenAbi) as unknown as Contract<
				typeof SQRCTF1TokenAbi
			>;

			deployOptions = {
				data: SQRCTF1TokenBytecode,
				arguments: [initialSupply],
			};

			sendOptions = {
				from: localAccount.address,
				gas: '2000000',
			};
			contractDeployed = await contract.deploy(deployOptions).send(sendOptions);
		});

		it('should deploy the contract', () => {
			expect(contractDeployed.options.address).toBeDefined();
		});

		it.each(['0x2'])('should transfer tokens %p', async type => {
			const acc = web3.qrl.accounts.create();
			const value = BigInt(10);

			await contractDeployed.methods.transfer(acc.address, value).send({
				...sendOptions,
				type,
			});

			expect(await contractDeployed.methods.balanceOf(acc.address).call()).toBe(value);
		});

		it.each(['0x2'])('should approve and transferFrom tokens %p', async type => {
			const value = BigInt(10);
			const transferFromValue = BigInt(4);
			const tempAccount = await createLocalAccount(web3);
			// approve
			await contractDeployed.methods
				.approve(tempAccount.address, value)
				.send({ ...sendOptions, type });

			// transferFrom
			await contractDeployed.methods
				.transferFrom(localAccount.address, tempAccount.address, transferFromValue)
				.send({ ...sendOptions, from: tempAccount.address, type });

			expect(await contractDeployed.methods.balanceOf(tempAccount.address).call()).toBe(
				transferFromValue,
			);

			// allowance
			expect(
				await contractDeployed.methods
					.allowance(localAccount.address, tempAccount.address)
					.call(),
			).toBe(value - transferFromValue);
		});

		it.each(['0x2'])('should increase allowance %p', async type => {
			const value = BigInt(10);
			const newAmount = BigInt(20);
			const tempAccount = await createLocalAccount(web3);

			// approve
			await contractDeployed.methods
				.approve(tempAccount.address, value)
				.send({ ...sendOptions, type });

			// allowance
			expect(
				await contractDeployed.methods
					.allowance(localAccount.address, tempAccount.address)
					.call(),
			).toBe(value);

			// approve
			await contractDeployed.methods
				.approve(tempAccount.address, newAmount)
				.send({ ...sendOptions, from: localAccount.address, type, gas: '2000000' });

			// check allowance
			expect(
				await contractDeployed.methods
					.allowance(localAccount.address, tempAccount.address)
					.call(),
			).toBe(newAmount);
		});
	});
});
