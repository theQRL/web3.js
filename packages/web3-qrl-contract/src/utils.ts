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

import { Web3ContractError } from '@theqrl/web3-errors';
import {
	TransactionForAccessList,
	AbiFunctionFragment,
	AbiParameter,
	TransactionWithSenderAPI,
	TransactionCall,
	HexString,
	Address,
	NonPayableCallOptions,
	PayableCallOptions,
	ContractInitOptions,
} from '@theqrl/web3-types';
import { isNullish, mergeDeep } from '@theqrl/web3-utils';
import { isAddressString, isHexStrict } from '@theqrl/web3-validator';
import { encodeMethodABI } from './encoding.js';
import { ContractOptions, Web3ContractContext } from './types.js';

/**
 * Where the encoded calldata of a contract call is placed in the transaction object.
 */
export type DataInputFill = 'data' | 'input' | 'both';

const DATA_INPUT_FILLS: ReadonlyArray<DataInputFill> = ['data', 'input', 'both'];

/**
 * Checks that a `dataInputFill` option (or `contractDataInputFill` config value) is one of
 * `'data'`, `'input'` or `'both'`. An unknown value used to store the calldata under a key the
 * node does not read, so `qrl_call` went out without any calldata (L-58).
 *
 * @param value - The value to check; `undefined` is returned as is.
 * @returns The validated value.
 * @throws Web3ContractError - when the value is not one of the three accepted strings.
 */
export const assertDataInputFill = (value: unknown): DataInputFill | undefined => {
	if (isNullish(value)) {
		return undefined;
	}
	if (!DATA_INPUT_FILLS.includes(value as DataInputFill)) {
		throw new Web3ContractError(
			`Invalid dataInputFill value: expected 'data', 'input' or 'both', got ${JSON.stringify(
				value,
			)}`,
		);
	}
	return value as DataInputFill;
};

const dataInputEncodeMethodHelper = (
	txParams: TransactionCall | TransactionForAccessList,
	abi: AbiFunctionFragment,
	params: unknown[],
	dataInputFill?: DataInputFill,
): { data?: HexString; input?: HexString } => {
	const fill = assertDataInputFill(dataInputFill) ?? 'input';
	const tx: { data?: HexString; input?: HexString } = {};
	if (!isNullish(txParams.data) || fill === 'both') {
		tx.data = encodeMethodABI(abi, params, (txParams.data ?? txParams.input) as HexString);
	}
	if (!isNullish(txParams.input) || fill === 'both') {
		tx.input = encodeMethodABI(abi, params, (txParams.input ?? txParams.data) as HexString);
	}
	// if input and data is empty, use web3config default
	if (isNullish(tx.input) && isNullish(tx.data)) {
		tx[fill === 'both' ? 'input' : fill] = encodeMethodABI(abi, params);
	}

	return { data: tx.data as HexString, input: tx.input as HexString };
};

const isDeployment = (abi: AbiFunctionFragment): boolean => abi.type === 'constructor';

/**
 * A method call needs a `to` address: without one the node would treat the calldata as init
 * code and create a new contract (I-13).
 */
const assertMethodCallHasAddress = (
	abi: AbiFunctionFragment,
	options: { to?: Address } | undefined,
	contractOptions: ContractOptions,
): void => {
	if (!isDeployment(abi) && !options?.to && !contractOptions.address) {
		throw new Web3ContractError(
			'Contract address not specified: a method call needs a "to" address, otherwise it would be sent as a contract creation',
		);
	}
};

export const getSendTxParams = ({
	abi,
	params,
	options,
	contractOptions,
}: {
	abi: AbiFunctionFragment;
	params: unknown[];
	options?: (PayableCallOptions | NonPayableCallOptions) & {
		input?: HexString;
		data?: HexString;
		to?: Address;
		dataInputFill?: DataInputFill;
	};
	contractOptions: ContractOptions;
}): TransactionCall => {
	const deploymentCall =
		options?.input ?? options?.data ?? contractOptions.input ?? contractOptions.data;
	if (!deploymentCall && !options?.to && !contractOptions.address) {
		throw new Web3ContractError('Contract address not specified');
	}
	assertMethodCallHasAddress(abi, options, contractOptions);

	if (!options?.from && !contractOptions.from) {
		throw new Web3ContractError('Contract "from" address not specified');
	}
	let txParams = mergeDeep(
		{
			to: contractOptions.address,
			gas: contractOptions.gas,
			from: contractOptions.from,
			input: contractOptions.input,
			maxPriorityFeePerGas: contractOptions.maxPriorityFeePerGas,
			maxFeePerGas: contractOptions.maxFeePerGas,
			data: contractOptions.data,
		},
		options as unknown as Record<string, unknown>,
	) as unknown as TransactionCall;
	const dataInput = dataInputEncodeMethodHelper(txParams, abi, params, options?.dataInputFill);
	txParams = { ...txParams, data: dataInput.data, input: dataInput.input };

	return txParams;
};

