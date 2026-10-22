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
	Transaction,
	TransactionWithSenderAPI,
	QRL_DATA_FORMAT,
	Web3ValidationErrorObject,
} from '@theqrl/web3-types';
import {
	isAddressString,
	isHexStrict,
	isHexString32Bytes,
	isNullish,
	isObject,
	isUInt,
	Web3ValidatorError,
} from '@theqrl/web3-validator';
import { toBigInt } from '@theqrl/web3-utils';
import {
	ChainMismatchError,
	HardforkMismatchError,
	ChainIdMismatchError,
	CommonOrChainAndHardforkError,
	InvalidBytesError,
	InvalidGas,
	InvalidMaxPriorityFeePerGasOrMaxFeePerGas,
	InvalidNonceOrChainIdError,
	InvalidNumberError,
	InvalidTransactionCall,
	InvalidTransactionObjectError,
	InvalidTransactionWithReceiver,
	InvalidTransactionWithSender,
	MissingChainOrHardforkError,
	MissingCustomChainError,
	MissingCustomChainIdError,
	MissingGasError,
} from '@theqrl/web3-errors';
import { formatTransaction } from './utils/format_transaction.js';
import { chainSchema, hardforkSchema } from './schemas.js';
import { InternalTransaction } from './types.js';

/**
 * Whether a receipt's `status` says the transaction succeeded. The test is an allow-list on
 * the one success value and independent of the representation the node or a formatter chose:
 * `'0x1'`, `'0x01'`, `1`, `1n` and `'1'` are a success; `'0x0'`, `0n`, a missing, `null`,
 * boolean or unparseable status are not (H-1).
 */
export const isTransactionStatusSuccessful = (status: unknown): boolean => {
	if (typeof status !== 'string' && typeof status !== 'number' && typeof status !== 'bigint') {
		return false;
	}
	try {
		return toBigInt(status) === BigInt(1);
	} catch {
		return false;
	}
};

export function isBaseTransaction(value: BaseTransactionAPI): boolean {
	if (!isNullish(value.to) && !isAddressString(value.to)) return false;
	if (!isHexStrict(value.type) && !isNullish(value.type) && value.type.length !== 2) return false;
	if (!isHexStrict(value.nonce)) return false;
	if (!isHexStrict(value.gas)) return false;
	if (!isHexStrict(value.value)) return false;
	if (!isHexStrict(value.input)) return false;
	if (value.chainId && !isHexStrict(value.chainId)) return false;

	return true;
}

export function isAccessListEntry(value: AccessListEntry): boolean {
	if (!isNullish(value.address) && !isAddressString(value.address)) return false;
	if (
		!isNullish(value.storageKeys) &&
		!value.storageKeys.every(storageKey => isHexString32Bytes(storageKey))
	)
		return false;

	return true;
}

export function isAccessList(value: AccessList): boolean {
	if (
		!Array.isArray(value) ||
		!value.every(accessListEntry => isAccessListEntry(accessListEntry))
	)
		return false;

	return true;
}

export function isTransaction1559Unsigned(value: Transaction1559UnsignedAPI): boolean {
	if (!isBaseTransaction(value)) return false;
	if (!isHexStrict(value.maxFeePerGas)) return false;
	if (!isHexStrict(value.maxPriorityFeePerGas)) return false;
	if (!isAccessList(value.accessList)) return false;

	return true;
}

export function isTransactionWithSender(value: TransactionWithSenderAPI): boolean {
	if (!isAddressString(value.from)) return false;
	if (!isBaseTransaction(value)) return false;
	if (!isTransaction1559Unsigned(value as Transaction1559UnsignedAPI)) return false;

	return true;
}

export function validateTransactionWithSender(value: TransactionWithSenderAPI) {
	if (!isTransactionWithSender(value)) throw new InvalidTransactionWithSender(value);
}

export function isTransactionCall(value: TransactionCall): boolean {
	if (!isNullish(value.from) && !isAddressString(value.from)) return false;
	if (!isAddressString(value.to)) return false;
	if (!isNullish(value.gas) && !isHexStrict(value.gas)) return false;
	if (!isNullish(value.value) && !isHexStrict(value.value)) return false;
	if (!isNullish(value.data) && !isHexStrict(value.data)) return false;
	if (!isNullish(value.input) && !isHexStrict(value.input)) return false;
	if (!isNullish(value.type)) return false;
	if (isTransaction1559Unsigned(value as Transaction1559UnsignedAPI)) return false;

	return true;
}

