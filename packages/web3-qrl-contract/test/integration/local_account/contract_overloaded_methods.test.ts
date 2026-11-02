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
import { utf8ToHex } from '@theqrl/web3-utils';
import { Contract, EventLog } from '../../../src';
import { SQRCTN1TokenAbi, SQRCTN1TokenBytecode } from '../../shared_fixtures/build/SQRCTN1Token';
import { getSystemTestProvider, createLocalAccount } from '../../fixtures/system_test_utils';
import { toUpperCaseHex } from '../../shared_fixtures/utils';

describe('contract SQRCTN1 overloaded functions', () => {
	let contract: Contract<typeof SQRCTN1TokenAbi>;
	let sendOptions: Record<string, unknown>;
	let deployOptions: Record<string, unknown>;
	let localAccount: Web3Account;
	let web3: Web3;
	let contractDeployed: Contract<typeof SQRCTN1TokenAbi>;

	beforeAll(async () => {
		web3 = new Web3(getSystemTestProvider());
		localAccount = await createLocalAccount(web3);
		contract = new web3.qrl.Contract(SQRCTN1TokenAbi) as unknown as Contract<
			typeof SQRCTN1TokenAbi
		>;

		deployOptions = {
			data: SQRCTN1TokenBytecode,
			arguments: [],
		};

		sendOptions = {
			from: localAccount.address,
			gas: '1000000',
		};
		contractDeployed = await contract
			.deploy(deployOptions)
			.send({ ...sendOptions, gas: '3000000' });
	});

	it('transferFrom with 4 arguments', async () => {
		const tempAccount = await createLocalAccount(web3);
		const toAccount = await createLocalAccount(web3);
		await contractDeployed.methods
			.awardItem(tempAccount.address, 'http://my-nft-award')
			.send({ ...sendOptions });

		const logs = await contractDeployed.getPastEvents('Transfer');
		const tokenId = (logs[0] as EventLog)?.returnValues?.tokenId as string;
		await contractDeployed.methods
			.safeTransferFrom(tempAccount.address, toAccount.address, tokenId, utf8ToHex('1'))
			.send({
				...sendOptions,
				from: tempAccount.address,
			});

		expect(
			toUpperCaseHex(
				(await contractDeployed.methods.ownerOf(tokenId).call()) as unknown as string,
			),
		).toBe(toUpperCaseHex(toAccount.address));
	});

	it('transferFrom with 3 arguments', async () => {
		const tempAccount = await createLocalAccount(web3);
		const toAccount = await createLocalAccount(web3);
		await contractDeployed.methods
			.awardItem(tempAccount.address, 'http://my-nft-award')
			.send({ ...sendOptions });

		const logs = await contractDeployed.getPastEvents('Transfer');
		const tokenId = (logs[0] as EventLog)?.returnValues?.tokenId as string;
		await contractDeployed.methods
			.safeTransferFrom(tempAccount.address, toAccount.address, tokenId)
			.send({
				...sendOptions,
				from: tempAccount.address,
			});

		expect(
			toUpperCaseHex(
				(await contractDeployed.methods.ownerOf(tokenId).call()) as unknown as string,
			),
		).toBe(toUpperCaseHex(toAccount.address));
	});

	it('transferFrom with 3 invalid arguments', () => {
		expect(() =>
			contractDeployed.methods
				// @ts-expect-error-next-line
				.safeTransferFrom(1, 2, 3),
		).toThrow('Web3 validator');
	});

	it('transferFrom with 2 arguments', () => {
		expect(() =>
			// @ts-expect-error-next-line
			contractDeployed.methods.safeTransferFrom(localAccount.address, localAccount.address),
		).toThrow('Web3 validator');
	});
});
