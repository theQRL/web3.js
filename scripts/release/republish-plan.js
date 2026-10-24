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

// Plans a manual (workflow_dispatch) release run that rebuilds and publishes
// versions that were tagged by an earlier run but never reached the registry
// (audit P4-M-12). Tags are pushed before anything is published, and
// multi-semantic-release derives sibling ranges from the last tag, so a
// tagged-but-unpublished version blocks every dependant until it is published.
//
// Usage: republish-plan.js <"all-missing" | tag[,tag...]> <output directory>
//
// Writes <output directory>/republish.tsv (commit, package path, name, version,
// release tag, tarball name — one row per package to rebuild, grouped by
// commit), plus released-packages.tsv/.json in the shape packages.js writes so
// the rest of the release workflow is unchanged, and the GitHub outputs
// `released`, `count` and `packages`. A requested tag whose version is already
// on the registry is reported and left out: publish-tarballs.js would only
// re-verify its integrity, and a rebuilt tarball is not guaranteed to be
// byte-identical.

const { mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');

const { publishablePackages, releaseTag, tarballName } = require('./packages');
const { fetchPublished } = require('./registry');
const { lastReleaseAt, parseReleaseTag, tagCommit, tagExists } = require('./tags');

const writeGithubOutput = values => {
	const outputPath = process.env.GITHUB_OUTPUT;
	if (!outputPath) return;
	const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
	writeFileSync(outputPath, `${lines.join('\n')}\n`, { flag: 'a' });
};

// Resolves the request into `{ entries, skipped }`; throws on an invalid tag.
const planRepublish = async (request, { cwd, fetchImpl } = {}) => {
	const packages = publishablePackages();
	const byName = new Map(packages.map(pkg => [pkg.name, pkg]));
	const wanted = [];

	if (request.trim() === 'all-missing') {
		for (const pkg of packages) {
			const release = lastReleaseAt(pkg.name, 'HEAD', cwd);
			if (release) wanted.push({ pkg, tag: release.tag, version: release.version });
		}
	} else {
		const tags = Array.from(new Set(request.split(/[\s,]+/).filter(Boolean)));
		if (tags.length === 0) throw new Error('No release tags given; pass "all-missing" or a comma-separated list of tags');
		for (const tag of tags) {
			const parsed = parseReleaseTag(tag);
			if (!parsed) throw new Error(`${tag} is not a release tag of the form <package>@<x.y.z>`);
			const pkg = byName.get(parsed.name);
			if (!pkg) throw new Error(`${tag} does not name a publishable workspace package`);
			if (!tagExists(tag, cwd)) throw new Error(`${tag} does not exist in this checkout; fetch the tags first`);
			wanted.push({ pkg, tag, version: parsed.version });
		}
	}

	const entries = [];
	const skipped = [];
	for (const { pkg, tag, version } of wanted) {
		const { versions } = await fetchPublished(pkg.name, fetchImpl);
		if (versions.includes(version)) {
			skipped.push(`${tag} (already on the registry)`);
			continue;
		}
		const released = { ...pkg, version };
		entries.push({
			commit: tagCommit(tag, cwd),
			path: pkg.path,
			name: pkg.name,
			version,
			private: pkg.private,
			access: pkg.access,
			releaseTag: releaseTag(released),
			tarballName: tarballName(released),
		});
	}
	entries.sort((a, b) => a.commit.localeCompare(b.commit) || a.name.localeCompare(b.name));
	return { entries, skipped };
};

const writePlan = (outputDirectory, entries) => {
	mkdirSync(outputDirectory, { recursive: true });
	const republishRows = entries.map(entry =>
		[entry.commit, entry.path, entry.name, entry.version, entry.releaseTag, entry.tarballName].join('\t'),
	);
	writeFileSync(join(outputDirectory, 'republish.tsv'), republishRows.length ? `${republishRows.join('\n')}\n` : '');
	const releasedRows = entries.map(entry =>
		[entry.path, entry.name, entry.version, entry.releaseTag, entry.tarballName].join('\t'),
	);
	writeFileSync(join(outputDirectory, 'released-packages.tsv'), releasedRows.length ? `${releasedRows.join('\n')}\n` : '');
	writeFileSync(
		join(outputDirectory, 'released-packages.json'),
		`${JSON.stringify(
			entries.map(({ commit, ...rest }) => rest),
			null,
			2,
		)}\n`,
	);
};

if (require.main === module) {
	const [request, outputDirectory] = process.argv.slice(2);
	if (!request || !outputDirectory) {
		console.error('Usage: republish-plan.js <"all-missing" | tag[,tag...]> <output directory>');
		process.exit(2);
	}
	planRepublish(request)
		.then(({ entries, skipped }) => {
			for (const note of skipped) console.info(`Skipping ${note}`);
			for (const entry of entries) console.info(`Republishing ${entry.releaseTag} from ${entry.commit}`);
			writePlan(outputDirectory, entries);
			writeGithubOutput({
				released: entries.length > 0 ? 'true' : 'false',
				count: String(entries.length),
				packages: entries.map(entry => entry.name).join(','),
			});
			if (entries.length === 0) console.info('Nothing to republish: every requested version is on the registry');
		})
		.catch(err => {
			console.error(err.message || err);
			process.exit(1);
		});
}

module.exports = { planRepublish, writePlan };
