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

import { SupportedProviders } from '@theqrl/web3-types';
import { rightPad, sha3Raw, toChecksumAddress } from '@theqrl/web3-utils';
import { Contract, NonPayableMethodObject } from '../../src';

export const ADDR = toChecksumAddress(`Q${'ab'.repeat(64)}`);
export const ADDR2 = toChecksumAddress(`Q${'cd'.repeat(64)}`);
export const FROM = toChecksumAddress(`Q${'11'.repeat(64)}`);
export const ZERO_ADDRESS = `Q${'0'.repeat(128)}`;

/** A 64-byte ABI word (128 hex characters) from a hex string without prefix. */
export const word = (hex: string): string => hex.padStart(128, '0');
export const uintWord = (value: number | bigint): string => word(BigInt(value).toString(16));
export const addrWord = (address: string): string => word(address.slice(1).toLowerCase());
export const boolWord = (value: boolean): string => uintWord(value ? 1 : 0);
/** The 64-byte topic of an event signature: the keccak256 in the high half. */
export const topicOf = (signature: string): string => rightPad(sha3Raw(signature), 128);

const BLOCK = {
	number: '0x10',
	hash: `0x${'55'.repeat(32)}`,
	parentHash: `0x${'66'.repeat(32)}`,
	baseFeePerGas: '0x7',
	gasLimit: '0x1c9c380',
	gasUsed: '0x0',
	timestamp: '0x1',
	miner: ZERO_ADDRESS,
	transactions: [],
	size: '0x1',
	extraData: '0x',
	logsBloom: `0x${'0'.repeat(512)}`,
	stateRoot: `0x${'0'.repeat(64)}`,
	receiptsRoot: `0x${'0'.repeat(64)}`,
	transactionsRoot: `0x${'0'.repeat(64)}`,
	prevRandao: `0x${'0'.repeat(64)}`,
};

export const RECEIPT = {
	status: '0x1',
	// eslint-disable-next-line no-null/no-null
	contractAddress: null,
	transactionHash: `0x${'33'.repeat(32)}`,
	blockNumber: '0x10',
	blockHash: `0x${'55'.repeat(32)}`,
	transactionIndex: '0x0',
	gasUsed: '0x5208',
	cumulativeGasUsed: '0x5208',
	logs: [],
	logsBloom: `0x${'0'.repeat(512)}`,
	from: FROM,
	// eslint-disable-next-line no-null/no-null
	to: null,
	effectiveGasPrice: '0x8',
	type: '0x2',
};

/** Answers the RPCs the send pipeline needs when a handler returns `undefined` for a method. */
const defaultHandler = (method: string): unknown => {
	switch (method) {
		case 'qrl_getBlockByNumber':
			return BLOCK;
		case 'qrl_blockNumber':
			return '0x10';
		case 'qrl_maxPriorityFeePerGas':
			return '0x1';
		case 'qrl_gasPrice':
			return '0x8';
		case 'qrl_getTransactionCount':
			return '0x0';
		case 'qrl_chainId':
			return '0x1';
		case 'net_version':
			return '1';
		case 'qrl_estimateGas':
			return '0x5208';
		case 'qrl_getTransactionReceipt':
			return RECEIPT;
		case 'qrl_sendTransaction':
		case 'qrl_sendRawTransaction':
			return `0x${'33'.repeat(32)}`;
		case 'qrl_call':
			return '0x';
		default:
			return '0x1';
	}
};

/** A single JSON-RPC request as the request manager sends it. */
type Request = { id?: unknown; method: string; params?: unknown };
/** Returned by a handler to answer a request with a JSON-RPC error reply. */
export class RpcErrorReply {
	public constructor(public readonly code: number, public readonly message: string) {}
}

export type FakeRpcHandler = (method: string, params: unknown[]) => unknown;
export interface RpcCall {
	method: string;
	params: unknown[];
}
type Listener = (...args: unknown[]) => void;

/**
 * A minimal in-memory provider. `handler(method, params)` returns the result; throwing an
 * object with a `code` produces a JSON-RPC error reply, throwing an `Error` rejects the request.
 * Every request is recorded in `calls`.
 */
export class FakeProvider {
	public readonly calls: RpcCall[] = [];
	private readonly listeners = new Map<string, Listener[]>();
	private readonly handler: FakeRpcHandler;
	private readonly subscriptions: boolean;

	public constructor(handler: FakeRpcHandler = () => undefined, subscriptions = false) {
		this.handler = handler;
		this.subscriptions = subscriptions;
		Object.defineProperty(this, Symbol.for('web3/base-provider'), { value: true });
	}

	public supportsSubscriptions(): boolean {
		return this.subscriptions;
	}

	public async request(payload: Request): Promise<unknown> {
		const params = Array.isArray(payload.params) ? (payload.params as unknown[]) : [];
		this.calls.push({ method: payload.method, params });
		try {
			let result = await this.handler(payload.method, params);
			if (result instanceof RpcErrorReply) {
				return {
					jsonrpc: '2.0',
					id: payload.id,
					error: { code: result.code, message: result.message },
				};
			}
			if (result === undefined) {
				result = defaultHandler(payload.method);
			}
			return { jsonrpc: '2.0', id: payload.id, result };
		} catch (error) {
			if (typeof error === 'object' && error && 'code' in error && !(error instanceof Error)) {
				return { jsonrpc: '2.0', id: payload.id, error };
			}
			throw error;
		}
	}

	public on(event: string, listener: Listener): void {
		this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
	}

	public removeListener(event: string, listener: Listener): void {
		this.listeners.set(
			event,
			(this.listeners.get(event) ?? []).filter(fn => fn !== listener),
		);
	}

	public removeAllListeners(event?: string): void {
		if (event) {
			this.listeners.delete(event);
		} else {
			this.listeners.clear();
		}
	}

	public listenerCount(event: string): number {
		return (this.listeners.get(event) ?? []).length;
	}

	/** Delivers a subscription notification to the `message` listeners. */
	public notify(subscriptionId: string, result: unknown): void {
		for (const fn of this.listeners.get('message') ?? []) {
			fn({
				jsonrpc: '2.0',
				method: 'qrl_subscription',
				params: { subscription: subscriptionId, result },
			});
		}
	}

	public lastCall(method: string): RpcCall | undefined {
		return [...this.calls].reverse().find(call => call.method === method);
	}

	public asProvider(): SupportedProviders {
		return this as unknown as SupportedProviders;
	}
}

/** `contract.methods[key]` as a plainly typed bound method, for signature and selector keys. */
export const boundMethod = (
	contract: Contract<any>,
	key: string,
): ((...args: unknown[]) => NonPayableMethodObject) =>
	(contract.methods as unknown as Record<string, (...args: unknown[]) => NonPayableMethodObject>)[
		key
	];

/** Waits for the pending microtasks and macrotasks to run. */
export const flush = async (): Promise<void> =>
	new Promise(resolve => {
		setTimeout(resolve, 20);
	});
