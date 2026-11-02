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

import { QRLExecutionAPI, SupportedProviders, Web3NetAPI } from '@theqrl/web3-types';
import { toChecksumAddress } from '@theqrl/web3-utils';

export const OWNER = toChecksumAddress(`Q${'11'.repeat(64)}`);
export const RESOLVER = toChecksumAddress(`Q${'cd'.repeat(64)}`);
export const CUSTOM_REGISTRY = toChecksumAddress(`Q${'ab'.repeat(64)}`);

/** A 64-byte ABI word (128 hex characters) from a hex string without prefix. */
export const word = (hex: string): string => hex.padStart(128, '0');
export const uintWord = (value: number | bigint): string => word(BigInt(value).toString(16));
export const addrWord = (address: string): string => word(address.slice(1).toLowerCase());
export const boolWord = (value: boolean): string => uintWord(value ? 1 : 0);
/** ABI encoding of a single dynamic `bytes` return value. */
export const bytesReturn = (hex: string): string => {
	const padded = hex.padEnd(Math.ceil(hex.length / 128) * 128, '0');
	return `0x${uintWord(64)}${uintWord(hex.length / 2)}${padded}`;
};

/** A single JSON-RPC request as the request manager sends it. */
type Request = { id?: unknown; method: string; params?: unknown };
export type FakeRpcHandler = (method: string, params: unknown[]) => unknown;
export interface RpcCall {
	method: string;
	params: unknown[];
}
type Listener = (...args: unknown[]) => void;

/**
 * A minimal in-memory provider. `handler(method, params)` returns the result; throwing an
 * object with a `code` produces a JSON-RPC error reply. Every request is recorded in `calls`.
 */
export class FakeProvider {
	public readonly calls: RpcCall[] = [];
	private readonly listeners = new Map<string, Listener[]>();
	private readonly handler: FakeRpcHandler;

	public constructor(handler: FakeRpcHandler = () => undefined) {
		this.handler = handler;
		Object.defineProperty(this, Symbol.for('web3/base-provider'), { value: true });
	}

	// eslint-disable-next-line class-methods-use-this
	public supportsSubscriptions(): boolean {
		return false;
	}

	public async request(payload: Request): Promise<unknown> {
		const params = Array.isArray(payload.params) ? (payload.params as unknown[]) : [];
		this.calls.push({ method: payload.method, params });
		try {
			const result = (await this.handler(payload.method, params)) ?? '0x';
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

	public callsTo(method: string): RpcCall[] {
		return this.calls.filter(call => call.method === method);
	}

	public asProvider(): SupportedProviders<QRLExecutionAPI & Web3NetAPI> {
		return this as unknown as SupportedProviders<QRLExecutionAPI & Web3NetAPI>;
	}
}

/** The `to` address of a recorded `qrl_call`, lowercased. */
export const calledContract = (call: RpcCall | undefined): string | undefined =>
	(call?.params[0] as { to?: string } | undefined)?.to?.toLowerCase();

/** The 4-byte selector of the calldata of a recorded `qrl_call`. */
export const calledSelector = (call: RpcCall | undefined): string | undefined => {
	const tx = call?.params[0] as { input?: string; data?: string } | undefined;
	return (tx?.input ?? tx?.data)?.slice(0, 10);
};
