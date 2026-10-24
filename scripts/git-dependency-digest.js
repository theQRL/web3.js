#!/usr/bin/env node

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

// In addition to the archive integrity pinned in the lockfile, check that the installed
// package still matches the reviewed tree. This module hashes sorted relative paths and
// file contents (nested node_modules excluded) for `scripts/doctor.js`.
//
// Recompute a digest after changing the pinned commit:
//   node scripts/git-dependency-digest.js @theqrl/qrl-contracts

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function listFiles(dir) {
	const files = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	entries.sort((a, b) => byCodePoint(a.name, b.name));
	for (const entry of entries) {
		if (entry.name === 'node_modules') continue;
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFiles(entryPath));
		} else if (entry.isFile()) {
			files.push(entryPath);
		}
	}
	return files;
}

/**
 * Returns the SHA-256 digest of the package installed at `packageRoot`, or `null` when the
 * directory does not exist.
 */
function digestInstalledPackage(packageRoot) {
	if (!fs.existsSync(packageRoot)) return null;

	const hash = crypto.createHash('sha256');
	for (const file of listFiles(packageRoot)) {
		hash.update(path.relative(packageRoot, file).split(path.sep).join('/'));
		hash.update('\0');
		hash.update(fs.readFileSync(file));
		hash.update('\0');
	}
	return hash.digest('hex');
}

function installedPackageRoot(repoRoot, packageName) {
	return path.join(repoRoot, 'node_modules', ...packageName.split('/'));
}

if (require.main === module) {
	const [packageName] = process.argv.slice(2);
	if (!packageName) {
		console.error('Usage: git-dependency-digest.js <package-name>');
		process.exit(1);
	}
	const digest = digestInstalledPackage(
		installedPackageRoot(path.resolve(__dirname, '..'), packageName),
	);
	if (digest === null) {
		console.error(`${packageName} is not installed`);
		process.exit(1);
	}
	console.log(digest);
}

module.exports = { digestInstalledPackage, installedPackageRoot };
