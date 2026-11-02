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
import { AbiError, ResponseError } from '@theqrl/web3-errors';
import { AbiEventFragment, DEFAULT_RETURN_FORMAT, LogsInput } from '@theqrl/web3-types';
import { encodeEventSignature, encodeParameter } from '@theqrl/web3-qrl-abi';
import { decodeEventABI } from '../../src/encoding';

type EventWithSignature = AbiEventFragment & { signature: string };

describe('decodeEventABI with unannotated public ABI fragments', () => {
	const event: AbiEventFragment = {
		type: 'event',
		name: 'StringEvent',
		anonymous: false,
		inputs: [{ name: 'value', type: 'string', indexed: false }],
	};
	const signature = encodeEventSignature(event);
	const log = { topics: [signature], data: encodeParameter('string', 'hello') } as LogsInput;

	it.each([false, true])('decodes a raw named fragment with registry=%s', withRegistry => {
		const decoded = decodeEventABI(event, log, withRegistry ? [event] : []);
		expect(decoded.returnValues.value).toBe('hello');
		expect(decoded.signature).toBe(signature.slice(0, 66));
		expect(event).not.toHaveProperty('signature');
	});

	it('accepts an omitted or null registry and rejects other registry shapes typed', () => {
		expect(decodeEventABI(event, log).returnValues.value).toBe('hello');
		// eslint-disable-next-line no-null/no-null
		expect(decodeEventABI(event, log, null as never).returnValues.value).toBe('hello');
		expect(() => decodeEventABI(event, log, {} as never)).toThrow(AbiError);
	});

	it.each([7, {}, undefined])('rejects malformed topic entries %p', topic => {
		expect(() => decodeEventABI(event, { ...log, topics: [topic] } as never)).toThrow(
			ResponseError,
		);
	});

	it('keeps the caller fragment when only another layout is in the registry', () => {
		const indexed = { ...event, inputs: [{ name: 'value', type: 'uint256', indexed: true }] };
		const plain = { ...indexed, inputs: [{ name: 'value', type: 'uint256', indexed: false }] };
		const valueLog = {
			topics: [encodeEventSignature(indexed), encodeParameter('uint256', 5)],
			data: '0x',
		} as LogsInput;
		expect(decodeEventABI(indexed, valueLog, [plain]).returnValues.value).toBe(BigInt(5));
	});

	it('does not mutate a selected registry fragment with missing inputs', () => {
		const ping = { type: 'event', name: 'Ping' } as AbiEventFragment;
		decodeEventABI(
			{ type: 'event', name: 'ALLEVENTS', inputs: [] },
			{ topics: [encodeEventSignature(ping)], data: '0x' } as LogsInput,
			[ping],
		);
		expect(ping).not.toHaveProperty('inputs');
	});

	it('resolves a raw event fragment on the allEvents path', () => {
		const decoded = decodeEventABI({ type: 'event', name: 'ALLEVENTS', inputs: [] }, log, [
			event,
		]);
		expect(decoded.event).toBe('StringEvent');
		expect(decoded.returnValues.value).toBe('hello');
		expect(event).not.toHaveProperty('signature');
	});

	it('still rejects a raw named fragment with the wrong topic count', () => {
		expect(() => decodeEventABI(event, { ...log, topics: [] }, [])).toThrow(AbiError);
	});
});

describe('decodeEventABI with a log that carries no topics', () => {
	// What a node delivers for a log, minus `topics`.
	const logWithoutTopics = {
		address: `Q${'0'.repeat(128)}`,
		data: '0x',
		blockNumber: '0x1',
		logIndex: '0x0',
		transactionIndex: '0x0',
		transactionHash: `0x${'11'.repeat(32)}`,
		blockHash: `0x${'22'.repeat(32)}`,
		removed: false,
	} as unknown as LogsInput;

	const transfer: EventWithSignature = {
		type: 'event',
		name: 'Transfer',
		anonymous: false,
		inputs: [
			{ indexed: true, name: 'from', type: 'address' },
			{ indexed: false, name: 'amount', type: 'uint256' },
		],
		signature: `0x${'ab'.repeat(32)}`,
	};

	it('decodes it as an anonymous event on the allEvents path instead of throwing', () => {
		const allEvents: EventWithSignature = {
			type: 'event',
			name: 'ALLEVENTS',
			inputs: [],
			signature: '',
		};

		const decoded = decodeEventABI(
			allEvents,
			logWithoutTopics,
			[transfer],
			DEFAULT_RETURN_FORMAT,
		);

		expect(decoded.signature).toBeUndefined();
		expect(decoded.returnValues.__length__).toBe(0);
		expect(decoded.raw.topics).toBeUndefined();
	});

	it('rejects a named event whose topics are missing', () => {
		expect(() =>
			decodeEventABI(transfer, logWithoutTopics, [transfer], DEFAULT_RETURN_FORMAT),
		).toThrow(AbiError);
	});

	it('reports a declared anonymous event with indexed inputs through AbiError', () => {
		const anonymous: EventWithSignature = { ...transfer, name: 'Anon', anonymous: true };

		expect(() =>
			decodeEventABI(anonymous, logWithoutTopics, [anonymous], DEFAULT_RETURN_FORMAT),
		).toThrow(AbiError);
	});
});
