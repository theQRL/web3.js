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

import { Numbers, HexString, BlockNumberOrTag, BlockTags, Common } from '@theqrl/web3-types';
import {
	BaseWeb3Error,
	ConfigHardforkMismatchError,
	ConfigChainMismatchError,
	InvalidMethodParamsError,
} from '@theqrl/web3-errors';
import { isNullish, MAX_TIMER_DELAY_MS, toHex } from '@theqrl/web3-utils';
import { TransactionTypeParser } from './types.js';
import { TransactionBuilder } from './web3_context.js';
import { Web3EventEmitter } from './web3_event_emitter.js';

// To avoid cycle dependency declare this
export interface Web3ConfigOptions {
	handleRevert: boolean;
	defaultAccount?: HexString;
	defaultBlock: BlockNumberOrTag;
	transactionSendTimeout: number;
	transactionBlockTimeout: number;
	transactionConfirmationBlocks: number;
	transactionPollingInterval: number;
	transactionPollingTimeout: number;
	transactionReceiptPollingInterval?: number;
	transactionConfirmationPollingInterval?: number;
	blockHeaderTimeout: number;
	maxListenersWarningThreshold: number;
	contractDataInputFill: 'data' | 'input' | 'both';
	defaultNetworkId?: Numbers;
	defaultChain: string;
	defaultHardfork: string;

	defaultCommon?: Common;
	defaultTransactionType: Numbers;
	defaultMaxPriorityFeePerGas: Numbers;
	enableExperimentalFeatures: {
		useSubscriptionWhenCheckingBlockTimeout: boolean;
		useRpcCallSpecification: boolean; // EIP-1474 https://eips.ethereum.org/EIPS/eip-1474
		// other experimental features...
	};
	transactionBuilder?: TransactionBuilder;
	transactionTypeParser?: TransactionTypeParser;
}

type ConfigEvent<T, P extends keyof T = keyof T> = P extends unknown
	? { name: P; oldValue: T[P]; newValue: T[P] }
	: never;

/** The payload of a {@link Web3ConfigEvent.CONFIG_CHANGE} event. */
export type Web3ConfigChangeEvent = ConfigEvent<Web3ConfigOptions>;

export enum Web3ConfigEvent {
	CONFIG_CHANGE = 'CONFIG_CHANGE',
}

const createDefaultConfig = (): Web3ConfigOptions => ({
	handleRevert: false,
	defaultAccount: undefined,
	defaultBlock: 'latest',
	transactionBlockTimeout: 50,
	transactionConfirmationBlocks: 24,
	transactionPollingInterval: 1000,
	transactionPollingTimeout: 750 * 1000,
	transactionReceiptPollingInterval: undefined,
	transactionSendTimeout: 750 * 1000,
	transactionConfirmationPollingInterval: undefined,
	blockHeaderTimeout: 10,
	maxListenersWarningThreshold: 100,
	contractDataInputFill: 'input',
	defaultNetworkId: undefined,
	defaultChain: 'mainnet',
	defaultHardfork: 'zond',
	// TODO - Check if there is a default Common
	defaultCommon: undefined,
	defaultTransactionType: '0x2',
	defaultMaxPriorityFeePerGas: toHex(2500000000),
	enableExperimentalFeatures: {
		useSubscriptionWhenCheckingBlockTimeout: false,
		useRpcCallSpecification: false,
	},
	transactionBuilder: undefined,
	transactionTypeParser: undefined,
});

const CONFIG_KEYS: ReadonlySet<string> = new Set(Object.keys(createDefaultConfig()));
const BLOCK_TAGS: ReadonlySet<string> = new Set(Object.values(BlockTags));
const CONTRACT_DATA_INPUT_FILL_VALUES: ReadonlySet<string> = new Set(['data', 'input', 'both']);
const EXPERIMENTAL_FEATURE_FLAGS = [
	'useSubscriptionWhenCheckingBlockTimeout',
	'useRpcCallSpecification',
] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && !isNullish(value) && !Array.isArray(value);

// A positive number of milliseconds a JavaScript timer can hold: above 2^31 - 1 ms the
// platform clamps the delay to 1 ms, so a "never time out" value timed out at once (P4-L-5).
const isPositiveNumber = (value: unknown): boolean =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_TIMER_DELAY_MS;

// The same bound for an option counted in seconds (`blockHeaderTimeout` is multiplied by 1000).
const isPositiveSeconds = (value: unknown): boolean =>
	typeof value === 'number' &&
	Number.isFinite(value) &&
	value > 0 &&
	value * 1000 <= MAX_TIMER_DELAY_MS;

