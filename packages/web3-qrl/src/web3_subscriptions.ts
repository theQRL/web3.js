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
import { format } from '@theqrl/web3-utils';
import { isBlockTag, isNullish, isObject } from '@theqrl/web3-validator';
import { BaseWeb3Error, SubscriptionError } from '@theqrl/web3-errors';

import {
	SyncOutput,
	Address,
	BlockNumberOrTag,
	HexString,
	Numbers,
	Topic,
	BlockHeaderOutput,
	LogsOutput,
	QRL_DATA_FORMAT,
} from '@theqrl/web3-types';
import { Web3Subscription } from '@theqrl/web3-core';
import { blockHeaderSchema, logSchema, syncSchema } from './schemas.js';

/**
 * Base of the QRL subscriptions: a subscription error (a notification the subscription cannot
 * decode, a failed backfill of past logs) is emitted on the `error` event when a listener is
 * attached and logged otherwise, so that it stays observable without ever throwing out of a
 * provider callback or a promise chain (M-7d, L-53).
 */
abstract class QRLSubscription<
	EventMap extends Record<string, unknown>,
	// Same default as the base class, so that `Web3QRL.subscribe()` keeps its argument typing.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ArgsType = any,
> extends Web3Subscription<EventMap, ArgsType> {
	public _processSubscriptionError(error: Error) {
		if (this.listenerCount('error') > 0) {
			super._processSubscriptionError(error);
			return;
		}
		console.warn(
			`An error happened in a subscription; attach an "error" listener to the subscription to receive it`,
			error,
		);
	}
}

/**
 * ## subscribe('logs')
 * Subscribes to incoming logs, filtered by the given options. If a valid numerical fromBlock options property is set, web3.js will retrieve logs beginning from this point, backfilling the response as necessary.
 *
 * You can subscribe to logs matching a given filter object, which can take the following parameters:
 * - `fromBlock`: (optional, default: 'latest') Integer block number, or `'latest'` for the last mined block or `'pending'`, `'earliest'` for not yet mined transactions.
 * - `address`: (optional) Contract address or a list of addresses from which logs should originate.
 * - `topics`: (optional) Array of 32 Bytes DATA topics. Topics are order-dependent. Each topic can also be an array of DATA with `or` options.
 *
 */
export class LogsSubscription extends QRLSubscription<
	{
		data: LogsOutput;
	},
	{
		readonly fromBlock?: BlockNumberOrTag;
		readonly address?: Address | Address[];
		readonly topics?: Topic[];
	}
> {
	protected _buildSubscriptionParams() {
		const fromBlock = this.args?.fromBlock;
		// A numeric `fromBlock` (number, bigint or decimal string) is sent as a hex quantity, as
		// the JSON-RPC quantity encoding requires; block tags and hex strings pass through (I-12).
		const args =
			isNullish(fromBlock) || isBlockTag(fromBlock as string)
				? this.args
				: {
						...this.args,
						fromBlock: format({ format: 'uint' }, fromBlock as Numbers, QRL_DATA_FORMAT),
				  };
		return ['logs', args];
	}

	protected formatSubscriptionResult(data: LogsOutput) {
		return format(logSchema, data, super.returnFormat);
	}
}

/**
 * ## subscribe('pendingTransactions')
 * Subscribes to incoming pending transactions.
 *
 * You can subscribe to pending transactions by calling web3.qrl.subscribe('pendingTransactions').
 * @example
 * ```ts
 * (await web3.qrl.subscribe('pendingTransactions')).on('data', console.log);
 * ```
 */
export class NewPendingTransactionsSubscription extends QRLSubscription<{
	data: HexString;
}> {
	// eslint-disable-next-line
	protected _buildSubscriptionParams() {
		return ['newPendingTransactions'];
	}

	protected formatSubscriptionResult(data: string) {
		return format({ format: 'string' }, data, super.returnFormat);
	}
}

