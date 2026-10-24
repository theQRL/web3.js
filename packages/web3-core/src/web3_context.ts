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
	Web3APISpec,
	Web3BaseWallet,
	Web3BaseWalletAccount,
	Web3AccountProvider,
	SupportedProviders,
	HexString,
	QRLExecutionAPI,
	Web3BaseProvider,
	Transaction,
} from '@theqrl/web3-types';
import { isNullish } from '@theqrl/web3-utils';
import {
	ExistingPluginNamespaceError,
	InvalidProviderError,
	ProviderError,
} from '@theqrl/web3-errors';

import { isSupportedProvider } from './utils.js';
import {
	Web3Config,
	Web3ConfigChangeEvent,
	Web3ConfigEvent,
	Web3ConfigOptions,
} from './web3_config.js';
import { Web3EventCallback } from './web3_event_emitter.js';
import { Web3RequestManager } from './web3_request_manager.js';
import { Web3SubscriptionConstructor } from './web3_subscriptions.js';
import { Web3SubscriptionManager } from './web3_subscription_manager.js';
import { Web3BatchRequest } from './web3_batch_request.js';
import { ExtensionObject } from './types.js';

// To avoid circular dependencies, we need to export type from here.
export type Web3ContextObject<
	API extends Web3APISpec = unknown,
	RegisteredSubs extends {
		[key: string]: Web3SubscriptionConstructor<API>;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} = any,
> = {
	config: Web3ConfigOptions;
	provider?: SupportedProviders<API> | string;
	requestManager: Web3RequestManager<API>;
	subscriptionManager?: Web3SubscriptionManager<API, RegisteredSubs> | undefined;
	registeredSubscriptions?: RegisteredSubs;
	providers: typeof Web3RequestManager.providers;
	accountProvider?: Web3AccountProvider<Web3BaseWalletAccount>;
	wallet?: Web3BaseWallet<Web3BaseWalletAccount>;
};

export type Web3ContextInitOptions<
	API extends Web3APISpec = unknown,
	RegisteredSubs extends {
		[key: string]: Web3SubscriptionConstructor<API>;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} = any,
> = {
	config?: Partial<Web3ConfigOptions>;
	provider?: SupportedProviders<API> | string;
	requestManager?: Web3RequestManager<API>;
	subscriptionManager?: Web3SubscriptionManager<API, RegisteredSubs> | undefined;
	registeredSubscriptions?: RegisteredSubs;
	accountProvider?: Web3AccountProvider<Web3BaseWalletAccount>;
	wallet?: Web3BaseWallet<Web3BaseWalletAccount>;
};

export type Web3ContextConstructor<T extends Web3Context, T2 extends unknown[]> = new (
	...args: [...extras: T2, context: Web3ContextObject]
) => T;

// To avoid circular dependencies, we need to export type from here.
export type Web3ContextFactory<
	T extends Web3Context,
	T2 extends unknown[],
> = Web3ContextConstructor<T, T2> & {
	fromContextObject(this: Web3ContextConstructor<T, T2>, contextObject: Web3ContextObject): T;
};

type ConfigChangeListener = Web3EventCallback<Web3ConfigChangeEvent>;

export class Web3Context<
	API extends Web3APISpec = unknown,
	RegisteredSubs extends {
		[key: string]: Web3SubscriptionConstructor<API>;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} = any,