export function validateTransactionCall(value: TransactionCall) {
	if (!isTransactionCall(value)) throw new InvalidTransactionCall(value);
}

export const validateCustomChainInfo = (transaction: InternalTransaction) => {
	if (!isNullish(transaction.common)) {
		if (isNullish(transaction.common.customChain)) throw new MissingCustomChainError();
		if (isNullish(transaction.common.customChain.chainId))
			throw new MissingCustomChainIdError();
		if (
			!isNullish(transaction.chainId) &&
			transaction.chainId !== transaction.common.customChain.chainId
		)
			throw new ChainIdMismatchError({
				txChainId: transaction.chainId,
				customChainId: transaction.common.customChain.chainId,
			});
	}
};
export const validateChainInfo = (transaction: InternalTransaction) => {
	if (
		!isNullish(transaction.common) &&
		!isNullish(transaction.chain) &&
		!isNullish(transaction.hardfork)
	) {
		throw new CommonOrChainAndHardforkError();
	}
	if (
		(!isNullish(transaction.chain) && isNullish(transaction.hardfork)) ||
		(!isNullish(transaction.hardfork) && isNullish(transaction.chain))
	)
		throw new MissingChainOrHardforkError({
			chain: transaction.chain,
			hardfork: transaction.hardfork,
		});
};
export const validateBaseChain = (transaction: InternalTransaction) => {
	if (!isNullish(transaction.common))
		if (!isNullish(transaction.common.baseChain))
			if (
				!isNullish(transaction.chain) &&
				transaction.chain !== transaction.common.baseChain
			) {
				throw new ChainMismatchError({
					txChain: transaction.chain,
					baseChain: transaction.common.baseChain,
				});
			}
};
export const validateHardfork = (transaction: InternalTransaction) => {
	if (!isNullish(transaction.common))
		if (!isNullish(transaction.common.hardfork))
			if (
				!isNullish(transaction.hardfork) &&
				transaction.hardfork !== transaction.common.hardfork
			) {
				throw new HardforkMismatchError({
					txHardfork: transaction.hardfork,
					commonHardfork: transaction.common.hardfork,
				});
			}
};

export const validateFeeMarketGas = (transaction: InternalTransaction) => {
	// This check is verifying gas isn't less than 0.
	if (isNullish(transaction.gas) || !isUInt(transaction.gas, { bitSize: 512 }))
		throw new InvalidGas({
			gas: transaction.gas,
		});

	if (
		isNullish(transaction.maxFeePerGas) ||
		!isUInt(transaction.maxFeePerGas, { bitSize: 512 }) ||
		isNullish(transaction.maxPriorityFeePerGas) ||
		!isUInt(transaction.maxPriorityFeePerGas, { bitSize: 512 })
	)
		throw new InvalidMaxPriorityFeePerGasOrMaxFeePerGas({
			maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
			maxFeePerGas: transaction.maxFeePerGas,
		});
};

/**
 * This method checks if all required gas properties are present for fee
 * market transactions (0x2)
 */
export const validateGas = (transaction: InternalTransaction) => {
	const gasPresent = !isNullish(transaction.gas) || !isNullish(transaction.gasLimit);
	const feeMarketGasPresent =
		gasPresent &&
		!isNullish(transaction.maxPriorityFeePerGas) &&
		!isNullish(transaction.maxFeePerGas);

	if (!feeMarketGasPresent)
		throw new MissingGasError({
			gas: transaction.gas,
			maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
			maxFeePerGas: transaction.maxFeePerGas,
		});

	validateFeeMarketGas(transaction);
};

/**
 * Enforces the `enum` of {@link chainSchema} and {@link hardforkSchema} on `chain`, `hardfork`,
 * `common.baseChain` and `common.hardfork`. The schemas declared the allowed names, but the
 * formatter never checked them, so `hardfork: 'london'` was signed as if it were `zond` (I-12).
 *
 * @throws Web3ValidatorError naming each offending field.
 */
export const validateChainAndHardforkNames = (transaction: InternalTransaction) => {
	const errors: Web3ValidationErrorObject[] = [];
	const check = (instancePath: string, value: unknown, allowed: readonly string[]) => {
		if (!isNullish(value) && (typeof value !== 'string' || !allowed.includes(value))) {
			errors.push({
				keyword: 'enum',
				instancePath,
				schemaPath: `#${instancePath}/enum`,
				params: { allowedValues: [...allowed] },
				message: `must be one of ${allowed.join(', ')}`,
			});
		}
	};
	check('/chain', transaction.chain, chainSchema.enum);
	check('/hardfork', transaction.hardfork, hardforkSchema.enum);
	check('/common/baseChain', transaction.common?.baseChain, chainSchema.enum);
	check('/common/hardfork', transaction.common?.hardfork, hardforkSchema.enum);
	if (errors.length > 0) throw new Web3ValidatorError(errors);
};

