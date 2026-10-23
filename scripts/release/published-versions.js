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

// Compares what this checkout says was released with what the registry holds.
//
// Usage: published-versions.js [--tags] [--check]
//
//   (default)  compares the committed manifest versions with the registry's
//              `latest` tag (post-release verification, RELEASE.md).
//   --tags     compares the last release tag of every publishable package —
//              the version multi-semantic-release derives the next release and
//              the sibling ranges from — with the registry's version list. A
//              tagged version that is missing from the registry wedges every
//              dependant's next release (`^<missing version>` fails to install),
//              see RELEASE.md "Recovering From A Failed Release Run" (P4-M-12).
//   --check    exit 1 when any compared version is missing from the registry
//              or a registry lookup failed; used as the release pre-flight.

const { publishablePackages } = require('./packages');
const { fetchPublished } = require('./registry');
const { compareVersions, lastReleaseAt } = require('./tags');

const status = (local, latest) => {
	if (latest === null) return 'unpublished';
	if (local === latest) return 'in-sync';
	const cmp = compareVersions(local, latest);
	if (cmp > 0) return 'ahead-of-npm';
	if (cmp < 0) return 'behind-npm';
	return 'in-sync';
};

// One row per publishable package, from the manifest version (default) or the
// last release tag (`useTags`).
const compareWithRegistry = async ({ useTags = false, fetchImpl, cwd } = {}) => {
	const packages = publishablePackages();
	return Promise.all(
		packages.map(async pkg => {
			const release = useTags ? lastReleaseAt(pkg.name, 'HEAD', cwd) : { version: pkg.version };
			if (!release) {
				return { name: pkg.name, local: '—', npm: '—', status: 'untagged', note: 'never released' };
			}
			try {
				const { latest, versions } = await fetchPublished(pkg.name, fetchImpl);
				const published = versions.includes(release.version);
				if (useTags) {
					return {
						name: pkg.name,
						local: release.version,
						npm: latest ?? '—',
						status: published ? 'published' : 'missing',
						note: published ? '' : `tag ${release.tag} is not on the registry`,
					};
				}
				return {
					name: pkg.name,
					local: release.version,
					npm: latest ?? '—',
					status: status(release.version, latest),
					note: !published && latest !== null ? `local ${release.version} not on npm` : '',
				};
			} catch (err) {
				return { name: pkg.name, local: release.version, npm: 'ERROR', status: 'error', note: err.message };
			}
		}),
	);
};

const printTable = rows => {
	const widths = {
		name: Math.max(7, ...rows.map(r => r.name.length)),
		local: Math.max(5, ...rows.map(r => r.local.length)),
		npm: Math.max(11, ...rows.map(r => r.npm.length)),
		status: Math.max(6, ...rows.map(r => r.status.length)),
	};
	const pad = (s, n) => String(s).padEnd(n);

	console.log(
		`${pad('PACKAGE', widths.name)}  ${pad('LOCAL', widths.local)}  ${pad('NPM LATEST', widths.npm)}  ${pad('STATUS', widths.status)}  NOTE`,
	);
	for (const r of rows) {
		console.log(
			`${pad(r.name, widths.name)}  ${pad(r.local, widths.local)}  ${pad(r.npm, widths.npm)}  ${pad(r.status, widths.status)}  ${r.note}`,
		);
	}

	const counts = rows.reduce((acc, r) => {
		acc[r.status] = (acc[r.status] || 0) + 1;
		return acc;
	}, {});
	console.log(
		`\n${rows.length} publishable packages. ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ')}`,
	);
};

if (require.main === module) {
	const args = new Set(process.argv.slice(2));
	const useTags = args.has('--tags');
	const check = args.has('--check');

	compareWithRegistry({ useTags })
		.then(rows => {
			printTable(rows);
			if (!check) return;
			const blocking = rows.filter(row => row.status === 'missing' || row.status === 'error');
			if (blocking.length > 0) {
				console.error(
					`\n${blocking.length} package(s) have a release that is not on the registry: ${blocking.map(row => `${row.name}@${row.local}`).join(', ')}.\n` +
						'Publish them first: run the Release workflow manually (workflow_dispatch) with "all-missing", or delete an unpublished tag and its draft release if that version must never ship. See RELEASE.md, "Recovering From A Failed Release Run".',
				);
				process.exit(1);
			}
		})
		.catch(err => {
			console.error(err);
			process.exit(1);
		});
}

module.exports = { compareWithRegistry, status };