const isNonNegativeInteger = (value: unknown): boolean =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** A `Numbers` value that is a non-negative integer: a safe integer, a bigint, a decimal or a hex string. */
const isUnsignedNumberLike = (value: unknown): boolean =>
	isNonNegativeInteger(value) ||
	(typeof value === 'bigint' && value >= BigInt(0)) ||
	(typeof value === 'string' && /^(0x[0-9a-f]+|[0-9]+)$/i.test(value));

const isBlockNumberOrTag = (value: unknown): boolean =>
	(typeof value === 'string' && BLOCK_TAGS.has(value)) || isUnsignedNumberLike(value);

/** Format check only (capital `Q` + 128 hex digits, as go-qrl requires); the checksum is verified where the address is used. */
const isAddressLike = (value: unknown): boolean =>
	typeof value === 'string' && /^Q[0-9a-fA-F]{128}$/.test(value);

const isNonEmptyString = (value: unknown): boolean =>
	typeof value === 'string' && value.trim() !== '';

const describeValue = (value: unknown): string => {
	const text = BaseWeb3Error.convertToString(value);
	return text.length > 64 ? `${text.slice(0, 64)}...` : text;
};

/**
 * What every configuration option accepts. The setters and {@link Web3Config.setConfig}
 * check a value against its rule before anything is stored or emitted (L-39, I-14).
 */
const CONFIG_RULES: {
	[K in keyof Web3ConfigOptions]-?: { expected: string; test: (value: unknown) => boolean };
} = {
	handleRevert: { expected: 'a boolean', test: value => typeof value === 'boolean' },
	defaultAccount: {
		expected: 'undefined or a QRL address',
		test: value => value === undefined || isAddressLike(value),
	},
	defaultBlock: {
		expected: 'a block tag (earliest, latest, pending, safe, finalized) or a block number',
		test: isBlockNumberOrTag,
	},
	transactionSendTimeout: { expected: 'a positive number of milliseconds', test: isPositiveNumber },
	transactionBlockTimeout: {
		expected: 'a positive integer number of blocks',
		test: value => isNonNegativeInteger(value) && (value as number) > 0,
	},
	transactionConfirmationBlocks: {
		expected: 'a non-negative integer number of blocks',
		test: isNonNegativeInteger,
	},
	transactionPollingInterval: {
		expected: 'a positive number of milliseconds',
		test: isPositiveNumber,
	},
	transactionPollingTimeout: {
		expected: 'a positive number of milliseconds',
		test: isPositiveNumber,
	},
	transactionReceiptPollingInterval: {
		expected: 'undefined or a positive number of milliseconds',
		test: value => value === undefined || isPositiveNumber(value),
	},
	transactionConfirmationPollingInterval: {
		expected: 'undefined or a positive number of milliseconds',
		test: value => value === undefined || isPositiveNumber(value),
	},
	blockHeaderTimeout: {
		expected: 'a positive number of seconds (at most 2147483 seconds)',
		test: isPositiveSeconds,
	},
	maxListenersWarningThreshold: {
		expected: 'a non-negative integer',
		test: isNonNegativeInteger,
	},
	contractDataInputFill: {
		expected: '"data", "input" or "both"',
		test: value => typeof value === 'string' && CONTRACT_DATA_INPUT_FILL_VALUES.has(value),
	},
	defaultNetworkId: {
		expected: 'undefined or a non-negative integer (number, bigint, decimal or hex string)',
		test: value => value === undefined || isUnsignedNumberLike(value),
	},
	defaultChain: { expected: 'a non-empty string', test: isNonEmptyString },
	defaultHardfork: { expected: 'a non-empty string', test: isNonEmptyString },
	defaultCommon: {
		expected: 'undefined or a Common object with a customChain',
		test: value =>
			value === undefined || (isPlainObject(value) && isPlainObject(value.customChain)),
	},
	defaultTransactionType: {
		expected: 'a non-negative integer (number, bigint, decimal or hex string)',
		test: isUnsignedNumberLike,
	},
	defaultMaxPriorityFeePerGas: {
		expected: 'a non-negative integer (number, bigint, decimal or hex string)',
		test: isUnsignedNumberLike,
	},
	enableExperimentalFeatures: {
		expected: 'an object of boolean feature flags',
		test: value =>
			isPlainObject(value) &&
			EXPERIMENTAL_FEATURE_FLAGS.every(
				flag => value[flag] === undefined || typeof value[flag] === 'boolean',
			),
	},
	transactionBuilder: {
		expected: 'undefined or a function',
		test: value => value === undefined || typeof value === 'function',
	},
	transactionTypeParser: {
		expected: 'undefined or a function',
		test: value => value === undefined || typeof value === 'function',
	},
};