> extends Web3Config {
	public static readonly providers = Web3RequestManager.providers;
	public static givenProvider?: SupportedProviders<never>;
	public readonly providers = Web3RequestManager.providers;
	protected _requestManager: Web3RequestManager<API>;
	protected _subscriptionManager: Web3SubscriptionManager<API, RegisteredSubs>;
	protected _accountProvider?: Web3AccountProvider<Web3BaseWalletAccount>;
	protected _wallet?: Web3BaseWallet<Web3BaseWalletAccount>;

	/** True when this context created its subscription manager (not shared through the init options or a parent). */
	private _ownsSubscriptionManager = false;
	/** The `CONFIG_CHANGE` forwarders registered on parent contexts for this one (`use()`, `link()`). */
	private readonly _parentConfigListeners: {
		parent: Web3Config;
		listener: ConfigChangeListener;
	}[] = [];

	/**
	 * @param providerOrContext - A provider URL, a provider instance or a
	 * {@link Web3ContextInitOptions} object. An empty or blank URL throws an
	 * {@link InvalidProviderError} and a value of any other type (`true`, a number) a
	 * {@link ProviderError} (I-14).
	 */
	public constructor(
		providerOrContext?:
			| string
			| SupportedProviders<API>
			| Web3ContextInitOptions<API, RegisteredSubs>,
	) {
		super();

		if (typeof providerOrContext === 'string') {
			if (providerOrContext.trim() === '') {
				throw new InvalidProviderError(providerOrContext);
			}
		} else if (
			!isNullish(providerOrContext) &&
			typeof providerOrContext !== 'object' &&
			typeof providerOrContext !== 'function'
		) {
			throw new ProviderError(
				`Invalid provider or context: expected a provider URL, a provider instance or Web3ContextInitOptions, got ${typeof providerOrContext}`,
			);
		}

		// If "providerOrContext" is provided as "string" or an objects matching "SupportedProviders" interface
		if (
			isNullish(providerOrContext) ||
			typeof providerOrContext === 'string' ||
			isSupportedProvider(providerOrContext as SupportedProviders<API>)
		) {
			this._requestManager = new Web3RequestManager<API>(
				providerOrContext as undefined | string | SupportedProviders<API>,
			);
			this._subscriptionManager = new Web3SubscriptionManager(
				this._requestManager,
				{} as RegisteredSubs,
			);
			this._ownsSubscriptionManager = true;
			this._followRpcCallSpecificationFlag();

			return;
		}

		const {
			config,
			provider,
			requestManager,
			subscriptionManager,
			registeredSubscriptions,
			accountProvider,
			wallet,
		} = providerOrContext as Web3ContextInitOptions<API, RegisteredSubs>;

		this.setConfig(config ?? {});

		// `useRpcCallSpecification` selects the error mapping; the block-timeout flag used to be
		// passed here by mistake (P4-L-4).
		this._requestManager =
			requestManager ??
			new Web3RequestManager<API>(
				provider,
				config?.enableExperimentalFeatures?.useRpcCallSpecification,
			);
		this._followRpcCallSpecificationFlag();

		if (subscriptionManager) {
			this._subscriptionManager = subscriptionManager;
		} else {
			this._subscriptionManager = new Web3SubscriptionManager(
				this.requestManager,
				registeredSubscriptions ?? ({} as RegisteredSubs),
			);
			this._ownsSubscriptionManager = true;
		}

		if (accountProvider) {
			this._accountProvider = accountProvider;
		}

		if (wallet) {
			this._wallet = wallet;
		}
	}

	public get requestManager() {
		return this._requestManager;
	}

	/**
	 * Will return the current subscriptionManager ({@link Web3SubscriptionManager})
	 */
	public get subscriptionManager() {
		return this._subscriptionManager;
	}

	public get wallet() {
		return this._wallet;
	}

	public get accountProvider() {
		return this._accountProvider;
	}

	public static fromContextObject<T extends Web3Context, T3 extends unknown[]>(
		this: Web3ContextConstructor<T, T3>,
		...args: [Web3ContextObject, ...T3]
	) {
		return new this(...(args.reverse() as [...T3, Web3ContextObject]));
	}

	public setConfig(options: Parameters<Web3Config['setConfig']>[0]) {
		super.setConfig(options);
		this._followRpcCallSpecificationFlag();
	}

	public getContextObject(): Web3ContextObject<API, RegisteredSubs> {
		return {
			config: this.config,
			provider: this.provider,
			requestManager: this.requestManager,
			subscriptionManager: this.subscriptionManager,
			registeredSubscriptions: this.subscriptionManager?.registeredSubscriptions,
			providers: this.providers,
			wallet: this.wallet,
			accountProvider: this.accountProvider,
		};
	}

	/**
	 * Use to create new object of any type extended by `Web3Context`
	 * and link it to current context. This can be used to initiate a global context object
	 * and then use it to create new objects of any type extended by `Web3Context`.
	 *
	 * The child follows every configuration change of this context; the forwarding listener is
	 * released by the child's {@link dispose}.
	 */
	public use<T extends Web3Context, T2 extends unknown[]>(
		ContextRef: Web3ContextConstructor<T, T2>,
		...args: [...T2]
	) {
		const newContextChild: T = new ContextRef(
			...([...args, this.getContextObject()] as unknown as [...T2, Web3ContextObject]),
		);

		const listener: ConfigChangeListener = event => {
			newContextChild.setConfig({ [event.name]: event.newValue });
		};
		this.on(Web3ConfigEvent.CONFIG_CHANGE, listener);
		newContextChild._trackParentConfigListener(this, listener);

		return newContextChild;
	}

	/**
	 * Link current context to another context.
	 *
	 * Adopts the parent's request manager, subscription manager, wallet, account provider and
	 * configuration, and follows the parent's configuration changes from then on. The parent's
	 * provider is not set again on the shared request manager: doing so used to emit the
	 * provider-change events, which unsubscribed every live subscription and left a duplicate
	 * provider listener behind (L-36).
	 */
	public link<T extends Web3Context>(parentContext: T) {
		this.setConfig(parentContext.config);
		this._requestManager = parentContext.requestManager;
		// The manager this context created is replaced by the parent's: release its listeners
		// instead of orphaning them on the request manager.
		if (
			this._ownsSubscriptionManager &&
			this._subscriptionManager !== parentContext.subscriptionManager
		) {
			this._subscriptionManager.dispose();
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		this._subscriptionManager = parentContext.subscriptionManager;
		this._ownsSubscriptionManager = false;
		this._wallet = parentContext.wallet;
		this._accountProvider = parentContext._accountProvider;

		const listener: ConfigChangeListener = event => {
			this.setConfig({ [event.name]: event.newValue });
		};
		parentContext.on(Web3ConfigEvent.CONFIG_CHANGE, listener);
		this._trackParentConfigListener(parentContext, listener);
	}

	/**
	 * Releases the listeners this context holds on other objects: the `CONFIG_CHANGE` forwarders
	 * registered on the parent it was created from with {@link use} or attached to with
	 * {@link link}, every listener registered on this context, and, when the subscription manager
	 * was created by this context rather than shared, that manager's provider and
	 * provider-change listeners (see {@link Web3SubscriptionManager.dispose}). A context created
	 * for a short-lived task can thus be dropped without leaving a listener behind on a shared
	 * provider or parent (L-37). The context must not be used afterwards.
	 */
	public dispose(): void {
		for (const { parent, listener } of this._parentConfigListeners) {
			parent.off(Web3ConfigEvent.CONFIG_CHANGE, listener);
		}
		this._parentConfigListeners.length = 0;
		this.removeAllListeners();

		if (this._ownsSubscriptionManager) {
			this._subscriptionManager.dispose();
		}
	}

	/**
	 * Copies the `useRpcCallSpecification` flag of the configuration into the request manager
	 * (which maps EIP-1474 error replies to typed classes when it is set), so the flag applies
	 * at construction and whenever `enableExperimentalFeatures` is assigned later (P4-L-4).
	 */
	private _followRpcCallSpecificationFlag(): void {
		if (isNullish(this._requestManager)) {
			return;
		}
		this._requestManager.useRpcCallSpecification =
			this.config.enableExperimentalFeatures?.useRpcCallSpecification ?? false;
	}

	public get enableExperimentalFeatures() {
		return super.enableExperimentalFeatures;
	}

	public set enableExperimentalFeatures(val) {
		super.enableExperimentalFeatures = val;
		this._followRpcCallSpecificationFlag();
	}

	/** Remembers a `CONFIG_CHANGE` forwarder registered on `parent` for this context, so {@link dispose} can remove it. */
	protected _trackParentConfigListener(parent: Web3Config, listener: ConfigChangeListener) {
		this._parentConfigListeners.push({ parent, listener });
	}

	public registerPlugin(plugin: Web3PluginBase) {
		const context = this as unknown as Record<string, unknown>;
		if (context[plugin.pluginNamespace] !== undefined)
			throw new ExistingPluginNamespaceError(plugin.pluginNamespace);

		const _pluginObject = {
			[plugin.pluginNamespace]: plugin,
		};
		_pluginObject[plugin.pluginNamespace].link(this);
		Object.assign(this, _pluginObject);
	}

	/**
	 * Will return the current provider.
	 *
	 * @returns Returns the current provider
	 * @example
	 * ```ts
	 * const web3 = new Web3Context("http://localhost:8545");
	 * console.log(web3.provider);
	 * > HttpProvider {
	 * 	clientUrl: 'http://localhost:8545',
	 * 	httpProviderOptions: undefined
	 *  }
	 * ```
	 */

	public get provider(): Web3BaseProvider<API> | undefined {
		return this.currentProvider;
	}

	/**
	 * Will set the current provider.
	 *
	 * @param provider - The provider to set
	 *
	 * Accepted providers are of type {@link SupportedProviders}
	 * @example
	 * ```ts
	 *  const web3Context = new web3ContextContext("http://localhost:8545");
	 * web3Context.provider = "ws://localhost:8545";
	 * console.log(web3Context.provider);
	 * > WebSocketProvider {
	 * _eventEmitter: EventEmitter {
	 * _events: [Object: null prototype] {},
	 * _eventsCount: 0,
	 * ...
	 * }
	 * ```
	 */

	public set provider(provider: SupportedProviders<API> | string | undefined) {
		this.requestManager.setProvider(provider);
	}

	/**
	 * Will return the current provider. (The same as `provider`)
	 *
	 * @returns Returns the current provider
	 * @example
	 * ```ts
	 * const web3Context = new Web3Context("http://localhost:8545");
	 * console.log(web3Context.provider);
	 * > HttpProvider {
	 * 	clientUrl: 'http://localhost:8545',
	 * 	httpProviderOptions: undefined
	 *  }
	 * ```
	 */
	public get currentProvider(): Web3BaseProvider<API> | undefined {
		return this.requestManager.provider as Web3BaseProvider<API>;
	}

	/**
	 * Will set the current provider. (The same as `provider`)
	 *
	 * @param provider - {@link SupportedProviders} The provider to set
	 *
	 * @example
	 * ```ts
	 *  const web3Context = new Web3Context("http://localhost:8545");
	 * web3Context.currentProvider = "ws://localhost:8545";
	 * console.log(web3Context.provider);
	 * > WebSocketProvider {
	 * _eventEmitter: EventEmitter {
	 * _events: [Object: null prototype] {},
	 * _eventsCount: 0,
	 * ...
	 * }
	 * ```
	 */
	public set currentProvider(provider: SupportedProviders<API> | string | undefined) {
		this.requestManager.setProvider(provider);
	}

	/**
	 * Will return the givenProvider if available.
	 *
	 * When using web3.js in a QRL compatible browser, it will set with the current native provider by that browser. Will return the given provider by the (browser) environment, otherwise `undefined`.
	 */
	// eslint-disable-next-line class-methods-use-this
	public get givenProvider() {
		return Web3Context.givenProvider;
	}
	/**
	 * Will set the provider. Setting the provider instance that is already set is a no-op (L-36);
	 * an empty URL throws an {@link InvalidProviderError}.
	 *
	 * @param provider - {@link SupportedProviders} The provider to set
	 * @returns Returns true if the provider was set
	 */
	public setProvider(provider?: SupportedProviders<API> | string): boolean {
		this.provider = provider;
		return true;
	}
	/**
	 * Will return the {@link Web3BatchRequest} constructor.
	 */
	public get BatchRequest(): new () => Web3BatchRequest {
		return Web3BatchRequest.bind(
			undefined,
			this._requestManager as unknown as Web3RequestManager,
		);
	}

	/**
	 * This method allows extending the web3 modules.
	 * Note: This method is only for backward compatibility, and It is recommended to use Web3 v4 Plugin feature for extending web3.js functionality if you are developing some thing new.
	 */
	public extend(extendObj: ExtensionObject) {
		const context = this as unknown as Record<string, Record<string, unknown> | unknown>;

		const forbiddenKeys = ['__proto__', 'constructor', 'prototype'];
		if (extendObj.property && forbiddenKeys.includes(extendObj.property))
			throw new Error(`Forbidden extend property name: ${extendObj.property}`);

		if (extendObj.property && !context[extendObj.property]) context[extendObj.property] = {};

		extendObj.methods?.forEach(element => {
			if (forbiddenKeys.includes(element.name))
				throw new Error(`Forbidden extend method name: ${element.name}`);

			const method = async (...givenParams: unknown[]) =>
				this.requestManager.send({
					method: element.call,
					params: givenParams,
				});

			if (extendObj.property)
				(context[extendObj.property] as Record<string, unknown>)[element.name] = method;
			else context[element.name] = method;
		});
		return this;
	}
}

// To avoid cycle dependency declare this type in this file
export type TransactionBuilder<API extends Web3APISpec = unknown> = <
	ReturnType = Transaction,
>(options: {
	transaction: Transaction;
	web3Context: Web3Context<API>;
	seed?: HexString | Uint8Array;
	fillGasPrice?: boolean;
}) => Promise<ReturnType>;

/**
 * Extend this class when creating a plugin that either doesn't require {@link QRLExecutionAPI},
 * or interacts with a RPC node that doesn't fully implement {@link QRLExecutionAPI}.
 *
 * To add type support for RPC methods to the {@link Web3RequestManager},
 * define a {@link Web3APISpec} and pass it as a generic to Web3PluginBase like so:
 *
 * @example
 * ```ts
 * type CustomRpcApi = {
 *	custom_rpc_method: () => string;
 *	custom_rpc_method_with_parameters: (parameter1: string, parameter2: number) => string;
 * };
 *
 * class CustomPlugin extends Web3PluginBase<CustomRpcApi> {...}
 * ```
 */
export abstract class Web3PluginBase<
	API extends Web3APISpec = Web3APISpec,
> extends Web3Context<API> {
	public abstract pluginNamespace: string;
}

/**
 * Extend this class when creating a plugin that makes use of {@link QRLExecutionAPI},
 * or depends on other Web3 packages (such as `web3-qrl-contract`) that depend on {@link QRLExecutionAPI}.
 *
 * To add type support for RPC methods to the {@link Web3RequestManager} (in addition to {@link QRLExecutionAPI}),
 * define a {@link Web3APISpec} and pass it as a generic to Web3PluginBase like so:
 *
 * @example
 * ```ts
 * type CustomRpcApi = {
 *	custom_rpc_method: () => string;
 *	custom_rpc_method_with_parameters: (parameter1: string, parameter2: number) => string;
 * };
 *
 * class CustomPlugin extends Web3PluginBase<CustomRpcApi> {...}
 * ```
 */
export abstract class Web3QRLPluginBase<API extends Web3APISpec = unknown> extends Web3PluginBase<
	API & QRLExecutionAPI
> {}
