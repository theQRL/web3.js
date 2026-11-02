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
	Web3Context,
	Web3ContextInitOptions,
	Web3ContextObject,
	Web3SubscriptionConstructor,
	isSupportedProvider,
} from '@theqrl/web3-core';
import { Web3QRL, RegisteredSubscription, registeredSubscriptions } from '@theqrl/web3-qrl';
import Contract from '@theqrl/web3-qrl-contract';
import { QRNS, registryAddresses } from '@theqrl/web3-qrl-qrns';
import { Net } from '@theqrl/web3-net';
import * as utils from '@theqrl/web3-utils';
import { isNullish } from '@theqrl/web3-utils';
import {
	Address,
	ContractAbi,
	ContractInitOptions,
	QRLExecutionAPI,
	SupportedProviders,
} from '@theqrl/web3-types';
import { InvalidMethodParamsError, InvalidProviderError, ProviderError } from '@theqrl/web3-errors';
import abi from './abi.js';
import { initAccountsForContext } from './accounts.js';
import { Web3QRLInterface } from './types.js';
import { Web3PkgInfo } from './version.js';

export class Web3<
	CustomRegisteredSubscription extends {
		[key: string]: Web3SubscriptionConstructor<QRLExecutionAPI>;
	} = RegisteredSubscription,
> extends Web3Context<QRLExecutionAPI, CustomRegisteredSubscription & RegisteredSubscription> {
	public static version = Web3PkgInfo.version;
	public static utils = utils;
	public static modules = {
		Web3QRL,
		Net,
		QRNS,
	};

	public utils: typeof utils;

	public qrl: Web3QRLInterface;

	/**
	 * @param providerOrContext - A provider URL, a provider instance or a
	 * {@link Web3ContextInitOptions} object. A `wallet` or `accountProvider` supplied through the
	 * options is kept: `web3.wallet` and `web3.qrl.accounts.wallet` are that wallet (L-41). An
	 * empty or blank URL throws an {@link InvalidProviderError} and a value of any other type
	 * (`true`, a number) a {@link ProviderError} instead of a raw `TypeError` (I-14).
	 */
	public constructor(
		providerOrContext?:
			| string
			| SupportedProviders<QRLExecutionAPI>
			| Web3ContextInitOptions<QRLExecutionAPI, CustomRegisteredSubscription>,
	) {
		if (typeof providerOrContext === 'string') {
			if (providerOrContext.trim() === '') {
				throw new InvalidProviderError(providerOrContext);
			}
		} else if (!isNullish(providerOrContext) && typeof providerOrContext !== 'object') {
			throw new ProviderError(
				`Invalid provider or context: expected a provider URL, a provider instance or Web3ContextInitOptions, got ${typeof providerOrContext}`,
			);
		}

		if (
			isNullish(providerOrContext) ||
			(typeof providerOrContext !== 'string' &&
				!isSupportedProvider(providerOrContext as SupportedProviders<QRLExecutionAPI>) &&
				!(providerOrContext as Web3ContextInitOptions).provider)
		) {
			console.warn(
				'NOTE: web3.js is running without provider. You need to pass a provider in order to interact with the network!',
			);
		}

		let contextInitOptions: Web3ContextInitOptions<QRLExecutionAPI> = {};
		if (
			typeof providerOrContext === 'string' ||
			isSupportedProvider(providerOrContext as SupportedProviders)
		) {
			contextInitOptions.provider = providerOrContext as
				| undefined
				| string
				| SupportedProviders;
		} else if (providerOrContext) {
			contextInitOptions = providerOrContext as Web3ContextInitOptions;
		} else {
			contextInitOptions = {};
		}

		contextInitOptions.registeredSubscriptions = {
			// all the QRL standard subscriptions
			...registeredSubscriptions,
			// overridden and combined with any custom subscriptions
			...(contextInitOptions.registeredSubscriptions ?? {}),
		} as CustomRegisteredSubscription;

		super(contextInitOptions);
		// A wallet handed in through the init options is kept and shared with the accounts
		// helper, so `web3.wallet` and `web3.qrl.accounts.wallet` are one object; a fresh empty
		// wallet is created only when none was supplied (L-41).
		const accounts = initAccountsForContext(() => this.qrl ?? this, this._wallet);

		// Init protected properties
		this._wallet = accounts.wallet;
		this._accountProvider = this._accountProvider ?? accounts;

		this.utils = utils;

		// Have to use local alias to initiate contract context
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;

		class ContractBuilder<Abi extends ContractAbi> extends Contract<Abi> {
			public constructor(jsonInterface: Abi);
			public constructor(jsonInterface: Abi, address: Address);
			public constructor(jsonInterface: Abi, options: ContractInitOptions);
			public constructor(jsonInterface: Abi, address: Address, options: ContractInitOptions);
			public constructor(
				jsonInterface: Abi,
				addressOrOptions?: Address | ContractInitOptions,
				options?: ContractInitOptions,
			) {
				if (typeof addressOrOptions === 'object' && typeof options === 'object') {
					throw new InvalidMethodParamsError(
						'Should not provide options at both 2nd and 3rd parameters',
					);
				}
				if (isNullish(addressOrOptions)) {
					super(jsonInterface, options, self.getContextObject() as Web3ContextObject);
				} else if (typeof addressOrOptions === 'object') {
					super(
						jsonInterface,
						addressOrOptions,
						self.getContextObject() as Web3ContextObject,
					);
				} else if (typeof addressOrOptions === 'string') {
					// `options` is forwarded only when it carries something. An empty object (or
					// `undefined` turned into `{}`) in the options slot used to be taken for the
					// context argument, which detached the contract from `web3`: no wallet, a
					// provider switch never reaching it, default configuration (M-6).
					if (isNullish(options) || Object.keys(options).length === 0) {
						super(
							jsonInterface,
							addressOrOptions,
							self.getContextObject() as Web3ContextObject,
						);
					} else {
						super(
							jsonInterface,
							addressOrOptions,
							options,
							self.getContextObject() as Web3ContextObject,
						);
					}
				} else {
					throw new InvalidMethodParamsError();
				}

				super.subscribeToContextEvents(self);
			}
		}

		const qrl = self.use(Web3QRL);

		// QRL Module
		this.qrl = Object.assign(qrl, {
			// QRNS module
			qrns: self.use(QRNS, registryAddresses.main), // no implicit mainnet registry; configure a verified deployment
			net: self.use(Net),

			// Contract helper and module
			Contract: ContractBuilder,

			// ABI Helpers
			abi,

			// Accounts helper
			accounts,
		});
	}
}
export default Web3;
