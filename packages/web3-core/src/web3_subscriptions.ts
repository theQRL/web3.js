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
	BlockOutput,
	DEFAULT_RETURN_FORMAT,
	DataFormat,
	QRLExecutionAPI,
	JsonRpcSubscriptionResult,
	JsonRpcSubscriptionResultOld,
	JsonRpcNotification,
	Log,
	HexString,
	Web3APIParams,
	Web3APISpec,
} from '@theqrl/web3-types';
import { jsonRpc } from '@theqrl/web3-utils';
import { BaseWeb3Error, SubscriptionError } from '@theqrl/web3-errors';

import { Web3SubscriptionManager } from './web3_subscription_manager.js';
import { Web3EventEmitter, Web3EventMap } from './web3_event_emitter.js';
import { Web3RequestManager } from './web3_request_manager.js';

type CommonSubscriptionEvents = {
	data: unknown; // Fires on each incoming block header.
	error: Error; // Fires when an error in the subscription occurs.
	connected: string; // Fires once after the subscription successfully connected. Returns the subscription id.
};

export abstract class Web3Subscription<
	EventMap extends Web3EventMap,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ArgsType = any,
	API extends Web3APISpec = QRLExecutionAPI,
	// The following generic type is just to define the type `CombinedEventMap` and use it inside the class
	// 	it combines the user passed `EventMap` with the `CommonSubscriptionEvents`
	//	However, this type definition could be refactored depending on the closure of
	//	[Permit type alias declarations inside a class](https://github.com/microsoft/TypeScript/issues/7061)
	CombinedEventMap extends CommonSubscriptionEvents = EventMap & CommonSubscriptionEvents,
