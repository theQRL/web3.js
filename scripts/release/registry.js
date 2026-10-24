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
// an untrusted input: only the version list and `dist-tags.latest` are read,
// and every value is type-checked before use.

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

module.exports = { REGISTRY, fetchPublished, packumentUrl };
