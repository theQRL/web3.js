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

/* eslint-disable max-classes-per-file */

import {
	ERR_ZNS_CHECK_INTERFACE_SUPPORT,
	ERR_ZNS_NETWORK_NOT_SYNCED,
	ERR_ZNS_UNSUPPORTED_NETWORK,
} from '../error_codes.js';
import { BaseWeb3Error } from '../web3_error_base.js';

export class ZNSCheckInterfaceSupportError extends BaseWeb3Error {
	public code = ERR_ZNS_CHECK_INTERFACE_SUPPORT;
	public constructor(errorDetails: string) {
		super(`ZNS resolver check interface support error. "${errorDetails}"`);
	}
}

export class ZNSUnsupportedNetworkError extends BaseWeb3Error {
	public code = ERR_ZNS_UNSUPPORTED_NETWORK;
	public constructor(networkType: string) {
		super(`ZNS is not supported on network ${networkType}`);
	}
}

export class ZNSNetworkNotSyncedError extends BaseWeb3Error {
	public code = ERR_ZNS_NETWORK_NOT_SYNCED;
	public constructor() {
		super(`Network not synced`);
	}
}
