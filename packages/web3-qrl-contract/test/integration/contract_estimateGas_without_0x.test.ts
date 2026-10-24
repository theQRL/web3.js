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

import { QRL_DATA_FORMAT } from '@theqrl/web3-types';
import { Contract } from '../../src';
import { getSystemTestProvider, createTempAccount } from '../fixtures/system_test_utils';

describe('contract', () => {
	// Create a new contract object using the ABI and bytecode
	const abi = [
		{
			inputs: [{ internalType: 'uint256', name: '_myNumber', type: 'uint256' }],
			stateMutability: 'nonpayable',
			type: 'constructor',
		},
		{
			inputs: [],
			name: 'myNumber',
			outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [{ internalType: 'uint256', name: '_myNumber', type: 'uint256' }],
			name: 'setMyNumber',
			outputs: [],
			stateMutability: 'nonpayable',
			type: 'function',
		},
	];
	let acc: { address: string; seed: string };
	let contract: Contract<typeof abi>;

	beforeEach(async () => {
		acc = await createTempAccount();
	});

	it('should be able to add `data` input without `0x` prefix', async () => {
		contract = new Contract(abi, undefined, {
			provider: getSystemTestProvider(),
		});

		const myContract = contract.deploy({
			data: '61010060805234a015610010575fa0fd5b506080516103243803a0610324a339a1a101608052a101b0610032b1b06100e8565ba05fa06101000aa154a17fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff021916b0a37fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff160217b0555050610113565b5fa0fd5b5f7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa216b050b1b050565b6100c7a1610093565ba1146100d1575fa0fd5b50565b5fa151b0506100e2a16100be565bb2b15050565b5f6040a2a40312156100fd576100fc61008f565b5b5f61010aa4a2a5016100d4565bb15050b2b15050565b610204a06101205f395ff3fe61010060805234a015610010575fa0fd5b5060043610610036575f356101e01ca06323fd0e401461003a57a0636ffd773c14610058575b5fa0fd5b610042610074565b60805161004fb1b0610137565b608051a0b103b0f35b6100726004a03603a101b061006db1b061017e565b6100a3565b005b5fa054b06101000ab0047fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff16a1565ba05fa06101000aa154a17fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff021916b0a37fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff160217b0555050565b5f7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa216b050b1b050565b610131a16100fd565ba2525050565b5f6040a201b05061014a5fa301a4610128565bb2b15050565b5fa0fd5b61015da16100fd565ba114610167575fa0fd5b50565b5fa135b050610178a1610154565bb2b15050565b5f6040a2a403121561019357610192610150565b5b5f6101a0a4a2a50161016a565bb15050b2b1505056fea26469706673582212201698b223522d0b76fec1f45f5e17138ef0111e6dcb8873d04cfb4a458bfb620364687970637827302e322e302d646576656c6f702e323032362e382e32312b636f6d6d69742e32623961306631640058',
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-expect-error
			arguments: [1],
		});

		const gas = await myContract.estimateGas(
			{
				from: acc.address,
			},
			QRL_DATA_FORMAT,
		);
		expect(gas).toBeDefined();
		expect(gas).toMatch(/0[xX][0-9a-fA-F]/i);
	});
});