/**
 * ## subscribe('newHeads') ( same as subscribe('newBlockHeaders'))
 *
 * Subscribes to incoming block headers. This can be used as timer to check for changes on the blockchain.
 *
 * The structure of a returned block header is {@link BlockHeaderOutput}:
 * @example
 * ```ts
 * (await web3.qrl.subscribe('newHeads')).on( // 'newBlockHeaders' would work as well
 *  'data',
 * console.log
 * );
 * >{
 * parentHash: '0x9e746a1d906b299def98c75b06f714d62dacadd567c7515d76eeaa8c8074c738',
 * miner: 'Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
 * stateRoot: '0xe0f04b04861ecfa95e82a9310d6a7ef7aef8d7417f5209c182582bfb98a8e307',
 * transactionsRoot: '0x31ab4ea571a9e10d3a19aaed07d190595b1dfa34e03960c04293fec565dea536',
 * logsBloom: '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
 * number: 21n,
 * gasLimit: 11738125n,
 * gasUsed: 830006n,
 * timestamp: 1678797237n,
 * extraData: '0xd883010b02846765746888676f312e32302e31856c696e757800000000000000e0a6e93cf40e2e71a72e493272210c3f43738ccc7e7d7b14ffd51833797d896c09117e8dc4fbcbc969bd21b42e5af3e276a911524038c001b2109b63b8e0352601'
 * }
 * ```
 */
export class NewHeadsSubscription extends QRLSubscription<{
	data: BlockHeaderOutput;
}> {
	// eslint-disable-next-line
	protected _buildSubscriptionParams() {
		return ['newHeads'];
	}

	protected formatSubscriptionResult(data: BlockHeaderOutput): BlockHeaderOutput {
		return format(blockHeaderSchema, data, super.returnFormat);
	}
}

/**
 * ## subscribe('syncing')
 *
 * Subscribe to syncing events. This will return `true` when the node is syncing and when it’s finished syncing will return `false`, for the `changed` event.
 * @example
 * ```ts
 * (await web3.qrl.subscribe('syncing')).on('changed', console.log);
 * > `true` // when syncing
 *
 * (await web3.qrl.subscribe('syncing')).on('data', console.log);
 * > {
 *      startingBlock: '0x0',
 *      currentBlock: '0x1a0',
 *      highestBlock: '0x2d0',
 *      syncedAccounts: '0x0',
 *      syncedAccountBytes: '0x0',
 *      syncedBytecodes: '0x0',
 *      syncedBytecodeBytes: '0x0',
 *      syncedStorage: '0x0',
 *      syncedStorageBytes: '0x0',
 *      healedTrienodes: '0x0',
 *      healedTrienodeBytes: '0x0',
 *      healedBytecodes: '0x0',
 *      healedBytecodeBytes: '0x0',
 *      healingTrienodes: '0x0',
 *      healingBytecode: '0x0'
 *   }
 * ```
 */
export class SyncingSubscription extends QRLSubscription<{
	data: SyncOutput;
	changed: boolean;
}> {
	// eslint-disable-next-line
	protected _buildSubscriptionParams() {
		return ['syncing'];
	}

	/**
	 * A `syncing` notification is either a boolean (the `changed` event) or an object
	 * `{ syncing: boolean, status: { ... } }`. Anything else is node supplied garbage: it used to
	 * throw a raw `TypeError` out of the provider's message listener and was dropped without any
	 * event; it is now reported through the guarded `error` path (L-53).
	 */
	public _processSubscriptionResult(data: unknown) {
		if (typeof data === 'boolean') {
			this.emit('changed', data);
			return;
		}

		if (!isObject(data) || typeof data.syncing !== 'boolean' || !isObject(data.status)) {
			this._processSubscriptionError(
				new SubscriptionError(
					`Malformed syncing notification: ${BaseWeb3Error.convertToString(data)}`,
				),
			);
			return;
		}

		let formatted: SyncOutput;
		try {
			const mappedData = Object.fromEntries(
				Object.entries(data.status).map(([key, value]) => [
					key.charAt(0).toLowerCase() + key.substring(1),
					value,
				]),
			) as unknown as SyncOutput;
			formatted = format(syncSchema, mappedData, super.returnFormat);
		} catch (error) {
			this._processSubscriptionError(error as Error);
			return;
		}

		this.emit('changed', data.syncing);
		this.emit('data', formatted);
	}
}
