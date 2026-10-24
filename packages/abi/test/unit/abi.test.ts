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
import { toChecksumAddress } from '@theqrl/web3-utils';
import {
	AbiCoder,
	ConstructorFragment,
	ErrorFragment,
	EventFragment,
	FormatTypes,
	Fragment,
	FunctionFragment,
	ParamType,
	checkResultErrors,
	defaultAbiCoder,
} from '../../src/index.js';

describe('@theqrl/abi public surface', () => {
	it('exports the coder entry points', () => {
		expect(typeof AbiCoder).toBe('function');
		expect(defaultAbiCoder).toBeInstanceOf(AbiCoder);
		expect(typeof checkResultErrors).toBe('function');
	});

	it('exports the fragment types', () => {
		expect(typeof Fragment).toBe('function');
		expect(typeof ConstructorFragment).toBe('function');
		expect(typeof ErrorFragment).toBe('function');
		expect(typeof EventFragment).toBe('function');
		expect(typeof FunctionFragment).toBe('function');
		expect(typeof ParamType).toBe('function');
	});

	it('exports the format types', () => {
		expect(FormatTypes).toEqual({
			sighash: 'sighash',
			minimal: 'minimal',
			full: 'full',
			json: 'json',
		});
		expect(Object.isFrozen(FormatTypes)).toBe(true);
	});

	it('encodes and decodes through the public entry point', () => {
		const address = toChecksumAddress(`Q${'ab'.repeat(64)}`);
		const encoded = defaultAbiCoder.encode(['address', 'uint8'], [address, 7]);
		expect(defaultAbiCoder.decode(['address', 'uint8'], encoded)).toEqual([address, 7]);
	});
});
