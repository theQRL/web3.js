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

import { QRLTypedData } from '@theqrl/web3-types';
import { keccak256 } from '@theqrl/web3-utils';
import { getEncodedQRLTypedData } from '../../src';

// Build reference hashes from explicit type strings and bytes32 values in 64-byte ABI words.
const hashWords = (...words: string[]): string =>
	keccak256(`0x${words.map(word => word.slice(2).padEnd(128, '0')).join('')}`);
const hashStruct = (type: string, ...fieldHashes: string[]): string =>
	hashWords(keccak256(type), ...fieldHashes);
const emptyArrayHash = keccak256('0x');
const domainHash = hashStruct('QRLTypedDataDomain(string name)', keccak256('test'));

const expectMessage = (typedData: QRLTypedData, structHash: string) => {
	const message = `0x1901${domainHash.slice(2)}${structHash.slice(2)}`;
	expect(getEncodedQRLTypedData(typedData, false)).toBe(message);
	expect(getEncodedQRLTypedData(typedData, true)).toBe(keccak256(message));
};

describe('recursive QRL typed-data schemas', () => {
	const personType = 'Person(string name,Person[] children)';
	const personData: QRLTypedData = {
		types: {
			QRLTypedDataDomain: [{ name: 'name', type: 'string' }],
			Person: [
				{ name: 'name', type: 'string' },
				{ name: 'children', type: 'Person[]' },
			],
		},
		primaryType: 'Person',
		domain: { name: 'test' },
		message: { name: 'Alice', children: [] },
	};

	it('encodes a self-referencing type with an empty array', () => {
		expectMessage(personData, hashStruct(personType, keccak256('Alice'), emptyArrayHash));
	});

	it('encodes a finite tree of a self-referencing type', () => {
		const carolHash = hashStruct(personType, keccak256('Carol'), emptyArrayHash);
		const bobHash = hashStruct(personType, keccak256('Bob'), hashWords(carolHash));
		const daveHash = hashStruct(personType, keccak256('Dave'), emptyArrayHash);

		expectMessage(
			{
				...personData,
				message: {
					name: 'Alice',
					children: [
						{ name: 'Bob', children: [{ name: 'Carol', children: [] }] },
						{ name: 'Dave', children: [] },
					],
				},
			},
			hashStruct(personType, keccak256('Alice'), hashWords(bobHash, daveHash)),
		);
	});

	it('rejects fixed and multidimensional struct arrays, like the go-qrl signer', () => {
		expect(() =>
			getEncodedQRLTypedData(
				{
					...personData,
					types: {
						QRLTypedDataDomain: [{ name: 'name', type: 'string' }],
						Person: [{ name: 'children', type: 'Person[2][]' }],
					},
					message: { children: [] },
				},
				true,
			),
		).toThrow('invalid field');
	});

	it('includes a recursive dependency only once when multiple fields reference it', () => {
		const aliceHash = hashStruct(personType, keccak256('Alice'), emptyArrayHash);
		const bobHash = hashStruct(personType, keccak256('Bob'), emptyArrayHash);

		expectMessage(
			{
				...personData,
				types: {
					...personData.types,
					Mail: [
						{ name: 'from', type: 'Person' },
						{ name: 'to', type: 'Person' },
					],
				},
				primaryType: 'Mail',
				message: {
					from: { name: 'Alice', children: [] },
					to: { name: 'Bob', children: [] },
				},
			},
			hashStruct(`Mail(Person from,Person to)${personType}`, aliceHash, bobHash),
		);
	});

	const memberType = 'Person(string name,Group group)Group(Person[] members)';
	const groupType = 'Group(Person[] members)Person(string name,Group group)';
	const emptyGroupHash = hashStruct(groupType, emptyArrayHash);
	const mutualData: QRLTypedData = {
		types: {
			QRLTypedDataDomain: [{ name: 'name', type: 'string' }],
			Person: [
				{ name: 'name', type: 'string' },
				{ name: 'group', type: 'Group' },
			],
			Group: [{ name: 'members', type: 'Person[]' }],
		},
		primaryType: 'Person',
		domain: { name: 'test' },
		message: { name: 'Alice', group: { members: [] } },
	};

	it('encodes mutually recursive types ending in an empty array', () => {
		expectMessage(mutualData, hashStruct(memberType, keccak256('Alice'), emptyGroupHash));
	});

	it('keeps the current primary type first when hashing mutually recursive values', () => {
		const bobHash = hashStruct(memberType, keccak256('Bob'), emptyGroupHash);
		const groupHash = hashStruct(groupType, hashWords(bobHash));

		expectMessage(
			{
				...mutualData,
				message: {
					name: 'Alice',
					group: { members: [{ name: 'Bob', group: { members: [] } }] },
				},
			},
			hashStruct(memberType, keccak256('Alice'), groupHash),
		);
	});

	it('sorts and deduplicates shared transitive dependencies', () => {
		const leafHash = hashStruct('Leaf(string value)', keccak256('shared'));
		const zedHash = hashStruct('Zed(Leaf leaf)Leaf(string value)', leafHash);
		const alphaHash = hashStruct('Alpha(Leaf leaf)Leaf(string value)', leafHash);
		const leaf = { value: 'shared' };

		expectMessage(
			{
				types: {
					QRLTypedDataDomain: [{ name: 'name', type: 'string' }],
					Envelope: [
						{ name: 'zed', type: 'Zed' },
						{ name: 'alpha', type: 'Alpha' },
						{ name: 'leaf', type: 'Leaf' },
					],
					Zed: [{ name: 'leaf', type: 'Leaf' }],
					Leaf: [{ name: 'value', type: 'string' }],
					Alpha: [{ name: 'leaf', type: 'Leaf' }],
					Unused: [{ name: 'children', type: 'Unused[]' }],
				},
				primaryType: 'Envelope',
				domain: { name: 'test' },
				message: { zed: { leaf }, alpha: { leaf }, leaf },
			},
			hashStruct(
				'Envelope(Zed zed,Alpha alpha,Leaf leaf)Alpha(Leaf leaf)Leaf(string value)Zed(Leaf leaf)',
				zedHash,
				alphaHash,
				leafHash,
			),
		);
	});
});
