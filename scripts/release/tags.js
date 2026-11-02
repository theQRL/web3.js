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

// Release tags are `<package name>@<x.y.z>` (scripts/release/packages.js
// `releaseTag`), one per released package, all pointing at the commit the
// release run tagged. multi-semantic-release derives a package's last release
// — and therefore the next version AND the sibling ranges it writes into every
// released manifest (`^<last release>`) — from the highest such tag reachable
// from the commit being released, never from the committed `version` field
// (node_modules/multi-semantic-release/lib/updateDeps.js, `_lastRelease`).
// These helpers read the same information so the release scripts can tell
// what a tag implied and what the registry should therefore hold.

const { execFileSync, spawnSync } = require('child_process');

const releaseTagPattern = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@(\d+\.\d+\.\d+)$/;

// `{ name, version }` of a stable release tag, or undefined for anything else
// (prerelease tags are not produced by this repository's release configuration).
const parseReleaseTag = tag => {
	const match = releaseTagPattern.exec(tag);
	return match ? { name: match[1], version: match[2] } : undefined;
};

// Numeric comparison of two `x.y.z` versions.
const compareVersions = (a, b) => {
	const left = a.split('.').map(Number);
	const right = b.split('.').map(Number);
	for (let index = 0; index < 3; index += 1) {
		if (left[index] !== right[index]) return left[index] - right[index];
	}
	return 0;
};

const highestVersion = versions =>
	versions.reduce(
		(best, version) => (best === undefined || compareVersions(version, best) > 0 ? version : best),
		undefined,
	);

// Highest release per package name from a list of tag names:
// `Map<name, { version, tag }>`. Unparsable tags are ignored.
const latestReleasesFromTags = tags => {
	const latest = new Map();
	for (const tag of tags) {
		const parsed = parseReleaseTag(tag);
		if (!parsed) continue;
		const current = latest.get(parsed.name);
		if (!current || compareVersions(parsed.version, current.version) > 0) {
			latest.set(parsed.name, { version: parsed.version, tag });
		}
	}
	return latest;
};

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// Tag names reachable from `mergedInto` (default: every tag).
const listTags = ({ cwd, mergedInto, pointsAt } = {}) => {
	const args = ['tag', '--list'];
	if (mergedInto) args.push('--merged', mergedInto);
	if (pointsAt) args.push('--points-at', pointsAt);
	return git(args, cwd).split('\n').filter(Boolean);
};

const tagExists = (tag, cwd) =>
	spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`], {
		cwd,
		encoding: 'utf8',
	}).status === 0;

// The commit a (lightweight or annotated) tag points at.
const tagCommit = (tag, cwd) => git(['rev-list', '-n', '1', `refs/tags/${tag}`], cwd);

// What multi-semantic-release considers the last release of `name` when it
// runs on `commit`: the highest `name@x.y.z` tag reachable from that commit.
const lastReleaseAt = (name, commit, cwd) => {
	const tags = listTags({ cwd, mergedInto: commit }).filter(tag => parseReleaseTag(tag)?.name === name);
	return latestReleasesFromTags(tags).get(name);
};

// Resolves a `workspace:` specifier exactly as multi-semantic-release does
// (updateDeps.js `substituteWorkspaceVersion`): `workspace:^` -> `^<version>`,
// `workspace:~` -> `~<version>`, `workspace:*` -> `<version>`, and an explicit
// `workspace:<range>` keeps its range. Other specifiers are returned unchanged.
const substituteWorkspaceVersion = (specifier, version) => {
	if (!specifier.startsWith('workspace:')) return specifier;
	const [, range, caret] = /^workspace:(([\^~*])?.*)$/.exec(specifier);
	if (caret !== range) return range;
	return caret === '*' ? version : caret + version;
};

module.exports = {
	compareVersions,
	highestVersion,
	lastReleaseAt,
	latestReleasesFromTags,
	listTags,
	parseReleaseTag,
	substituteWorkspaceVersion,
	tagCommit,
	tagExists,
};
