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

import {
	isBloom,
	isContractAddressInBloom,
	isInBloom,
	isUserQRLAddressInBloom,
} from '../../../src/validation/bloom';
import {
	validBloomData,
	validContractAddressInBloomData,
	invalidInBloomData,
	validInBloomData,
	invalidUserQRLAddressInBloomData,
	validUserQRLAddressInBloomData,
} from '../../fixtures/validation';

describe('validation', () => {
	describe('bloom', () => {
		describe('isBloom', () => {
			describe('valid cases', () => {
				it.each(validBloomData)('%s', input => {
					expect(isBloom(input)).toBeTruthy();
				});
			});
		});

		describe('isInBloom', () => {
			describe('valid cases', () => {
				it.each(validInBloomData)('%s', (bloom, value) => {
					expect(isInBloom(bloom, value)).toBeTruthy();
				});
			});

			describe('invalid cases', () => {
				it.each(invalidInBloomData)('%s', (bloom, value) => {
					expect(isInBloom(bloom, value)).toBeFalsy();
				});
			});
		});

		describe('isUserQRLAddressInBloom', () => {
			describe('valid cases', () => {
				it.each(validUserQRLAddressInBloomData)('%s', (bloom, address) => {
					expect(isUserQRLAddressInBloom(bloom, address)).toBeTruthy();
				});
			});

			describe('invalid cases', () => {
				it.each(invalidUserQRLAddressInBloomData)('%s', (bloom, address) => {
					expect(isUserQRLAddressInBloom(bloom, address)).toBeFalsy();
				});
			});
		});

		describe('isContractAddressInBloom', () => {
			describe('valid cases', () => {
				it.each(validContractAddressInBloomData)('%s', (bloom, address) => {
					expect(isContractAddressInBloom(bloom, address)).toBeTruthy();
				});
			});

			describe('invalid cases', () => {
				it.each(invalidUserQRLAddressInBloomData)('%s', (bloom, address) => {
					expect(isContractAddressInBloom(bloom, address)).toBeFalsy();
				});
			});
		});
	});
});

test('returns false for an odd-length hex bloom value', () => {
	expect(isInBloom(`0x${'f'.repeat(512)}`, '0x1')).toBe(false);
});
