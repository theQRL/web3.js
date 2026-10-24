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

/**
 * The `web3-qrl` package allows you to interact with a QRL blockchain and QRL smart contracts.
 *
 * To use this package standalone and use its methods use:
 * ```ts
 * import { Web3Context } from '@theqrl/web3-core';
 * import { BlockTags } from '@theqrl/web3-types';
 * import { DEFAULT_RETURN_FORMAT } from '@theqrl/web3-types';
 * import { getBalance} from '@theqrl/web3-qrl';
 *
 * getBalance(
 *      new Web3Context('http://127.0.0.1:8545'),
 *      'Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3',
 *      BlockTags.LATEST,
 *      DEFAULT_RETURN_FORMAT
 * ).then(console.log);
 * > 1000000000000n
 * ```
 *
 * To use this package within the `web3` object use:
 * ```ts
 * import Web3 from '@theqrl/web3';
 *
 * const web3 = new Web3(Web3.givenProvider || 'ws://some.local-or-remote.node:8546');
 * web3.qrl.getBalance('Q83cd1122848dd1b2E3AF9ca60a1340e595B2C6d5b3B340AfD625e38EEf9067bc9C28db215702Aa8B3C0243Bb13785a9365A35ee1Fe8e57983b1D47d9fff835a3').then(console.log);
 * > 1000000000000n
 *```
 *
 * With `web3-qrl` you can also subscribe (if supported by provider) to events in the QRL Blockchain, using the `subscribe` function. See more at the {@link Web3QRL.subscribe} function.
 */
/**
 *
 */
import 'setimmediate';

import { Web3QRL } from './web3_qrl.js';

export * from './web3_qrl.js';
export * from './schemas.js';
export * from './types.js';
export * from './validation.js';
export * from './rpc_method_wrappers.js';
export * from './utils/format_transaction.js';
export * from './utils/prepare_transaction_for_signing.js';
export * from './web3_subscriptions.js';
export { detectTransactionType } from './utils/detect_transaction_type.js';
export { transactionBuilder } from './utils/transaction_builder.js';

export default Web3QRL;
