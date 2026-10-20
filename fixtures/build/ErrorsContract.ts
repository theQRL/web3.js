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
export const ErrorsContractAbi = [
	{ inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
	{
		inputs: [{ internalType: 'string', name: '', type: 'string' }],
		name: 'CustomError',
		type: 'error',
	},
	{ inputs: [], name: 'Unauthorized', type: 'error' },
	{
		inputs: [],
		name: 'badRequire',
		outputs: [],
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		inputs: [],
		name: 'unauthorize',
		outputs: [],
		stateMutability: 'nonpayable',
		type: 'function',
	},
] as const;
export const ErrorsContractBytecode =
	'0x6101006080525fa05534a015610013575fa0fd5b50610121a06100215f395ff3fe61010060805234a015600f575fa0fd5b50600436106032575f356101e01ca063593b0df414603657a0638ec6371414603e575b5fa0fd5b603c6044565b005b603c60cb565b6080516346b7545f6101e11ba15260406004a20152601b6044a201527a3932bb32b93a32b2103ab9b4b7339031bab9ba37b69022b93937b96101291b6084a2015260c401608051a0b103b0fd5b5f546108fc47600160016101001b0316b0a11502b06080515f608051a0a303a1a5a8a8f1b35050505015a01560c8573d5fa03e3d5ffd5b50565b5f5433146091576080516282b4296101e81ba152600401608051a0b103b0fdfea2646970667358221220db872e105567e757dede21d1874e2d3f753ac72dc623a1108f61dfe2de1e9e386468797063430002000033';
