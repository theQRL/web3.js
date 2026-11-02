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

import { keccak256 as qrlKeccak256 } from '@theqrl/qrl-cryptography/keccak.js';
import { bytesToHex, utf8ToBytes } from '@theqrl/qrl-cryptography/utils.js';
import {
	InvalidBytesError,
	InvalidNumberError,
	InvalidSizeError,
	InvalidTypeError,
} from '@theqrl/web3-errors';
import { Web3ValidatorError } from '@theqrl/web3-validator';
import {
	sha3,
	sha3Raw,
	hyperionSha3,
	hyperionSha3Raw,
	encodePacked,
	keccak256 as web3keccak256,
	getStorageSlotNumForLongString,
} from '../../src/hash';
import {
	sha3Data,
	sha3ValidData,
	hyperionSha3RawValidData,
	sha3RawValidData,
	hyperionSha3ValidData,
	hyperionSha3InvalidData,
	compareSha3JSValidData,
	compareSha3JSRawValidData,
	encodePackData,
	encodePackedInvalidData,
	keccak256ValidData,
	hyperionSha3BigIntValidData,
} from '../fixtures/hash';

// Reference keccak256 for cross-checking the sha3 wrapper, mirroring the old
// js-sha3 `keccak256(data)` API (string|bytes -> lowercase hex, no 0x). Uses
// @theqrl/qrl-cryptography so js-sha3 is no longer a dependency to monitor.
const keccak256 = (data: string | Uint8Array): string =>
	bytesToHex(qrlKeccak256(typeof data === 'string' ? utf8ToBytes(data) : data));

