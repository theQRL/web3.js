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

import { ProviderError } from '@theqrl/web3-errors';
import {
	DEFAULT_CONNECTION_TIMEOUT,
	DEFAULT_MAX_IN_FLIGHT_REQUESTS,
	DEFAULT_MAX_RESPONSE_BYTES,
	DEFAULT_REQUEST_TIMEOUT,
	resolveProviderBounds,
	validatePositiveInteger,
	validateTimeout,
} from '../../src/provider_bounds';

describe('provider_bounds', () => {
	describe('defaults', () => {
		it('pins the agreed shared values', () => {
			expect(DEFAULT_CONNECTION_TIMEOUT).toBe(30_000);
			expect(DEFAULT_REQUEST_TIMEOUT).toBe(120_000);
			expect(DEFAULT_MAX_RESPONSE_BYTES).toBe(10 * 1024 * 1024);
			expect(DEFAULT_MAX_IN_FLIGHT_REQUESTS).toBe(256);
		});
	});

	describe('validateTimeout', () => {
		it('accepts finite positive values', () => {
			expect(validateTimeout(1, 'requestTimeout')).toBe(1);
			expect(validateTimeout(120_000, 'requestTimeout')).toBe(120_000);
			expect(validateTimeout(0.5, 'requestTimeout')).toBe(0.5);
		});

		it.each([Infinity, -Infinity, NaN, 0, -1])('rejects %p', value => {
			expect(() => validateTimeout(value, 'requestTimeout')).toThrow(ProviderError);
		});

		it('rejects non-numbers', () => {
			expect(() => validateTimeout('1000' as unknown as number, 'requestTimeout')).toThrow(
				ProviderError,
			);
			expect(() => validateTimeout(undefined as unknown as number, 'requestTimeout')).toThrow(
				ProviderError,
			);
		});

		it('names the offending option in the message', () => {
			expect(() => validateTimeout(Infinity, 'connectionTimeout')).toThrow(
				/connectionTimeout/,
			);
		});
	});

	describe('validatePositiveInteger', () => {
		it('accepts positive integers', () => {
			expect(validatePositiveInteger(1, 'maxInFlightRequests')).toBe(1);
			expect(validatePositiveInteger(256, 'maxInFlightRequests')).toBe(256);
		});

		it.each([0, -1, 1.5, Infinity, NaN])('rejects %p', value => {
			expect(() => validatePositiveInteger(value, 'maxResponseBytes')).toThrow(ProviderError);
		});
	});

	describe('resolveProviderBounds', () => {
		it('applies every default when given nothing', () => {
			expect(resolveProviderBounds()).toEqual({
				connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
				requestTimeout: DEFAULT_REQUEST_TIMEOUT,
				maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
				maxInFlightRequests: DEFAULT_MAX_IN_FLIGHT_REQUESTS,
				maxResponseDepth: 4096,
			});
		});

		it('applies defaults for the fields left unset', () => {
			expect(resolveProviderBounds({ requestTimeout: 5000 })).toEqual({
				connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
				requestTimeout: 5000,
				maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
				maxInFlightRequests: DEFAULT_MAX_IN_FLIGHT_REQUESTS,
				maxResponseDepth: 4096,
			});
		});

		it('honours a fully-specified options bag', () => {
			expect(
				resolveProviderBounds({
					connectionTimeout: 1000,
					requestTimeout: 2000,
					maxResponseBytes: 1024,
					maxInFlightRequests: 8,
					maxResponseDepth: 4096,
				}),
			).toEqual({
				connectionTimeout: 1000,
				requestTimeout: 2000,
				maxResponseBytes: 1024,
				maxInFlightRequests: 8,
				maxResponseDepth: 4096,
			});
		});

		it('rejects an infinite requestTimeout, leaving no unbounded opt-out', () => {
			expect(() => resolveProviderBounds({ requestTimeout: Infinity })).toThrow(
				ProviderError,
			);
		});

		it('rejects an invalid maxResponseBytes', () => {
			expect(() => resolveProviderBounds({ maxResponseBytes: 0 })).toThrow(ProviderError);
		});
	});
});

test.each([536_870_889, 2 ** 53, 1e300])(
	'rejects unsupported response size %s',
	maxResponseBytes => {
		expect(() => resolveProviderBounds({ maxResponseBytes })).toThrow(ProviderError);
	},
);
test('accepts the maximum supported response size', () => {
	expect(resolveProviderBounds({ maxResponseBytes: 536_870_888 }).maxResponseBytes).toBe(
		536_870_888,
	);
});

test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
	'rejects invalid maxResponseDepth %p',
	maxResponseDepth => {
		expect(() => resolveProviderBounds({ maxResponseDepth })).toThrow(ProviderError);
	},
);
