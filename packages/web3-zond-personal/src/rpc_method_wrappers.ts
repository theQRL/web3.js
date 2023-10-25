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
import { Web3RequestManager } from '@theqrl/web3-core';
import { toChecksumAddress, utf8ToHex } from '@theqrl/web3-utils';
import { formatTransaction } from '@theqrl/web3-zond';
import { Address, ZondPersonalAPI, ZOND_DATA_FORMAT, HexString, Transaction } from '@theqrl/web3-types';
import { validator, isHexStrict } from '@theqrl/web3-validator';
import { personalRpcMethods } from '@theqrl/web3-rpc-methods';

export const getAccounts = async (requestManager: Web3RequestManager<ZondPersonalAPI>) => {
	const result = await personalRpcMethods.getAccounts(requestManager);

	return result.map(toChecksumAddress);
};

export const newAccount = async (
	requestManager: Web3RequestManager<ZondPersonalAPI>,
	password: string,
) => {
	validator.validate(['string'], [password]);

	const result = await personalRpcMethods.newAccount(requestManager, password);

	return toChecksumAddress(result);
};

export const unlockAccount = async (
	requestManager: Web3RequestManager<ZondPersonalAPI>,
	address: Address,
	password: string,
	unlockDuration: number,
) => {
	validator.validate(['address', 'string', 'uint'], [address, password, unlockDuration]);

	return personalRpcMethods.unlockAccount(requestManager, address, password, unlockDuration);
};

export const lockAccount = async (
	requestManager: Web3RequestManager<ZondPersonalAPI>,
	address: Address,
) => {
	validator.validate(['address'], [address]);

	return personalRpcMethods.lockAccount(requestManager, address);
};

export const importRawKey = async (
	requestManager: Web3RequestManager<ZondPersonalAPI>,
	keyData: HexString,
	passphrase: string,
) => {
	validator.validate(['string', 'string'], [keyData, passphrase]);

	return personalRpcMethods.importRawKey(requestManager, keyData, passphrase);
};

export const sendTransaction = async (
	requestManager: Web3RequestManager<ZondPersonalAPI>,
	tx: Transaction,
	passphrase: string,
) => {
	const formattedTx = formatTransaction(tx, ZOND_DATA_FORMAT);

	return personalRpcMethods.sendTransaction(requestManager, formattedTx, passphrase);
};

export const signTransaction = async (
	requestManager: Web3RequestManager<ZondPersonalAPI>,
	tx: Transaction,
	passphrase: string,
) => {
	const formattedTx = formatTransaction(tx, ZOND_DATA_FORMAT);

	return personalRpcMethods.signTransaction(requestManager, formattedTx, passphrase);
};

export const sign = async (
	requestManager: Web3RequestManager<ZondPersonalAPI>,
	data: HexString,
	address: Address,
	passphrase: string,
) => {
	validator.validate(['string', 'address', 'string'], [data, address, passphrase]);

	const dataToSign = isHexStrict(data) ? data : utf8ToHex(data);

	return personalRpcMethods.sign(requestManager, dataToSign, address, passphrase);
};
