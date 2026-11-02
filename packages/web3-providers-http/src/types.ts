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
 * Native Node fetch uses an undici `dispatcher` for proxy and TLS configuration.
 * This is a Node-only option: browser fetch does not support custom dispatchers.
 * A dispatcher must be an object with a `dispatch` function; undefined uses the default.
 * A node-fetch `agent` is rejected when native fetch is available.
 *
 * The transport bounds (`connectionTimeout`, `requestTimeout`, `maxResponseBytes`,
 * `maxResponseDepth`, `maxInFlightRequests`) come
 * from {@link ProviderBoundsOptions} so that the HTTP and socket providers share option
 * names, defaults and validation. Every bound is optional and defaults to a finite value;
 * there is deliberately no way to express "no timeout". `maxResponseBytes` counts response-body
 * bytes, and `maxResponseDepth` bounds JSON nesting before parsing.
 */
export interface HttpProviderOptions extends ProviderBoundsOptions {
	/**
	 * Extra `fetch` options merged into every request. Note that `method` and `body` are
	 * always set by the provider, and `signal` is composed with the provider's own deadline
	 * rather than used directly.
	 *
	 * `headers` is the place for credentials (`authorization`, `x-api-key`, ...): a URL of
	 * the form `http://user:password@host/` is rejected by the constructor (a WHATWG `fetch`
	 * refuses it, node-fetch would send the credentials as Basic authentication, and a header
	 * never ends up in an error message or a log line, whereas a URL does). Per-request `headers` passed to `request()` are
	 * merged on top of these, header names compared case-insensitively so that one name is
	 * sent once; `Content-Type: application/json` is added unless a `content-type` header
	 * (any letter case) is supplied explicitly here or per request.
	 *
	 * `redirect` defaults to `'error'`: a JSON-RPC endpoint that answers with a redirect is
	 * refused rather than followed (the request rejects with a `ConnectionError`), so the
	 * request body and any custom authentication headers are never re-sent to another host.
	 * Set `redirect: 'follow'` to opt in explicitly, knowing what that costs: the underlying
	 * native `fetch` drops `authorization`, `proxy-authorization`, `cookie` and `host` when
	 * the target's origin (scheme, hostname or port) differs. Other headers, including
	 * `x-api-key`, can be sent to any redirect target; 307/308 redirects also retain the body.
	 */
	providerOptions?: RequestInit & { dispatcher?: unknown };
}

/**
 * Per-request options accepted by `HttpProvider.request`.
 *
 * `signal` is taken from {@link RequestBoundsOptions} rather than `RequestInit` so that a
 * caller signal is always composed with (never replaces) the request deadline.
 */
export type HttpRequestOptions = Omit<RequestInit, 'signal'> &
	RequestBoundsOptions & { dispatcher?: unknown };