export abstract class Web3Config
	extends Web3EventEmitter<{ [Web3ConfigEvent.CONFIG_CHANGE]: Web3ConfigChangeEvent }>
	implements Web3ConfigOptions
{
	public config: Web3ConfigOptions = createDefaultConfig();

	public constructor(options?: Partial<Web3ConfigOptions>) {
		super();

		this.setConfig(options ?? {});
		// The emitter's own default is Node's 10; the configured threshold applies from the
		// start, not only once `maxListenersWarningThreshold` is assigned explicitly.
		this.setMaxListenerWarningThreshold(this.config.maxListenersWarningThreshold);
	}

	/**
	 * Applies several options at once.
	 *
	 * Every option goes through its setter: the value is validated exactly as a direct
	 * assignment is, and a `CONFIG_CHANGE` event is emitted per option, so the contexts created
	 * from this one with `use()` or attached to it with `link()` follow (L-39). An unknown option
	 * and a value of the wrong type or out of range throw an {@link InvalidMethodParamsError}
	 * naming the option. A `__proto__` key (a parsed JSON document, for example) is ignored
	 * instead of re-parenting the configuration (I-14).
	 */
	public setConfig(options: Partial<Web3ConfigOptions>) {
		if (!isPlainObject(options)) {
			throw new InvalidMethodParamsError(
				`setConfig expects a configuration object, got ${describeValue(options)}`,
			);
		}

		const keys = Object.keys(options);
		for (const key of keys) {
			if (key === '__proto__') {
				continue;
			}
			if (!CONFIG_KEYS.has(key)) {
				throw new InvalidMethodParamsError(`Unknown configuration option "${key}"`);
			}
		}

		// `transactionPollingInterval` also resets the receipt and confirmation intervals, so it
		// is applied first: an explicit `transactionReceiptPollingInterval` given in the same
		// object must win whatever the key order (P4-L-6).
		const ordered = [
			...keys.filter(key => key === 'transactionPollingInterval'),
			...keys.filter(key => key !== 'transactionPollingInterval' && key !== '__proto__'),
		];
		for (const key of ordered) {
			// Assigning through `this` runs the option's setter (validation and CONFIG_CHANGE).
			(this as unknown as Record<string, unknown>)[key] =
				options[key as keyof Web3ConfigOptions];
		}
	}

	/**
	 * The `handleRevert` options property returns the revert reason string if enabled for the following methods:
	 * - web3.qrl.sendTransaction()
	 * - web3.qrl.call()
	 * - myContract.methods.myMethod().call()
	 * - myContract.methods.myMethod().send()
	 * Default is `false`.
	 *
	 * `Note`: At the moment `handleRevert` is only supported for `sendTransaction` and not for `sendSignedTransaction`
	 */
	public get handleRevert() {
		return this.config.handleRevert;
	}

	/**
	 * Will set the handleRevert. Throws an {@link InvalidMethodParamsError} for a non-boolean.
	 */
	public set handleRevert(val) {
		this._setConfigValue('handleRevert', val);
	}

	/**
	 * The `contractDataInputFill` options property will allow you to set the hash of the method signature and encoded parameters to the property
	 * either `data`, `input` or both within your contract.
	 * This will affect the contracts send, call and estimateGas methods
	 * Default is `input`.
	 */
	public get contractDataInputFill() {
		return this.config.contractDataInputFill;
	}

	/**
	 * Will set the contractDataInputFill. Throws an {@link InvalidMethodParamsError} for a value
	 * other than `'data'`, `'input'` or `'both'`.
	 */
	public set contractDataInputFill(val) {
		this._setConfigValue('contractDataInputFill', val);
	}

	/**
	 * This default address is used as the default `from` property, if no `from` property is specified in for the following methods:
	 * - web3.qrl.sendTransaction()
	 * - web3.qrl.call()
	 * - myContract.methods.myMethod().call()
	 * - myContract.methods.myMethod().send()
	 */
	public get defaultAccount() {
		return this.config.defaultAccount;
	}
	/**
	 * Will set the default account. Throws an {@link InvalidMethodParamsError} for a value that
	 * is neither `undefined` nor a QRL address (`Q` followed by 128 hex digits).
	 */
	public set defaultAccount(val) {
		this._setConfigValue('defaultAccount', val);
	}

	/**
	 * The default block is used for certain methods. You can override it by passing in the defaultBlock as last parameter. The default value is `"latest"`.
	 * - web3.qrl.getBalance()
	 * - web3.qrl.getCode()
	 * - web3.qrl.getTransactionCount()
	 * - web3.qrl.getStorageAt()
	 * - web3.qrl.call()
	 * - myContract.methods.myMethod().call()
	 */
	public get defaultBlock() {
		return this.config.defaultBlock;
	}

	/**
	 * Will set the default block. Throws an {@link InvalidMethodParamsError} for anything but:
	 *
	 * - A block number
	 * - `"earliest"` - String: The genesis block
	 * - `"latest"` - String: The latest block (current head of the blockchain)
	 * - `"pending"` - String: The currently mined block (including pending transactions)
	 * - `"finalized"` - String: (For POS networks) The finalized block is one which has been accepted as canonical by greater than 2/3 of validators
	 * - `"safe"` - String: (For POS networks) The safe head block is one which under normal network conditions, is expected to be included in the canonical chain. Under normal network conditions the safe head and the actual tip of the chain will be equivalent (with safe head trailing only by a few seconds). Safe heads will be less likely to be reorged than the proof of work network`s latest blocks.
	 */
	public set defaultBlock(val) {
		this._setConfigValue('defaultBlock', val);
	}

	/**
	 * The time used to wait for QRL Node to return the sent transaction result.
	 * Note: If the RPC call stuck at the Node and therefor timed-out, the transaction may still be pending or even mined by the Network. We recommend checking the pending transactions in such a case.
	 * Default is `750` seconds (12.5 minutes).
	 */
	public get transactionSendTimeout() {
		return this.config.transactionSendTimeout;
	}

	/**
	 * Will set the transactionSendTimeout. Throws an {@link InvalidMethodParamsError} for a
	 * value that is not a positive number.
	 */
	public set transactionSendTimeout(val) {
		this._setConfigValue('transactionSendTimeout', val);
	}

	/**
	 * The `transactionBlockTimeout` is used over socket-based connections. This option defines the amount of new blocks it should wait until the first confirmation happens, otherwise the PromiEvent rejects with a timeout error.
	 * Default is `50`.
	 */
	public get transactionBlockTimeout() {
		return this.config.transactionBlockTimeout;
	}

	/**
	 * Will set the transactionBlockTimeout. Throws an {@link InvalidMethodParamsError} for a
	 * value that is not a positive integer.
	 */
	public set transactionBlockTimeout(val) {
		this._setConfigValue('transactionBlockTimeout', val);
	}

	/**
	 * This defines the number of blocks it requires until a transaction is considered confirmed.
	 * Default is `24`.
	 */
	public get transactionConfirmationBlocks() {
		return this.config.transactionConfirmationBlocks;
	}

	/**
	 * Will set the transactionConfirmationBlocks. Throws an {@link InvalidMethodParamsError}
	 * for a value that is not a non-negative integer.
	 */
	public set transactionConfirmationBlocks(val) {
		this._setConfigValue('transactionConfirmationBlocks', val);
	}

	/**
	 * Used over HTTP connections. This option defines the number of seconds between Web3 calls for a receipt which confirms that a transaction was mined by the network.
	 * Default is `1000` ms.
	 */
	public get transactionPollingInterval() {
		return this.config.transactionPollingInterval;
	}

	/**
	 * Will set the transactionPollingInterval (and, with it, `transactionReceiptPollingInterval`
	 * and `transactionConfirmationPollingInterval`). Throws an {@link InvalidMethodParamsError}
	 * for a value that is not a positive number.
	 */
	public set transactionPollingInterval(val) {
		this._setConfigValue('transactionPollingInterval', val);

		this.transactionReceiptPollingInterval = val;
		this.transactionConfirmationPollingInterval = val;
	}
	/**
	 * Used over HTTP connections. This option defines the number of seconds Web3 will wait for a receipt which confirms that a transaction was mined by the network. Note: If this method times out, the transaction may still be pending.
	 * Default is `750` seconds (12.5 minutes).
	 */
	public get transactionPollingTimeout() {
		return this.config.transactionPollingTimeout;
	}

	/**
	 * Will set the transactionPollingTimeout. Throws an {@link InvalidMethodParamsError} for a
	 * value that is not a positive number.
	 */
	public set transactionPollingTimeout(val) {
		this._setConfigValue('transactionPollingTimeout', val);
	}

	/**
	 * The `transactionPollingInterval` is used over HTTP connections. This option defines the number of seconds between Web3 calls for a receipt which confirms that a transaction was mined by the network.
	 * Default is `undefined`
	 */
	public get transactionReceiptPollingInterval() {
		return this.config.transactionReceiptPollingInterval;
	}

	/**
	 * Will set the transactionReceiptPollingInterval. Throws an {@link InvalidMethodParamsError}
	 * for a value that is neither `undefined` nor a positive number.
	 */
	public set transactionReceiptPollingInterval(val) {
		this._setConfigValue('transactionReceiptPollingInterval', val);
	}

	public get transactionConfirmationPollingInterval() {
		return this.config.transactionConfirmationPollingInterval;
	}

	/**
	 * Will set the transactionConfirmationPollingInterval. Throws an
	 * {@link InvalidMethodParamsError} for a value that is neither `undefined` nor a positive
	 * number.
	 */
	public set transactionConfirmationPollingInterval(val) {
		this._setConfigValue('transactionConfirmationPollingInterval', val);
	}

	/**
	 * The blockHeaderTimeout is used over socket-based connections. This option defines the amount seconds it should wait for `'newBlockHeaders'` event before falling back to polling to fetch transaction receipt.
	 * Default is `10` seconds.
	 */
	public get blockHeaderTimeout() {
		return this.config.blockHeaderTimeout;
	}

	/**
	 * Will set the blockHeaderTimeout. Throws an {@link InvalidMethodParamsError} for a value
	 * that is not a positive number.
	 */
	public set blockHeaderTimeout(val) {
		this._setConfigValue('blockHeaderTimeout', val);
	}

	/**
	 * The enableExperimentalFeatures is used to enable trying new experimental features that are still not fully implemented or not fully tested or still have some related issues.
	 * Default is `false` for every feature.
	 */
	public get enableExperimentalFeatures() {
		return this.config.enableExperimentalFeatures;
	}

	/**
	 * Will set the enableExperimentalFeatures. Throws an {@link InvalidMethodParamsError} for a
	 * value that is not an object of boolean flags.
	 */
	public set enableExperimentalFeatures(val) {
		this._setConfigValue('enableExperimentalFeatures', val);
	}

	public get maxListenersWarningThreshold() {
		return this.config.maxListenersWarningThreshold;
	}

	/**
	 * Will set the maxListenersWarningThreshold. Throws an {@link InvalidMethodParamsError} for
	 * a value that is not a non-negative integer, before any `CONFIG_CHANGE` is emitted (I-14).
	 */
	public set maxListenersWarningThreshold(val) {
		this._setConfigValue('maxListenersWarningThreshold', val);
		this.setMaxListenerWarningThreshold(val);
	}

	public get defaultNetworkId() {
		return this.config.defaultNetworkId;
	}

	/**
	 * Will set the defaultNetworkId. Throws an {@link InvalidMethodParamsError} for a value that
	 * is neither `undefined` nor a non-negative integer.
	 */
	public set defaultNetworkId(val) {
		this._setConfigValue('defaultNetworkId', val);
	}

	public get defaultChain() {
		return this.config.defaultChain;
	}

	/**
	 * Will set the defaultChain. Throws an {@link InvalidMethodParamsError} for a value that is
	 * not a non-empty string, and a {@link ConfigChainMismatchError} when it differs from
	 * `defaultCommon.baseChain`.
	 */
	public set defaultChain(val) {
		if (
			!isNullish(this.config.defaultCommon) &&
			!isNullish(this.config.defaultCommon.baseChain) &&
			val !== this.config.defaultCommon.baseChain
		)
			throw new ConfigChainMismatchError(this.config.defaultChain, val);

		this._setConfigValue('defaultChain', val);
	}

	/**
	 * Will return the default hardfork. Default is `zond`
	 * The default hardfork property can be one of the following:
	 * - 'zond'
	 *
	 */
	public get defaultHardfork() {
		return this.config.defaultHardfork;
	}

	/**
	 * Will set the default hardfork. Throws an {@link InvalidMethodParamsError} for a value that
	 * is not a non-empty string, and a {@link ConfigHardforkMismatchError} when it differs from
	 * `defaultCommon.hardfork`.
	 *
	 */
	public set defaultHardfork(val) {
		if (
			!isNullish(this.config.defaultCommon) &&
			!isNullish(this.config.defaultCommon.hardfork) &&
			val !== this.config.defaultCommon.hardfork
		)
			throw new ConfigHardforkMismatchError(this.config.defaultCommon.hardfork, val);

		this._setConfigValue('defaultHardfork', val);
	}

	/**
	 *
	 * Will get the default common property
	 * The default common property does contain the following Common object:
	 * - `customChain` - `Object`: The custom chain properties
	 * 	- `name` - `string`: (optional) The name of the chain
	 * 	- `networkId` - `number`: Network ID of the custom chain
	 * 	- `chainId` - `number`: Chain ID of the custom chain
	 * - `baseChain` - `string`: (optional) mainnet
	 * - `hardfork` - `string`: (optional) zond
	 * Default is `undefined`.
	 *
	 */
	public get defaultCommon() {
		return this.config.defaultCommon;
	}

	/**
	 * Will set the default common property. Throws an {@link InvalidMethodParamsError} for a
	 * value that is neither `undefined` nor an object with a `customChain`, and a
	 * {@link ConfigHardforkMismatchError} / {@link ConfigChainMismatchError} when its
	 * `hardfork` / `baseChain` differ from `defaultHardfork` / `defaultChain`.
	 *
	 */
	public set defaultCommon(val: Common | undefined) {
		// validation check if default hardfork is set and matches defaultCommon hardfork
		if (
			!isNullish(this.config.defaultHardfork) &&
			!isNullish(val) &&
			!isNullish(val.hardfork) &&
			this.config.defaultHardfork !== val.hardfork
		)
			throw new ConfigHardforkMismatchError(this.config.defaultHardfork, val.hardfork);
		if (
			!isNullish(this.config.defaultChain) &&
			!isNullish(val) &&
			!isNullish(val.baseChain) &&
			this.config.defaultChain !== val.baseChain
		)
			throw new ConfigChainMismatchError(this.config.defaultChain, val.baseChain);

		this._setConfigValue('defaultCommon', val);
	}

	public get defaultTransactionType() {
		return this.config.defaultTransactionType;
	}

	/**
	 * Will set the defaultTransactionType. Throws an {@link InvalidMethodParamsError} for a
	 * value that is not a non-negative integer.
	 */
	public set defaultTransactionType(val) {
		this._setConfigValue('defaultTransactionType', val);
	}

	public get defaultMaxPriorityFeePerGas() {
		return this.config.defaultMaxPriorityFeePerGas;
	}

	/**
	 * Will set the defaultMaxPriorityFeePerGas. Throws an {@link InvalidMethodParamsError} for
	 * a value that is not a non-negative integer.
	 */
	public set defaultMaxPriorityFeePerGas(val) {
		this._setConfigValue('defaultMaxPriorityFeePerGas', val);
	}

	public get transactionBuilder() {
		return this.config.transactionBuilder;
	}

	/**
	 * Will set the transactionBuilder. Throws an {@link InvalidMethodParamsError} for a value
	 * that is neither `undefined` nor a function.
	 */
	public set transactionBuilder(val) {
		this._setConfigValue('transactionBuilder', val);
	}

	public get transactionTypeParser() {
		return this.config.transactionTypeParser;
	}

	/**
	 * Will set the transactionTypeParser. Throws an {@link InvalidMethodParamsError} for a
	 * value that is neither `undefined` nor a function.
	 */
	public set transactionTypeParser(val) {
		this._setConfigValue('transactionTypeParser', val);
	}

	/**
	 * Validates, announces and stores one option, in that order: an invalid value is rejected
	 * before any `CONFIG_CHANGE` reaches a child context (I-14).
	 */
	private _setConfigValue<K extends keyof Web3ConfigOptions>(
		key: K,
		value: Web3ConfigOptions[K],
	) {
		Web3Config._assertValidConfigValue(key, value);
		this._triggerConfigChange(key, value);
		this.config[key] = value;
	}

	private static _assertValidConfigValue(key: keyof Web3ConfigOptions, value: unknown): void {
		const rule = CONFIG_RULES[key];
		if (!rule.test(value)) {
			throw new InvalidMethodParamsError(
				`Invalid value for the "${key}" configuration option: expected ${
					rule.expected
				}, got ${describeValue(value)}`,
			);
		}
	}

	private _triggerConfigChange<K extends keyof Web3ConfigOptions>(
		config: K,
		newValue: Web3ConfigOptions[K],
	) {
		this.emit(Web3ConfigEvent.CONFIG_CHANGE, {
			name: config,
			oldValue: this.config[config],
			newValue,
		} as ConfigEvent<Web3ConfigOptions>);
	}
}
