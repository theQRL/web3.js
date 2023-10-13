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
// eslint-disable-next-line max-classes-per-file
import {
	Web3Context,
	Web3ContextInitOptions,
	Web3ContextObject,
	Web3SubscriptionConstructor,
	isSupportedProvider,
} from '@theqrl/web3-core';
import { Web3Zond, RegisteredSubscription, registeredSubscriptions } from '@theqrl/web3-zond';
import Contract from '@theqrl/web3-zond-contract';
import { ENS, registryAddresses } from '@theqrl/web3-zond-ens';
import { Iban } from '@theqrl/web3-zond-iban';
import { Personal } from '@theqrl/web3-zond-personal';
import { Net } from '@theqrl/web3-net';
import * as utils from '@theqrl/web3-utils';
import { isNullish } from '@theqrl/web3-utils';
import {
	Address,
	ContractAbi,
	ContractInitOptions,
	ZondExecutionAPI,
	SupportedProviders,
} from '@theqrl/web3-types';
import { InvalidMethodParamsError } from '@theqrl/web3-errors';
import abi from './abi.js';
import { initAccountsForContext } from './accounts.js';
import { Web3ZondInterface } from './types.js';
import { Web3PkgInfo } from './version.js';

export class Web3<
	CustomRegisteredSubscription extends {
		[key: string]: Web3SubscriptionConstructor<ZondExecutionAPI>;
	} = RegisteredSubscription,
> extends Web3Context<ZondExecutionAPI, CustomRegisteredSubscription & RegisteredSubscription> {
	public static version = Web3PkgInfo.version;
	public static utils = utils;
	public static modules = {
		Web3Zond,
		Iban,
		Net,
		ENS,
		Personal,
	};

	public utils: typeof utils;

	public zond: Web3ZondInterface;

	public constructor(
		providerOrContext?:
			| string
			| SupportedProviders<ZondExecutionAPI>
			| Web3ContextInitOptions<ZondExecutionAPI, CustomRegisteredSubscription>,
	) {
		if (
			isNullish(providerOrContext) ||
			(typeof providerOrContext === 'string' && providerOrContext.trim() === '') ||
			(typeof providerOrContext !== 'string' &&
				!isSupportedProvider(providerOrContext as SupportedProviders<ZondExecutionAPI>) &&
				!(providerOrContext as Web3ContextInitOptions).provider)
		) {
			console.warn(
				'NOTE: web3.js is running without provider. You need to pass a provider in order to interact with the network!',
			);
		}

		let contextInitOptions: Web3ContextInitOptions<ZondExecutionAPI> = {};
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
			// all the Zond standard subscriptions
			...registeredSubscriptions,
			// overridden and combined with any custom subscriptions
			...(contextInitOptions.registeredSubscriptions ?? {}),
		} as CustomRegisteredSubscription;

		super(contextInitOptions);
		const accounts = initAccountsForContext(this);

		// Init protected properties
		this._wallet = accounts.wallet;
		this._accountProvider = accounts;

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
					super(
						jsonInterface,
						addressOrOptions,
						options ?? {},
						self.getContextObject() as Web3ContextObject,
					);
				} else {
					throw new InvalidMethodParamsError();
				}

				super.subscribeToContextEvents(self);
			}
		}

		const zond = self.use(Web3Zond);

		// Zond Module
		this.zond = Object.assign(zond, {
			// ENS module
			ens: self.use(ENS, registryAddresses.main), // registry address defaults to main network

			// Iban helpers
			Iban,

			net: self.use(Net),
			personal: self.use(Personal),

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
