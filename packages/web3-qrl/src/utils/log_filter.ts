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

import { Bytes, Filter, QRL_DATA_FORMAT } from '@theqrl/web3-types';
import { format } from '@theqrl/web3-utils';
import { isNullish } from '@theqrl/web3-validator';
import { invalidResponseError } from './invalid_response_error.js';

/** Check a schema-validated log against the request's address and positional topic filter. */
export const assertLogMatchesFilter = (
	method: string,
	entry: { address?: unknown; topics?: unknown },
	filter: Pick<Filter, 'address' | 'topics'> | null = {},
): void => {
	filter ??= {};
	const addresses = Array.isArray(filter.address) ? filter.address : [filter.address];
	const matchesAddress =
		isNullish(filter.address) ||
		addresses.length === 0 ||
		addresses.some(
			address =>
				typeof entry.address === 'string' &&
				typeof address === 'string' &&
				address.toLowerCase() === entry.address.toLowerCase(),
		);
	const topics = entry.topics as Bytes[] | undefined;
	const matchesTopics =
		!filter.topics?.length ||
		(Array.isArray(topics) &&
			topics.length >= filter.topics.length &&
			filter.topics.every((topic, index) => {
				const alternatives = Array.isArray(topic) ? topic : [topic];
				return (
					alternatives.length === 0 ||
					alternatives.some(
						alternative =>
							isNullish(alternative) ||
							(typeof alternative === 'string' &&
								alternative.replace(/^0x/i, '').toLowerCase() ===
									format({ format: 'bytes64' }, topics[index], QRL_DATA_FORMAT)
										.replace(/^0x/i, '')
										.toLowerCase()),
					)
				);
			}));
	if (!matchesAddress || !matchesTopics) {
		throw invalidResponseError(method, 'logs matching the requested address and topics', entry);
	}
};
