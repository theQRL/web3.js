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

import { InvalidAddressError } from '@theqrl/web3-errors';
import { sha3Raw, utf8ToHex } from '@theqrl/web3-utils';
import { QRNS } from '../../src/qrns';
import { namehash } from '../../src/utils';
import {
	CUSTOM_REGISTRY,
	FakeProvider,
	OWNER,
	RESOLVER,
	addrWord,
	boolWord,
	bytesReturn,
	calledSelector,
} from '../fixtures/fake_provider';

const sel = (signature: string) => sha3Raw(signature).slice(0, 10);
/** ABI encoding of a single `string` return value. */
const stringReturn = (text: string) => bytesReturn(utf8ToHex(text).slice(2));
const ZERO_ADDRESS = `Q${'0'.repeat(128)}`;
const NAME = 'alice.qrl';
const TEXT = 'https://alice.example';

interface Records {
	/** The name the reverse record of OWNER claims. */
	claimed?: string;
	/** The `qrl_call` reply to `addr(bytes32)` of the claimed name, or a function producing it. */
	addrReply?: unknown;
	/** The resolver the registry reports for the claimed name. */
	forwardResolver?: string;
}

/** A node holding a reverse record for OWNER and the forward records of the claimed name. */
const nodeWith = ({
	claimed = NAME,
	addrReply = `0x${addrWord(OWNER)}`,
	forwardResolver = RESOLVER,
}: Records = {}) => {
	let forwardNode: string | undefined;
	try {
		forwardNode = namehash(claimed).slice(2);
	} catch {
		forwardNode = undefined;
	}
	return new FakeProvider((method, params) => {
		if (method !== 'qrl_call') return undefined;
		const tx = params[0] as { input?: string; data?: string };
		const calldata = tx.input ?? tx.data ?? '';
		switch (calldata.slice(0, 10)) {
			case sel('resolver(bytes32)'):
				return forwardNode !== undefined && calldata.includes(forwardNode)
					? `0x${addrWord(forwardResolver)}`
					: `0x${addrWord(RESOLVER)}`;
			case sel('supportsInterface(bytes4)'):
				return `0x${boolWord(true)}`;
			case sel('name(bytes32)'):
				return stringReturn(claimed);
			case sel('addr(bytes32)'):
				return typeof addrReply === 'function' ? (addrReply as () => unknown)() : addrReply;
			case sel('text(bytes32,string)'):
				return stringReturn(TEXT);
			default:
				return undefined;
		}
	});
};

const selectors = (provider: FakeProvider) => provider.callsTo('qrl_call').map(calledSelector);

describe('QRNS reverse resolution (P4-L-31)', () => {
	it('returns the claimed name when it forward-resolves to the address', async () => {
		const provider = nodeWith();
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		await expect(qrns.getName(OWNER)).resolves.toBe(NAME);
		expect(selectors(provider)).toEqual([
			sel('resolver(bytes32)'),
			sel('supportsInterface(bytes4)'),
			sel('name(bytes32)'),
			sel('resolver(bytes32)'),
			sel('supportsInterface(bytes4)'),
			sel('addr(bytes32)'),
		]);
	});

	it('compares the forward-resolved address case-insensitively', async () => {
		const qrns = new QRNS(CUSTOM_REGISTRY, nodeWith().asProvider());

		await expect(qrns.getName(`Q${OWNER.slice(1).toLowerCase()}`)).resolves.toBe(NAME);
	});

	it('returns an empty string when the claimed name resolves to another address', async () => {
		const qrns = new QRNS(
			CUSTOM_REGISTRY,
			nodeWith({ addrReply: `0x${addrWord(CUSTOM_REGISTRY)}` }).asProvider(),
		);

		await expect(qrns.getName(OWNER)).resolves.toBe('');
	});

	it('returns an empty string without forward-resolving when there is no reverse record', async () => {
		const provider = nodeWith({ claimed: '' });
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		await expect(qrns.getName(OWNER)).resolves.toBe('');
		expect(selectors(provider)).not.toContain(sel('addr(bytes32)'));
	});

	it('returns an empty string for a claimed name the normalizer rejects', async () => {
		const provider = nodeWith({ claimed: 'a b.qrl' });
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		await expect(qrns.getName(OWNER)).resolves.toBe('');
		expect(selectors(provider)).not.toContain(sel('addr(bytes32)'));
	});

	it('returns an empty string when the claimed name has no resolver', async () => {
		const qrns = new QRNS(
			CUSTOM_REGISTRY,
			nodeWith({ forwardResolver: ZERO_ADDRESS }).asProvider(),
		);

		await expect(qrns.getName(OWNER)).resolves.toBe('');
	});

	it('returns an empty string when the claimed name has no address record', async () => {
		const qrns = new QRNS(CUSTOM_REGISTRY, nodeWith({ addrReply: '0x' }).asProvider());

		await expect(qrns.getName(OWNER)).resolves.toBe('');
	});

	it('returns an empty string when the forward resolution reverts', async () => {
		const reverted = () => {
			// eslint-disable-next-line @typescript-eslint/only-throw-error -- a JSON-RPC error reply
			throw { code: 3, message: 'execution reverted', data: '0x' };
		};
		const qrns = new QRNS(CUSTOM_REGISTRY, nodeWith({ addrReply: reverted }).asProvider());

		await expect(qrns.getName(OWNER)).resolves.toBe('');
	});

	it('reports a transport failure of the forward resolution instead of hiding it', async () => {
		const failing = () => {
			throw new Error('socket hang up');
		};
		const qrns = new QRNS(CUSTOM_REGISTRY, nodeWith({ addrReply: failing }).asProvider());

		await expect(qrns.getName(OWNER)).rejects.toBeInstanceOf(Error);
	});

	it.each(['hello.qrl', `Q${'zz'.repeat(64)}`, `q${OWNER.slice(1)}`, `0x${'ab'.repeat(20)}`, ''])(
		'rejects the non-address %p with an InvalidAddressError before any call',
		async input => {
			const provider = nodeWith();
			const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

			await expect(qrns.getName(input)).rejects.toThrow(InvalidAddressError);
			expect(provider.calls).toHaveLength(0);
		},
	);

	it('getText(address) reads the text record of the verified name', async () => {
		const provider = nodeWith();
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		await expect(qrns.getText(OWNER, 'url')).resolves.toBe(TEXT);
		expect(selectors(provider)).toContain(sel('text(bytes32,string)'));
	});

	it('getText(address) is an empty string when the reverse record is not verified', async () => {
		const provider = nodeWith({ addrReply: `0x${addrWord(CUSTOM_REGISTRY)}` });
		const qrns = new QRNS(CUSTOM_REGISTRY, provider.asProvider());

		await expect(qrns.getText(OWNER, 'url')).resolves.toBe('');
		expect(selectors(provider)).not.toContain(sel('text(bytes32,string)'));
	});
});
