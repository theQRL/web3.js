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

export type ForkName =
	| 'Shanghai';

export type ForkNamesMap = { [forkName in ForkName]: string };

export interface TxData {
	data: string;
	gasLimit: string;
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;
	nonce: string;
	to: string;
	value: string;

	publicKey: string;
	signature: string;
}

export type ForksData = {
	[forkName in ForkName]: { hash?: string; sender?: string; exception?: string };
};

export type OfficialTransactionTestData = {
	_info: {
		comment: string;
		filledwith: string;
		lllcversion: string;
		source: string;
		sourceHash: string;
	};
	result: ForksData;
	txbytes: string;
};
