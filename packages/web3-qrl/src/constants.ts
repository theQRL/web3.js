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
import { FMT_BYTES, FMT_NUMBER } from '@theqrl/web3-types';

export const NUMBER_DATA_FORMAT = { bytes: FMT_BYTES.HEX, number: FMT_NUMBER.NUMBER } as const;

/**
 * How many consecutive failed polls are tolerated before the failure is reported, both while
 * waiting for a receipt (`qrl_getTransactionReceipt`) and while counting confirmations
 * (`qrl_getBlockByNumber`). One transient node error used to abort the wait for a transaction
 * that was already broadcast (L-49) or to stop the confirmation watcher (M-7c); a persistent
 * error must still surface quickly instead of hiding behind the polling timeout.
 */
export const MAX_CONSECUTIVE_POLLING_ERRORS = 5;
