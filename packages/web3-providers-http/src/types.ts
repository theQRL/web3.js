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

import { ProviderBoundsOptions, RequestBoundsOptions } from '@theqrl/web3-utils';

/**
 * Constructor options for `HttpProvider`.
 *
 * The transport bounds (`connectionTimeout`, `requestTimeout`, `maxResponseBytes`) come
 * from {@link ProviderBoundsOptions} so that the HTTP and socket providers share option
 * names, defaults and validation. Every bound is optional and defaults to a finite value;
 * there is deliberately no way to express "no timeout".
 */
export interface HttpProviderOptions extends ProviderBoundsOptions {
	/**
	 * Extra `fetch` options merged into every request. Note that `method`, `body` and
	 * `Content-Type` are always set by the provider, and `signal` is composed with the
	 * provider's own deadline rather than used directly.
	 *
	 * `redirect` defaults to `'error'`: a JSON-RPC endpoint that answers with a redirect is
	 * refused rather than followed, so the request body and any custom authentication headers
	 * are never re-sent to another host. Set `redirect: 'follow'` to opt in explicitly.
	 */
	providerOptions?: RequestInit;
}

/**
 * Per-request options accepted by `HttpProvider.request`.
 *
 * `signal` is taken from {@link RequestBoundsOptions} rather than `RequestInit` so that a
 * caller signal is always composed with (never replaces) the request deadline.
 */
export type HttpRequestOptions = Omit<RequestInit, 'signal'> & RequestBoundsOptions;
