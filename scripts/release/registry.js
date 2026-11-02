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

// Read-only registry lookups shared by the release scripts. The registry is
// an untrusted input: only the version list, `dist-tags.latest` and a
// version's `dist.integrity` / `dist.tarball` are read, and every value is
// type-checked before use.

const REGISTRY = process.env.npm_config_registry || 'https://registry.npmjs.org';

const packumentUrl = name => `${REGISTRY.replace(/\/$/, '')}/${encodeURIComponent(name).replace(/%40/g, '@')}`;

// Versions and `latest` tag of a package; `{ latest: null, versions: [] }` for a
// package that was never published (HTTP 404).
const fetchPublished = async (name, fetchImpl = fetch) => {
	const res = await fetchImpl(packumentUrl(name), { headers: { accept: 'application/json' } });
	if (res.status === 404) return { latest: null, versions: [] };
	if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
	const data = await res.json();
	const versions =
		data && typeof data === 'object' && data.versions && typeof data.versions === 'object'
			? Object.keys(data.versions)
			: [];
	const latest =
		data && typeof data === 'object' && data['dist-tags'] && typeof data['dist-tags'].latest === 'string'
			? data['dist-tags'].latest
			: null;
	return { latest, versions };
};

// `dist.integrity` (sha512 only) and `dist.tarball` of one published version.
// The tarball URL must be an https URL on the registry's host, or the
// registry's own origin when it is a local http stub.
const fetchVersionDist = async (name, version, fetchImpl = fetch) => {
	const res = await fetchImpl(packumentUrl(name), { headers: { accept: 'application/json' } });
	if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
	const data = await res.json();
	const dist = data?.versions?.[version]?.dist;
	if (!dist || typeof dist !== 'object') throw new Error(`${name}@${version} is not on the registry`);
	const { integrity, tarball } = dist;
	if (typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
		throw new Error(`${name}@${version}: the registry reports no sha512 dist.integrity`);
	}
	const registryUrl = new URL(REGISTRY);
	let tarballUrl;
	try {
		if (typeof tarball === 'string') tarballUrl = new URL(tarball);
	} catch {
		tarballUrl = undefined;
	}
	const sameOrigin = tarballUrl && tarballUrl.origin === registryUrl.origin;
	const sameHttpsHost = tarballUrl && tarballUrl.protocol === 'https:' && tarballUrl.hostname === registryUrl.hostname;
	if (!sameOrigin && !sameHttpsHost) {
		throw new Error(`${name}@${version}: dist.tarball is not a URL on ${registryUrl.origin}`);
	}
	return { integrity, tarball: tarballUrl.href };
};

module.exports = { REGISTRY, fetchPublished, fetchVersionDist, packumentUrl };
