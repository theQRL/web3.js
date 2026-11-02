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

import { InvalidResponseError } from '@theqrl/web3-errors';
import { ResolvedProviderBounds } from './provider_bounds.js';

/** Allow dense struct-logger traces while bounding heap amplification, including empty containers. */
export const maxResponseContainers = (maxBytes: number): number =>
	Math.max(1024, Math.floor(maxBytes / 16));

export const jsonStructureViolation = (
	depth: number,
	containers: number,
	maxDepth: number,
	maxContainers: number,
): string | undefined => {
	if (depth > maxDepth) return `JSON-RPC message exceeds maximum nesting depth ${maxDepth}`;
	if (containers > maxContainers)
		return `JSON-RPC message exceeds maximum container count ${maxContainers}`;
	return undefined;
};

/** Linear, allocation-free pre-scan; JSON.parse still validates JSON syntax afterwards. */
export const findJsonStructureViolation = (
	text: string,
	bounds: Pick<ResolvedProviderBounds, 'maxResponseBytes' | 'maxResponseDepth'>,
): string | undefined => {
	let depth = 0;
	let containers = 0;
	let inString = false;
	let escaped = false;
	const maxContainers = maxResponseContainers(bounds.maxResponseBytes);
	for (let i = 0; i < text.length; i += 1) {
		const c = text.charCodeAt(i);
		if (inString) {
			if (escaped) escaped = false;
			else if (c === 92) escaped = true;
			else if (c === 34) inString = false;
		} else if (c === 34) inString = true;
		else if (c === 123 || c === 91) {
			depth += 1;
			containers += 1;
			const violation = jsonStructureViolation(
				depth,
				containers,
				bounds.maxResponseDepth,
				maxContainers,
			);
			if (violation) return violation;
		} else if (c === 125 || c === 93) depth -= 1;
	}
	return undefined;
};

export const assertJsonStructureBounds = (
	text: string,
	bounds: Pick<ResolvedProviderBounds, 'maxResponseBytes' | 'maxResponseDepth'>,
): void => {
	const message = findJsonStructureViolation(text, bounds);
	if (message)
		throw new InvalidResponseError({
			jsonrpc: '2.0',
			id: 0,
			error: { code: 2, message },
		});
};