> extends Web3EventEmitter<CombinedEventMap> {
	private readonly _subscriptionManager: Web3SubscriptionManager<API>;
	private readonly _lastBlock?: BlockOutput;
	private readonly _returnFormat: DataFormat;
	protected _id?: HexString;

	public constructor(
		args: ArgsType,
		options: { subscriptionManager: Web3SubscriptionManager; returnFormat?: DataFormat },
	);
	public constructor(
		public readonly args: ArgsType,
		options: (
			| { subscriptionManager: Web3SubscriptionManager }
			| { requestManager: Web3RequestManager<API> }
		) & {
			returnFormat?: DataFormat;
		},
	) {
		super();
		const { subscriptionManager } = options as { subscriptionManager: Web3SubscriptionManager };
		if (!subscriptionManager) {
			throw new SubscriptionError(
				'subscriptionManager should be provided at Subscription constructor',
			);
		}
		this._subscriptionManager = subscriptionManager;

		this._returnFormat = options?.returnFormat ?? (DEFAULT_RETURN_FORMAT as DataFormat);
	}

	public get id() {
		return this._id;
	}

	public get lastBlock() {
		return this._lastBlock;
	}

	public async subscribe(): Promise<string> {
		return this._subscriptionManager.addSubscription(this);
	}

	public processSubscriptionData(
		data:
			| JsonRpcSubscriptionResult
			| JsonRpcSubscriptionResultOld<Log>
			| JsonRpcNotification<Log>,
	) {
		if (data?.data) {
			// for EIP-1193 provider
			this._processSubscriptionResult(data?.data?.result ?? data?.data);
		} else if (
			data &&
			jsonRpc.isResponseWithNotification(
				data as unknown as JsonRpcSubscriptionResult | JsonRpcNotification<Log>,
			)
		) {
			this._processSubscriptionResult(data?.params.result);
		}
	}

	public async sendSubscriptionRequest(): Promise<string> {
		const result: unknown = await this._subscriptionManager.requestManager.send({
			method: 'qrl_subscribe',
			params: this._buildSubscriptionParams(),
		});

		// The node is untrusted: only a non-empty `0x` hex string is a subscription id (go-qrl
		// hands out `"0x" + hex`). Anything else used to be stored as it came and string-converted
		// later in a path nobody awaited, where `{ toString: 1 }` terminated the process (P4-M-1).
		if (typeof result !== 'string' || !/^0x[0-9a-f]+$/i.test(result)) {
			throw new SubscriptionError(
				`Invalid subscription id in the qrl_subscribe reply: expected a 0x hex string, got ${BaseWeb3Error.convertToString(
					result,
				)}`,
			);
		}

		this._id = result;
		this.emit('connected', this._id);
		return this._id;
	}

	protected get returnFormat() {
		return this._returnFormat;
	}

	protected get subscriptionManager() {
		return this._subscriptionManager;
	}

	/**
	 * Unsubscribes and subscribes again. A failed `qrl_unsubscribe` (the node no longer knows
	 * the id, for example after a reconnect) does not abort the re-subscription: the
	 * subscription is already dropped locally in that case (P4-L-3).
	 */
	public async resubscribe() {
		try {
			await this.unsubscribe();
		} catch {
			this._markUnsubscribed();
		}
		await this.subscribe();
	}

	public async unsubscribe() {
		if (!this.id) {
			return;
		}

		await this._subscriptionManager.removeSubscription(this);
	}

	public async sendUnsubscribeRequest() {
		const { id } = this;
		await this._subscriptionManager.requestManager.send({
			method: 'qrl_unsubscribe',
			params: [id] as Web3APIParams<API, 'qrl_unsubscribe'>,
		});
		// A late acknowledgement from a replaced provider must not wipe the id of a
		// subscription that was re-subscribed meanwhile (P4-L-2).
		if (this._id === id) {
			this._id = undefined;
		}
	}

	/**
	 * Forgets the subscription id without talking to the node. The subscription manager calls
	 * it when it drops the subscription locally: when the node refused `qrl_unsubscribe`, when
	 * the provider is replaced (the previous node may already be unreachable), or on
	 * `dispose()`. Afterwards {@link unsubscribe} is a no-op and no notification is dispatched
	 * to the subscription any more (M-7f).
	 */
	public _markUnsubscribed(): void {
		this._id = undefined;
	}

	// eslint-disable-next-line class-methods-use-this
	protected formatSubscriptionResult(data: CombinedEventMap['data']) {
		return data;
	}

	public _processSubscriptionResult(data: CombinedEventMap['data'] | unknown) {
		let formatted: CombinedEventMap['data'];
		try {
			formatted = this.formatSubscriptionResult(data as CombinedEventMap['data']);
		} catch (error) {
			// A notification the subclass cannot decode (a malformed log, for example) is this
			// subscription's problem: report it on the subscription's `error` event so the
			// subscriber learns that an item was dropped. Without an `error` listener the
			// emitter drops the event silently; subclasses that want it logged override
			// `_processSubscriptionError` (as the QRL subscriptions do).
			this._processSubscriptionError(error as Error);
			return;
		}
		this.emit('data', formatted);
	}

	public _processSubscriptionError(error: Error) {
		this.emit('error', error);
	}

	// eslint-disable-next-line class-methods-use-this
	protected _buildSubscriptionParams(): Web3APIParams<API, 'qrl_subscribe'> {
		// This should be overridden in the subclass
		throw new Error('Implement in the child class');
	}
}

export type Web3SubscriptionConstructor<
	API extends Web3APISpec,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	SubscriptionType extends Web3Subscription<any, any, API> = Web3Subscription<any, any, API>,
> =
	| (new (
			// We accept any type of arguments here and don't deal with this type internally
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			args: any,
			options:
				| { subscriptionManager: Web3SubscriptionManager<API>; returnFormat?: DataFormat }
				| { requestManager: Web3RequestManager<API>; returnFormat?: DataFormat },
	  ) => SubscriptionType)
	| (new (
			args: any,
			options: {
				subscriptionManager: Web3SubscriptionManager<API>;
				returnFormat?: DataFormat;
			},
	  ) => SubscriptionType)
	| (new (
			args: any,
			options: { requestManager: Web3RequestManager<API>; returnFormat?: DataFormat },
	  ) => SubscriptionType);
