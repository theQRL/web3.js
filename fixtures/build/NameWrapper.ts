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
export const NameWrapperAbi = [
	{
		inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
		name: 'ownerOf',
		outputs: [{ internalType: 'address', name: '', type: 'address' }],
		stateMutability: 'view',
		type: 'function',
	},
] as const;
export const NameWrapperBytecode =
	'0x61010060805234a015600f575fa0fd5b5060b0a0601b5f395ff3fe61010060805234a015600f575fa0fd5b50600436106028575f356101e01ca0636352211e14602c575b5fa0fd5b603c6037366004604e565b5032b0565b608051b0a152604001608051a0b103b0f35b5f6040a2a4031215605d575fa0fd5ba135600160016101001b03a116a1146073575fa0fd5bb3b250505056fea2646970667358221220419c485096ff9a33cf0b5ae854cfbd4da4b59d556774887853af6e17926ccab76468797063430002000033';
