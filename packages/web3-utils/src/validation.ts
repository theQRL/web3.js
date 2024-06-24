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

import { InvalidBlockError } from '@theqrl/web3-errors';
import {
	isBlockTag,
	isHexStrict as isHexStrictValidator,
	isNullish as isNullishValidator,
} from '@theqrl/web3-validator';
import { BlockNumberOrTag, BlockTags } from '@theqrl/web3-types';

// NOTE(rgeraldes24): used in tests
/**
 * @deprecated Will be removed in next release. Please use `web3-validator` package instead.
 */
export const isHexStrict = isHexStrictValidator;

/**
 * Compares between block A and block B
 * @param blockA - Block number or string
 * @param blockB - Block number or string
 *
 * @returns - Returns -1 if a \< b, returns 1 if a \> b and returns 0 if a == b
 *
 * @example
 * ```ts
 * console.log(web3.utils.compareBlockNumbers('latest', 'pending'));
 * > -1
 *
 * console.log(web3.utils.compareBlockNumbers(12, 11));
 * > 1
 * ```
 */
export const compareBlockNumbers = (blockA: BlockNumberOrTag, blockB: BlockNumberOrTag) => {
	const isABlockTag = typeof blockA === 'string' && isBlockTag(blockA);
	const isBBlockTag = typeof blockB === 'string' && isBlockTag(blockB);

	if (
		blockA === blockB ||
		((blockA === 'earliest' || blockA === 0) && (blockB === 'earliest' || blockB === 0)) // only exception compare blocktag with number
	) {
		return 0;
	}
	if (blockA === 'earliest' && blockB > 0) {
		return -1;
	}
	if (blockB === 'earliest' && blockA > 0) {
		return 1;
	}

	if (isABlockTag && isBBlockTag) {
		// Increasing order:  earliest, finalized , safe, latest, pending
		const tagsOrder = {
			[BlockTags.EARLIEST as string]: 1,
			[BlockTags.FINALIZED as string]: 2,
			[BlockTags.SAFE as string]: 3,
			[BlockTags.LATEST as string]: 4,
			[BlockTags.PENDING as string]: 5,
		};

		if (tagsOrder[blockA] < tagsOrder[blockB]) {
			return -1;
		}

		return 1;
	}
	if ((isABlockTag && !isBBlockTag) || (!isABlockTag && isBBlockTag)) {
		throw new InvalidBlockError('Cannot compare blocktag with provided non-blocktag input.');
	}

	const bigIntA = BigInt(blockA);
	const bigIntB = BigInt(blockB);

	if (bigIntA < bigIntB) {
		return -1;
	}
	if (bigIntA === bigIntB) {
		return 0;
	}
	return 1;
};

export const isNullish = isNullishValidator;
