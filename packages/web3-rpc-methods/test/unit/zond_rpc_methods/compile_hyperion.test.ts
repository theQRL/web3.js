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

// web3.js is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// web3.js is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.

// You should have received a copy of the GNU Lesser General Public License
// along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
// */
import { Web3RequestManager } from '@theqrl/web3-core';
import { validator } from '@theqrl/web3-validator';

import { zondRpcMethods } from '../../../src/index';
import { testData } from './fixtures/compile_hyperion';

jest.mock('@theqrl/web3-validator');

describe('compileHyperion', () => {
	let requestManagerSendSpy: jest.Mock;
	let requestManager: Web3RequestManager;

	beforeAll(() => {
		requestManager = new Web3RequestManager('http://127.0.0.1:8545');
		requestManagerSendSpy = jest.fn();
		requestManager.send = requestManagerSendSpy;
	});

	it.each(testData)(
		'should call requestManager.send with compileHyperion method and expect parameters\n Title: %s\n Input parameters: %s',
		async (_, inputParameters) => {
			await zondRpcMethods.compileHyperion(requestManager, ...inputParameters);
			expect(requestManagerSendSpy).toHaveBeenCalledWith({
				method: 'zond_compileHyperion',
				params: inputParameters,
			});
		},
	);

	it.each(testData)(
		'should call validator.validate with expected params\n Title: %s\n Input parameters: %s',
		async (_, inputParameters) => {
			const validatorSpy = jest.spyOn(validator, 'validate');
			await zondRpcMethods.compileHyperion(requestManager, ...inputParameters);
			expect(validatorSpy).toHaveBeenCalledWith(['string'], inputParameters);
		},
	);
});
