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
import { AbiEventFragment, DEFAULT_RETURN_FORMAT, LogsInput } from '@theqrl/web3-types';
import { decodeEventABI } from '../../src/encoding';

type EventWithSignature = AbiEventFragment & { signature: string };

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
