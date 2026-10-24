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
	createInvalidResponseError,
	Web3Context,
	Web3EventEmitter,
	Web3PromiEvent,
	Web3ConfigEvent,
	Web3SubscriptionManager,
} from '@theqrl/web3-core';
import {
	ContractExecutionError,
	ContractMissingABIError,
	ContractTransactionDataAndInputError,
	InvalidAddressError,
	NoContractAddressFoundError,
	SubscriptionError,
	Web3ContractError,
} from '@theqrl/web3-errors';
import {
	createAccessList,
	call,
	estimateGas,
	getLogs,
	NewHeadsSubscription,
	sendTransaction,
	SendTransactionEvents,
	isTransactionStatusSuccessful,
} from '@theqrl/web3-qrl';
import {
	encodeEventSignature,
	encodeFunctionSignature,
	encodeParameter,
	decodeContractErrorData,
	isAbiErrorFragment,
	isAbiEventFragment,
	isAbiFunctionFragment,
	jsonInterfaceMethodToString,
} from '@theqrl/web3-qrl-abi';
import {
	AbiConstructorFragment,
	AbiErrorFragment,
	AbiEventFragment,
	AbiFragment,
	AbiFunctionFragment,
	AbiParameter,
	ContractAbi,
	ContractConstructorArgs,
	ContractEvent,
	ContractEvents,
	ContractMethod,
	ContractMethodInputParameters,
	ContractMethodOutputParameters,
	Address,
	BlockNumberOrTag,
	BlockTags,
	Bytes,
	QRLExecutionAPI,
	Filter,
	FilterAbis,
	HexString,
	LogsInput,
	Mutable,
	ContractInitOptions,
	NonPayableCallOptions,
	PayableCallOptions,
	DataFormat,
	DEFAULT_RETURN_FORMAT,
	QRL_DATA_FORMAT,
	SupportedProviders,
	Web3ValidationErrorObject,
} from '@theqrl/web3-types';
import { format, isDataFormat, rightPad, toChecksumAddress } from '@theqrl/web3-utils';
import {
	isAddressString,
	isNullish,
	validator,
	utils as validatorUtils,
	ValidationSchemaInput,
	Web3ValidatorError,
} from '@theqrl/web3-validator';
import { ALL_EVENTS, ALL_EVENTS_ABI, TOPIC_HEX_LENGTH } from './constants.js';
import {
	decodeEventABI,
	decodeMethodReturn,
	encodeEventABI,
	encodeIndexedTopic,
	encodeMethodABI,
	isIndexedHashType,
	isOrList,
} from './encoding.js';
import { LogsSubscription } from './log_subscription.js';
import {
	ContractAbiWithSignature,
	ContractEventOptions,
	ContractOptions,
	EventLog,
	NonPayableMethodObject,
	NonPayableTxOptions,
	PayableMethodObject,
	PayableTxOptions,
	Web3ContractContext,
} from './types.js';
import {
	assertDataInputFill,
	DataInputFill,
	getCreateAccessListParams,
	getEstimateGasParams,
	getQRLTxCallParams,
	getSendTxParams,
	isContractInitOptions,
	isExactAbiValue,
	isLogOf,
	isWeb3ContractContext,
} from './utils.js';

type ContractBoundMethod<
	Abi extends AbiFunctionFragment,
	Method extends ContractMethod<Abi> = ContractMethod<Abi>,
> = (
	...args: Method['Inputs']
) => Method['Abi']['stateMutability'] extends 'payable' | 'pure'
	? PayableMethodObject<Method['Inputs'], Method['Outputs']>
	: NonPayableMethodObject<Method['Inputs'], Method['Outputs']>;

export type ContractOverloadedMethodInputs<AbiArr extends ReadonlyArray<unknown>> = NonNullable<
	AbiArr extends readonly []
		? undefined
		: AbiArr extends readonly [infer A, ...infer R]
			? A extends AbiFunctionFragment
				? ContractMethodInputParameters<A['inputs']> | ContractOverloadedMethodInputs<R>
				: undefined
			: undefined
>;

export type ContractOverloadedMethodOutputs<AbiArr extends ReadonlyArray<unknown>> = NonNullable<
	AbiArr extends readonly []
		? undefined
		: AbiArr extends readonly [infer A, ...infer R]
			? A extends AbiFunctionFragment
				? ContractMethodOutputParameters<A['outputs']> | ContractOverloadedMethodOutputs<R>
				: undefined
			: undefined
>;

/**
 * The type of `contract.methods['f(uint256)']` and `contract.methods['0x…']`: the signature and
 * selector keys take the inputs of whichever overload they name, which the type system cannot
 * know, so they accept any argument list (`ContractBoundMethod<any>` used to accept none, which
 * made the documented overload keys unusable from TypeScript, H-4).
 */

export type ContractBoundMethodBySignature = (
	...args: any[]
) => PayableMethodObject<any, any> | NonPayableMethodObject<any, any>;

// To avoid circular dependency between types and encoding, declared these types here.
export type ContractMethodsInterface<Abi extends ContractAbi> = {
	[MethodAbi in FilterAbis<
		Abi,
		AbiFunctionFragment & { type: 'function' }
	> as MethodAbi['name']]: ContractBoundMethod<MethodAbi>;
	// To allow users to use method signatures
} & { [key: string]: ContractBoundMethodBySignature };

/**
 * The event object can be accessed from `myContract.events.myEvent`.
 *
 * \> Remember: To subscribe to an event, your provider must have support for subscriptions.
 *
 * ```ts
 * const subscription = await myContract.events.MyEvent([options])
 * ```
 *
 * @param options - The options used to subscribe for the event
 * @returns - A Promise resolved with {@link LogsSubscription} object
 */
export type ContractBoundEvent = (options?: ContractEventOptions) => LogsSubscription;

// To avoid circular dependency between types and encoding, declared these types here.
export type ContractEventsInterface<
	Abi extends ContractAbi,
	Events extends ContractEvents<Abi> = ContractEvents<Abi>,
> = {
	[Name in keyof Events | 'allEvents']: ContractBoundEvent;
} & {
	[key: string]: ContractBoundEvent;
};

/**
 * The keys {@link Contract.getPastEvents} accepts for an event: its name (for an overloaded
 * event the first overload of that name), its canonical signature such as
 * `Transfer(address,uint256)` or its signature hash (the keys of `contract.events`), or
 * `allEvents` (P4-L-26).
 */
export type ContractEventKey<Abi extends ContractAbi> =
	| keyof ContractEvents<Abi>
	| 'allEvents'
	| `${string}(${string})`
	| `0x${string}`;

// To avoid circular dependency between types and encoding, declared these types here.
export type ContractEventEmitterInterface<Abi extends ContractAbi> = {
	[EventAbi in FilterAbis<
		Abi,
		AbiFunctionFragment & { type: 'event' }
	> as EventAbi['name']]: ContractEvent<EventAbi>['Inputs'];
};

type EventParameters = Parameters<typeof encodeEventABI>[2];

type ContextConfigListener = Parameters<Web3Context['on']>[1];

const contractSubscriptions = {
	logs: LogsSubscription,
	newHeads: NewHeadsSubscription,
	newBlockHeaders: NewHeadsSubscription,
};

/**
 * A name under which no method or event is published on `contract.methods` /
 * `contract.events`: a `then` member would make the maps thenables, so `await contract.methods`
 * (or returning `contract.events` from an async function) would call into the ABI (L-64).
 * Such a function or event stays reachable through its signature and selector keys.
 */
const RESERVED_INTERFACE_KEYS = new Set(['then']);

