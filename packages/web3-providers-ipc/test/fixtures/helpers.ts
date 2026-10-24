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

import path from 'path';
import fs from 'fs';
import os from 'os';
import { getSystemTestProviderUrl } from './system_test_utils';

// A private alias lets this test make its endpoint unavailable without stopping
// the real node or depending on a pre-existing repository-local tmp directory.
export const createIpcEndpointAlias = (): { path: string; close: () => void } => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'web3-ipc-reconnect-'));
	const socketPath = path.join(directory, 'node.ipc');
	fs.symlinkSync(getSystemTestProviderUrl(), socketPath);
	return {
		path: socketPath,
		close: () => fs.rmSync(directory, { recursive: true, force: true }),
	};
};
