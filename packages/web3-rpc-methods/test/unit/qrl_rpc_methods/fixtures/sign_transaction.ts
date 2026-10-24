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
import { TransactionWithSenderAPI } from '@theqrl/web3-types';

export const mockRpcResponse = '0x5208';

const transaction: Partial<TransactionWithSenderAPI> = {
	from: 'QdBb14ea952DfAedB0788Beae4fD92393f215CAa2c115ac22bc68805E171cfadE76CFF540c1ADC7B13017E4c66b6109135f25ff73412650da569E458E4A43800b',
	to: 'QFcAc5a47dc5363999c60BC3b4288720E870a423A1383F00cFaa9E1135a60E43eA809688917A789EE0BDd6828dB2dcd848Bc632c28023794f8187af3Bac5DB018',
	value: '0x174876e800',
	gas: '0x5208',
	type: '0x2',
	maxFeePerGas: '0x1229298c00',
	maxPriorityFeePerGas: '0x49504f80',
	data: '0x',
};

/**
 * Array consists of:
 * - Test title
 * - Input parameters:
 * 	   - transaction
 */
type TestData = [string, [TransactionWithSenderAPI | Partial<TransactionWithSenderAPI>]];
export const testData: TestData[] = [[`${JSON.stringify(transaction)}`, [transaction]]];
