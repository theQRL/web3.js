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

// Publishes the packed release tarballs idempotently so that a failed release
// run can be re-driven (audit L-68):
//
// - a package whose exact version is already on the registry is skipped ONLY
//   when the registry's `dist.integrity` equals the SHA-512 of the local
//   tarball, i.e. the registry holds this run's bytes (audit P4-M-9). A version
//   that exists with different bytes (front-run publish, break-glass publish of
//   another build) or whose integrity cannot be read fails the package, and
//   with it the run, so no attestation or GitHub release describes bytes the
//   pipeline did not produce;
// - one failing `npm publish` does not stop the loop: every remaining package
//   is still attempted and the exit status reports all failures at the end;
// - the registry check tolerates a package that has never been published
//   (HTTP 404 from `npm view`), which is the first-release case.
//
// Usage: publish-tarballs.js [released-packages.tsv] [tarball directory]
// The TSV is the one written by scripts/release/packages.js (path, name,
// version, release tag, tarball name). `NPM_EXECUTABLE` overrides the npm
// binary (used by the unit test); every npm flag, including provenance and
// access, comes from the environment exactly as for a plain `npm publish`.

const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();

const [releasedPackagesPath = 'dist/released-packages.tsv', tarballDirectory = 'dist/tarballs'] =
	args;
const npm = process.env.NPM_EXECUTABLE || 'npm';

const releasedPackages = readFileSync(releasedPackagesPath, 'utf8')
	.trim()
	.split('\n')
	.filter(Boolean)
	.map(line => {
		const [packagePath, name, version, releaseTag, tarballName] = line.split('\t');
		return { packagePath, name, version, releaseTag, tarballName };
	});

if (releasedPackages.length === 0) {
	console.info('No released packages to publish');
	process.exit(0);
}

const runNpm = (npmArgs, stdio) =>
	spawnSync(npm, npmArgs, { encoding: 'utf8', stdio, env: process.env });

// Returns 'published' | 'missing' | 'unknown' for name@version on the registry.
const registryStatus = ({ name, version }) => {
	const result = runNpm(['view', name, 'versions', '--json'], ['ignore', 'pipe', 'pipe']);
	if (result.error) return { status: 'unknown', detail: result.error.message };
	if (result.status !== 0) {
		if (/E404|404 Not Found/.test(`${result.stderr}${result.stdout}`))
			return { status: 'missing' };
		return { status: 'unknown', detail: (result.stderr || result.stdout).trim() };
	}
	let versions;
	try {
		const parsed = JSON.parse(result.stdout || '[]');
		versions = Array.isArray(parsed) ? parsed : [parsed];
	} catch (error) {
		return { status: 'unknown', detail: `unparsable npm view output: ${error.message}` };
	}
	return { status: versions.includes(version) ? 'published' : 'missing' };
};

// The registry's Subresource Integrity string for name@version
// (`sha512-<base64>`), or the reason it could not be read.
const registryIntegrity = ({ name, version }) => {
	const result = runNpm(
		['view', `${name}@${version}`, 'dist.integrity', '--json'],
		['ignore', 'pipe', 'pipe'],
	);
	if (result.error) return { detail: result.error.message };
	if (result.status !== 0) return { detail: (result.stderr || result.stdout).trim() };
	let parsed;
	try {
		parsed = JSON.parse((result.stdout || '').trim() || 'null');
	} catch (error) {
		return { detail: `unparsable npm view output: ${error.message}` };
	}
	if (typeof parsed !== 'string' || !/^sha512-[A-Za-z0-9+/]+=*$/.test(parsed)) {
		return { detail: 'the registry reports no sha512 dist.integrity for this version' };
	}
	return { integrity: parsed };
};

// SRI string of the packed tarball on disk, computed the way npm records it.
const localIntegrity = tarballPath => {
	try {
		return {
			integrity: `sha512-${createHash('sha512').update(readFileSync(tarballPath)).digest('base64')}`,
		};
	} catch (error) {
		return { detail: `cannot read ${tarballPath}: ${error.message}` };
	}
};

const published = [];
const skipped = [];
const failed = [];

for (const pkg of releasedPackages) {
	const label = `${pkg.name}@${pkg.version}`;
	const { status, detail } = registryStatus(pkg);

	if (status === 'published') {
		const local = localIntegrity(resolve(tarballDirectory, pkg.tarballName));
		const remote = registryIntegrity(pkg);
		if (local.integrity && remote.integrity && local.integrity === remote.integrity) {
			console.info(`Skipping ${label}: already on the registry with this tarball's integrity`);
			skipped.push(label);
			continue;
		}
		if (!local.integrity || !remote.integrity) {
			console.error(
				`Not publishing ${label}: already on the registry but the integrity check failed (${local.detail ?? remote.detail})`,
			);
			failed.push(`${label} (integrity check)`);
			continue;
		}
		console.error(
			`Not publishing ${label}: the registry already holds this version with a different integrity (registry ${remote.integrity}, local ${local.integrity}); the published bytes are not this run's tarball`,
		);
		failed.push(`${label} (integrity mismatch)`);
		continue;
	}
	if (status === 'unknown') {
		console.error(`Not publishing ${label}: registry check failed (${detail})`);
		failed.push(`${label} (registry check)`);
		continue;
	}

	console.info(`Publishing ${label}`);
	const result = runNpm(
		['publish', resolve(tarballDirectory, pkg.tarballName), '--access', 'public'],
		'inherit',
	);
	if (result.error || result.status !== 0) {
		console.error(
			`Publishing ${label} failed${result.error ? `: ${result.error.message}` : ` with exit status ${result.status}`}`,
		);
		failed.push(label);
		continue;
	}
	published.push(label);
}

console.info(
	`Published ${published.length}, skipped ${skipped.length} already-published, failed ${failed.length} of ${releasedPackages.length} package(s)`,
);

if (failed.length > 0) {
	console.error(
		`Failed: ${failed.join(', ')}. Re-run the publish job: packages already on the registry with this run's integrity are skipped; an integrity mismatch means the registry version was not published by this run and needs investigation (RELEASE.md).`,
	);
	process.exit(1);
}
