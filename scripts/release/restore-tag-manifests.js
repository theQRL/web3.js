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

// Re-creates, for a checked-out tagged commit, the manifests the release run
// that tagged it had in its working tree when it packed and published
// (audit P4-M-12). multi-semantic-release writes nothing back to git, so a
// checkout of the tag still carries the committed `version` fields and
// `workspace:^` ranges; what was published had, for every package tagged at
// that commit:
//
// - `version` set to the tag's version (prepareCmd, set-package-version.js);
// - every `workspace:` range on a publishable sibling replaced by
//   `^<sibling's last release>` (`--deps.prefix=^`), where the sibling's last
//   release is its highest release tag reachable from the commit — the tag of
//   the same run when the sibling was released with it, an older tag otherwise
//   (updateDeps.js, `dependency._nextRelease || dependency._lastRelease`).
//
// `workspace:` ranges on private tools are untouched, as in the release run;
// `pnpm pack` substitutes them with the tool's committed version.
//
// Usage: restore-tag-manifests.js <commit>   (run from the repository root
// with <commit> checked out). Prints one line per restored manifest.

const { publishablePackages } = require('./packages');
const { setPackageVersion } = require('./set-package-version');
const { lastReleaseAt, listTags, parseReleaseTag, substituteWorkspaceVersion } = require('./tags');

const dependencyScopes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

// Returns the released `{ name, version, path }` entries restored at `commit`.
const restoreTagManifests = (commit, { cwd } = {}) => {
	const packages = publishablePackages();
	const publishableNames = new Set(packages.map(pkg => pkg.name));

	const taggedHere = new Map();
	for (const tag of listTags({ cwd, pointsAt: commit })) {
		const parsed = parseReleaseTag(tag);
		if (parsed && publishableNames.has(parsed.name)) taggedHere.set(parsed.name, parsed.version);
	}
	if (taggedHere.size === 0) {
		throw new Error(`${commit} carries no release tag of a publishable package`);
	}

	const siblingVersion = name => {
		if (taggedHere.has(name)) return taggedHere.get(name);
		const release = lastReleaseAt(name, commit, cwd);
		if (!release) {
			throw new Error(`Cannot restore: dependency ${name} has no release tag reachable from ${commit}`);
		}
		return release.version;
	};

	const restored = [];
	for (const pkg of packages) {
		if (!taggedHere.has(pkg.name)) continue;
		const version = taggedHere.get(pkg.name);
		setPackageVersion(pkg.path, version, manifest => {
			for (const scope of dependencyScopes) {
				const entries = manifest[scope];
				if (!entries || typeof entries !== 'object') continue;
				for (const [name, specifier] of Object.entries(entries)) {
					if (!publishableNames.has(name) || typeof specifier !== 'string') continue;
					if (!specifier.startsWith('workspace:')) continue;
					entries[name] = substituteWorkspaceVersion(specifier, siblingVersion(name));
				}
			}
		});
		restored.push({ name: pkg.name, version, path: pkg.path });
	}
	return restored;
};

if (require.main === module) {
	const [commit] = process.argv.slice(2);
	if (!commit) {
		console.error('Usage: restore-tag-manifests.js <commit>');
		process.exit(2);
	}
	try {
		for (const entry of restoreTagManifests(commit)) {
			console.info(`Restored ${entry.name}@${entry.version} (${entry.path})`);
		}
	} catch (error) {
		console.error(error.message);
		process.exit(1);
	}
}

module.exports = { restoreTagManifests };
