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

import { AbiError } from '@theqrl/web3-errors';
import { encodeEventSignature } from '@theqrl/web3-qrl-abi';
import { Filter } from '@theqrl/web3-types';
import { hexToBytes } from '@theqrl/web3-utils';
import { isFilterObject } from '@theqrl/web3-validator';
import { Contract, encodeEventABI } from '../../src';
import { getLogsData } from '../fixtures/unitTestFixtures';

const eventAbi = {
	anonymous: false,
	inputs: [{ name: 'callback', type: 'function', indexed: true }],
	name: 'Callback',
	type: 'event',
} as const;
const event = { ...eventAbi, signature: encodeEventSignature(eventAbi) };
// `encodeEventSignature` already returns the 64-byte QRVM topic.
const eventTopic = event.signature;
const address = `Q${'44'.repeat(64)}`;
const contractOptions = { address, jsonInterface: [event] };

// Indexed external functions hash the compact 68-byte address + selector.
// The 32-byte digest is left-aligned in a 64-byte topic.
const callbacks = [
	{
		value: `0x${'11'.repeat(64)}12345678`,
		hash: '0x86a3e834e5d213b1eeb4fadff1536c63572a1f8be922564a87eda67a22774de7',
	},
	{
		value: `0x${'11'.repeat(64)}87654321`,
		hash: '0x6c3beeafd0004c8401963cd821774dcb5e4a33fc27968982d78e56e4afb08fac',
	},
	{
		value: `0x${'22'.repeat(64)}12345678`,
		hash: '0x3492dd344173e0d9d1ee1e69ec070fa8b99fd5333a5cfb5b7f47695e94e38633',
	},
].map(callback => ({ ...callback, topic: `${callback.hash}${'00'.repeat(32)}` }));

const filters = [
	{
		name: 'hex string',
		value: callbacks[0].value,
		topic: callbacks[0].topic,
		hashes: [callbacks[0].hash],
	},
	{
		name: 'Uint8Array',
		value: hexToBytes(callbacks[0].value),
		topic: callbacks[0].topic,
		hashes: [callbacks[0].hash],
	},
	{
		name: 'OR list',
		value: [callbacks[0].value, hexToBytes(callbacks[1].value)],
		topic: [callbacks[0].topic, callbacks[1].topic],
		hashes: [callbacks[0].hash, callbacks[1].hash],
	},
];

describe('indexed function topics', () => {
	it.each(filters)('encodes a valid topic for a $name filter', ({ value, topic }) => {
		// Byte buffers are accepted at runtime but are absent from Filter's typings.
		const options = { filter: { callback: value } } as unknown as Filter;
		const filter = encodeEventABI(contractOptions, event, options);

		expect(filter.topics).toEqual([eventTopic, topic]);
		expect(isFilterObject(filter)).toBe(true);
	});

	it('encodes anonymous event topics without an event signature', () => {
		const filter = encodeEventABI(
			contractOptions,
			{ ...event, anonymous: true },
			{ filter: { callback: callbacks[0].value } },
		);

		expect(filter.topics).toEqual([callbacks[0].topic]);
		expect(isFilterObject(filter)).toBe(true);
	});

	it('keeps an omitted function filter as a wildcard', () => {
		const filter = encodeEventABI(contractOptions, event);

		expect(filter.topics?.[0]).toBe(eventTopic);
		expect(filter.topics?.[1]).toBeNull();
		expect(isFilterObject(filter)).toBe(true);
	});

	it('preserves explicitly supplied topics', () => {
		const topics = [eventTopic, callbacks[0].topic];
		const filter = encodeEventABI(contractOptions, event, { topics });

		expect(filter.topics).toEqual(topics);
		expect(isFilterObject(filter)).toBe(true);
	});

	it.each([
		...[0, 24, 64, 67, 69, 128].map(length => `0x${'11'.repeat(length)}`),
		`0x${'gg'.repeat(68)}`,
	])('rejects invalid function reference %s in single and OR filters', value => {
		expect(() =>
			encodeEventABI(contractOptions, event, { filter: { callback: value } }),
		).toThrow(AbiError);
		expect(() =>
			encodeEventABI(contractOptions, event, {
				filter: { callback: [callbacks[0].value, value] },
			}),
		).toThrow(AbiError);
	});
});

describe.each(['Callback', 'allEvents'] as const)(
	'getPastEvents(%s) with indexed functions',
	eventName => {
		it.each(filters)(
			'returns matching events for a $name filter',
			async ({ value, topic, hashes }) => {
				const logs = callbacks.map(callback => ({
					...getLogsData.response[0],
					address,
					data: '0x',
					topics: [eventTopic, callback.topic],
				}));
				const request = jest.fn().mockResolvedValue(logs);
				const contract = new Contract([eventAbi], address, { provider: { request } });

				const options = { filter: { callback: value } } as unknown as Filter;
				const events = await contract.getPastEvents(eventName, options);

				expect(request).toHaveBeenCalledTimes(1);
				expect(request.mock.calls[0][0]).toMatchObject({
					method: 'qrl_getLogs',
					params: [
						expect.objectContaining({
							address,
							...(eventName === 'Callback' ? { topics: [eventTopic, topic] } : {}),
						}),
					],
				});
				expect(events).toHaveLength(hashes.length);
				hashes.forEach((hash, index) => {
					expect(events[index]).toMatchObject({
						event: 'Callback',
						returnValues: { callback: hash },
					});
				});
			},
		);
	},
);
