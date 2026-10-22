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

import { InvalidMethodParamsError } from '@theqrl/web3-errors';
import { Web3Config, Web3ConfigEvent } from '../../src/web3_config';

/* eslint-disable no-null/no-null */

class MyConfigObject extends Web3Config {}

const address = `Q${'ab'.repeat(64)}`;

describe('Web3Config validation', () => {
	describe('setConfig() (L-39, I-14)', () => {
		it('routes every option through its setter and emits CONFIG_CHANGE per option (L-39)', () => {
			const obj = new MyConfigObject();
			const changes = jest.fn();
			obj.on(Web3ConfigEvent.CONFIG_CHANGE, changes);

			obj.setConfig({ defaultBlock: 'pending', handleRevert: true });

			expect(obj.defaultBlock).toBe('pending');
			expect(obj.handleRevert).toBe(true);
			expect(changes).toHaveBeenCalledTimes(2);
			expect(changes).toHaveBeenCalledWith({
				name: 'defaultBlock',
				oldValue: 'latest',
				newValue: 'pending',
			});
			expect(changes).toHaveBeenCalledWith({
				name: 'handleRevert',
				oldValue: false,
				newValue: true,
			});
		});

		it('rejects an unknown option with an InvalidMethodParamsError and changes nothing (L-39)', () => {
			const obj = new MyConfigObject();
			expect(() => obj.setConfig({ notAConfigKey: 1, defaultBlock: 7 } as never)).toThrow(
				InvalidMethodParamsError,
			);
			expect(() => obj.setConfig({ notAConfigKey: 1 } as never)).toThrow(
				'Unknown configuration option "notAConfigKey"',
			);
			expect((obj.config as unknown as Record<string, unknown>).notAConfigKey).toBeUndefined();
		});

		it('rejects an invalid value with an InvalidMethodParamsError naming the option (L-39)', () => {
			const obj = new MyConfigObject();
			expect(() => obj.setConfig({ transactionPollingInterval: 'abc' as never })).toThrow(
				InvalidMethodParamsError,
			);
			expect(() => obj.setConfig({ transactionPollingInterval: 'abc' as never })).toThrow(
				'Invalid value for the "transactionPollingInterval" configuration option',
			);
			expect(obj.transactionPollingInterval).toBe(1000);
		});

		it.each([undefined, null, 'x', 5, [1]])(
			'rejects %p instead of a configuration object (L-39)',
			value => {
				const obj = new MyConfigObject();
				expect(() => obj.setConfig(value as never)).toThrow(InvalidMethodParamsError);
			},
		);

		it('ignores a __proto__ key and leaves the prototypes untouched (I-14)', () => {
			const obj = new MyConfigObject();
			const options = JSON.parse(
				'{"__proto__":{"handleRevert":"polluted"},"defaultBlock":"safe"}',
			) as Record<string, unknown>;

			obj.setConfig(options as never);

			expect(obj.defaultBlock).toBe('safe');
			expect(obj.config.handleRevert).toBe(false);
			expect(Object.getPrototypeOf(obj.config)).toBe(Object.prototype);
			expect(({} as Record<string, unknown>).handleRevert).toBeUndefined();
		});
	});

	describe('setter validation (I-14, L-39)', () => {
		it.each([
			['handleRevert', 'yes'],
			['handleRevert', undefined],
			['defaultAccount', 'not-an-address'],
			['defaultAccount', `Q${'ab'.repeat(63)}`],
			['defaultAccount', `0x${'ab'.repeat(20)}`],
			['defaultBlock', 'bogus'],
			['defaultBlock', -1],
			['defaultBlock', 1.5],
			['defaultBlock', '0x'],
			['defaultBlock', undefined],
			['transactionSendTimeout', -1],
			['transactionSendTimeout', 0],
			['transactionSendTimeout', 'abc'],
			['transactionBlockTimeout', 0],
			['transactionBlockTimeout', 1.5],
			['transactionConfirmationBlocks', -1],
			['transactionConfirmationBlocks', 1.5],
			['transactionPollingInterval', 0],
			['transactionPollingInterval', -5],
			['transactionPollingInterval', 'abc'],
			['transactionPollingInterval', NaN],
			['transactionPollingTimeout', 0],
			['transactionReceiptPollingInterval', 0],
			['transactionConfirmationPollingInterval', -1],
			['blockHeaderTimeout', 0],
			['blockHeaderTimeout', Infinity],
			['maxListenersWarningThreshold', -1],
			['maxListenersWarningThreshold', NaN],
			['contractDataInputFill', 'neither'],
			['defaultNetworkId', 'x'],
			['defaultNetworkId', -1],
			['defaultChain', 42],
			['defaultChain', ''],
			['defaultHardfork', { a: 1 }],
			['defaultCommon', 'x'],
			['defaultCommon', {}],
			['defaultCommon', []],
			['defaultTransactionType', '0xg'],
			['defaultTransactionType', -1],
			['defaultMaxPriorityFeePerGas', -1],
			['defaultMaxPriorityFeePerGas', 1.5],
			['enableExperimentalFeatures', 'yes'],
			['enableExperimentalFeatures', { useRpcCallSpecification: 'true' }],
			['transactionBuilder', 'x'],
			['transactionTypeParser', 5],
		])('rejects %s = %p with an InvalidMethodParamsError and keeps the old value (I-14)', (key, value) => {
			const obj = new MyConfigObject();
			const before = obj[key as keyof MyConfigObject];
			const changes = jest.fn();
			obj.on(Web3ConfigEvent.CONFIG_CHANGE, changes);

			expect(() => {
				(obj as unknown as Record<string, unknown>)[key] = value;
			}).toThrow(InvalidMethodParamsError);

			expect(obj[key as keyof MyConfigObject]).toEqual(before);
			// Validation happens before anything is announced to child contexts.
			expect(changes).not.toHaveBeenCalled();
		});

		it.each([
			['defaultBlock', 'safe'],
			['defaultBlock', 7],
			['defaultBlock', '0x10'],
			['defaultBlock', '12'],
			['defaultBlock', BigInt(5)],
			['defaultAccount', undefined],
			['defaultAccount', address],
			['defaultAccount', `q${'ab'.repeat(64)}`],
			['defaultNetworkId', '0x1'],
			['defaultNetworkId', BigInt(3)],
			['defaultNetworkId', undefined],
			['defaultTransactionType', 2],
			['transactionConfirmationBlocks', 0],
			['transactionBlockTimeout', 1],
			['maxListenersWarningThreshold', 0],
			['blockHeaderTimeout', 0.5],
			['transactionReceiptPollingInterval', undefined],
			['enableExperimentalFeatures', { useRpcCallSpecification: true }],
			['transactionBuilder', () => undefined],
			['transactionTypeParser', undefined],
			['defaultCommon', { customChain: { name: 'c', networkId: 1, chainId: 1 } }],
		])('accepts %s = %p', (key, value) => {
			const obj = new MyConfigObject();
			(obj as unknown as Record<string, unknown>)[key] = value;
			expect(obj[key as keyof MyConfigObject]).toEqual(value);
		});

		it('maxListenersWarningThreshold applies the threshold to the emitter after validating (I-14)', () => {
			const obj = new MyConfigObject();
			obj.maxListenersWarningThreshold = 7;
			expect(obj.getMaxListeners()).toBe(7);
			expect(() => {
				obj.maxListenersWarningThreshold = -1;
			}).toThrow(InvalidMethodParamsError);
			expect(obj.getMaxListeners()).toBe(7);
		});
	});
});
