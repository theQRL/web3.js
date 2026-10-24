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

const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

// Sets the manifest version of the package in `packageDirectory` and keeps
// src/version.ts in sync with it. The release pipeline only updates
// package.json by default (multi-semantic-release's prepareCmd runs this
// script); any runtime accessor for the package version (e.g. Web3PkgInfo)
// lives in src/version.ts and would otherwise drift on every release.
// `mutateManifest` lets a caller apply further manifest changes in the same
// write (scripts/release/restore-tag-manifests.js rewrites sibling ranges).
const setPackageVersion = (packageDirectory, version, mutateManifest = () => {}) => {
	const manifestPath = join(packageDirectory, 'package.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

	manifest.version = version;
	mutateManifest(manifest);
	writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, '\t')}\n`);

	const versionTsPath = join(packageDirectory, 'src', 'version.ts');
	if (existsSync(versionTsPath)) {
		const original = readFileSync(versionTsPath, 'utf8');
		const versionLiteralPattern = /(version\s*:\s*)(['"])[^'"]*\2/;
		if (!versionLiteralPattern.test(original)) {
			throw new Error(
				`set-package-version: ${versionTsPath} exists but contains no \`version: '...'\` literal to update`,
			);
		}
		const updated = original.replace(versionLiteralPattern, `$1$2${version}$2`);
		if (updated !== original) {
			writeFileSync(versionTsPath, updated);
		}
	}
};

if (require.main === module) {
	const [version] = process.argv.slice(2);

	if (!version) {
		console.error('Usage: set-package-version.js <version>');
		process.exit(1);
	}

	try {
		setPackageVersion(process.cwd(), version);
	} catch (error) {
		console.error(error.message);
		process.exit(1);
	}
}

module.exports = { setPackageVersion };
