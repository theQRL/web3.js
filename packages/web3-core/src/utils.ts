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
	SupportedProviders,
	Web3APISpec,
	Web3BaseProvider,
} from '@theqrl/web3-types';

export const isWeb3Provider = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): provider is Web3BaseProvider<API> => Web3BaseProvider.isWeb3Provider(provider);



export const isEIP1193Provider = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): provider is EIP1193Provider<API> =>
	typeof provider !== 'string' &&
	'request' in provider &&
	provider.request.constructor.name === 'AsyncFunction';

export const isSupportedProvider = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): provider is SupportedProviders<API> =>
	provider &&
	(isWeb3Provider(provider) ||
		isEIP1193Provider(provider));

export const isSupportSubscriptions = <API extends Web3APISpec>(
	provider: SupportedProviders<API>,
): boolean => {
	if (provider && 'supportsSubscriptions' in provider) {
		return provider.supportsSubscriptions();
	}

	if (provider && typeof provider !== 'string' && 'on' in provider) {
		return true;
	}

	return false;
};
