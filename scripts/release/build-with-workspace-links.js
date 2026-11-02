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
// Release manifests may refer to sibling versions absent from the source tree.
// Keep release versions for generated artifacts, but restore workspace edges
// while building. Packing always sees the exact original release manifests.
const { existsSync, readdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const withWorkspaceLinks = (build, cwd = process.cwd()) => {
	const manifests = ['packages', 'tools']
		.flatMap(root => {
			const directory = join(cwd, root);
			if (!existsSync(directory)) return [];
			return readdirSync(directory, { withFileTypes: true })
				.filter(entry => entry.isDirectory())
				.map(entry => join(directory, entry.name, 'package.json'))
				.filter(existsSync);
		})
		.map(path => {
			const original = readFileSync(path, 'utf8');
			return { path, original, manifest: JSON.parse(original) };
		});
	const names = new Set(manifests.map(entry => entry.manifest.name));
	try {
		for (const { path, manifest } of manifests) {
			for (const scope of [
				'dependencies',
				'devDependencies',
				'peerDependencies',
				'optionalDependencies',
			]) {
				for (const name of Object.keys(manifest[scope] ?? {})) {
					if (names.has(name)) manifest[scope][name] = 'workspace:*';
				}
			}
			writeFileSync(path, `${JSON.stringify(manifest, undefined, '\t')}\n`);
		}
		return build();
	} finally {
		for (const { path, original } of manifests) writeFileSync(path, original);
	}
};

if (require.main === module) {
	withWorkspaceLinks(() => {
		execFileSync('pnpm', ['run', 'build', '--concurrency=1'], { stdio: 'inherit' });
		execFileSync('pnpm', ['run', 'build:web', '--concurrency=1'], { stdio: 'inherit' });
	});
}
module.exports = { withWorkspaceLinks };
