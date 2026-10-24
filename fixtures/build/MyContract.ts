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
export const MyContractAbi = [
	{
		inputs: [],
		name: 'getAttr',
		outputs: [{ internalType: 'string', name: '', type: 'string' }],
		stateMutability: 'view',
		type: 'function',
	},
] as const;
export const MyContractBytecode =
	'0x61010060805234a015610010575fa0fd5b506101c0a061001e5f395ff3fe61010060805234a015610010575fa0fd5b506004361061002b575f356101e01ca063f540c8ba1461002f575b5fa0fd5b61003761004d565b608051610044b1b06100f0565b608051a0b103b0f35b60c05fa05461005bb0610151565ba0603f016040a0b10402604001608051b0a101608052a0b2b1b0a1600160016101001b0316a152604001a2a054610091b0610151565ba0156100e657a0603f106100b357610100a0a3540402a352b1604001b16100e6565ba201b1b0600160016101001b03165f5260405f20b05ba154a152b0600101b0604001a0a3116100c957a2b003603f16a201b15b5050505050b050b0565b5f6040a0a352a351a06040a501525f5ba1a1101561011c57a5a101a30151a5a20160800152a201610100565ba1b2505ba0a3101561013b575f6080a4a70101536001a301b250610120565b50603f01603f1916b2b0b201608001b3b2505050565b6001a1a11cb0a216a061016557607fa216b1505b6040a210a10361018457634e487b716101e01b5f52602260045260445ffd5b50b1b05056fea2646970667358221220fad4eafcc6d441d4129f1c30a9ad97d63834a04dd21f3d612da9da175e3c857c6468797063430002000033';