export const getQRLTxCallParams = ({
	abi,
	params,
	options,
	contractOptions,
}: {
	abi: AbiFunctionFragment;
	params: unknown[];
	options?: (PayableCallOptions | NonPayableCallOptions) & {
		to?: Address;
		dataInputFill?: DataInputFill;
	};
	contractOptions: ContractOptions;
}): TransactionCall => {
	if (!options?.to && !contractOptions.address) {
		throw new Web3ContractError('Contract address not specified');
	}
	let txParams = mergeDeep(
		{
			to: contractOptions.address,
			gas: contractOptions.gas,
			from: contractOptions.from,
			input: contractOptions.input,
			maxPriorityFeePerGas: contractOptions.maxPriorityFeePerGas,
			maxFeePerGas: contractOptions.maxFeePerGas,
			data: contractOptions.data,
		},
		options as unknown as Record<string, unknown>,
	) as unknown as TransactionCall;

	const dataInput = dataInputEncodeMethodHelper(txParams, abi, params, options?.dataInputFill);
	txParams = { ...txParams, data: dataInput.data, input: dataInput.input };

	return txParams;
};

export const getEstimateGasParams = ({
	abi,
	params,
	options,
	contractOptions,
}: {
	abi: AbiFunctionFragment;
	params: unknown[];
	options?: (PayableCallOptions | NonPayableCallOptions) & {
		to?: Address;
		dataInputFill?: DataInputFill;
	};
	contractOptions: ContractOptions;
}): Partial<TransactionWithSenderAPI> => {
	assertMethodCallHasAddress(abi, options, contractOptions);
	let txParams = mergeDeep(
		{
			to: contractOptions.address,
			gas: contractOptions.gas,
			maxFeePerGas: contractOptions.maxFeePerGas,
			maxPriorityFeePerGas: contractOptions.maxPriorityFeePerGas,
			from: contractOptions.from,
			input: contractOptions.input,
			data: contractOptions.data,
		},
		options as unknown as Record<string, unknown>,
	) as unknown as TransactionCall;

	const dataInput = dataInputEncodeMethodHelper(txParams, abi, params, options?.dataInputFill);
	txParams = { ...txParams, data: dataInput.data, input: dataInput.input };

	return txParams as TransactionWithSenderAPI;
};

export const isContractInitOptions = (options: unknown): options is ContractInitOptions =>
	typeof options === 'object' &&
	!isNullish(options) &&
	[
		'input',
		'data',
		'from',
		'gas',
		'maxFeePerGas',
		'maxPriorityFeePerGas',
		'gasLimit',
		'address',
		'jsonInterface',
		'syncWithContext',
		'dataInputFill',
	].some(key => key in options);

/**
 * The keys that identify a {@link Web3ContractContext} (a `Web3Context` instance or its
 * `getContextObject()`).
 */
const CONTRACT_CONTEXT_KEYS = [
	'config',
	'provider',
	'requestManager',
	'subscriptionManager',
	'registeredSubscriptions',
	'accountProvider',
	'wallet',
	'providers',
];

/**
 * Whether `options` is a context the contract should attach to.
 *
 * Only an object carrying at least one context key qualifies. An empty object used to pass
 * this check, so `new Contract(abi, address, {}, context)` (which is what
 * `new web3.qrl.Contract(abi, address)` built) attached to the empty object instead of
 * `context` and silently lost the wallet, the request manager and the config (M-6).
 */
export const isWeb3ContractContext = (options: unknown): options is Web3ContractContext =>
	typeof options === 'object' &&
	!isNullish(options) &&
	!isContractInitOptions(options) &&
	CONTRACT_CONTEXT_KEYS.some(key => key in options);

