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
import { AbiEventFragment, Filter } from '@theqrl/web3-types';
import { keccak256, rightPad } from '@theqrl/web3-utils';
import { ContractOptions, encodeEventABI } from '../../src';

const word = (value: number): string => value.toString(16).padStart(128, '0');

const contractOptions: ContractOptions = {
	address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
} as ContractOptions;
const abiEventFragment: AbiEventFragment & { signature: string } = {
	anonymous: false,
	inputs: [
		{
			indexed: true,
			internalType: 'string',
			name: 'str',
			type: 'string',
		},
		{
			indexed: true,
			internalType: 'uint256',
			name: 'val',
			type: 'uint256',
		},
		{
			indexed: true,
			internalType: 'bool',
			name: 'flag',
			type: 'bool',
		},
	],
	name: 'MultiValueIndexedEventWithStringIndexed',
	type: 'event',
	signature: '0x5b5730af07e266d8b4845f404beb3b193085c686b0edd8e8e20cd4b3fc2b6cd5',
};

describe('encodeEventAbi', () => {
	it('should format fromBlock for filter', () => {
		const encodedEventFilter = encodeEventABI(contractOptions, abiEventFragment, {
			fromBlock: 10,
		});

		expect(encodedEventFilter).toMatchObject({
			fromBlock: '0xa',
			address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
		});
	});

	it('should format toBlock for filter', () => {
		const encodedEventFilter = encodeEventABI(contractOptions, abiEventFragment, {
			toBlock: 10,
		});

		expect(encodedEventFilter).toMatchObject({
			toBlock: '0xa',
			address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
		});
	});

	it('should set topics array for filter to given topics array', () => {
		const encodedEventFilter = encodeEventABI(contractOptions, abiEventFragment, {
			topics: [
				'0x3f6d5d7b72c0059e2ecac56fd4adeefb2cff23aa41d13170f78ea6bf81e6e0ca0000000000000000000000000000000000000000000000000000000000000000',
			],
		});

		expect(encodedEventFilter).toMatchObject({
			topics: [
				'0x3f6d5d7b72c0059e2ecac56fd4adeefb2cff23aa41d13170f78ea6bf81e6e0ca0000000000000000000000000000000000000000000000000000000000000000',
			],
			address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
		});
	});

	it('should set filter to get all events for address starting at fromBlock', () => {
		const encodedEventFilter = encodeEventABI(
			contractOptions,
			{
				anonymous: false,
				name: 'ALLEVENTS',
				type: 'event',
				signature: '0x5b5730af07e266d8b4845f404beb3b193085c686b0edd8e8e20cd4b3fc2b6cd5',
			},
			{
				fromBlock: 1000,
			},
		);

		expect(encodedEventFilter).toMatchObject({
			fromBlock: '0x3e8',
			address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
		});
	});

	it('should set the filter topics to the keccak256 hash of the provided filter value (L-71)', () => {
		const _abiEventFragment: AbiEventFragment & { signature: string } = {
			anonymous: false,
			inputs: [
				{
					indexed: true,
					internalType: 'uint256[]',
					name: 'vals',
					type: 'uint256[]',
				},
			],
			name: 'IndexedArrayEvent',
			type: 'event',
			signature: '0x71aefd401e4886a78931d42be506247958b9751348fa91aa2f9dbbd557e9208e',
		};

		const { topics } = encodeEventABI(contractOptions, _abiEventFragment, {
			filter: {
				vals: [1, 2, 3],
			},
		});

		// The array value is the value, not a list of alternatives: one topic, the keccak256
		// of the three 64-byte words in the high half.
		expect(topics?.[1]).toBe(rightPad(keccak256(`0x${word(1)}${word(2)}${word(3)}`), 128));
	});

	it('should set the filter topics (L-71)', () => {
		const _abiEventFragment: AbiEventFragment & { signature: string } = {
			anonymous: false,
			inputs: [
				{
					indexed: true,
					internalType: 'uint256[]',
					name: 'vals',
					type: 'uint256[]',
				},
				{
					indexed: true,
					internalType: 'string[]',
					name: 'strs',
					type: 'string[]',
				},
				{
					indexed: true,
					internalType: 'bool[]',
					name: 'flags',
					type: 'bool[]',
				},
			],
			name: 'IndexedMultiValArrayEvent',
			type: 'event',
			signature: '0x9b5a12617e7ca791109ef5e09b8cc23cb4034e0e3dfb4aadac37b55fd28718f6',
		};

		const { topics } = encodeEventABI(contractOptions, _abiEventFragment, {
			filter: {
				vals: [1, 2, 3],
				strs: ['ab', 'c'],
				flags: [true, false],
			},
		});

		expect(topics?.[1]).toBe(rightPad(keccak256(`0x${word(1)}${word(2)}${word(3)}`), 128));
		// `string` members of an indexed array are laid out in place: the raw bytes, right-padded
		// to a 64-byte word, no length word.
		expect(topics?.[2]).toBe(
			rightPad(keccak256(`0x${'6162'.padEnd(128, '0')}${'63'.padEnd(128, '0')}`), 128),
		);
		expect(topics?.[3]).toBe(rightPad(keccak256(`0x${word(1)}${word(0)}`), 128));
	});

	describe('indexed reference types against the Hyperion ground truth (L-71)', () => {
		// hyperion/test/libhyperion/semanticTests/events/event_indexed_string.hyp:
		// event E(string indexed r, uint[4] indexed t) emitted with r = bytes 0..89 and t = [4,5,6,7].
		const groundTruth: AbiEventFragment & { signature: string } = {
			anonymous: false,
			inputs: [
				{ indexed: true, internalType: 'string', name: 'r', type: 'string' },
				{ indexed: true, internalType: 'uint256[4]', name: 't', type: 'uint256[4]' },
			],
			name: 'E',
			type: 'event',
			signature: encodeEventSignature('E(string,uint256[4])'),
		};
		const r = String.fromCharCode(...Array.from({ length: 90 }, (_, i) => i));
		const padding = '0'.repeat(64);

		it('encodes the string and the fixed array topics of event_indexed_string.hyp', () => {
			const { topics } = encodeEventABI(contractOptions, groundTruth, {
				filter: { r, t: [4, 5, 6, 7] },
			});

			expect(topics?.[1]).toBe(
				`0xa7fb06bb999a5eb9aff9e0779953f4e1e4ce58044936c2f51c7fb879b85c08bd${padding}`,
			);
			expect(topics?.[2]).toBe(
				`0xb3f6caf69de88c92c6f475f5933c65e5c9ed98574d177d8f3a69f705d14b6643${padding}`,
			);
		});

		it('encodes an indexed tuple as the keccak256 of its padded members', () => {
			const tupleEvent: AbiEventFragment & { signature: string } = {
				anonymous: false,
				inputs: [
					{
						indexed: true,
						name: 't',
						type: 'tuple',
						components: [
							{ name: 'a', type: 'uint256' },
							{ name: 'b', type: 'bool' },
						],
					},
					{ indexed: true, name: 'd', type: 'int8' },
				],
				name: 'Tup',
				type: 'event',
				signature: encodeEventSignature('Tup((uint256,bool),int8)'),
			};
			const expected = `0x11490ee46318d5f35f9c5f9f0b15f49bd90dda7194820f0bf983a837176d082f${padding}`;

			expect(
				encodeEventABI(contractOptions, tupleEvent, {
					filter: { t: { a: 7, b: true }, d: -1 },
				} as unknown as Filter)
					.topics,
			).toEqual([
				rightPad(tupleEvent.signature, 128),
				expected,
				`0x${'f'.repeat(128)}`,
			]);
			// Positional form is the same value; a list of object-form tuples is an OR list.
			expect(
				encodeEventABI(contractOptions, tupleEvent, {
					filter: { t: [7, true] },
				} as unknown as Filter).topics?.[1],
			).toBe(expected);
			expect(
				encodeEventABI(contractOptions, tupleEvent, {
					filter: { t: [{ a: 7, b: true }, { a: 8, b: false }] },
				} as unknown as Filter).topics?.[1],
			).toEqual([expected, rightPad(keccak256(`0x${word(8)}${word(0)}`), 128)]);
		});

		it('flattens nested arrays in place', () => {
			const nested: AbiEventFragment & { signature: string } = {
				anonymous: false,
				inputs: [{ indexed: true, name: 'm', type: 'uint256[][]' }],
				name: 'Nested',
				type: 'event',
				signature: encodeEventSignature('Nested(uint256[][])'),
			};

			expect(
				encodeEventABI(contractOptions, nested, {
					filter: { m: [[1, 2], [3]] },
				} as unknown as Filter).topics?.[1],
			).toBe(rightPad(keccak256(`0x${word(1)}${word(2)}${word(3)}`), 128));
			expect(
				encodeEventABI(contractOptions, nested, { filter: { m: [] } } as unknown as Filter)
					.topics?.[1],
			).toBe(rightPad(keccak256(new Uint8Array(0)), 128));
		});

		it('rejects shapes that cannot be encoded with a typed error', () => {
			const fixedEvent: AbiEventFragment & { signature: string } = {
				anonymous: false,
				inputs: [{ indexed: true, name: 'arr', type: 'uint256[2]' }],
				name: 'Fixed',
				type: 'event',
				signature: encodeEventSignature('Fixed(uint256[2])'),
			};

			expect(() =>
				encodeEventABI(contractOptions, fixedEvent, { filter: { arr: [1, 2, 3] } }),
			).toThrow(AbiError);
			expect(() =>
				encodeEventABI(contractOptions, fixedEvent, { filter: { arr: 7 } }),
			).toThrow(AbiError);
			expect(() =>
				encodeEventABI(contractOptions, fixedEvent, { filter: { arr: ['x', 2] } }),
			).toThrow(AbiError);
			expect(() =>
				encodeEventABI(contractOptions, groundTruth, { filter: { t: [4, 5, 6] } }),
			).toThrow(AbiError);
		});
	});

	it('should filter by the keccak256 of the provided indexed string filter', () => {
		const encodedEventFilter = encodeEventABI(contractOptions, abiEventFragment, {
			filter: {
				str: 'str4',
			},
		});

		expect(encodedEventFilter).toMatchObject({
			topics: [
				'0x5b5730af07e266d8b4845f404beb3b193085c686b0edd8e8e20cd4b3fc2b6cd50000000000000000000000000000000000000000000000000000000000000000',
				'0x3f6d5d7b72c0059e2ecac56fd4adeefb2cff23aa41d13170f78ea6bf81e6e0ca0000000000000000000000000000000000000000000000000000000000000000',
				// eslint-disable-next-line no-null/no-null
				null,
				// eslint-disable-next-line no-null/no-null
				null,
			],
			address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
		});
	});

	it('should filter by the provided bool filter', () => {
		const encodedEventFilter = encodeEventABI(contractOptions, abiEventFragment, {
			filter: {
				flag: true,
			},
		});

		expect(encodedEventFilter).toMatchObject({
			topics: [
				'0x5b5730af07e266d8b4845f404beb3b193085c686b0edd8e8e20cd4b3fc2b6cd50000000000000000000000000000000000000000000000000000000000000000',
				// eslint-disable-next-line no-null/no-null
				null,
				// eslint-disable-next-line no-null/no-null
				null,
				'0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001',
			],
			address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
		});
	});

	it('should encode zero, false, and empty string indexed filters', () => {
		const encodedEventFilter = encodeEventABI(contractOptions, abiEventFragment, {
			filter: { str: '', val: 0, flag: false },
		});

		expect(encodedEventFilter.topics).toStrictEqual([
			`0x5b5730af07e266d8b4845f404beb3b193085c686b0edd8e8e20cd4b3fc2b6cd5${'0'.repeat(64)}`,
			`0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470${'0'.repeat(64)}`,
			`0x${'0'.repeat(128)}`,
			`0x${'0'.repeat(128)}`,
		]);
	});

	it('should encode dynamic string and bytes topics', () => {
		const dynamicEventFragment: AbiEventFragment & { signature: string } = {
			anonymous: false,
			inputs: [
				{ indexed: true, internalType: 'string', name: 'text', type: 'string' },
				{ indexed: true, internalType: 'bytes', name: 'data', type: 'bytes' },
			],
			name: 'DynamicIndexed',
			type: 'event',
			signature: '0xbac4615f67d03bd638dfc37d5751fe1acbc0d951241a04b0d5e6aa6835d58880',
		};
		const padding = '0'.repeat(64);
		const stringTopic = `0x77b446f7f7431b79d3ee0ee3faafefd90f1f8cc91b5c88cf21bac16ac0c8590b${padding}`;
		const bytesTopic = `0xdbe576b4818846aa77e82f4ed5fa78f92766b141f282d36703886d196df39322${padding}`;

		const topics = encodeEventABI(contractOptions, dynamicEventFragment, {
			filter: { text: ['0xabcd'], data: ['0xabcd', '0xabc'] },
		}).topics;

		expect(topics?.[1]).toStrictEqual([stringTopic]);
		expect(topics?.[2]).toStrictEqual([
			bytesTopic,
			`0xe91cf08aac85935e32397f410e48217a127b6855d41b1e3877eb4179c0904b77${padding}`,
		]);
	});
});
