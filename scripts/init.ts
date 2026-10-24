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
	existsSync,
	writeFileSync,
	readFileSync,
	fchmodSync,
	openSync,
	closeSync,
	constants,
	lstatSync,
} from 'fs';

if (!existsSync('.secrets.json')) {
	const data = readFileSync('templates/.secrets.json.tmpl', 'utf-8');
	writeFileSync('.secrets.json', data, { mode: 0o600, flag: 'wx' });
}

// O_NOFOLLOW also closes the race between checking the path and changing permissions.
if (lstatSync('.secrets.json').isSymbolicLink())
	throw new Error('.secrets.json must not be a symlink');
const secretsFd = openSync('.secrets.json', constants.O_RDONLY | constants.O_NOFOLLOW);
try {
	fchmodSync(secretsFd, 0o600);
} finally {
	closeSync(secretsFd);
}