export const getCreateAccessListParams = ({
	abi,
	params,
	options,
	contractOptions,
}: {
	abi: AbiFunctionFragment;
	params: unknown[];
	options?: (PayableCallOptions | NonPayableCallOptions) & {
		to?: Address;
		dataInputFill?: DataInputFill;
	};
	contractOptions: ContractOptions;
}): TransactionForAccessList => {
	if (!options?.to && !contractOptions.address) {
		throw new Web3ContractError('Contract address not specified');
	}

	if (!options?.from && !contractOptions.from) {
		throw new Web3ContractError('Contract "from" address not specified');
	}

	let txParams = mergeDeep(
		{
			to: contractOptions.address,
			gas: contractOptions.gas,
			from: contractOptions.from,
			input: contractOptions.input,
			maxPriorityFeePerGas: contractOptions.maxPriorityFeePerGas,
			maxFeePerGas: contractOptions.maxFeePerGas,
			data: contractOptions.data,
		},
		options as unknown as Record<string, unknown>,
	) as unknown as TransactionForAccessList;

	const dataInput = dataInputEncodeMethodHelper(txParams, abi, params, options?.dataInputFill);
	txParams = { ...txParams, data: dataInput.data, input: dataInput.input };

	return txParams;
};

const ARRAY_SUFFIX = /\[(\d*)\]$/;
const DECIMAL_INTEGER = /^-?\d+$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' &&
	!isNullish(value) &&
	!Array.isArray(value) &&
	!(value instanceof Uint8Array);

const isHexOfLength = (value: unknown, bytes: number): boolean =>
	(value instanceof Uint8Array && value.length === bytes) ||
	(typeof value === 'string' && isHexStrict(value) && (value.length - 2) / 2 === bytes);

/**
 * Whether `value` is the natural JavaScript spelling of an ABI value of `input`'s type, as
 * opposed to a value the validator merely tolerates. Used to pick between overloads that all
 * accept the arguments (H-4):
 *
 * - `address`: a `Q`-prefixed address string;
 * - `bool`: a boolean;
 * - `string`: a string;
 * - `bytes` / `bytesN` / `function`: a `0x` hex string (of exactly N bytes for `bytesN`) or
 *   a `Uint8Array`;
 * - `intN` / `uintN`: a number, a bigint or a decimal string (non-negative for `uint`);
 * - arrays and tuples: element-wise.
 *
 * A hex string is therefore an exact match for `bytes32` but not for `uint256`, and `7` is an
 * exact match for `uint256` and `int256` alike.
 */
export const isExactAbiValue = (input: AbiParameter, value: unknown): boolean => {
	const arrayMatch = ARRAY_SUFFIX.exec(input.type);
	if (arrayMatch) {
		if (!Array.isArray(value)) {
			return false;
		}
		if (arrayMatch[1] !== '' && value.length !== Number(arrayMatch[1])) {
			return false;
		}
		const elementInput = { ...input, type: input.type.slice(0, -arrayMatch[0].length) };
		return value.every(element => isExactAbiValue(elementInput, element));
	}

	const { type } = input;
	if (type === 'tuple') {
		const components = input.components ?? [];
		if (Array.isArray(value)) {
			return (
				value.length === components.length &&
				components.every((component, index) => isExactAbiValue(component, value[index]))
			);
		}
		return (
			isPlainObject(value) &&
			components.every(component => isExactAbiValue(component, value[component.name]))
		);
	}
	if (type === 'address') {
		return typeof value === 'string' && isAddressString(value);
	}
	if (type === 'bool') {
		return typeof value === 'boolean';
	}
	if (type === 'string') {
		return typeof value === 'string';
	}
	if (type === 'bytes' || type === 'function') {
		return value instanceof Uint8Array || (typeof value === 'string' && isHexStrict(value));
	}
	const bytesMatch = /^bytes(\d+)$/.exec(type);
	if (bytesMatch) {
		return isHexOfLength(value, Number(bytesMatch[1]));
	}
	if (/^u?int\d*$/.test(type)) {
		const unsigned = type.startsWith('u');
		if (typeof value === 'bigint') {
			return !unsigned || value >= BigInt(0);
		}
		if (typeof value === 'number') {
			return Number.isSafeInteger(value) && (!unsigned || value >= 0);
		}
		return (
			typeof value === 'string' &&
			DECIMAL_INTEGER.test(value) &&
			(!unsigned || !value.startsWith('-'))
		);
	}
	return false;
};
