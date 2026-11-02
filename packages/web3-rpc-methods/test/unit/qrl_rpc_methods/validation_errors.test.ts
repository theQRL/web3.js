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

import { Web3RequestManager } from '@theqrl/web3-core';
import { Web3ValidatorError } from '@theqrl/web3-validator';

import { qrlRpcMethods } from '../../../src/index';

// Deliberately NOT mocking @theqrl/web3-validator: these cases exercise the real validator to
// prove that malformed caller input ends in a typed Web3ValidatorError, not a raw TypeError.

const address = `Q${'00'.repeat(64)}`;
const storageKey = `0x${'ab'.repeat(32)}`;

describe('caller input that used to escape as a raw TypeError (L-26)', () => {
	let requestManager: Web3RequestManager;
	let sendSpy: jest.Mock;

	beforeEach(() => {
		requestManager = new Web3RequestManager('http://127.0.0.1:8545');
		sendSpy = jest.fn().mockResolvedValue('0x1');
		requestManager.send = sendSpy;
	});

	describe('getLogs', () => {
		it.each(['notarray', 5, { a: 1 }, true])(
			'rejects a filter whose topics are %p with a Web3ValidatorError (L-26)',
			async topics => {
				const outcome = qrlRpcMethods.getLogs(requestManager, { topics } as never);
				await expect(outcome).rejects.toBeInstanceOf(Web3ValidatorError);
				await expect(outcome).rejects.not.toBeInstanceOf(TypeError);
				expect(sendSpy).not.toHaveBeenCalled();
			},
		);
	});

	describe('getFeeHistory', () => {
		/* eslint-disable no-null/no-null */
		it.each([null, undefined, 'notarray', 25, { 0: 25 }])(
			'rejects the reward percentiles %p with a Web3ValidatorError (L-26)',
			async rewardPercentiles => {
				const outcome = qrlRpcMethods.getFeeHistory(
					requestManager,
					'0x4',
					'latest',
					rewardPercentiles as never,
				);
				await expect(outcome).rejects.toBeInstanceOf(Web3ValidatorError);
				await expect(outcome).rejects.toThrow('rewardPercentiles) must be an array of numbers');
				expect(sendSpy).not.toHaveBeenCalled();
			},
		);
		/* eslint-enable no-null/no-null */

		it('rejects a non-numeric percentile with a Web3ValidatorError', async () => {
			await expect(
				qrlRpcMethods.getFeeHistory(requestManager, '0x4', 'latest', ['x'] as never),
			).rejects.toBeInstanceOf(Web3ValidatorError);
			expect(sendSpy).not.toHaveBeenCalled();
		});

		it.each([[[25, 50]], [[]], [[12.5]]])('sends the valid reward percentiles %p', async rewardPercentiles => {
			await qrlRpcMethods.getFeeHistory(requestManager, '0x4', 'latest', rewardPercentiles);
			expect(sendSpy).toHaveBeenCalledWith({
				method: 'qrl_feeHistory',
				params: ['0x4', 'latest', rewardPercentiles],
			});
		});
	});

	describe('getProof', () => {
		it.each([
			['a 4-byte key', ['0xabababab']],
			['a 33-byte key', [`0x${'ab'.repeat(33)}`]],
			['a valid key next to a short key', [storageKey, '0x12']],
			['a non-hex key', ['zz']],
		])('rejects %s in storageKeys with a Web3ValidatorError (L-26)', async (_, storageKeys) => {
			const outcome = qrlRpcMethods.getProof(requestManager, address, storageKeys, 'latest');
			await expect(outcome).rejects.toBeInstanceOf(Web3ValidatorError);
			expect(sendSpy).not.toHaveBeenCalled();
		});

		it.each([[[storageKey]], [[storageKey, storageKey]], [[]]])(
			'sends the valid storage keys %p',
			async storageKeys => {
				await qrlRpcMethods.getProof(requestManager, address, storageKeys, 'latest');
				expect(sendSpy).toHaveBeenCalledWith({
					method: 'qrl_getProof',
					params: [address, storageKeys, 'latest'],
				});
			},
		);
	});
});