/** The `provider` member of an argument, when the argument is an object that has one. */
const providerOf = (arg: unknown): SupportedProviders<QRLExecutionAPI> | string | undefined =>
	typeof arg === 'object' && !isNullish(arg) && 'provider' in arg
		? (arg as { provider?: SupportedProviders<QRLExecutionAPI> | string }).provider
		: undefined;

/**
 * A private copy of the ABI parameters, so that a caller mutating the array it handed to the
 * constructor cannot change what the contract encodes later (I-13).
 */
const cloneAbiParameters = (
	parameters: ReadonlyArray<AbiParameter> | undefined,
): ReadonlyArray<AbiParameter> | undefined => {
	// Anything that is not an array is left to the ABI layer to reject.
	if (isNullish(parameters) || !Array.isArray(parameters as unknown)) {
		return parameters;
	}
	return parameters.map(parameter => {
		if (typeof parameter !== 'object' || isNullish(parameter)) {
			return parameter;
		}
		return isNullish(parameter.components)
			? { ...parameter }
			: { ...parameter, components: cloneAbiParameters(parameter.components) };
	});
};

const inputCount = (abi: AbiFunctionFragment): number => (abi.inputs ?? []).length;

/** The return data of `qrl_call`: a `0x`-prefixed hex string, possibly empty (P4-L-30). */
const HEX_RETURN_DATA = /^0x[0-9a-f]*$/i;

type EventAbiWithSignature = AbiEventFragment & { signature: string };

/**
 * The class designed to interact with smart contracts on the QRL blockchain.
 */