describe('hash', () => {
	describe('sha3', () => {
		describe('valid cases', () => {
			it.each(sha3ValidData)('%s', (input, output) => {
				expect(sha3(input)).toEqual(output);
			});
		});

		describe('compare with js-sha3 normal cases', () => {
			it.each(sha3Data)('%s', input => {
				expect(sha3(input)).toBe(`0x${keccak256(input)}`);
			});
		});

		describe('compare with js-sha3 uint8array cases', () => {
			it.each(compareSha3JSValidData)('%s', (input, output) => {
				expect(sha3(input)).toBe(`0x${keccak256(output)}`);
			});
		});
	});

	describe('sha3Raw', () => {
		describe('valid cases', () => {
			it.each(sha3RawValidData)('%s', (input, output) => {
				expect(sha3Raw(input)).toEqual(output);
			});
		});
		describe('comparing with js-sha3 cases', () => {
			it.each(compareSha3JSRawValidData)('%s', (input, output) => {
				expect(sha3Raw(input)).toBe(`0x${keccak256(output)}`);
			});
		});
	});

	describe('hyperionSha3', () => {
		describe('valid cases', () => {
			it.each(hyperionSha3ValidData)('%s', (input, output) => {
				expect(hyperionSha3(...input)).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			it.each(hyperionSha3InvalidData)('%s', (input, output) => {
				expect(() => hyperionSha3(input)).toThrow(output);
			});
		});
	});

	describe('hyperionSha3Raw', () => {
		describe('valid cases', () => {
			it.each(hyperionSha3RawValidData)('%s', (input, output) => {
				expect(hyperionSha3Raw(...input)).toEqual(output);
			});
		});
		describe('invalid cases', () => {
			it.each(hyperionSha3InvalidData)('%s', (input, output) => {
				expect(() => hyperionSha3Raw(input)).toThrow(output);
			});
		});
	});

	describe('encodePacked', () => {
		describe('valid cases', () => {
			it.each(encodePackData)('%s', (input, output) => {
				expect(encodePacked(...input)).toEqual(output);
			});
		});
		describe.each(['[]', '[2]'])('array padding for %s', suffix => {
			it.each(['bool', 'boolean'])('left-pads %s elements to 64 bytes', type => {
				const arg = { type: `${type}${suffix}`, value: [true, false] };
				const expected = `0x${'00'.repeat(63)}01${'00'.repeat(64)}`;

				expect(encodePacked(arg)).toBe(expected);
				expect(hyperionSha3(arg)).toBe(web3keccak256(expected));
				expect(hyperionSha3Raw(arg)).toBe(web3keccak256(expected));
				expect(encodePacked({ type, value: true }, { type, value: false })).toBe('0x0100');
			});

			it.each([1, 2, 4, 32, 63, 64])('right-pads bytes%i elements to 64 bytes', size => {
				const first = '12'.repeat(size);
				const second = '34'.repeat(size);
				const type = `bytes${size}`;
				const arg = { type: `${type}${suffix}`, value: [`0x${first}`, `0x${second}`] };
				const expected = `0x${first}${'00'.repeat(64 - size)}${second}${'00'.repeat(64 - size)}`;

				expect(encodePacked(arg)).toBe(expected);
				expect(hyperionSha3(arg)).toBe(web3keccak256(expected));
				expect(hyperionSha3Raw(arg)).toBe(web3keccak256(expected));
				expect(
					encodePacked({ type, value: `0x${first}` }, { type, value: `0x${second}` }),
				).toBe(`0x${first}${second}`);
			});
		});
		it.each(['bool[]', 'boolean[]', 'bytes1[]', 'bytes64[]'])(
			'keeps empty %s arrays empty',
			type => {
				const arg = { type, value: [] };
				expect(encodePacked(arg)).toBe('0x');
				expect(hyperionSha3(arg)).toBeUndefined();
				expect(hyperionSha3Raw(arg)).toBe(web3keccak256('0x'));
			},
		);
		describe('invalid cases', () => {
			it.each(encodePackedInvalidData)('%s', (input, output) => {
				expect(() => encodePacked(input)).toThrow(output);
			});
		});
	});
	describe('keccak256', () => {
		describe('valid cases', () => {
			it.each(keccak256ValidData)('%s', (input, output) => {
				expect(web3keccak256(input)).toEqual(output);
			});
		});
	});

	describe('getStorageSlotNumForLongString', () => {
		it.each([1, '1'])('hashes slot %s as a 64-byte VM word', slot => {
			expect(getStorageSlotNumForLongString(slot)).toBe(
				'0xa6eef7e35abe7026729641147f7915573c7e97b47efa546f5f6e3230263bcb49',
			);
		});

		// Multi-digit numeric slots: the pre-image is hex, so slot 10 must hash 0x0a (not
		// decimal text "10" read as 0x10). String slots are hex, so 'a' equals numeric 10.
		it.each([
			[10, '0x13da86008ba1c6922daee3e07db95305ef49ebced9f5467a0b8613fcc6b343e3'],
			['a', '0x13da86008ba1c6922daee3e07db95305ef49ebced9f5467a0b8613fcc6b343e3'],
			[255, '0x03d616f3758432b4d7452e2e9011612152589bfc903ce751686613c478b2af5f'],
			['ff', '0x03d616f3758432b4d7452e2e9011612152589bfc903ce751686613c478b2af5f'],
		])('hashes multi-digit slot %s from a hex pre-image', (slot, expected) => {
			expect(getStorageSlotNumForLongString(slot)).toBe(expected);
		});
	});

	describe('extra types supporting', () => {
		it('object', () => {
			const res = hyperionSha3({
				historicBlock: {
					hash: '0xcba0b90a5e65512202091c12a2e3b328f374715b9f1c8f32cb4600c726fe2aa6',
					height: 1,
				},
				networkId: 5777,
			});
			expect(res).toBe('0x00203462b63e3a8ca15da715e490c676b0e370f47823e31383fe43c25da3b78d');
		});
		it('object in string', () => {
			const res = hyperionSha3(
				'{"contents":"pragma hyperion >=0.4.21 <0.6.0;\\n\\ncontract Migrations {\\n  address public owner;\\n  uint public last_completed_migration;\\n\\n  constructor() public {\\n    owner = msg.sender;\\n  }\\n\\n  modifier restricted() {\\n    if (msg.sender == owner) _;\\n  }\\n\\n  function setCompleted(uint completed) public restricted {\\n    last_completed_migration = completed;\\n  }\\n\\n  function upgrade(address new_address) public restricted {\\n    Migrations upgraded = Migrations(new_address);\\n    upgraded.setCompleted(last_completed_migration);\\n  }\\n}\\n","sourcePath":"/Users/gnidan/src/work/reproduce/2019/01/21/artifacts/contracts/Migrations.hyp"}',
			);
			expect(res).toBe('0xc8a294f5901a17c159d7d0c29fb02ea8d207f15e1879d0955d059eb6486c0dd6');
		});
		it('another object in string', () => {
			const res = hyperionSha3(
				'{"bytes":"608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550610314806100606000396000f3fe608060405260043610610062576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff1680630900f01014610067578063445df0ac146100b85780638da5cb5b146100e3578063fdacd5761461013a575b600080fd5b34801561007357600080fd5b506100b66004803603602081101561008a57600080fd5b81019080803573ffffffffffffffffffffffffffffffffffffffff169060200190929190505050610175565b005b3480156100c457600080fd5b506100cd61025d565b6040518082815260200191505060405180910390f35b3480156100ef57600080fd5b506100f8610263565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34801561014657600080fd5b506101736004803603602081101561015d57600080fd5b8101908080359060200190929190505050610288565b005b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141561025a5760008190508073ffffffffffffffffffffffffffffffffffffffff1663fdacd5766001546040518263ffffffff167c010000000000000000000000000000000000000000000000000000000002815260040180828152602001915050600060405180830381600087803b15801561024057600080fd5b505af1158015610254573d6000803e3d6000fd5b50505050505b50565b60015481565b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614156102e557806001819055505b5056fea165627a7a7230582013359aba5684f88626fb6a58a003236e309ef1462172af4afb4afb9bd2532b510029","linkReferences":[]}',
			);
			expect(res).toBe('0x46e99868594ceb46b7cd37e4b33d635f12a7751671f8c51dd8218fa0dcf82901');
		});

		describe('BigInt hyperionSha3', () => {
			it.each(hyperionSha3BigIntValidData)('%s', (input, output) => {
				expect(hyperionSha3(...input)).toEqual(output);
			});
		});
	});

	describe('third audit pass regressions', () => {
		it('packs a bytes64 word with the top bit set (L-29)', () => {
			const word = `0x80${'00'.repeat(63)}`;
			expect(encodePacked({ t: 'bytes64', v: word })).toBe(word);
			expect(hyperionSha3({ t: 'bytes64', v: word })).toBe(web3keccak256(word));
			expect(encodePacked({ t: 'bytes64', v: `0x${'ff'.repeat(64)}` })).toBe(`0x${'ff'.repeat(64)}`);
		});

		it('rejects non-hex dynamic bytes instead of packing them verbatim (L-29)', () => {
			expect(() => encodePacked({ t: 'bytes', v: 'zz' })).toThrow(InvalidBytesError);
			expect(() => encodePacked({ t: 'bytes32', v: '0xzz' })).toThrow(InvalidBytesError);
		});

		it('accepts an uppercase prefix and byte arrays for bytes', () => {
			expect(encodePacked({ t: 'bytes', v: '0X12' })).toBe('0x12');
			expect(encodePacked({ t: 'bytes', v: new Uint8Array([1, 2]) as never })).toBe('0x0102');
		});

		it('rejects an unknown type instead of packing nothing (L-29)', () => {
			expect(() => encodePacked({ t: 'foo', v: 1 })).toThrow(InvalidTypeError);
		});

		it('enforces a declared array size (L-29)', () => {
			expect(() => encodePacked({ t: 'uint8[2]', v: [1, 2, 3] })).toThrow(InvalidSizeError);
			expect(encodePacked({ t: 'uint8[2]', v: [1, 2] })).toHaveLength(2 + 2 * 128);
			expect(() => encodePacked({ t: 'uint8[]', v: 5 })).toThrow(InvalidTypeError);
		});

		it('hashes a 0x-prefixed storage slot as a number (L-29)', () => {
			expect(getStorageSlotNumForLongString('0x1')).toBe(getStorageSlotNumForLongString(1));
			expect(getStorageSlotNumForLongString('0xff')).toBe(getStorageSlotNumForLongString(255));
			expect(() => getStorageSlotNumForLongString('zz')).toThrow(InvalidNumberError);
			expect(() => getStorageSlotNumForLongString(-1)).toThrow(InvalidNumberError);
			expect(() => getStorageSlotNumForLongString(1.5)).toThrow(InvalidNumberError);
		});

		it('throws typed errors for a non-bytes input to sha3 and a digitless uint (L-26)', () => {
			expect(() => sha3(123 as never)).toThrow(Web3ValidatorError);
			expect(() => hyperionSha3({ t: 'uint', v: '0x' })).toThrow(InvalidNumberError);
			expect(() => encodePacked({ t: 'uint', v: 'abc' })).toThrow(InvalidNumberError);
		});

		describe('string hashing rule shared by sha3, sha3Raw and keccak256 (M-11, I-11)', () => {
			it('decodes a 0x/0X-prefixed hex string as bytes', () => {
				const asBytes = web3keccak256(new Uint8Array([0x12, 0x34]));
				expect(sha3('0x1234')).toBe(asBytes);
				expect(sha3('0X1234')).toBe(asBytes);
				expect(sha3Raw('0X1234')).toBe(asBytes);
				expect(web3keccak256('0X1234')).toBe(asBytes);
			});

			it('hashes a signed hex string and hex-looking text as UTF-8 text', () => {
				const signed = web3keccak256(utf8ToBytes('-0x12'));
				expect(sha3('-0x12')).toBe(signed);
				expect(sha3Raw('-0x12')).toBe(signed);
				expect(web3keccak256('-0x12')).toBe(signed);
				expect(sha3('0xzz')).toBe(web3keccak256(utf8ToBytes('0xzz')));
			});

			it('documents the collision the rule implies for hex-looking labels', () => {
				expect(sha3Raw('0x6162')).toBe(sha3Raw('ab'));
				expect(sha3Raw(utf8ToBytes('0x6162'))).not.toBe(sha3Raw('ab'));
			});
		});
	});
});
