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

// Re-attest path of a manual release run: proves that the tarballs this run
// rebuilt from the release tags have exactly the contents of the versions on
// the registry, then replaces them with the registry's bytes so the
// attestations, checksums and GitHub release assets name what consumers
// install.
//
// Usage: verify-registry-tarballs.js <released-packages.tsv> <tarball directory>
//
// For every row the published tarball is downloaded, checked against the
// registry's sha512 `dist.integrity`, and compared with the rebuilt tarball
// after gunzip. The uncompressed tar is what pnpm pack produces
// deterministically (fixed mtimes and modes); the gzip framing around it
// depends on the zlib of the machine that packed it, so it is the one part
// not compared. Any difference fails the run and leaves the directory as the
// rebuild produced it.

const { createHash } = require('crypto');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { gunzipSync } = require('zlib');

const { fetchVersionDist } = require('./registry');

// A published package tarball larger than this is refused rather than read.
const MAX_TARBALL_BYTES = 64 * 1024 * 1024;

const sha512Integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

const readRows = tsvPath =>
	readFileSync(tsvPath, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map(line => {
			const [path, name, version, releaseTag, tarballName] = line.split('\t');
			return { path, name, version, releaseTag, tarballName };
		});

const download = async (url, fetchImpl) => {
	const res = await fetchImpl(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const declared = Number(res.headers.get('content-length'));
	if (declared > MAX_TARBALL_BYTES) throw new Error(`tarball is larger than ${MAX_TARBALL_BYTES} bytes`);
	const bytes = Buffer.from(await res.arrayBuffer());
	if (bytes.length > MAX_TARBALL_BYTES) throw new Error(`tarball is larger than ${MAX_TARBALL_BYTES} bytes`);
	return bytes;
};

// Returns `{ verified, failed }`; writes the registry bytes over the rebuilt
// tarballs only when every row verified.
const verifyRegistryTarballs = async (tsvPath, tarballDirectory, { fetchImpl = fetch } = {}) => {
	const verified = [];
	const failed = [];
	for (const row of readRows(tsvPath)) {
		const label = `${row.name}@${row.version}`;
		try {
			const rebuilt = readFileSync(join(tarballDirectory, row.tarballName));
			const { integrity, tarball } = await fetchVersionDist(row.name, row.version, fetchImpl);
			const published = await download(tarball, fetchImpl);
			if (sha512Integrity(published) !== integrity) {
				throw new Error(`the downloaded tarball does not match the registry's dist.integrity ${integrity}`);
			}
			if (!gunzipSync(rebuilt).equals(gunzipSync(published))) {
				throw new Error('the rebuilt package contents differ from the published tarball');
			}
			verified.push({ ...row, published });
			console.info(`Verified ${label}: the rebuild has the published contents (${integrity})`);
		} catch (err) {
			console.error(`Not re-attesting ${label}: ${err.message || err}`);
			failed.push(label);
		}
	}
	if (failed.length === 0) {
		for (const { tarballName, published } of verified) writeFileSync(join(tarballDirectory, tarballName), published);
	}
	return { verified: verified.map(({ published, ...row }) => row), failed };
};

if (require.main === module) {
	const [tsvPath, tarballDirectory] = process.argv.slice(2);
	if (!tsvPath || !tarballDirectory) {
		console.error('Usage: verify-registry-tarballs.js <released-packages.tsv> <tarball directory>');
		process.exit(2);
	}
	verifyRegistryTarballs(tsvPath, tarballDirectory)
		.then(({ failed }) => {
			if (failed.length > 0) {
				console.error(
					`Failed: ${failed.join(', ')}. Nothing is attested: a version whose rebuild differs from the registry needs investigation (RELEASE.md).`,
				);
				process.exit(1);
			}
		})
		.catch(err => {
			console.error(err.message || err);
			process.exit(1);
		});
}

module.exports = { verifyRegistryTarballs };