export class Contract<Abi extends ContractAbi>
	extends Web3Context<QRLExecutionAPI, typeof contractSubscriptions>
	implements Web3EventEmitter<ContractEventEmitterInterface<Abi>>
{
	/**
	 * The options `object` for the contract instance. `from`, `gas`, `maxFeePerGas` and `maxPriorityFeePerGas` are used as fallback values when sending transactions.
	 *
	 * ```ts
	 * myContract.options;
	 * > {
	 *     address: 'Q5562344B82A426FBA86EA4C35c048c71bB17bb46f68309aabFb8A4Cd79052ec10B88738Df7fd204Ce37A9f18Bd9cbdbE0a0F3b2a1dDF26F793008eFE331A2A88',
	 *     jsonInterface: [...],
	 *     from: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
	 *     maxFeePerGas: '10000000000000',
	 * 	   maxPriorityFeePerGas: '0',
	 *     gas: 1000000
	 * }
	 *
	 * myContract.options.from = 'Q5562344B82A426FBA86EA4C35c048c71bB17bb46f68309aabFb8A4Cd79052ec10B88738Df7fd204Ce37A9f18Bd9cbdbE0a0F3b2a1dDF26F793008eFE331A2A88'; // default from address
	 * myContract.options.maxFeePerGas = '20000000000000'; // default max fee per gas in planck
	 * myContract.options.maxPriorityFeePerGas = '0'; // default max priority fee per gas in planck
	 * myContract.options.gas = 5000000; // provide as fallback always 5M gas
	 * ```
	 */

	public readonly options: ContractOptions;

	/**
	 * Set to true if you want contracts' defaults to sync with global defaults.
	 */
	public syncWithContext = false;

	private _errorsInterface!: AbiErrorFragment[];
	private _jsonInterface!: ContractAbiWithSignature;
	private _address?: Address;
	private _functions: Record<
		string,
		{
			signature: string;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			method: ContractBoundMethod<any>;
		}
	> = {};
	private readonly _overloadedMethodAbis: Map<string, AbiFunctionFragment[]>;
	private _methods!: ContractMethodsInterface<Abi>;
	private _events!: ContractEventsInterface<Abi>;
	/**
	 * The `dataInputFill` constructor option: where the calldata of a call or transaction is
	 * placed (`data`, `input` or `both`). When absent, the context's `contractDataInputFill`
	 * config applies; a config value of `both` always wins.
	 */
	private readonly _dataInputFillOption?: DataInputFill;

	private context?: Web3Context;
	/** The `CONFIG_CHANGE` listener registered on {@link context} while `syncWithContext` is on. */
	private _contextConfigListener?: ContextConfigListener;

	/**
	 * Creates a new contract instance with all its methods and events defined in its {@doclink glossary/json_interface | json interface} object.
	 *
	 * ```ts
	 * new web3.qrl.Contract(jsonInterface[, address][, options])
	 * ```
	 *
	 * @param jsonInterface - The JSON interface for the contract to instantiate. It must be an array of ABI fragment objects; a copy of it is kept.
	 * @param address - The address of the smart contract to call. A mixed-case address must carry a valid checksum (an `InvalidAddressError` is thrown otherwise); `null`, `undefined` and `''` mean "no address yet".
	 * @param options - The options of the contract. Some are used as fallbacks for calls and transactions. `dataInputFill` must be `'data'`, `'input'` or `'both'`. `address` may be given here instead of the positional argument (the positional address wins).
	 * @param context - The context of the contract used for customizing the behavior of the contract: a `Web3Context` instance or its `getContextObject()`. The contract then shares the request manager, subscription manager, wallet and config of that context. An empty object is not a context.
	 * @returns - The contract instance with all its methods and events.
	 *
	 * ```ts title="Example"
	 * var myContract = new web3.qrl.Contract([...], 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40', {
	 *   from: 'Q5562344B82A426FBA86EA4C35c048c71bB17bb46f68309aabFb8A4Cd79052ec10B88738Df7fd204Ce37A9f18Bd9cbdbE0a0F3b2a1dDF26F793008eFE331A2A88', // default from address
	 *   maxFeePerGas: '20000000000' // default max fee per gas in planck, 20 shor in this case
	 * });
	 * ```
	 *
	 * To use the type safe interface for these contracts you have to include the ABI definitions in your Typescript project and then declare these as `const`.
	 *
	 * ```ts title="Example"
	 * const myContractAbi = [....] as const; // ABI definitions
	 * const myContract = new web3.qrl.Contract(myContractAbi, 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40');
	 * ```
	 */
	public constructor(
		jsonInterface: Abi,
		context?: Web3ContractContext | Web3Context,
		returnFormat?: DataFormat,
	);
	public constructor(
		jsonInterface: Abi,
		address?: Address,
		contextOrReturnFormat?: Web3ContractContext | Web3Context | DataFormat,
		returnFormat?: DataFormat,
	);
	public constructor(
		jsonInterface: Abi,
		options?: ContractInitOptions,
		contextOrReturnFormat?: Web3ContractContext | Web3Context | DataFormat,
		returnFormat?: DataFormat,
	);
	public constructor(
		jsonInterface: Abi,
		address: Address | undefined,
		options: ContractInitOptions,
		contextOrReturnFormat?: Web3ContractContext | Web3Context | DataFormat,
		returnFormat?: DataFormat,
	);
	public constructor(
		jsonInterface: Abi,
		addressOrOptionsOrContext?:
			| Address
			| ContractInitOptions
			| Web3ContractContext
			| Web3Context,
		optionsOrContextOrReturnFormat?:
			| ContractInitOptions
			| Web3ContractContext
			| Web3Context
			| DataFormat,
		contextOrReturnFormat?: Web3ContractContext | Web3Context | DataFormat,
		returnFormat?: DataFormat,
	) {
		const options = isContractInitOptions(addressOrOptionsOrContext)
			? addressOrOptionsOrContext
			: isContractInitOptions(optionsOrContextOrReturnFormat)
				? optionsOrContextOrReturnFormat
				: undefined;

		// Only an object that carries a context key is a context: an empty object (what
		// `new web3.qrl.Contract(abi, address)` used to pass as the options) must not hide the
		// real context given after it (M-6).
		let contractContext: Web3ContractContext | Web3Context | undefined;
		if (isWeb3ContractContext(addressOrOptionsOrContext)) {
			contractContext = addressOrOptionsOrContext;
		} else if (isWeb3ContractContext(optionsOrContextOrReturnFormat)) {
			contractContext = optionsOrContextOrReturnFormat;
		} else if (isWeb3ContractContext(contextOrReturnFormat)) {
			contractContext = contextOrReturnFormat;
		}
		// A `Web3Context` instance shares its request manager, subscription manager, wallet
		// and config through its context object; spreading the instance itself would only
		// copy its private fields.
		const contextObject =
			contractContext instanceof Web3Context
				? contractContext.getContextObject()
				: contractContext;

		const provider =
			providerOf(addressOrOptionsOrContext) ??
			providerOf(optionsOrContextOrReturnFormat) ??
			providerOf(contextOrReturnFormat) ??
			Contract.givenProvider;

		super({
			...contextObject,
			provider,
			// An explicit override gets its own managers; changing it must not repoint the
			// parent's provider. Keep the inherited wallet and configuration.
			...(options?.provider === undefined
				? {}
				: {
						provider: options.provider,
						requestManager: undefined,
						subscriptionManager: undefined,
					}),
			registeredSubscriptions: contractSubscriptions,
		});
		if (
			!isNullish(options) &&
			!isNullish(options.data) &&
			!isNullish(options.input) &&
			this.config.contractDataInputFill !== 'both'
		)
			throw new ContractTransactionDataAndInputError({
				data: options.data as HexString,
				input: options.input as HexString,
			});
		this._overloadedMethodAbis = new Map<string, AbiFunctionFragment[]>();

		const returnDataFormat = isDataFormat(contextOrReturnFormat)
			? contextOrReturnFormat
			: isDataFormat(optionsOrContextOrReturnFormat)
				? optionsOrContextOrReturnFormat
				: (returnFormat ?? DEFAULT_RETURN_FORMAT);

		// `address` is also accepted as an init option (`new Contract(abi, {address, from})`); a
		// positional address wins. The option used to be a recognised key that was then
		// ignored, which left the contract without an address (P4-L-28).
		const optionsAddress = (
			options as (ContractInitOptions & { address?: Address }) | undefined
		)?.address;
		const address =
			typeof addressOrOptionsOrContext === 'string'
				? addressOrOptionsOrContext
				: optionsAddress;

		this._dataInputFillOption = assertDataInputFill(options?.dataInputFill);
		this._parseAndSetJsonInterface(jsonInterface, returnDataFormat);

		if (!isNullish(address)) {
			this._parseAndSetAddress(address, returnDataFormat);
		}

		this.options = {
			address,
			jsonInterface: this._jsonInterface,
			gas: options?.gas ?? options?.gasLimit,
			maxFeePerGas: options?.maxFeePerGas,
			maxPriorityFeePerGas: options?.maxPriorityFeePerGas,
			from: options?.from,
			input: options?.input,
			data: options?.data,
		};

		this.syncWithContext = options?.syncWithContext ?? false;
		if (contractContext instanceof Web3Context) {
			this.subscribeToContextEvents(contractContext);
		}
		Object.defineProperty(this.options, 'address', {
			set: (value: Address) => this._parseAndSetAddress(value, returnDataFormat),
			get: () => this._address,
		});

		Object.defineProperty(this.options, 'jsonInterface', {
			set: (value: ContractAbi) => this._parseAndSetJsonInterface(value, returnDataFormat),
			get: () => this._jsonInterface,
		});
	}

	/**
	 * Subscribe to an event.
	 *
	 * ```ts
	 * await myContract.events.MyEvent([options])
	 * ```
	 *
	 * There is a special event `allEvents` that can be used to subscribe all events.
	 *
	 * ```ts
	 * await myContract.events.allEvents([options])
	 * ```
	 *
	 * The subscription request (and, with `fromBlock`, the replay of past events) is started on
	 * the next microtask, so listeners attached right after the call are in place before anything
	 * is emitted. A failure to subscribe or to replay past events is reported on the
	 * subscription's `error` event when it has a listener, and always through the promise
	 * `subscription.subscribed`, which otherwise resolves with the subscription id. Nothing is
	 * thrown into the process when no `error` listener is attached.
	 *
	 * @returns - When individual event is accessed will returns {@link ContractBoundEvent} object
	 */
	public get events() {
		return this._events;
	}

	/**
	 * Creates a transaction object for that method, which then can be `called`, `send`, `estimated`, `createAccessList` , or `ABI encoded`.
	 *
	 * The methods of this smart contract are available through:
	 *
	 * The name: `myContract.methods.myMethod(123)`
	 * The name with parameters: `myContract.methods['myMethod(uint256)'](123)`
	 * The signature `myContract.methods['0x58cf5f10'](123)`
	 *
	 * This allows calling functions with same name but different parameters from the JavaScript contract object.
	 *
	 * The signature and selector keys always encode exactly that overload: the arguments are
	 * validated against its inputs and nothing else is considered. The name key resolves
	 * overloads from the arguments: among the overloads with the same number of inputs, the
	 * ones whose validation passes are kept; when more than one remains, the overload whose
	 * inputs are all exact matches for the JavaScript values (an address string for `address`,
	 * a boolean for `bool`, a hex string of the right length for `bytesN`, a number, bigint or
	 * decimal string for `intN`/`uintN`, and so on) is chosen. When the arguments still fit
	 * more than one overload (for example `f(uint256)` and `f(int256)` given `7`) a
	 * `Web3ContractError` is thrown instead of guessing: use the signature key. Passing more
	 * arguments than any overload takes throws a `Web3ValidatorError`.
	 *
	 * \> The method signature does not provide a type safe interface, so we recommend to use method `name` instead.
	 *
	 * ```ts
	 * // calling a method
	 * const result = await myContract.methods.myMethod(123).call({from: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40'});
	 *
	 * // or sending and using a promise
	 * const receipt = await myContract.methods.myMethod(123).send({from: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40'});
	 *
	 * // or sending and using the events
	 * const sendObject = myContract.methods.myMethod(123).send({from: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40'});
	 * sendObject.on('transactionHash', function(hash){
	 *   ...
	 * });
	 * sendObject.on('receipt', function(receipt){
	 *   ...
	 * });
	 * sendObject.on('confirmation', function(confirmationNumber, receipt){
	 *   ...
	 * });
	 * sendObject.on('error', function(error, receipt) {
	 *   ...
	 * });
	 * ```
	 *
	 * @returns - Either returns {@link PayableMethodObject} or {@link NonPayableMethodObject} based on the definitions of the {@doclink glossary/json_interface | json interface} of that contract.
	 */
	public get methods() {
		return this._methods;
	}

	/**
	 * Clones the current contract instance. This doesn't deploy contract on blockchain and only creates a local clone.
	 *
	 * The clone shares the request manager, subscription manager and wallet of this contract.
	 * When this contract syncs its config with a context (`syncWithContext`), so does the
	 * clone; call {@link Contract.dispose} on a clone you no longer use.
	 *
	 * @returns - The new contract instance.
	 *
	 * ```ts
	 * const contract1 = new qrl.Contract(abi, address, {maxFeePerGas: '12345678', maxPriorityFeePerGas: '0', from: fromAddress});
	 *
	 * const contract2 = contract1.clone();
	 * contract2.options.address = address2;
	 *
	 * (contract1.options.address !== contract2.options.address);
	 * > true
	 * ```
	 */
	public clone() {
		let newContract: Contract<Abi>;
		if (this.options.address) {
			newContract = new Contract<Abi>(
				[...this._jsonInterface, ...this._errorsInterface] as unknown as Abi,
				this.options.address,
				{
					gas: this.options.gas,
					maxFeePerGas: this.options.maxFeePerGas,
					maxPriorityFeePerGas: this.options.maxPriorityFeePerGas,
					from: this.options.from,
					input: this.options.input,
					data: this.options.data,
					syncWithContext: this.syncWithContext,
					dataInputFill: this._dataInputFillOption,
				},
				this.getContextObject(),
			);
		} else {
			newContract = new Contract<Abi>(
				[...this._jsonInterface, ...this._errorsInterface] as unknown as Abi,
				{
					gas: this.options.gas,
					maxFeePerGas: this.options.maxFeePerGas,
					maxPriorityFeePerGas: this.options.maxPriorityFeePerGas,
					from: this.options.from,
					input: this.options.input,
					data: this.options.data,
					syncWithContext: this.syncWithContext,
					dataInputFill: this._dataInputFillOption,
				},
				this.getContextObject(),
			);
		}
		if (this.context) newContract.subscribeToContextEvents(this.context);

		return newContract;
	}

	/**
	 * Detaches the contract from the context it was created from: the `CONFIG_CHANGE` listener
	 * that `syncWithContext` registered on that context is removed, so a contract (or a clone)
	 * that is no longer used does not keep receiving config updates nor keep the context's
	 * listener list growing (L-37). The contract itself stays usable; its config simply stops
	 * following the context.
	 */
	public dispose(): void {
		this._detachFromContext();
		this.context = undefined;
		// `Web3Context` may carry its own cleanup; run it when it exists.
		const parent = Object.getPrototypeOf(Contract.prototype) as { dispose?: () => void };
		if (typeof parent.dispose === 'function') {
			parent.dispose.call(this);
		}
	}

	/**
	 * Call this function to deploy the contract to the blockchain. After successful deployment the promise will resolve with a new contract instance.
	 *
	 * ```ts
	 * myContract.deploy({
	 *   input: '0x12345...', // data keyword can be used, too. If input is used, data will be ignored.
	 *   arguments: [123, 'My String']
	 * })
	 * .send({
	 *   from: 'Q5562344B82A426FBA86EA4C35c048c71bB17bb46f68309aabFb8A4Cd79052ec10B88738Df7fd204Ce37A9f18Bd9cbdbE0a0F3b2a1dDF26F793008eFE331A2A88',
	 *   gas: 1500000,
	 *   maxFeePerGas: '30000000000000',
	 *   maxPriorityFeePerGas: '0'
	 * }, function(error, transactionHash){ ... })
	 * .on('error', function(error){ ... })
	 * .on('transactionHash', function(transactionHash){ ... })
	 * .on('receipt', function(receipt){
	 *  console.log(receipt.contractAddress) // contains the new contract address
	 * })
	 * .on('confirmation', function(confirmationNumber, receipt){ ... })
	 * .then(function(newContractInstance){
	 *   console.log(newContractInstance.options.address) // instance with the new contract address
	 * });
	 *
	 *
	 * // When the data is already set as an option to the contract itself
	 * myContract.options.data = '0x12345...';
	 *
	 * myContract.deploy({
	 *   arguments: [123, 'My String']
	 * })
	 * .send({
	 *   from: 'Q5562344B82A426FBA86EA4C35c048c71bB17bb46f68309aabFb8A4Cd79052ec10B88738Df7fd204Ce37A9f18Bd9cbdbE0a0F3b2a1dDF26F793008eFE331A2A88',
	 *   gas: 1500000,
	 *   maxFeePerGas: '30000000000000',
	 *   maxPriorityFeePerGas: '0',
	 * })
	 * .then(function(newContractInstance){
	 *   console.log(newContractInstance.options.address) // instance with the new contract address
	 * });
	 *
	 *
	 * // Simply encoding
	 * myContract.deploy({
	 *   input: '0x12345...',
	 *   arguments: [123, 'My String']
	 * })
	 * .encodeABI();
	 * > '0x12345...0000012345678765432'
	 *
	 *
	 * // Gas estimation
	 * myContract.deploy({
	 *   input: '0x12345...',
	 *   arguments: [123, 'My String']
	 * })
	 * .estimateGas(function(err, gas){
	 *   console.log(gas);
	 * });
	 * ```
	 *
	 * The bytecode is taken from `input`, else from `data`, else from the contract's
	 * `options.input` / `options.data`; a bytecode given here never combines with one set on the
	 * contract, so `send()`, `estimateGas()` and `encodeABI()` use the same bytes (P4-L-27).
	 *
	 * The promise returned by `send()` rejects with a `Web3ContractError` when the receipt
	 * reports a failed creation and with a `NoContractAddressFoundError` when a successful
	 * receipt carries no `contractAddress`.
	 *
	 * @returns - The transaction object
	 */
	public deploy(deployOptions?: {
		/**
		 * The byte code of the contract.
		 */
		data?: HexString;
		input?: HexString;
		/**
		 * The arguments which get passed to the constructor on deployment.
		 */
		arguments?: ContractConstructorArgs<Abi>;
	}) {
		let abi = this._jsonInterface.find(j => j.type === 'constructor') as AbiConstructorFragment;
		if (!abi) {
			abi = {
				type: 'constructor',
				inputs: [],
				stateMutability: '',
			} as AbiConstructorFragment;
		}

		// The bytecode comes from exactly one place: `deployOptions.input`, else
		// `deployOptions.data`, else the contract's `options.input` / `options.data`. An
		// explicit `input` used to be combined with `options.data` (and vice versa), so
		// `encodeABI()` used one while `send()` and `estimateGas()` rejected the pair with a
		// `TransactionDataAndInputError` (P4-L-27).
		let inputSource: Bytes | undefined;
		let dataSource: Bytes | undefined;
		if (!isNullish(deployOptions?.input)) {
			inputSource = deployOptions?.input;
		} else if (!isNullish(deployOptions?.data)) {
			dataSource = deployOptions?.data;
		} else {
			inputSource = this.options.input;
			dataSource = this.options.data;
		}
		const _input = format({ format: 'bytes' }, inputSource, DEFAULT_RETURN_FORMAT);
		const _data = format({ format: 'bytes' }, dataSource, DEFAULT_RETURN_FORMAT);

		if ((!_input || _input.trim() === '0x') && (!_data || _data.trim() === '0x')) {
			throw new Web3ContractError('contract creation without any data provided.');
		}

		const args = deployOptions?.arguments ?? [];

		const contractOptions: ContractOptions = { ...this.options, input: _input, data: _data };
		const deployData = _input ?? _data;
		return {
			arguments: args,
			send: (
				options?: PayableTxOptions,
			): Web3PromiEvent<
				Contract<Abi>,
				SendTransactionEvents<typeof DEFAULT_RETURN_FORMAT>
			> => {
				const modifiedOptions = { ...options };

				return this._contractMethodDeploySend(
					abi as AbiFunctionFragment,
					args as unknown[],
					modifiedOptions,
					contractOptions,
				);
			},
			estimateGas: async <ReturnFormat extends DataFormat = typeof DEFAULT_RETURN_FORMAT>(
				options?: PayableCallOptions,
				returnFormat: ReturnFormat = DEFAULT_RETURN_FORMAT as ReturnFormat,
			) => {
				const modifiedOptions = { ...options };
				return this._contractMethodEstimateGas({
					abi: abi as AbiFunctionFragment,
					params: args as unknown[],
					returnFormat,
					options: modifiedOptions,
					contractOptions,
				});
			},
			encodeABI: () =>
				encodeMethodABI(
					abi as AbiFunctionFragment,
					args as unknown[],
					format({ format: 'bytes' }, deployData as Bytes, DEFAULT_RETURN_FORMAT),
				),
		};
	}

	/**
	 * Gets past events for this contract.
	 *
	 * ```ts
	 * const events = await myContract.getPastEvents('MyEvent', {
	 *   filter: {myIndexedParam: [20,23], myOtherIndexedParam: '0x123456789...'}, // Using an array means OR: e.g. 20 or 23
	 *   fromBlock: 0,
	 *   toBlock: 'latest'
	 * });
	 *
	 * > [{
	 *   returnValues: {
	 *       myIndexedParam: 20,
	 *       myOtherIndexedParam: '0x123456789...',
	 *       myNonIndexParam: 'My String'
	 *   },
	 *   raw: {
	 *       data: '0x7f9fade1c0d57a7af66ab4ead79fade1c0d57a7af66ab4ead7c2c2eb7b11a91385',
	 *       topics: ['0xfd43ade1c09fade1c0d57a7af66ab4ead7c2c2eb7b11a91ffdd57a7af66ab4ea0000000000000000000000000000000000000000000000000000000000000000', '0x7f9fade1c0d57a7af66ab4ead79fade1c0d57a7af66ab4ead7c2c2eb7b11a9130000000000000000000000000000000000000000000000000000000000000000']
	 *   },
	 *   event: 'MyEvent',
	 *   signature: '0xfd43ade1c09fade1c0d57a7af66ab4ead7c2c2eb7b11a91ffdd57a7af66ab4ea',
	 *   logIndex: 0,
	 *   transactionIndex: 0,
	 *   transactionHash: '0x7f9fade1c0d57a7af66ab4ead79fade1c0d57a7af66ab4ead7c2c2eb7b11a91385',
	 *   blockHash: '0xfd43ade1c09fade1c0d57a7af66ab4ead7c2c2eb7b11a91ffdd57a7af66ab4ead7',
	 *   blockNumber: 1234,
	 *   address: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40'
	 * },{
	 *   ...
	 * }]
	 * ```
	 *
	 * Logs the node returns for another address, or (when an event is named and no custom
	 * `topics` are given) with another signature topic, are dropped. The `filter` values are
	 * compared through the ABI type of the input, so `{value: 20}`, `{value: '20'}` and
	 * `{value: '0x14'}` match the same log, and a nullish filter value is a wildcard, as it is in
	 * the topics sent to the node; indexed `string`, `bytes`, `function`, array and tuple values
	 * are compared through their keccak256 topic. A log entry that is not an object, or a reply
	 * that is not an array, is reported with a `ResponseError`. The logs are fetched in the node's
	 * wire format and the decoded events are formatted with `returnFormat`, so
	 * `FMT_BYTES.UINT8ARRAY` is usable here (P4-L-29).
	 *
	 * @param eventName - The event to get: its name (for an overloaded event the first overload of that name, the one `contract.events.<name>` subscribes to), its canonical signature such as `Transfer(address,address,uint256,bytes)` or its signature hash (the other keys of `contract.events`), or `allEvents` to get all events.
	 * @param filter - The filter options used to get events.
	 * @param returnFormat - Return format
	 * @returns - An array with the past event `Objects`, matching the given event name and filter.
	 */
	public async getPastEvents<ReturnFormat extends DataFormat = typeof DEFAULT_RETURN_FORMAT>(
		returnFormat?: ReturnFormat,
	): Promise<(string | EventLog)[]>;
	public async getPastEvents<ReturnFormat extends DataFormat = typeof DEFAULT_RETURN_FORMAT>(
		eventName: ContractEventKey<Abi>,
		returnFormat?: ReturnFormat,
	): Promise<(string | EventLog)[]>;
	public async getPastEvents<ReturnFormat extends DataFormat = typeof DEFAULT_RETURN_FORMAT>(
		filter: Omit<Filter, 'address'>,
		returnFormat?: ReturnFormat,
	): Promise<(string | EventLog)[]>;
	public async getPastEvents<ReturnFormat extends DataFormat = typeof DEFAULT_RETURN_FORMAT>(
		eventName: ContractEventKey<Abi>,
		filter: Omit<Filter, 'address'>,
		returnFormat?: ReturnFormat,
	): Promise<(string | EventLog)[]>;
	public async getPastEvents<ReturnFormat extends DataFormat = typeof DEFAULT_RETURN_FORMAT>(
		param1?: ContractEventKey<Abi> | Omit<Filter, 'address'> | ReturnFormat,
		param2?: Omit<Filter, 'address'> | ReturnFormat,
		param3?: ReturnFormat,
	): Promise<(string | EventLog)[]> {
		const eventName: string = typeof param1 === 'string' ? param1 : 'allEvents';

		const options =
			typeof param1 !== 'string' && !isDataFormat(param1)
				? param1
				: !isDataFormat(param2)
					? param2
					: {};

		const returnFormat = isDataFormat(param1)
			? param1
			: isDataFormat(param2)
				? param2
				: (param3 ?? DEFAULT_RETURN_FORMAT);

		const abi =
			eventName === 'allEvents' || eventName === ALL_EVENTS
				? ALL_EVENTS_ABI
				: this._findEventAbi(eventName);

		if (!abi) {
			throw new Web3ContractError(`Event ${String(eventName)} not found.`);
		}
		const eventOptions = (options && typeof options === 'object' ? options : {}) as Filter;
		return this._getPastEventsForAbi(abi, eventOptions, returnFormat);
	}

	/**
	 * The event fragment a `getPastEvents` key names: the event name (the first overload of that
	 * name, as `contract.events.<name>`), the canonical signature, or the signature hash as the
	 * 32-byte hash or the 64-byte topic (P4-L-26). Only event fragments qualify: a same-named
	 * function used to be picked (L-60).
	 */
	private _findEventAbi(key: string): EventAbiWithSignature | undefined {
		const events = this._jsonInterface.filter(isAbiEventFragment) as EventAbiWithSignature[];
		// The hash key is accepted in both spellings: the 32-byte keccak of the signature and the
		// 64-byte QRVM topic `encodeEventSignature` returns (the keccak right-padded with zeros).
		const hashKey = /^0x[0-9a-fA-F]{64}$/.test(key)
			? rightPad(key, TOPIC_HEX_LENGTH).toLowerCase()
			: key.toLowerCase();
		return (
			events.find(event => event.name === key) ??
			events.find(event => jsonInterfaceMethodToString(event) === key) ??
			events.find(
				event => rightPad(event.signature, TOPIC_HEX_LENGTH).toLowerCase() === hashKey,
			)
		);
	}

	/**
	 * Fetches and decodes the past logs of one event fragment. The backfill of
	 * `contract.events.<Event>({fromBlock})` uses it with the fragment the subscription is bound
	 * to, so that an overloaded event is replayed and streamed with the same fragment (P4-L-26).
	 */
	private async _getPastEventsForAbi(
		abi: EventAbiWithSignature,
		eventOptions: Filter,
		returnFormat: DataFormat,
		onDecodeError?: (error: Error) => void,
	): Promise<(string | EventLog)[]> {
		const { fromBlock, toBlock, topics, address } = encodeEventABI(
			this.options,
			abi,
			eventOptions,
		);
		// The logs are fetched in the wire format: `decodeEventABI` needs hex `data` and `topics`
		// and formats the decoded event with the caller's format itself (P4-L-29).
		const logs = await getLogs(this, { fromBlock, toBlock, topics, address }, QRL_DATA_FORMAT);
		if (!Array.isArray(logs)) {
			throw new Web3ContractError('qrl_getLogs did not return an array of logs');
		}

		// The node already filtered by address and signature; a log that does not match is
		// not this contract's event and must not be labelled as one (I-13).
		const expectedAddress = typeof address === 'string' ? address.toLowerCase() : undefined;
		const signatureTopic = rightPad(abi.signature, TOPIC_HEX_LENGTH).toLowerCase();
		const expectedTopic =
			abi.name === ALL_EVENTS ||
			abi.anonymous ||
			(Array.isArray(eventOptions.topics) &&
				topics?.[0]?.toString().toLowerCase() !== signatureTopic)
				? undefined
				: signatureTopic;
		const decodedLogs = logs
			.filter(log => isLogOf(log, expectedAddress, expectedTopic))
			.flatMap(log => {
				try {
					return [
						typeof log === 'string'
							? log
							: decodeEventABI(
									abi,
									log as LogsInput,
									this._jsonInterface,
									returnFormat,
								),
					];
				} catch (error) {
					if (!onDecodeError) throw error;
					onDecodeError(error as Error);
					return [];
				}
			});

		const filter = eventOptions.filter ?? {};
		// A nullish filter value is a wildcard, like the `null` topic it was sent as (F-9).
		const filterKeys = Object.keys(filter).filter(key => !isNullish(filter[key]));

		if (filterKeys.length > 0) {
			return decodedLogs.filter(log => {
				if (typeof log === 'string') return true;

				// allEvents has no inputs; resolve its event ABI to identify indexed types that require hashing.
				// A decoded log carries the 32-byte signature hash, a fragment the 64-byte topic
				// `encodeEventSignature` returns: compare both as topics.
				const logAbi =
					abi.name === ALL_EVENTS
						? this._jsonInterface.find(
								item =>
									isAbiEventFragment(item) &&
									typeof log.signature === 'string' &&
									rightPad(item.signature, TOPIC_HEX_LENGTH).toLowerCase() ===
										rightPad(log.signature, TOPIC_HEX_LENGTH).toLowerCase(),
							)
						: abi;

				return filterKeys.every((key: string) => {
					const inputAbi = logAbi?.inputs?.find(input => input.name === key);
					if (!inputAbi) {
						return false;
					}

					// Compare through the ABI type: `20`, `'20'`, `20n` and `'0x14'` are the
					// same `uint256`, and a hashed indexed value is compared as its topic
					// (L-61).
					const matches = (expected: unknown): boolean => {
						const actual = log.returnValues[key];
						if (inputAbi.indexed && isIndexedHashType(inputAbi.type)) {
							const expectedTopicValue = encodeIndexedTopic(inputAbi, expected);
							return (
								typeof actual === 'string' &&
								rightPad(actual, 128).toLowerCase() ===
									expectedTopicValue.toLowerCase()
							);
						}
						const expectedWord = encodeParameter(inputAbi, expected);
						try {
							return encodeParameter(inputAbi, actual) === expectedWord;
						} catch {
							// A value that cannot be re-encoded (the log was decoded as
							// anonymous, for example) does not match.
							return false;
						}
					};

					if (isOrList(inputAbi, filter[key])) {
						return (filter[key] as unknown[]).some(matches);
					}
					return matches(filter[key]);
				});
			});
		}

		return decodedLogs;
	}

	/** Where the calldata of a call or transaction goes: the option, else the config (L-58). */
	private get dataInputFill(): DataInputFill {
		if (this.config.contractDataInputFill === 'both') {
			return 'both';
		}
		return this._dataInputFillOption ?? this.config.contractDataInputFill;
	}

	private _parseAndSetAddress(value?: Address, returnFormat: DataFormat = DEFAULT_RETURN_FORMAT) {
		if (isNullish(value) || value === '') {
			this._address = undefined;
			return;
		}
		// A mixed-case address with a wrong checksum is the one typo the checksum exists to
		// catch; it used to be re-checksummed silently and become `to` of every send (L-57).
		if (typeof value !== 'string' || !isAddressString(value)) {
			throw new InvalidAddressError(value);
		}
		this._address = toChecksumAddress(format({ format: 'address' }, value, returnFormat));
	}

	private _parseAndSetJsonInterface(
		abis: ContractAbi,
		returnFormat: DataFormat = DEFAULT_RETURN_FORMAT,
	) {
		if (!Array.isArray(abis as unknown)) {
			throw new ContractMissingABIError();
		}
		abis.forEach((item, index) => {
			if (typeof item !== 'object' || isNullish(item) || Array.isArray(item)) {
				throw new Web3ContractError(
					`Invalid JSON interface: the item at index ${index} is not an ABI fragment object`,
				);
			}
		});

		this._functions = {};
		// Null-prototype maps: an ABI name never reaches `Object.prototype` (L-64).
		// eslint-disable-next-line no-null/no-null -- a null prototype is the point here
		this._methods = Object.create(null) as ContractMethodsInterface<Abi>;
		// eslint-disable-next-line no-null/no-null -- a null prototype is the point here
		this._events = Object.create(null) as ContractEventsInterface<Abi>;
		// Overloads of the previous interface must not survive a re-set (L-56).
		this._overloadedMethodAbis.clear();

		let result: ContractAbi = [];

		const functionsAbi = abis.filter(abi => abi.type !== 'error');
		const seenErrors = new Set<string>();
		const errorsAbi = (abis.filter(isAbiErrorFragment) as AbiErrorFragment[])
			.filter(abi => {
				const signature = jsonInterfaceMethodToString(abi);
				if (seenErrors.has(signature)) return false;
				seenErrors.add(signature);
				return true;
			})
			.map(abi => ({ ...abi, inputs: cloneAbiParameters(abi.inputs) ?? [] }));

		for (const a of functionsAbi) {
			const abi: Mutable<AbiFragment & { signature: HexString }> = {
				...a,
				signature: '',
			};
			if ('inputs' in abi) {
				abi.inputs = cloneAbiParameters(abi.inputs);
			}
			if ('outputs' in abi) {
				abi.outputs = cloneAbiParameters(abi.outputs);
			}

			if (isAbiFunctionFragment(abi)) {
				const methodName = jsonInterfaceMethodToString(abi);
				// An identical fragment listed twice (a hand-merged proxy and implementation
				// ABI, for example) is registered once, first occurrence wins: both copies used
				// to count as overloads and made every call by name ambiguous (P4-M-8). The
				// duplicate is left out of `options.jsonInterface` as well.
				if (methodName in this._functions) {
					continue;
				}
				const methodSignature = encodeFunctionSignature(methodName);
				abi.signature = methodSignature;

				// make constant and payable backwards compatible
				abi.constant =
					abi.stateMutability === 'view' ||
					abi.stateMutability === 'pure' ||
					abi.constant;

				abi.payable = abi.stateMutability === 'payable' || abi.payable;
				this._overloadedMethodAbis.set(abi.name, [
					...(this._overloadedMethodAbis.get(abi.name) ?? []),
					abi,
				]);
				const abiFragment = this._overloadedMethodAbis.get(abi.name) ?? [];
				// The name key resolves the overload from the arguments; the signature and
				// selector keys are bound to exactly this fragment (H-4).
				const contractMethod = this._createContractMethod<
					typeof abiFragment,
					AbiErrorFragment
				>(abiFragment, errorsAbi, false);
				const exactContractMethod = this._createContractMethod<
					typeof abiFragment,
					AbiErrorFragment
				>(abiFragment, errorsAbi, true);

				this._functions[methodName] = {
					signature: methodSignature,
					method: exactContractMethod,
				};

				if (!RESERVED_INTERFACE_KEYS.has(abi.name)) {
					// We don't know a particular type of the Abi method so can't type check
					this._methods[abi.name as keyof ContractMethodsInterface<Abi>] =
						contractMethod as never;
				}

				// We don't know a particular type of the Abi method so can't type check
				this._methods[methodName as keyof ContractMethodsInterface<Abi>] =
					exactContractMethod as never;

				// We don't know a particular type of the Abi method so can't type check
				this._methods[methodSignature as keyof ContractMethodsInterface<Abi>] =
					exactContractMethod as never;
			} else if (isAbiEventFragment(abi)) {
				const eventName = jsonInterfaceMethodToString(abi);
				// An identical event fragment is registered once as well (P4-M-8).
				if (eventName in this._events) {
					continue;
				}
				const eventSignature = encodeEventSignature(eventName);
				const event = this._createContractEvent(abi, returnFormat);
				abi.signature = eventSignature;

				// It's a private type and we don't want to expose it and no need to check
				this._events[eventName as keyof ContractEventsInterface<Abi>] = event as never;
				if (!RESERVED_INTERFACE_KEYS.has(abi.name) && !(abi.name in this._events)) {
					// The name key is the first overload: the one `getPastEvents(name)` resolves,
					// so a subscription and its backfill agree (P4-L-26). The other overloads
					// stay reachable through their signature and hash keys.
					this._events[abi.name as keyof ContractEventsInterface<Abi>] = event as never;
				}
				// It's a private type and we don't want to expose it and no need to check
				this._events[eventSignature as keyof ContractEventsInterface<Abi>] = event as never;
			}

			result = [...result, abi];
		}

		this._events.allEvents = this._createContractEvent(ALL_EVENTS_ABI, returnFormat);
		this._jsonInterface = [...result] as unknown as ContractAbiWithSignature;
		this._errorsInterface = errorsAbi;
	}

	// eslint-disable-next-line class-methods-use-this
	private _getAbiParams(abi: AbiFunctionFragment, params: unknown[]): Array<unknown> {
		try {
			return validatorUtils.transformJsonDataToAbiFormat(abi.inputs ?? [], params);
		} catch (error) {
			throw new Web3ContractError(
				`Invalid parameters for method ${abi.name}: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Picks the overload the arguments are meant for (H-4, L-59): same number of inputs, then
	 * validation, then exact JavaScript-type matches; anything still ambiguous is an error.
	 */
	private _resolveOverload(
		candidates: AbiFunctionFragment[],
		params: unknown[],
	): { methodAbi: AbiFunctionFragment; abiParams: unknown[] } {
		const { name } = candidates[0];
		const sameArity = candidates.filter(candidate => inputCount(candidate) === params.length);

		if (sameArity.length === 0) {
			// Too few arguments: let the validator name the missing ones against the closest
			// overload. Too many: no overload takes them, nothing may be dropped (L-59).
			const larger = candidates
				.filter(candidate => inputCount(candidate) > params.length)
				.sort((a, b) => inputCount(a) - inputCount(b));
			if (larger.length > 0) {
				validator.validate(larger[0].inputs ?? [], this._getAbiParams(larger[0], params));
			}
			const signatures = candidates.map(candidate => jsonInterfaceMethodToString(candidate));
			throw new Web3ValidatorError([
				{
					keyword: 'arity',
					instancePath: '',
					schemaPath: '#',
					params: { value: params.length, signatures },
					message: `no overload of "${name}" takes ${
						params.length
					} argument(s); available: ${signatures.join(', ')}`,
				},
			]);
		}

		if (sameArity.length === 1) {
			const abiParams = this._getAbiParams(sameArity[0], params);
			validator.validate(sameArity[0].inputs ?? [], abiParams);
			return { methodAbi: sameArity[0], abiParams };
		}

		const errors: Web3ValidationErrorObject[] = [];
		const applicable: { methodAbi: AbiFunctionFragment; abiParams: unknown[] }[] = [];
		for (const candidate of sameArity) {
			try {
				const abiParams = this._getAbiParams(candidate, params);
				validator.validate(candidate.inputs as unknown as ValidationSchemaInput, abiParams);
				applicable.push({ methodAbi: candidate, abiParams });
			} catch (e) {
				errors.push(e as Web3ValidationErrorObject);
			}
		}
		if (applicable.length === 0) {
			throw new Web3ValidatorError(errors);
		}
		if (applicable.length === 1) {
			return applicable[0];
		}

		const exactMatches = applicable.filter(({ methodAbi }) =>
			(methodAbi.inputs ?? []).every((input, index) => isExactAbiValue(input, params[index])),
		);
		if (exactMatches.length === 1) {
			return exactMatches[0];
		}
		const signatures = (exactMatches.length > 1 ? exactMatches : applicable).map(
			({ methodAbi }) => jsonInterfaceMethodToString(methodAbi),
		);
		throw new Web3ContractError(
			`Ambiguous call to "${name}": the arguments fit ${
				signatures.length
			} overloads (${signatures.join(
				', ',
			)}). Call the intended overload explicitly, e.g. contract.methods['${
				signatures[0]
			}'](...)`,
		);
	}

	private _createContractMethod<T extends AbiFunctionFragment[], E extends AbiErrorFragment>(
		abiArr: T,
		errorsAbis: E[],
		exact: boolean,
	): ContractBoundMethod<T[0]> {
		const abi = abiArr[abiArr.length - 1];
		return (...params: unknown[]) => {
			// A signature or selector key is bound to exactly its fragment; the name key sees
			// every overload known at call time.
			const candidates = exact ? [abi] : (this._overloadedMethodAbis.get(abi.name) ?? [abi]);
			const { methodAbi, abiParams } = this._resolveOverload(candidates, params);
			const internalErrorsAbis = errorsAbis;

			const methods = {
				arguments: abiParams,

				call: async (
					options?: PayableCallOptions | NonPayableCallOptions,
					block?: BlockNumberOrTag,
				) =>
					this._contractMethodCall(
						methodAbi,
						abiParams,
						internalErrorsAbis,
						options,
						block,
					),

				send: (options?: PayableTxOptions | NonPayableTxOptions) =>
					this._contractMethodSend(methodAbi, abiParams, internalErrorsAbis, options),

				estimateGas: async <ReturnFormat extends DataFormat = typeof DEFAULT_RETURN_FORMAT>(
					options?: PayableCallOptions | NonPayableCallOptions,
					returnFormat: ReturnFormat = DEFAULT_RETURN_FORMAT as ReturnFormat,
				) =>
					this._contractMethodEstimateGas({
						abi: methodAbi,
						params: abiParams,
						returnFormat,
						options,
					}),

				encodeABI: () => encodeMethodABI(methodAbi, abiParams),

				createAccessList: async (
					options?: PayableCallOptions | NonPayableCallOptions,
					block?: BlockNumberOrTag,
				) =>
					this._contractMethodCreateAccessList(
						methodAbi,
						abiParams,
						internalErrorsAbis,
						options,
						block,
					),
			};

			if (methodAbi.stateMutability === 'payable') {
				return methods as PayableMethodObject<
					ContractOverloadedMethodInputs<T>,
					ContractOverloadedMethodOutputs<T>
				>;
			}
			return methods as NonPayableMethodObject<
				ContractOverloadedMethodInputs<T>,
				ContractOverloadedMethodOutputs<T>
			>;
		};
	}

	private async _contractMethodCall<Options extends PayableCallOptions | NonPayableCallOptions>(
		abi: AbiFunctionFragment,
		params: unknown[],
		errorsAbi: AbiErrorFragment[],
		options?: Options,
		block?: BlockNumberOrTag,
	) {
		const tx = getQRLTxCallParams({
			abi,
			params,
			options: {
				...options,
				dataInputFill: this.dataInputFill,
			},
			contractOptions: {
				...this.options,
				from: this.options.from ?? this.config.defaultAccount,
			},
		});
		try {
			const result: unknown = await call(this, tx, block, DEFAULT_RETURN_FORMAT);
			// The reply is the return data, a `0x` hex string. `null`, `false`, `0` or `''`
			// used to resolve the call with `null`, as if the function had no outputs; a
			// non-hex reply is not return data either (P4-L-30).
			if (typeof result !== 'string' || !HEX_RETURN_DATA.test(result)) {
				throw createInvalidResponseError('qrl_call', 'a 0x-prefixed hex string', result);
			}
			return decodeMethodReturn(abi, result);
		} catch (error: unknown) {
			if (error instanceof ContractExecutionError) {
				// this will parse the error data by trying to decode the ABI error inputs according to EIP-838
				decodeContractErrorData(errorsAbi, error.innerError);
			}
			throw error;
		}
	}

	private async _contractMethodCreateAccessList<
		Options extends PayableCallOptions | NonPayableCallOptions,
	>(
		abi: AbiFunctionFragment,
		params: unknown[],
		errorsAbi: AbiErrorFragment[],
		options?: Options,
		block?: BlockNumberOrTag,
	) {
		const tx = getCreateAccessListParams({
			abi,
			params,
			options: { ...options, dataInputFill: this.dataInputFill },
			contractOptions: {
				...this.options,
				from: this.options.from ?? this.config.defaultAccount,
			},
		});

		try {
			return await createAccessList(this, tx, block, DEFAULT_RETURN_FORMAT);
		} catch (error: unknown) {
			if (error instanceof ContractExecutionError) {
				// this will parse the error data by trying to decode the ABI error inputs according to EIP-838
				decodeContractErrorData(errorsAbi, error.innerError);
			}
			throw error;
		}
	}

	private _contractMethodSend<Options extends PayableCallOptions | NonPayableCallOptions>(
		abi: AbiFunctionFragment,
		params: unknown[],
		errorsAbi: AbiErrorFragment[],
		options?: Options,
		contractOptions?: ContractOptions,
	) {
		let modifiedContractOptions = contractOptions ?? this.options;
		modifiedContractOptions = {
			...modifiedContractOptions,
			input: undefined,
			from: modifiedContractOptions.from ?? this.defaultAccount ?? undefined,
		};
		const tx = getSendTxParams({
			abi,
			params,
			options: { ...options, dataInputFill: this.dataInputFill },
			contractOptions: modifiedContractOptions,
		});
		// Custom errors are decoded against the contract's error ABI inside the send pipeline
		// (`contractAbi`), so no internal `error` listener is attached here: a consumer that neither
		// awaits the PromiEvent nor listens for `error` keeps the ordinary unhandled-rejection
		// semantics instead of having failures silently marked as handled.
		return sendTransaction(this, tx, DEFAULT_RETURN_FORMAT, {
			// TODO Should make this configurable by the user
			checkRevertBeforeSending: false,
			contractAbi: errorsAbi,
		});
	}

	private _contractMethodDeploySend<Options extends PayableCallOptions | NonPayableCallOptions>(
		abi: AbiFunctionFragment,
		params: unknown[],
		options?: Options,
		contractOptions?: ContractOptions,
	) {
		let modifiedContractOptions = contractOptions ?? this.options;
		modifiedContractOptions = {
			...modifiedContractOptions,
			from: modifiedContractOptions.from ?? this.defaultAccount ?? undefined,
		};
		const tx = getSendTxParams({
			abi,
			params,
			options: { ...options, dataInputFill: this.dataInputFill },
			contractOptions: modifiedContractOptions,
		});
		return sendTransaction(this, tx, DEFAULT_RETURN_FORMAT, {
			transactionResolver: receipt => {
				if (!isTransactionStatusSuccessful(receipt.status)) {
					throw new Web3ContractError("code couldn't be stored", receipt);
				}
				// A successful creation always reports the new address; a receipt without
				// one must not resolve into an address-less contract (I-13).
				if (isNullish(receipt.contractAddress)) {
					throw new NoContractAddressFoundError(receipt);
				}

				const newContract = this.clone();

				newContract.options.address = receipt.contractAddress;
				return newContract;
			},
			// TODO Should make this configurable by the user
			checkRevertBeforeSending: false,
		});
	}

	private async _contractMethodEstimateGas<
		Options extends PayableCallOptions | NonPayableCallOptions,
		ReturnFormat extends DataFormat,
	>({
		abi,
		params,
		returnFormat,
		options,
		contractOptions,
	}: {
		abi: AbiFunctionFragment;
		params: unknown[];
		returnFormat: ReturnFormat;
		options?: Options;
		contractOptions?: ContractOptions;
	}) {
		const tx = getEstimateGasParams({
			abi,
			params,
			options: { ...options, dataInputFill: this.dataInputFill },
			contractOptions: contractOptions ?? this.options,
		});
		return estimateGas(this, tx, BlockTags.LATEST, returnFormat);
	}

	private _createContractEvent(
		abi: AbiEventFragment & { signature: HexString },
		returnFormat: DataFormat = DEFAULT_RETURN_FORMAT,
	): ContractBoundEvent {
		return (...params: unknown[]) => {
			const { topics, fromBlock } = encodeEventABI(
				this.options,
				abi,
				params[0] as EventParameters,
			);
			const sub = new LogsSubscription(
				{
					address: this.options.address,
					topics,
					abi,
					jsonInterface: this._jsonInterface,
				},
				{
					subscriptionManager: this
						.subscriptionManager as unknown as Web3SubscriptionManager,
					returnFormat,
				},
			);

			// A failure is reported on `error` only when somebody listens: an unlistened
			// `error` emit must not take the process down (M-7e). It always rejects
			// `subscribed`, which is handled here so that nobody has to await it.
			const report = (error: SubscriptionError): SubscriptionError => {
				if (sub.listenerCount('error') > 0) {
					sub.emit('error', error);
				}
				return error;
			};

			sub.subscribed = new Promise<string>((resolve, reject) => {
				// Deferred to the next microtask so the caller can attach listeners first.
				queueMicrotask(() => {
					// The bound fragment is replayed, not whichever overload the name resolves
					// to (P4-L-26).
					const backfill = isNullish(fromBlock)
						? Promise.resolve()
						: this._getPastEventsForAbi(
								abi,
								{ fromBlock, topics },
								returnFormat,
								error => sub._processSubscriptionError(error),
							).then(
								logs => {
									logs.forEach(log => sub.emit('data', log as EventLog));
								},
								(error: Error) => {
									throw report(
										new SubscriptionError('Failed to get past events.', error),
									);
								},
							);
					const subscribe = this.subscriptionManager.addSubscription(sub).then(
						id => id,
						(error: Error) => {
							throw report(new SubscriptionError('Failed to subscribe.', error));
						},
					);
					Promise.all([subscribe, backfill]).then(
						([id]) => resolve(id),
						error => {
							void sub
								.unsubscribe()
								.catch(cleanupError =>
									report(
										new SubscriptionError(
											'Failed to unsubscribe after backfill failure.',
											cleanupError as Error,
										),
									),
								);
							reject(error);
						},
					);
				});
			});
			void sub.subscribed.catch(() => {
				// Reported through `error` (when listened) and through `subscribed` itself.
			});

			return sub;
		};
	}

	/**
	 * Attaches the contract to a context: with `syncWithContext` the contract's config follows
	 * the context's `CONFIG_CHANGE` events. Attaching again replaces the previous listener, so
	 * the context never carries more than one listener per contract; {@link Contract.dispose}
	 * removes it.
	 */
	protected subscribeToContextEvents<T extends Web3Context>(context: T): void {
		this._detachFromContext();
		this.context = context;

		if (this.syncWithContext) {
			const listener: ContextConfigListener = event => {
				this.setConfig({ [event.name]: event.newValue });
			};
			context.on(Web3ConfigEvent.CONFIG_CHANGE, listener);
			this._contextConfigListener = listener;
		}
	}

	private _detachFromContext(): void {
		if (this.context && this._contextConfigListener) {
			this.context.off(Web3ConfigEvent.CONFIG_CHANGE, this._contextConfigListener);
		}
		this._contextConfigListener = undefined;
	}
}
