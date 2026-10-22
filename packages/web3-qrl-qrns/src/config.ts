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

//
/**
 * An object holding the interface Ids of the QRNS resolver contracts. Please see [how to write a resolver](https://docs.ens.domains/contract-developer-guide/writing-a-resolver).
 *
 * `addr` is `addr(bytes32)` (the QRL address of a name), `multicoinAddr` is
 * `addr(bytes32,uint256)` (the address bytes of a name for any coin type).
 */
export const interfaceIds: { [T: string]: string } = {
	addr: '0x3b3b57de',
	multicoinAddr: '0xf1cb7e06',
	name: '0x691f3431',
	abi: '0x2203ab56',
	pubkey: '0xc8690233',
	text: '0x59d1d43c',
	contenthash: '0xbc1c58d1',
};

/**
 * An object holding the functions that are supported by the QRNS resolver contracts/interfaces.
 */
export const methodsInInterface: { [T: string]: string } = {
	setAddr: 'addr',
	addr: 'addr',
	multicoinAddr: 'multicoinAddr',
	setPubkey: 'pubkey',
	pubkey: 'pubkey',
	setContenthash: 'contenthash',
	contenthash: 'contenthash',
	text: 'text',
	name: 'name',
};

/**
 * An object holding the addressed of the QRNS registries on the different networks (mainnet).
 */
// TODO(https://github.com/cyyber/web3.js/issues/103)
export const registryAddresses: { [T: string]: string } = {
	main: 'Q33380cd8b47eed92b0dcd1ccca2ee84efd0c8b87a4fe6ee4a918969cdd454c0b04ac9f03ffaafa765af0cbeab572d8c9dd514044aa94adee50fa5d361a3e4629',
};

export const networkIds: { [T: string]: string } = {
	'0x1': 'main',
};
