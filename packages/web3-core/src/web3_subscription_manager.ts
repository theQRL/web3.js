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
	DataFormat,
	DEFAULT_RETURN_FORMAT,
	JsonRpcNotification,
	JsonRpcSubscriptionResult,
	JsonRpcSubscriptionResultOld,
	Log,
	Web3APISpec,
} from '@theqrl/web3-types';
import { BaseWeb3Error, ProviderError, SubscriptionError } from '@theqrl/web3-errors';
import { isNullish, waitWithTimeout } from '@theqrl/web3-utils';
import { isSupportSubscriptions } from './utils.js';
import { Web3EventEmitter } from './web3_event_emitter.js';
import { Web3RequestManager, Web3RequestManagerEvent } from './web3_request_manager.js';
import { Web3SubscriptionConstructor } from './web3_subscriptions.js';

type ShouldUnsubscribeCondition = ({
	id,
	sub,
}: {
	id: string;
	sub: unknown;
}) => boolean | undefined;

/**
 * How long a provider change waits for the provider being replaced to acknowledge
 * `qrl_unsubscribe` before the attempt is abandoned and reported through the `error` event
 * (M-7f). The local bookkeeping does not wait for it: every subscription is dropped locally the
 * moment the provider changes.
 */
export const UNSUBSCRIBE_ON_PROVIDER_CHANGE_TIMEOUT = 5000;

type ProviderNotification =
	| JsonRpcSubscriptionResult
	| JsonRpcSubscriptionResultOld<Log>
	| JsonRpcNotification<Log>;

type ProviderListener = (data: ProviderNotification) => void;

/**
 * The part of a provider's event API the manager uses. EIP-1193 providers and the socket
 * providers expose `removeListener`; Node-style emitters used as providers may only have `off`.
 */
interface ListenableProvider {
	on(eventName: string, listener: ProviderListener): unknown;
	removeListener?(eventName: string, listener: ProviderListener): unknown;
	off?(eventName: string, listener: ProviderListener): unknown;
	request?: unknown;
	supportsSubscriptions?: () => boolean;
	getStatus?: () => string;
}

/** The members of a registered subscription the manager relies on. */
interface ManagedSubscription {
	id?: string;
	sendSubscriptionRequest(): Promise<string>;
	sendUnsubscribeRequest(): Promise<void>;
	_markUnsubscribed(): void;
	listenerCount(eventName: 'error'): number;
	emit(eventName: 'error', error: Error): void;
}

export type Web3SubscriptionManagerEvents = {
	/**
	 * A failure that has no caller to report to: a `qrl_unsubscribe` that the provider being
	 * replaced refused or did not answer within {@link UNSUBSCRIBE_ON_PROVIDER_CHANGE_TIMEOUT}.
	 * It is delivered to the subscription's own `error` listeners when it has any and to the
	 * manager's otherwise; without either listener it is dropped (M-7f).
	 */
	error: Error;
};

export class Web3SubscriptionManager<
	API extends Web3APISpec = Web3APISpec,
	RegisteredSubs extends { [key: string]: Web3SubscriptionConstructor<API> } = {
		[key: string]: Web3SubscriptionConstructor<API>;
	},