const isSigningAccessList = (accessList: unknown): boolean =>
	Array.isArray(accessList) &&
	accessList.every(
		(entry: unknown) =>
			isObject(entry) &&
			typeof entry.address === 'string' &&
			isAddressString(entry.address) &&
			Array.isArray(entry.storageKeys) &&
			entry.storageKeys.every(
				(key: unknown) => typeof key === 'string' && isHexString32Bytes(key),
			),
	);

/**
 * Checks the encoding of the fields that the transaction classes would otherwise reject with
 * a raw `TypeError`/`Error` or silently reinterpret (an empty `to` became a contract
 * creation): `to` must be a QRL address, `data`/`input` hex bytes, `value` an unsigned 256-bit
 * quantity (`'0x'` stands for zero) and `accessList` a list of `{ address, storageKeys }`
 * entries (L-26).
 *
 * @throws InvalidTransactionWithReceiver, InvalidBytesError, InvalidNumberError or
 * Web3ValidatorError (for `accessList`).
 */
export const validateSigningFieldEncodings = (transaction: InternalTransaction) => {
	if (!isNullish(transaction.to) && !isAddressString(transaction.to)) {
		throw new InvalidTransactionWithReceiver(transaction.to);
	}

	for (const field of ['data', 'input'] as const) {
		const value = transaction[field];
		if (!isNullish(value) && !isHexStrict(value)) throw new InvalidBytesError(value);
	}

	if (
		!isNullish(transaction.value) &&
		transaction.value !== '0x' &&
		!isUInt(transaction.value, { bitSize: 256 })
	) {
		throw new InvalidNumberError(`value: ${String(transaction.value)}`);
	}

	if (!isNullish(transaction.accessList) && !isSigningAccessList(transaction.accessList)) {
		throw new Web3ValidatorError([
			{
				keyword: 'accessList',
				instancePath: '/accessList',
				schemaPath: '#/properties/accessList',
				params: {},
				message:
					'must be an array of { address: QRL address, storageKeys: 32-byte hex string[] } entries',
			},
		]);
	}
};

/**
 * Validates a populated transaction right before it is signed.
 *
 * @throws InvalidNumberError for a quantity given as a JavaScript number that is not a safe
 * integer (L-55) or a `value` that is not an unsigned quantity; Web3ValidatorError for an
 * unsupported `chain`/`hardfork` name (I-12), a malformed `accessList` or a `gas`/`gasLimit`
 * pair that disagrees (L-50); InvalidTransactionWithReceiver / InvalidBytesError for a `to`
 * that is not a QRL address or `data`/`input` that is not hex (L-26); InvalidNonceOrChainIdError
 * for a `nonce`/`chainId` that is missing or not an unsigned quantity.
 */
export const validateTransactionForSigning = (
	transaction: InternalTransaction,
	overrideMethod?: (transaction: InternalTransaction) => void,
) => {
	if (!isNullish(overrideMethod)) {
		overrideMethod(transaction);
		return;
	}

	if (typeof transaction !== 'object' || isNullish(transaction))
		throw new InvalidTransactionObjectError(transaction);

	validateCustomChainInfo(transaction);
	validateChainInfo(transaction);
	validateBaseChain(transaction);
	validateHardfork(transaction);
	validateChainAndHardforkNames(transaction);

	const formattedTransaction = formatTransaction(transaction as Transaction, QRL_DATA_FORMAT);
	validateGas(formattedTransaction);
	validateSigningFieldEncodings(formattedTransaction);

	if (
		isNullish(formattedTransaction.nonce) ||
		isNullish(formattedTransaction.chainId) ||
		// Anything but an unsigned quantity (`'-0x1'`, `'0x'`, `'abc'`) is rejected here with a
		// typed error instead of surfacing as a raw `TypeError` further down (L-26).
		!isUInt(formattedTransaction.nonce, { bitSize: 512 }) ||
		!isUInt(formattedTransaction.chainId, { bitSize: 512 })
	)
		throw new InvalidNonceOrChainIdError({
			nonce: transaction.nonce,
			chainId: transaction.chainId,
		});
};
