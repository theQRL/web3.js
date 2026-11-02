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
	EIP1193Provider,
	LegacyRequestProvider,
	LegacySendAsyncProvider,
	LegacySendProvider,
	SupportedProviders,
	Web3APISpec,
	Web3BaseProvider,
} from '@theqrl/web3-types';
import { isNullish } from '@theqrl/web3-utils';
import { BaseWeb3Error, InvalidResponseError } from '@theqrl/web3-errors';

/**
 * A provider is an object carrying one of the request methods below. Primitives (`true`, `0`,
 * a URL string) are never providers, and probing them with the `in` operator would throw a raw
 * `TypeError` instead of letting the caller report an unsupported provider (I-14).
 */
const isObjectLike = (value: unknown): value is Record<string, unknown> =>
	!isNullish(value) && (typeof value === 'object' || typeof value === 'function');

export const isWeb3Provider = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): provider is Web3BaseProvider<API> => Web3BaseProvider.isWeb3Provider(provider);

export const isLegacyRequestProvider = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): provider is LegacyRequestProvider =>
	isObjectLike(provider) &&
	typeof provider.request === 'function' &&
	provider.request.constructor.name === 'Function';

export const isEIP1193Provider = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): provider is EIP1193Provider<API> =>
	isObjectLike(provider) &&
	typeof provider.request === 'function' &&
	provider.request.constructor.name === 'AsyncFunction';

export const isLegacySendProvider = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): provider is LegacySendProvider => isObjectLike(provider) && typeof provider.send === 'function';

export const isLegacySendAsyncProvider = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): provider is LegacySendAsyncProvider =>
	isObjectLike(provider) && typeof provider.sendAsync === 'function';

export const isSupportedProvider = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): provider is SupportedProviders<API> =>
	isObjectLike(provider) &&
	(isWeb3Provider(provider) ||
		isEIP1193Provider(provider) ||
		isLegacyRequestProvider(provider) ||
		isLegacySendAsyncProvider(provider) ||
		isLegacySendProvider(provider));

export const isSupportSubscriptions = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): boolean => {
	if (!isObjectLike(provider)) {
		return false;
	}

	if (typeof provider.supportsSubscriptions === 'function') {
		return Boolean((provider.supportsSubscriptions as () => unknown)());
	}

	return typeof provider.on === 'function';
};

const MAX_DESCRIBED_REPLY_LENGTH = 64;

/**
 * The error a method wrapper throws for a reply that the method's specification does not allow
 * (a `net_version` that is not a number, a `net_listening` that is not a boolean, ...). It is an
 * {@link InvalidResponseError} (code 101) whose message names the method, what the method must
 * return and what came back, cut to 64 characters so that the reply's size never dictates the
 * message's size. Wrapper packages that only depend on `@theqrl/web3-core` fail with the typed
 * error through it (L-40).
 *
 * @param method - The JSON-RPC method whose reply was validated.
 * @param expected - What the method must return, for the message.
 * @param result - The reply that was received.
 */
export const createInvalidResponseError = (
	method: string,
	expected: string,
	result: unknown,
): InvalidResponseError => {
	const text = BaseWeb3Error.convertToString(result);
	const described =
		text.length > MAX_DESCRIBED_REPLY_LENGTH
			? `${text.slice(0, MAX_DESCRIBED_REPLY_LENGTH)}...`
			: text;
	const error = new InvalidResponseError(result as never);
	error.message = `Invalid JSON-RPC response: ${method} must return ${expected}, got ${described}`;
	return error;
};