> extends Web3EventEmitter<Web3SubscriptionManagerEvents> {
	private readonly _subscriptions: Map<
		string,
		InstanceType<RegisteredSubs[keyof RegisteredSubs]>
	> = new Map();

	private _providerListener?: {
		provider: ListenableProvider;
		eventName: 'message' | 'data';
		listener: ProviderListener;
		connectListener?: () => void;
		disconnectListener?: () => void;
	};

	/** `qrl_subscribe` requests sent but not yet answered; they keep the provider listener attached (P4-M-4). */
	private _subscribesInFlight = 0;
	/** Set when the provider disconnected while subscriptions were live; the next `connect` re-subscribes them (P4-L-3). */
	private _resubscribeOnConnect = false;
	/**
	 * Whether the attached provider has been seen connected. A `connect` event from a provider that
	 * was already connected is a reconnection: the socket providers' auto-reconnect path re-opens
	 * the socket without emitting `disconnect` first (P4-L-3).
	 */
	private _providerConnected = false;

	private readonly _beforeProviderChangeListener: () => void;
	private readonly _providerChangedListener: () => void;

	/**
	 *
	 * @param - requestManager
	 * @param - registeredSubscriptions
	 *
	 * @example
	 * ```ts
	 * const requestManager = new Web3RequestManager("ws://localhost:8545");
	 * const subscriptionManager = new Web3SubscriptionManager(requestManager, {});
	 * ```
	 */
	public constructor(
		requestManager: Web3RequestManager<API>,
		registeredSubscriptions: RegisteredSubs,
	);
	public constructor(
		public readonly requestManager: Web3RequestManager<API>,
		public readonly registeredSubscriptions: RegisteredSubs,
	) {
		super();

		this._beforeProviderChangeListener = () => {
			// Every failure is reported from inside, and whatever still escapes is reported here:
			// nothing on this path may become an unhandled rejection (M-7f, P4-M-1).
			this._unsubscribeAllForProviderChange().catch((error: unknown) => {
				this._reportManagerError(error);
			});
		};
		this._providerChangedListener = () => {
			this.clear();
		};

		this.requestManager.on(
			Web3RequestManagerEvent.BEFORE_PROVIDER_CHANGE,
			this._beforeProviderChangeListener,
		);
		this.requestManager.on(
			Web3RequestManagerEvent.PROVIDER_CHANGED,
			this._providerChangedListener,
		);
	}

	/**
	 * Attaches the manager's single `message`/`data` listener to the current provider. It is
	 * attached on demand, when the first subscription is added, and never twice: a context
	 * that never subscribes leaves nothing behind on a shared provider (L-37), and a provider
	 * change moves the one listener instead of adding another (L-36).
	 */
	private _attachProviderListener(): void {
		const provider = this.requestManager.provider as unknown as
			| ListenableProvider
			| undefined;

		if (
			isNullish(provider) ||
			(typeof provider.supportsSubscriptions === 'function' &&
				!provider.supportsSubscriptions()) ||
			typeof provider.on !== 'function'
		) {
			return;
		}

		if (this._providerListener?.provider === provider) {
			return;
		}
		this._detachProviderListener();

		// EIP-1193 providers notify through `message`; the older socket providers through `data`.
		const eventName = typeof provider.request === 'function' ? 'message' : 'data';
		const listener: ProviderListener = data => {
			this.messageListener(data);
		};
		provider.on(eventName, listener);

		// A socket provider that drops the connection and reconnects comes back without any
		// server-side subscription: the ids the node handed out are gone, so every live
		// subscription is re-subscribed on the next `connect` (P4-L-3). Two signals mark the
		// connection as lost: a `disconnect` event (an explicit `disconnect()`), and a `connect`
		// event from a provider this manager has already seen connected, because the socket
		// providers' auto-reconnect path re-opens the socket without emitting `disconnect`. The
		// `connect` that completes the initial connection (provider still connecting when the
		// listener was attached) re-subscribes nothing.
		this._providerConnected =
			typeof provider.getStatus === 'function' && provider.getStatus() === 'connected';
		const disconnectListener = () => {
			this._providerConnected = false;
			if (this._subscriptions.size > 0) {
				this._resubscribeOnConnect = true;
			}
		};
		const connectListener = () => {
			const reconnected = this._providerConnected || this._resubscribeOnConnect;
			this._providerConnected = true;
			this._resubscribeOnConnect = false;
			if (!reconnected || this._subscriptions.size === 0) {
				return;
			}
			this._resubscribeAll().catch((error: unknown) => {
				this._reportManagerError(error);
			});
		};
		provider.on('disconnect', disconnectListener as unknown as ProviderListener);
		provider.on('connect', connectListener as unknown as ProviderListener);

		this._providerListener = {
			provider,
			eventName,
			listener,
			connectListener,
			disconnectListener,
		};
	}

	private _detachProviderListener(): void {
		const attached = this._providerListener;
		if (!attached) {
			return;
		}
		this._providerListener = undefined;
		this._resubscribeOnConnect = false;
		this._providerConnected = false;

		const { provider, eventName, listener, connectListener, disconnectListener } = attached;
		const remove = (name: string, fn: ProviderListener) => {
			if (typeof provider.removeListener === 'function') {
				provider.removeListener(name, fn);
			} else if (typeof provider.off === 'function') {
				provider.off(name, fn);
			}
		};
		remove(eventName, listener);
		if (disconnectListener) {
			remove('disconnect', disconnectListener as unknown as ProviderListener);
		}
		if (connectListener) {
			remove('connect', connectListener as unknown as ProviderListener);
		}
	}

	/**
	 * Detaches the provider listener when nothing needs it: no subscription is registered and
	 * no `qrl_subscribe` is in flight. Counting the in-flight requests closes the race in which
	 * a removal emptied the map while another subscribe was pending, which detached the listener
	 * and registered the pending subscription deaf (P4-M-4).
	 */
	private _detachProviderListenerWhenIdle(): void {
		if (this._subscriptions.size === 0 && this._subscribesInFlight === 0) {
			this._detachProviderListener();
		}
	}

	/**
	 * Re-subscribes every registered subscription after the provider reconnected. Each one is
	 * re-keyed under the id the node hands out now; a failure is reported through the
	 * subscription's (or the manager's) `error` event and that subscription is dropped.
	 */
	private async _resubscribeAll(): Promise<void> {
		const entries = [...this._subscriptions.entries()];
		for (const [oldId, sub] of entries) {
			const managed = sub as unknown as ManagedSubscription;
			this._subscriptions.delete(oldId);
			// Best effort and not awaited, so a node that never answers cannot stall the recovery:
			// after a real reconnect the node no longer knows the id and its error reply is
			// ignored; if the connection never dropped (a `connect` event the manager could not
			// tell from a reconnection) this releases the old server-side subscription instead
			// of leaking it. The id is captured before `_markUnsubscribed` clears it.
			void managed.sendUnsubscribeRequest().catch(() => undefined);
			managed._markUnsubscribed();
			try {
				// eslint-disable-next-line no-await-in-loop -- one subscribe at a time keeps the ids ordered
				await managed.sendSubscriptionRequest();
				if (!isNullish(sub.id) && !this._subscriptions.has(sub.id)) {
					this._subscriptions.set(sub.id, sub);
				}
			} catch (error) {
				this._reportSubscriptionError(managed, oldId, error);
			}
		}
		if (this._subscriptions.size > 0) {
			this._attachProviderListener();
		} else {
			this._detachProviderListenerWhenIdle();
		}
	}

	protected messageListener(data?: ProviderNotification) {
		// A provider may emit a `message` without a payload; there is nothing to dispatch and
		// throwing into the provider's `emit` would only break the provider (I-14).
		if (isNullish(data)) {
			return;
		}
		const legacyId = (data as JsonRpcSubscriptionResult).id;
		const subscriptionId =
			(data as JsonRpcNotification).params?.subscription ||
			(data as JsonRpcSubscriptionResultOld).data?.subscription ||
			// Only a number has a radix conversion; `{ toString: 1 }` from the node must not throw.
			(typeof legacyId === 'number' ? legacyId.toString(16) : undefined);

		// Process if the received data is related to a subscription
		if (typeof subscriptionId === 'string') {
			const sub = this._subscriptions.get(subscriptionId);
			sub?.processSubscriptionData(data);
		}
	}
	/**
	 * Will create a new subscription
	 *
	 * @param name - The subscription you want to subscribe to
	 * @param args - Optional additional parameters, depending on the subscription type
	 * @param returnFormat- ({@link DataFormat} defaults to {@link DEFAULT_RETURN_FORMAT}) - Specifies how the return data from the call should be formatted.
	 *
	 * Will subscribe to a specific topic (note: name)
	 * @returns The subscription object
	 */
	public async subscribe<T extends keyof RegisteredSubs>(
		name: T,
		args?: ConstructorParameters<RegisteredSubs[T]>[0],
		returnFormat: DataFormat = DEFAULT_RETURN_FORMAT,
	): Promise<InstanceType<RegisteredSubs[T]>> {
		const Klass: RegisteredSubs[T] = this.registeredSubscriptions[name];
		if (!Klass) {
			throw new SubscriptionError('Invalid subscription type');
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		const subscription = new Klass(args ?? undefined, {
			subscriptionManager: this as Web3SubscriptionManager<API, RegisteredSubs>,
			returnFormat,
		} as any) as InstanceType<RegisteredSubs[T]>;

		await this.addSubscription(subscription);

		return subscription;
	}

	/**
	 * Will returns all subscriptions.
	 */
	public get subscriptions() {
		return this._subscriptions;
	}

	/**
	 *
	 * Adds an instance of {@link Web3Subscription} and subscribes to it
	 *
	 * The provider `message` listener is attached with the first subscription. A node that
	 * answers `qrl_subscribe` with an id that is already in use would silently replace the
	 * earlier subscription; such a reply rejects with a {@link SubscriptionError} and the new
	 * subscription stays unsubscribed (I-14).
	 *
	 * @param sub - A {@link Web3Subscription} object
	 */
	public async addSubscription(sub: InstanceType<RegisteredSubs[keyof RegisteredSubs]>) {
		if (!this.requestManager.provider) {
			throw new ProviderError('Provider not available');
		}

		if (!this.supportsSubscriptions()) {
			throw new SubscriptionError('The current provider does not support subscriptions');
		}

		if (sub.id && this._subscriptions.has(sub.id)) {
			throw new SubscriptionError(`Subscription with id "${sub.id}" already exists`);
		}

		const managed = sub as unknown as ManagedSubscription;
		// The provider the request goes to. If it is replaced while the request is in flight, the
		// id the old node answers with is worthless on the new one (P4-L-1).
		const providerAtRequest = this.requestManager.provider;
		this._attachProviderListener();
		this._subscribesInFlight += 1;

		try {
			await managed.sendSubscriptionRequest();
		} catch (error) {
			this._subscribesInFlight -= 1;
			this._detachProviderListenerWhenIdle();
			throw error;
		}
		this._subscribesInFlight -= 1;

		if (this.requestManager.provider !== providerAtRequest) {
			managed._markUnsubscribed();
			this._detachProviderListenerWhenIdle();
			throw new SubscriptionError(
				'The provider was replaced while subscribing; the subscription was not registered. Subscribe again on the new provider.',
			);
		}

		if (isNullish(sub.id)) {
			this._detachProviderListenerWhenIdle();
			throw new SubscriptionError('Subscription is not subscribed yet.');
		}

		if (this._subscriptions.has(sub.id)) {
			const duplicateId = sub.id;
			managed._markUnsubscribed();
			this._detachProviderListenerWhenIdle();
			throw new SubscriptionError(
				`Subscription with id "${duplicateId}" already exists: the node handed out an id that is in use`,
			);
		}

		this._subscriptions.set(sub.id, sub);
		// Idempotent: re-attaches the listener if a concurrent removal detached it meanwhile.
		this._attachProviderListener();

		return sub.id;
	}

	/**
	 * Will clear a subscription
	 *
	 * The subscription is dropped locally (its entry removed, its id cleared) whether or not
	 * the node accepted `qrl_unsubscribe`; a refusal is still thrown to the caller (M-7f).
	 *
	 * @param id - The subscription of type {@link Web3Subscription}  to remove
	 */
	public async removeSubscription(sub: InstanceType<RegisteredSubs[keyof RegisteredSubs]>) {
		const { id } = sub;

		if (isNullish(id)) {
			throw new SubscriptionError(
				'Subscription is not subscribed yet. Or, had already been unsubscribed but not through the Subscription Manager.',
			);
		}

		if (!this._subscriptions.has(id)) {
			throw new SubscriptionError(`Subscription with id "${id.toString()}" does not exists`);
		}

		const managed = sub as unknown as ManagedSubscription;
		try {
			await managed.sendUnsubscribeRequest();
		} finally {
			// A stale entry would keep dispatching notifications to a subscription its owner has
			// let go of, and `sub.id` would claim it is still live (M-7f).
			this._subscriptions.delete(id);
			managed._markUnsubscribed();
			this._detachProviderListenerWhenIdle();
		}
		return id;
	}
	/**
	 * Will unsubscribe all subscriptions that fulfill the condition
	 *
	 * @param condition - A function that access and `id` and a `subscription` and return `true` or `false`
	 * @returns An array of all the un-subscribed subscriptions
	 */
	public async unsubscribe(condition?: ShouldUnsubscribeCondition) {
		const result = [];
		for (const [id, sub] of this.subscriptions.entries()) {
			if (!condition || (typeof condition === 'function' && condition({ id, sub }))) {
				result.push(this.removeSubscription(sub));
			}
		}

		return Promise.all(result);
	}

	/**
	 * Drops every subscription locally and asks the provider being replaced to release each of
	 * them, bounded by {@link UNSUBSCRIBE_ON_PROVIDER_CHANGE_TIMEOUT}. A refusal, a transport
	 * failure or a timeout is reported through the `error` event of the subscription (when
	 * listened) or of the manager (when listened), never thrown: the listener of a
	 * synchronous `BEFORE_PROVIDER_CHANGE` event has nobody to throw to and an unhandled
	 * rejection would terminate the process (M-7f).
	 */
	private async _unsubscribeAllForProviderChange(): Promise<void> {
		const pending: Promise<void>[] = [];

		for (const [id, sub] of [...this._subscriptions.entries()]) {
			const managed = sub as unknown as ManagedSubscription;
			// Nothing in this loop may throw: one bad entry must not skip the others (P4-M-1).
			try {
				// The request reads the id synchronously and goes to the provider that is still
				// current at this point, i.e. the one being replaced; a synchronous throw becomes a
				// rejection like any other failure.
				const request: Promise<void> = (async () => managed.sendUnsubscribeRequest())();
				this._subscriptions.delete(id);
				managed._markUnsubscribed();

				pending.push(
					waitWithTimeout(
						request,
						UNSUBSCRIBE_ON_PROVIDER_CHANGE_TIMEOUT,
						new SubscriptionError(
							`Timed out after ${UNSUBSCRIBE_ON_PROVIDER_CHANGE_TIMEOUT}ms waiting for the previous provider to unsubscribe "${BaseWeb3Error.convertToString(
								id,
								true,
							)}"`,
						),
					).then(
						() => undefined,
						(error: unknown) => {
							this._reportSubscriptionError(managed, id, error);
						},
					),
				);
			} catch (error) {
				this._subscriptions.delete(id);
				this._reportSubscriptionError(managed, id, error);
			}
		}

		this._detachProviderListener();
		await Promise.all(pending);
	}

	/** Reports a failure that has no subscription to attach to: the manager's `error` listeners, or nowhere. */
	private _reportManagerError(error: unknown): void {
		if (this.listenerCount('error') === 0) {
			return;
		}
		this.emit(
			'error',
			error instanceof Error
				? error
				: new SubscriptionError(BaseWeb3Error.convertToString(error)),
		);
	}

	private _reportSubscriptionError(sub: ManagedSubscription, id: string, error: unknown): void {
		const reason =
			error instanceof Error
				? error
				: new SubscriptionError(
						`Failed to unsubscribe "${BaseWeb3Error.convertToString(
							id,
							true,
						)}": ${BaseWeb3Error.convertToString(error)}`,
					);

		if (sub.listenerCount('error') > 0) {
			sub.emit('error', reason);
			return;
		}

		if (this.listenerCount('error') > 0) {
			this.emit('error', reason);
		}
	}

	/**
	 * Clears all subscriptions locally (no `qrl_unsubscribe` is sent) and detaches the
	 * provider listener.
	 */
	public clear() {
		this._subscriptions.clear();
		this._resubscribeOnConnect = false;
		this._detachProviderListener();
	}

	/**
	 * Releases everything the manager holds on other objects: the `message`/`data` listener on
	 * the provider and the provider-change listeners on the request manager. The subscriptions
	 * are dropped locally with their ids cleared; call {@link unsubscribe} first to also release
	 * them on the node. The manager must not be used afterwards (L-37).
	 */
	public dispose(): void {
		for (const sub of this._subscriptions.values()) {
			(sub as unknown as ManagedSubscription)._markUnsubscribed();
		}
		this._subscriptions.clear();
		this._detachProviderListener();

		if (typeof this.requestManager.off === 'function') {
			this.requestManager.off(
				Web3RequestManagerEvent.BEFORE_PROVIDER_CHANGE,
				this._beforeProviderChangeListener,
			);
			this.requestManager.off(
				Web3RequestManagerEvent.PROVIDER_CHANGED,
				this._providerChangedListener,
			);
		}
		this.removeAllListeners();
	}

	/**
	 * Check whether the current provider supports subscriptions.
	 *
	 * @returns `true` or `false` depending on if the current provider supports subscriptions
	 */
	public supportsSubscriptions(): boolean {
		return isNullish(this.requestManager.provider)
			? false
			: isSupportSubscriptions(this.requestManager.provider);
	}
}
