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

import { ZOND_DATA_FORMAT, FormatType, Transaction } from '@theqrl/web3-types';

export const transactionType0x2: FormatType<Transaction, typeof ZOND_DATA_FORMAT>[] = [
	{
		from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
		to: 'Z3535353535353535353535353535353535353535',
		value: '0x174876e800',
		gas: '0x5208',
		type: '0x2',
		data: '0x0',
		nonce: '0x4',
		chainId: '0x1',
		gasLimit: '0x5208',
	},
	{
		from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
		to: 'Z3535353535353535353535353535353535353535',
		value: '0x174876e800',
		gas: '0x5208',
		maxFeePerGas: '0x1229298c00',
		data: '0x0',
		nonce: '0x4',
		chainId: '0x1',
		gasLimit: '0x5208',
	},
	{
		from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
		to: 'Z3535353535353535353535353535353535353535',
		value: '0x174876e800',
		gas: '0x5208',
		maxPriorityFeePerGas: '0x49504f80',
		data: '0x0',
		nonce: '0x4',
		chainId: '0x1',
		gasLimit: '0x5208',
	},
	{
		from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
		to: 'Z3535353535353535353535353535353535353535',
		value: '0x174876e800',
		gas: '0x5208',
		data: '0x0',
		nonce: '0x4',
		chainId: '0x1',
		gasLimit: '0x5208',
		common: {
			customChain: {
				networkId: '0x42',
				chainId: '0x42',
			},
			hardfork: 'shanghai',
		},
	},
	{
		from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
		to: 'Z3535353535353535353535353535353535353535',
		value: '0x174876e800',
		gas: '0x5208',
		data: '0x0',
		nonce: '0x4',
		chainId: '0x1',
		gasLimit: '0x5208',
		hardfork: 'shanghai',
	},
];

export const transactionTypeUndefined: FormatType<Transaction, typeof ZOND_DATA_FORMAT>[] = [
	{
		from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
		to: 'Z3535353535353535353535353535353535353535',
		value: '0x174876e800',
		gas: '0x5208',
		data: '0x',
		nonce: '0x4',
		chainId: '0x1',
		gasLimit: '0x5208',
	},
	{
		from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
		to: 'Z3535353535353535353535353535353535353535',
		value: '0x174876e800',
		gas: '0x5208',
		data: '0x',
		nonce: '0x4',
		chainId: '0x1',
		gasLimit: '0x5208',
	},
	{
		from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
		to: 'Z3535353535353535353535353535353535353535',
		value: '0x174876e800',
		gas: '0x5208',
		maxFeePerGas: '0x1229298c00',
		maxPriorityFeePerGas: '0x0',
		data: '0x',
		nonce: '0x4',
		chainId: '0x1',
		gasLimit: '0x5208',
		// @ts-expect-error Hardfork doesn't exist
		hardfork: 'nonExistent',
	},
	{
		from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
		to: 'Z3535353535353535353535353535353535353535',
		value: '0x174876e800',
		gas: '0x5208',
		maxFeePerGas: '0x1229298c00',
		maxPriorityFeePerGas: '0x0',
		data: '0x',
		nonce: '0x4',
		chainId: '0x1',
		gasLimit: '0x5208',
		common: {
			customChain: {
				networkId: '0x42',
				chainId: '0x42',
			},
			// @ts-expect-error Hardfork doesn't exist
			hardfork: 'nonExistent',
		},
	},
];

export const transactionTypeValidationError: FormatType<Transaction, typeof ZOND_DATA_FORMAT>[] = [];
