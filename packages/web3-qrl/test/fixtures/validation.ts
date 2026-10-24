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
	AccessList,
	AccessListEntry,
	BaseTransactionAPI,
	Transaction1559UnsignedAPI,
	TransactionCall,
	TransactionWithSenderAPI,
} from '@theqrl/web3-types';
import { InvalidTransactionCall, InvalidTransactionWithSender } from '@theqrl/web3-errors';

export const isBaseTransactionValidData: [BaseTransactionAPI, true][] = [
	[
		{
			type: '0x2',
			nonce: '0x0',
			gas: '0x5208',
			value: '0x1',
			input: '0x0',
			chainId: '0x1',
		},
		true,
	],
	[
		{
			to: 'Q9Fa83f21CE9bd493B02D7460E03d82D44a77B4612d8B6a0Acc94655106Fbb96152d3E16a0ba414C368653BaE2fe868cB109c05727Ca47148114749451afb7Cc1',
			type: '0x2',
			nonce: '0x1',
			gas: '0x5208',
			value: '0x1',
			input: '0x1',
		},
		true,
	],
];

export const isAccessListEntryValidData: [AccessListEntry, true][] = [
	[{}, true],
	[
		{
			address: 'Q9Fa83f21CE9bd493B02D7460E03d82D44a77B4612d8B6a0Acc94655106Fbb96152d3E16a0ba414C368653BaE2fe868cB109c05727Ca47148114749451afb7Cc1',
		},
		true,
	],
	[
		{
			storageKeys: [
				'0x22f30f0608f88c510de0016370f1525b330e5839026bdff93f9ceef24d2275e6',
				'0x63a01bba0d4f0ad913a241aed52f5c55807be35f554536abd1e451d4e6515b29',
			],
		},
		true,
	],
	[
		{
			address: 'Q9Fa83f21CE9bd493B02D7460E03d82D44a77B4612d8B6a0Acc94655106Fbb96152d3E16a0ba414C368653BaE2fe868cB109c05727Ca47148114749451afb7Cc1',
			storageKeys: [
				'0x22f30f0608f88c510de0016370f1525b330e5839026bdff93f9ceef24d2275e6',
				'0x63a01bba0d4f0ad913a241aed52f5c55807be35f554536abd1e451d4e6515b29',
			],
		},
		true,
	],
];

export const isAccessListValidData = (): [AccessList, true][] => [
	[isAccessListEntryValidData.map(entry => entry[0]), true],
];

export const isTransaction1559UnsignedValidData = (): [Transaction1559UnsignedAPI, true][] =>
	isBaseTransactionValidData.map(transaction => {
		return [
			{
				...transaction[0],
				maxFeePerGas: '0x1',
				maxPriorityFeePerGas: '0x1',
				accessList: [],
			},
			true,
		];
	});

export const isTransactionWithSenderValidData = (): [TransactionWithSenderAPI, true][] => {
	const transactions = [...isTransaction1559UnsignedValidData()];
	return transactions.map(transaction => {
		return [
			{
				...transaction[0],
				from: 'Q9Fa83f21CE9bd493B02D7460E03d82D44a77B4612d8B6a0Acc94655106Fbb96152d3E16a0ba414C368653BaE2fe868cB109c05727Ca47148114749451afb7Cc1',
			},
			true,
		];
	});
};

export const validateTransactionWithSenderInvalidData = (): [
	any,
	InvalidTransactionWithSender,
][] => {
	const transactions = [...isTransaction1559UnsignedValidData()];
	return transactions.map(transaction => {
		return [transaction[0], new InvalidTransactionWithSender(transaction[0])];
	});
};

export const isTransactionCallValidData: [TransactionCall, true][] = [
	[{ to: 'Q9Fa83f21CE9bd493B02D7460E03d82D44a77B4612d8B6a0Acc94655106Fbb96152d3E16a0ba414C368653BaE2fe868cB109c05727Ca47148114749451afb7Cc1' }, true],
	[
		{
			from: 'Q9Fa83f21CE9bd493B02D7460E03d82D44a77B4612d8B6a0Acc94655106Fbb96152d3E16a0ba414C368653BaE2fe868cB109c05727Ca47148114749451afb7Cc1',
			to: 'Q9Fa83f21CE9bd493B02D7460E03d82D44a77B4612d8B6a0Acc94655106Fbb96152d3E16a0ba414C368653BaE2fe868cB109c05727Ca47148114749451afb7Cc1',
			gas: '0x5208',
			value: '0x1',
		},
		true,
	],
	[
		{
			from: 'Q9Fa83f21CE9bd493B02D7460E03d82D44a77B4612d8B6a0Acc94655106Fbb96152d3E16a0ba414C368653BaE2fe868cB109c05727Ca47148114749451afb7Cc1',
			to: 'Q9Fa83f21CE9bd493B02D7460E03d82D44a77B4612d8B6a0Acc94655106Fbb96152d3E16a0ba414C368653BaE2fe868cB109c05727Ca47148114749451afb7Cc1',
			gas: '0x5208',
			maxFeePerGas: '0x5208',
			value: '0x1',
			data: '0x0',
		},
		true,
	],
];

// A call may set `type` and the fee-market fields (they only have to be well-formed), so the
// sender-invalid data above (complete 1559 transactions without `from`) are valid calls; the
// invalid calls are the ones with a missing or malformed field.
export const validateTransactionCallInvalidData = (): [any, InvalidTransactionCall][] => {
	const { to } = isTransactionCallValidData[0][0];
	const invalidCalls = [
		{},
		{ to: '0x1' },
		{ to, from: 'Q1' },
		{ to, gas: 'abc' },
		{ to, value: 'abc' },
		{ to, type: 'ab' },
		{ to, maxFeePerGas: 'abc' },
	];
	return invalidCalls.map(call => [call, new InvalidTransactionCall(call)]);
};
