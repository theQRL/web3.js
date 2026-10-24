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
	QRLExecutionAPI,
	HexString,
	ProviderConnectInfo,
	Web3APIMethod,
	Web3APIPayload,
	Web3APISpec,
	Web3BaseProvider,
} from '@theqrl/web3-types';
import { EventEmitter, EventEmitterLike } from './event_emitter.js';
import { EIP1193ProviderRpcError, InvalidResponseError } from '@theqrl/web3-errors';
import { toPayload } from './json_rpc.js';

/**
 * This is an abstract class, which extends {@link Web3BaseProvider} class. This class is used to implement a provider that adheres to the EIP-1193 standard for QRL providers.
 */
export abstract class Eip1193Provider<
	API extends Web3APISpec = QRLExecutionAPI,
> extends Web3BaseProvider<API> {
	protected readonly _eventEmitter: EventEmitterLike = new EventEmitter();
	private _chainId: HexString = '';
	private _accounts: HexString[] = [];
	private _connectionGeneration = 0;

	protected _invalidateConnection(): void {
		this._connectionGeneration += 1;
	}

	protected _emitError(error: unknown): void {
		if (this._eventEmitter.listenerCount('error') > 0) {
			this._eventEmitter.emit('error', error);
		}
	}

	private async _getChainId(): Promise<HexString> {
		const data = await (this as Web3BaseProvider<API>).request<
			Web3APIMethod<API>,
			ResponseType
		>(
			toPayload({
				method: 'qrl_chainId',
				params: [],
			}) as Web3APIPayload<API, Web3APIMethod<API>>,
		);
		if (typeof data?.result !== 'string' || data.error) throw new InvalidResponseError(data);
		return data.result;
	}

	private async _getAccounts(): Promise<HexString[]> {
		const data = await (this as Web3BaseProvider<API>).request<Web3APIMethod<API>, HexString[]>(
			toPayload({
				method: 'qrl_accounts',
				params: [],
			}) as Web3APIPayload<API, Web3APIMethod<API>>,
		);
		if (!Array.isArray(data?.result) || data.error) throw new InvalidResponseError(data);
		return data.result;
	}

	protected _onConnect() {
		const generation = ++this._connectionGeneration;
		Promise.all([this._getChainId(), this._getAccounts()])
			.then(([chainId, accounts]) => {
				if (generation !== this._connectionGeneration) return;
				if (chainId !== this._chainId) {
					this._chainId = chainId;
					this._eventEmitter.emit('chainChanged', chainId);
				}
				const unchanged =
					this._accounts.length === accounts.length &&
					accounts.every(account => this._accounts.includes(account));
				if (!unchanged) {
					this._accounts = accounts;
					this._onAccountsChanged();
				}
				if (generation !== this._connectionGeneration) return;
				this._eventEmitter.emit('connect', {
					chainId: this._chainId,
				} as ProviderConnectInfo);
			})
			.catch(err => this._emitError(err));
	}

	// todo this must be ProvideRpcError with a message too
	protected _onDisconnect(code: number, data?: unknown) {
		this._invalidateConnection();
		this._eventEmitter.emit('disconnect', new EIP1193ProviderRpcError(code, data));
	}

	private _onAccountsChanged() {
		// get chainId and safe to local
		this._eventEmitter.emit('accountsChanged', this._accounts);
	}
}
