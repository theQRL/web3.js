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

import { AbiEventFragment, LogsInput, HexString, Topic, DataFormat } from '@theqrl/web3-types';
import { Web3RequestManager, Web3Subscription, Web3SubscriptionManager } from '@theqrl/web3-core';
import { SubscriptionError } from '@theqrl/web3-errors';
import { rightPad } from '@theqrl/web3-utils';
import { ALL_EVENTS, TOPIC_HEX_LENGTH } from './constants.js';
import { decodeEventABI } from './encoding.js';
import { EventLog, ContractAbiWithSignature } from './types.js';
import { isLogOf } from './utils.js';

/**
 * LogSubscription to be used to subscribe to events logs.
 *
 * Following events are supported and can be accessed with either {@link LogsSubscription.once} or ${@link LogsSubscription.on} methods.
 *
 * - **connected**: Emitted when the subscription is connected.
 * - **data**: Fires on each incoming event with the event object as argument.
 * - **changed**: Fires on each event which was removed from the blockchain. The event will have the additional property `removed: true`.
 * - **error**: Fires on each error.
 *
 * A notification for another address, or (for a named, non-anonymous event subscribed through
 * its ABI-derived topics) for another event signature, is not this subscription's event and is
 * never emitted on `data`: it is reported on `error` when an `error` listener exists and ignored
 * silently otherwise (I-13, P4-L-25).
 *
 * ```ts
 * const subscription = await myContract.events.MyEvent({
 *   filter: {myIndexedParam: [20,23], myOtherIndexedParam: '0x123456789...'}, // Using an array means OR: e.g. 20 or 23
 *   fromBlock: 0
 * });
 *
 * subscription.on("connected", function(subscriptionId){
 *   console.log(subscriptionId);
 * });
 *
 * subscription.on('data', function(event){
 *   console.log(event); // same results as the optional callback above
 * });
 *
 * subscription.on('changed', function(event){
 *   // remove event from local database
 * })
 *
 * subscription.on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
 *   ...
 * });
 *
 * // event output example
 * > {
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
 * }
 * ```
 */
export class LogsSubscription extends Web3Subscription<
	{
		data: EventLog;
		changed: EventLog & { removed: true };
	},
	{ address?: HexString; topics?: (Topic | Topic[] | null)[]; abi: AbiEventFragment }
> {
	/**
	 * Address of tye contract
	 */
	public readonly address?: HexString;

	/**
	 * The list of topics subscribed
	 */
	public readonly topics?: (Topic | Topic[] | null)[];

	/**
	 * The {@doclink glossary/json_interface | JSON Interface} of the event.
	 */
	public readonly abi: AbiEventFragment & { signature: HexString };

	public readonly jsonInterface: ContractAbiWithSignature;

	/**
	 * Set when the subscription was created through `contract.events.<Event>()`: resolves with
	 * the subscription id once `qrl_subscribe` succeeded (and, with `fromBlock`, the past events
	 * were replayed), rejects with the `SubscriptionError` that is also emitted on `error` when
	 * an `error` listener exists. Rejections are handled by the contract, so awaiting it is
	 * optional. A subscription created through the subscription manager leaves it `undefined`.
	 */
	public subscribed?: Promise<string>;

	public constructor(
		args: {
			address?: HexString;
			topics?: (Topic | Topic[] | null)[];
			abi: AbiEventFragment & { signature: HexString };
			jsonInterface: ContractAbiWithSignature;
		},
		options: { subscriptionManager: Web3SubscriptionManager; returnFormat?: DataFormat },
	);
	public constructor(
		args: {
			address?: HexString;
			topics?: (Topic | Topic[] | null)[];
			abi: AbiEventFragment & { signature: HexString };
			jsonInterface: ContractAbiWithSignature;
		},
		options: (
			| { subscriptionManager: Web3SubscriptionManager }
			| { requestManager: Web3RequestManager }
		) & {
			returnFormat?: DataFormat;
		},
	) {
		// The base constructor accepts either option shape; the overloads above narrow it.
		super(args, options as { subscriptionManager: Web3SubscriptionManager });

		this.address = args.address;
		this.topics = args.topics;
		this.abi = args.abi;
		this.jsonInterface = args.jsonInterface;
	}

	protected _buildSubscriptionParams() {
		return ['logs', { address: this.address, topics: this.topics }];
	}

	protected formatSubscriptionResult(data: EventLog) {
		return decodeEventABI(this.abi, data as LogsInput, this.jsonInterface, super.returnFormat);
	}

	/**
	 * Dispatches a notification. A log of another address or event is dropped (see the class
	 * description); a log the node reports as `removed` (reorged out) is emitted on `changed`
	 * instead of `data`, as documented (P4-L-25).
	 */
	public _processSubscriptionResult(data: unknown) {
		if (!isLogOf(data, this.expectedAddress, this.expectedTopic)) {
			if (this.listenerCount('error') > 0) {
				this.emit(
					'error',
					new SubscriptionError(
						'Dropped a log that does not belong to the subscribed address or event',
					),
				);
			}
			return;
		}
		let formatted: EventLog;
		try {
			formatted = this.formatSubscriptionResult(data as EventLog);
		} catch (error) {
			this._processSubscriptionError(error as Error);
			return;
		}
		if ((formatted as { removed?: unknown }).removed === true) {
			this.emit('changed', formatted as EventLog & { removed: true });
			return;
		}
		this.emit('data', formatted);
	}

	/** The lowercased address every log must carry, when the subscription is bound to one. */
	private get expectedAddress(): string | undefined {
		return typeof this.address === 'string' ? this.address.toLowerCase() : undefined;
	}

	/**
	 * The lowercased 64-byte signature topic every log must carry: set for a named,
	 * non-anonymous event unless custom `topics` replaced the ABI-derived ones, in which case
	 * the node's filter is the caller's choice (as in `getPastEvents`).
	 */
	private get expectedTopic(): string | undefined {
		const { abi, topics } = this;
		if (abi.name === ALL_EVENTS || abi.anonymous || !abi.signature) {
			return undefined;
		}
		const signatureTopic = rightPad(abi.signature, TOPIC_HEX_LENGTH).toLowerCase();
		if (
			Array.isArray(topics) &&
			topics.length > 0 &&
			!(typeof topics[0] === 'string' && topics[0].toLowerCase() === signatureTopic)
		) {
			return undefined;
		}
		return signatureTopic;
	}
}
