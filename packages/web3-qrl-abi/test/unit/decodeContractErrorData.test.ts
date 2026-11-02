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

import { Eip838ExecutionError } from '@theqrl/web3-errors';
import { encodeErrorSignature } from '../../src/api/errors_api';
import { decodeContractErrorData } from '../../src/decode_contract_error_data';

import { validDecodeContractErrorData, invalidDecodeContractErrorData } from '../fixtures/data';

describe('decodeContractErrorData', () => {
	describe('valid data', () => {
		it.each(validDecodeContractErrorData)(
			'%#: should pass for valid values: %j',
			({ input: [abi, errorData], output }) => {
				const err = new Eip838ExecutionError(errorData);

				decodeContractErrorData(abi, err);

				expect(err.errorName).toEqual(output.errorName);
				expect(err.errorSignature).toEqual(output.errorSignature);
				expect(err.errorArgs?.message).toEqual(output.errorArgs?.message);
				expect(Number(err.errorArgs?.code)).toEqual(output.errorArgs?.code);
				expect(err.innerError?.code).toEqual(output.innerError?.code);
			},
		);
	});

	describe('invalid data', () => {
		it.each(invalidDecodeContractErrorData)(
			'%#: should leave the error undecoded without logging for invalid values: %j (L-33)',
			({ input: [abi, errorData] }) => {
				const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => 'error');
				const err = new Eip838ExecutionError(errorData);
				decodeContractErrorData(abi, err);
				expect(consoleSpy).not.toHaveBeenCalled();
				expect(err.errorName).toBeUndefined();
				expect(err.errorSignature).toBeUndefined();
				expect(err.errorArgs).toBeUndefined();
				expect(err.data).toBe(errorData.data);
			},
		);
	});

	describe('untrusted revert data (L-33)', () => {
		const word = (n: number) => n.toString(16).padStart(128, '0');
		const errorsAbi = [
			{ type: 'error', name: 'Unauthorized', inputs: [] },
			{ type: 'error', name: 'Custom', inputs: [{ type: 'uint256', name: 'x' }] },
		];
		const unauthorizedSelector = encodeErrorSignature('Unauthorized()').slice(0, 10);
		const customSelector = encodeErrorSignature('Custom(uint256)').slice(0, 10);
		const boom = `${word(64)}${word(4)}${'626f6f6d'.padEnd(128, '0')}`;

		const decode = (data: unknown, abi = errorsAbi) => {
			const err = new Eip838ExecutionError({
				code: 3,
				message: 'execution reverted',
				data,
			} as unknown as ConstructorParameters<typeof Eip838ExecutionError>[0]);
			decodeContractErrorData(abi, err);
			return err;
		};

		it.each(['0x', '0x08c3', '0x08c379a', '0x08c379ag'])(
			'leaves a bare or truncated revert (%s) undecoded instead of attributing it to the first ABI error',
			data => {
				const err = decode(data);
				expect(err.errorName).toBeUndefined();
				expect(err.errorSignature).toBeUndefined();
				expect(err.errorArgs).toBeUndefined();
				expect(err.data).toBe(data);
			},
		);

		it('leaves non-string data undecoded without logging', () => {
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => 'error');
			for (const data of [{ a: 1 }, 123, ['0x08c379a0'], true]) {
				const err = decode(data);
				expect(err.errorName).toBeUndefined();
				expect(err.errorArgs).toBeUndefined();
			}
			expect(consoleSpy).not.toHaveBeenCalled();
		});

		it('matches the full selector only', () => {
			// A selector that merely shares a prefix with Error(string) is not Error(string).
			const err = decode(`0x08c379a1${boom}`);
			expect(err.errorName).toBeUndefined();
		});

		it('matches the selector case-insensitively', () => {
			const err = decode(`0X08C379A0${boom.toUpperCase()}`);
			expect(err.errorName).toBe('Error');
			expect(err.errorSignature).toBe('Error(string)');
			expect(err.errorArgs?.message).toBe('boom');
		});

		it('sets no property when the selector matches but the arguments do not decode', () => {
			const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => 'error');
			for (const data of [customSelector, `${customSelector}ab`, `${customSelector}${word(1).slice(2)}`]) {
				const err = decode(data);
				expect(err.errorName).toBeUndefined();
				expect(err.errorSignature).toBeUndefined();
				expect(err.errorArgs).toBeUndefined();
			}
			expect(consoleSpy).not.toHaveBeenCalled();
		});

		it('decodes a zero-argument custom error from its selector alone', () => {
			const err = decode(unauthorizedSelector);
			expect(err.errorName).toBe('Unauthorized');
			expect(err.errorSignature).toBe('Unauthorized()');
			expect(err.errorArgs).toEqual({ __length__: 0 });
		});

		it('decodes a custom error with arguments', () => {
			const err = decode(`${customSelector}${word(5)}`);
			expect(err.errorName).toBe('Custom');
			expect(err.errorSignature).toBe('Custom(uint256)');
			expect(err.errorArgs?.x).toBe(BigInt(5));
		});

		it('decodes the builtin Error(string) and Panic(uint256) without an ABI', () => {
			expect(decode(`0x08c379a0${boom}`, []).errorArgs?.message).toBe('boom');
			expect(decode(`0x4e487b71${word(0x11)}`, []).errorArgs?.code).toBe(BigInt(0x11));
		});
	});
});
