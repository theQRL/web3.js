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
import { AbiErrorFragment, AbiParameter } from '@theqrl/web3-types';
import fixture from '../../../../fixtures/abi/hyperion-0.2.0.json';
import { decodeParameters, encodeParameters } from '../../src/api/parameters_api';
import { encodeFunctionSignature } from '../../src/api/functions_api';
import { encodeEventSignature } from '../../src/api/events_api';
import { encodeErrorSignature } from '../../src/api/errors_api';
import { decodeContractErrorData } from '../../src/decode_contract_error_data';
import { jsonInterfaceMethodToString } from '../../src/utils';

describe('Hyperion compiler ABI compatibility', () => {
	it.each(fixture.cases.filter(test => !test.packed && !test.panic))(
		'$name matches the compiler through the public API',
		({ inputs, values, encoded }) => {
			expect(encodeParameters(inputs, values)).toBe(encoded);
			const decoded = decodeParameters(inputs, encoded);
			expect(decoded.__length__).toBe(inputs.length);
			expect(
				encodeParameters(
					inputs,
					inputs.map((_, index) => decoded[index]),
				),
			).toBe(encoded);
		},
	);

	it('accepts function values as bytes through the public API', () => {
		const pointer = new Uint8Array(68).fill(0xab);
		const encoded = encodeParameters(['function'], [pointer]);
		expect(decodeParameters(['function'], encoded)[0]).toBe(`0x${'ab'.repeat(68)}`);
	});

	it.each([encodeFunctionSignature, encodeEventSignature, encodeErrorSignature])(
		'canonicalizes integer aliases in string signatures',
		encodeSignature => {
			expect(encodeSignature('uint(uint,int[],(uint[2],int))')).toBe(
				encodeSignature('uint(uint256,int256[],(uint256[2],int256))'),
			);
		},
	);

	it('canonicalizes nested integer aliases in JSON signatures', () => {
		const inputs: AbiParameter[] = [
			{ name: 'values', type: 'uint[]' },
			{
				name: 'pair',
				type: 'tuple',
				components: [
					{ name: 'a', type: 'int' },
					{ name: 'b', type: 'uint[2]' },
				],
			},
		];
		expect(jsonInterfaceMethodToString({ type: 'function', name: 'foo', inputs })).toBe(
			'foo(uint256[],(int256,uint256[2]))',
		);
		expect(encodeFunctionSignature({ type: 'function', name: 'foo', inputs })).toBe(
			encodeFunctionSignature('foo(uint256[],(int256,uint256[2]))'),
		);
	});

	it.each(fixture.cases.filter(test => test.panic))(
		'decodes $name without a builtin error entry in the ABI',
		({ encoded, code }) => {
			expect(encoded.slice(0, 10)).toBe('0x4e487b71');
			expect(encoded).toHaveLength(2 + (4 + 64) * 2);
			const error = new Eip838ExecutionError({ code: 3, message: 'reverted', data: encoded });
			decodeContractErrorData([], error);
			expect(error.errorName).toBe('Panic');
			expect(error.errorSignature).toBe('Panic(uint256)');
			expect(error.errorArgs?.code).toBe(BigInt(code as string));
		},
	);

	it('decodes Error(string) without an ABI entry', () => {
		const error = new Eip838ExecutionError({
			code: 3,
			message: 'reverted',
			data: `0x08c379a0${encodeParameters(['string'], ['reason']).slice(2)}`,
		});
		decodeContractErrorData([], error);
		expect(error.errorSignature).toBe('Error(string)');
		expect(error.errorArgs?.message).toBe('reason');
	});

	it('gives an explicit error ABI precedence over the builtin fallback', () => {
		const abi: AbiErrorFragment = {
			type: 'error',
			name: 'Panic',
			inputs: [{ type: 'uint256', name: 'customCode' }],
		};
		const error = new Eip838ExecutionError({
			code: 3,
			message: 'reverted',
			data: `0x4e487b71${encodeParameters(['uint256'], [1]).slice(2)}`,
		});
		decodeContractErrorData([abi], error);
		expect(error.errorArgs?.customCode).toBe(BigInt(1));
		expect(error.errorArgs?.code).toBeUndefined();
	});

	it('only decodes Panic(uint512) when supplied as a custom error', () => {
		const abi: AbiErrorFragment = {
			type: 'error',
			name: 'Panic',
			inputs: [{ type: 'uint512', name: 'wideCode' }],
		};
		const error = new Eip838ExecutionError({
			code: 3,
			message: 'reverted',
			data: `${encodeErrorSignature(abi).slice(0, 10)}${encodeParameters(['uint512'], [1]).slice(2)}`,
		});
		decodeContractErrorData([], error);
		expect(error.errorName).toBeUndefined();
		decodeContractErrorData([abi], error);
		expect(error.errorSignature).toBe('Panic(uint512)');
		expect(error.errorArgs?.wideCode).toBe(BigInt(1));
	});
});
