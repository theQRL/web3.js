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

import { isBigInt, isInt, isNumber, isUInt } from '../../../src/validation/numbers';
import {
	validBigIntData,
	invalidBigIntData,
	validUintData,
	invalidUintData,
	validUintDataWithSize,
	invalidUintDataWithSize,
	validUintDataWithAbiType,
	invalidUintDataWithAbiType,
	validIntData,
	invalidIntData,
	validIntDataWithSize,
	invalidIntDataWithSize,
	validIntDataWithAbiType,
	invalidIntDataWithAbiType,
} from '../../fixtures/validation';

describe('validation', () => {
	describe('numbers', () => {
		describe('isBigInt', () => {
			describe('valid cases', () => {
				it.each(validBigIntData)('%s', value => {
					expect(isBigInt(value)).toBeTruthy();
				});
			});

			describe('invalid cases', () => {
				it.each(invalidBigIntData)('%s', value => {
					expect(isBigInt(value)).toBeFalsy();
				});
			});
		});

		describe('isUInt', () => {
			describe('raw number', () => {
				describe('valid cases', () => {
					it.each(validUintData)('%s', value => {
						expect(isUInt(value)).toBeTruthy();
					});
				});

				describe('invalid cases', () => {
					it.each(invalidUintData)('%s', value => {
						expect(isUInt(value)).toBeFalsy();
					});
				});
			});

			describe('number with size', () => {
				describe('valid cases', () => {
					it.each(validUintDataWithSize)('%s', (value, bitSize) => {
						expect(isUInt(value, { bitSize })).toBeTruthy();
					});
				});

				describe('invalid cases', () => {
					it.each(invalidUintDataWithSize)('%s', (value, bitSize) => {
						expect(isUInt(value, { bitSize })).toBeFalsy();
					});
				});
			});

			describe('number with abi type', () => {
				describe('valid cases', () => {
					it.each(validUintDataWithAbiType)('%s', (value, abiType) => {
						expect(isUInt(value, { abiType })).toBeTruthy();
					});
				});

				describe('invalid cases', () => {
					it.each(invalidUintDataWithAbiType)('%s', (value, abiType) => {
						expect(isUInt(value, { abiType })).toBeFalsy();
					});
				});
			});
		});

		describe('strict spellings (L-28)', () => {
			it.each(['', ' ', ' 12 ', '+1', '0b11', '0o7', '1e3', '1.5', '0x', '-0x', '1_000'])(
				'isInt and isUInt reject %j',
				value => {
					expect(isInt(value)).toBe(false);
					expect(isUInt(value)).toBe(false);
				},
			);

			it.each(['12', '-12', '0x0c', '-0x0c', '0X0C'])('isInt accepts %j', value => {
				expect(isInt(value)).toBe(true);
			});
		});

		describe('safe integer symmetry (I-11)', () => {
			it.each([2 ** 53, 2 ** 60, -(2 ** 53), -(2 ** 60), 1.5, NaN, Infinity])(
				'isInt and isUInt both reject the JavaScript number %s',
				value => {
					expect(isInt(value)).toBe(false);
					expect(isUInt(value)).toBe(false);
				},
			);

			it('accepts the safe integer bounds as numbers and anything exact as bigint', () => {
				expect(isInt(Number.MAX_SAFE_INTEGER)).toBe(true);
				expect(isInt(Number.MIN_SAFE_INTEGER)).toBe(true);
				expect(isUInt(Number.MAX_SAFE_INTEGER)).toBe(true);
				expect(isUInt(BigInt(2) ** BigInt(60))).toBe(true);
				expect(isInt(-(BigInt(2) ** BigInt(60)))).toBe(true);
			});

			it('isUInt rejects an abi type that is not uint', () => {
				expect(isUInt(1, { abiType: 'int8' })).toBe(false);
				expect(isUInt(1, { abiType: 'uint8x' })).toBe(false);
			});
		});

		describe('isNumber (L-28)', () => {
			it.each([1, 1.5, -1.5, 0, BigInt(1), '1', '1.5', '-0.5', '.5', '1.', '-1', '0x10', '-0x10'])(
				'accepts %s',
				value => {
					expect(isNumber(value)).toBe(true);
				},
			);

			it.each(['', ' ', '.', '+1', ' 1 ', '0b11', '1e3', '1.5.5', 'Q1', '0x', NaN, Infinity, -Infinity, true, [], {}])(
				'rejects %s',
				value => {
					expect(isNumber(value as never)).toBe(false);
				},
			);
		});

		describe('isInt', () => {
			describe('raw number', () => {
				describe('valid cases', () => {
					it.each(validIntData)('%s', value => {
						expect(isInt(value)).toBeTruthy();
					});
				});

				describe('invalid cases', () => {
					it.each(invalidIntData)('%s', value => {
						expect(isInt(value)).toBeFalsy();
					});
				});
			});

			describe('number with size', () => {
				describe('valid cases', () => {
					it.each(validIntDataWithSize)('%s', (value, bitSize) => {
						expect(isInt(value, { bitSize })).toBeTruthy();
					});
				});

				describe('invalid cases', () => {
					it.each(invalidIntDataWithSize)('%s', (value, bitSize) => {
						expect(isInt(value, { bitSize })).toBeFalsy();
					});
				});
			});

			describe('number with abi type', () => {
				describe('valid cases', () => {
					it.each(validIntDataWithAbiType)('%s', (value, abiType) => {
						expect(isInt(value, { abiType })).toBeTruthy();
					});
				});

				describe('invalid cases', () => {
					it.each(invalidIntDataWithAbiType)('%s', (value, abiType) => {
						expect(isInt(value, { abiType })).toBeFalsy();
					});
				});
			});
		});
	});
});
