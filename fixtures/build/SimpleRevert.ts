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
export const SimpleRevertAbi = [
	{ inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
	{ inputs: [], name: 'ErrorWithNoParams', type: 'error' },
	{
		inputs: [
			{ internalType: 'uint256', name: 'code', type: 'uint256' },
			{ internalType: 'string', name: 'message', type: 'string' },
		],
		name: 'ErrorWithParams',
		type: 'error',
	},
	{ inputs: [], name: 'revertCall', outputs: [], stateMutability: 'pure', type: 'function' },
	{
		inputs: [],
		name: 'revertErrorWithNoParams',
		outputs: [],
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		inputs: [],
		name: 'revertErrorWithParams',
		outputs: [],
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		inputs: [{ internalType: 'string', name: 'revertString', type: 'string' }],
		name: 'revertSend',
		outputs: [],
		stateMutability: 'nonpayable',
		type: 'function',
	},
] as const;
export const SimpleRevertBytecode =
	'0x61010060805234a015610010575fa0fd5b506102cea061001e5f395ff3fe61010060805234a015610010575fa0fd5b506004361061004c575f356101e01ca0633ebf4d9c1461005057a063819f48fe1461005a57a063ba57a5111461006257a063f38fb65b14610075575b5fa0fd5b61005861007d565b005b610058610097565b6100586100703660046101ed565b6100f0565b610058610196565b6080516372090e4d6101e01ba152600401608051a0b103b0fd5b6080a051630642ded36101e51ba152602a6004a201526044a101b1b0b152601c6084a201527b5468697320697320616e206572726f72207769746820706172616d736101201b60c4a20152610104015b608051a0b103b0fd5b6080a051a0a201b0b1526006a152651c995d995c9d6101d21b6040b1a20152a151b0a201207f2c90f3d1a9157ed29776cb68059c8d973512ada89aeb3fa768c664eb6617cd076101011b610100b1b0b11b600160016101001b031916016101935760805162461bcd6101e51ba15260406004a2015260156044a2015274151a1a5cc81a5cc818481cd95b99081c995d995c9d61015a1b6084a2015260c4016100e7565b50565b60805162461bcd6101e51ba15260406004a2015260156044a2015274151a1a5cc81a5cc8184818d85b1b081c995d995c9d61015a1b6084a2015260c4016100e7565b634e487b716101e01b5f52604160045260445ffd5b5f6040a2a40312156101fd575fa0fd5ba13567ffffffffffffffffa0a21115610214575fa0fd5ba1a401b150a4603fa30112610227575fa0fd5ba135a1a11115610239576102396101d8565b608051603fa201603f19b0a116607f0116a101b0a3a211a1a3101715610261576102616101d8565ba1608052a2a152a76040a4a701011115610279575fa0fd5ba26040a6016040a301375fb2a101604001b2b0b25250b5b4505050505056fea2646970667358221220e29676cff1f2a5f777e52cb154c933edbc0f09c14bc4218717362c29332472596468797063430002000033';
