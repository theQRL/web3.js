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
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';

interface VerifyRegistryTarballs {
	verifyRegistryTarballs: (
		tsvPath: string,
		tarballDirectory: string,
	) => Promise<{ verified: { name: string }[]; failed: string[] }>;
}

const integrityOf = (bytes: Buffer) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

describe('verify-registry-tarballs (re-attest)', () => {
	let server: Server;
	let origin: string;
	let directory: string;
	let verify: VerifyRegistryTarballs['verifyRegistryTarballs'];
	// What the stub registry serves: the published tarball, and overrides of its metadata.
	const registry: Record<string, { tarball: Buffer; integrity?: string; tarballUrl?: string }> = {};

	// A stand-in for a pnpm pack tar stream; only the bytes matter here.
	const tar = (content: string) => Buffer.from(`package/index.js\0${content}`.padEnd(1024, '\0'));
	// The same tar compressed differently, as another runner's zlib would.
	const publish = (name: string, content: string) => {
		registry[name] = { tarball: gzipSync(tar(content), { level: 9 }) };
	};
	const rebuild = (tarballName: string, content: string) => {
		const bytes = gzipSync(tar(content), { level: 1 });
		writeFileSync(join(directory, tarballName), bytes);
		return bytes;
	};
	const plan = (...rows: [string, string][]) => {
		const tsvPath = join(directory, 'released-packages.tsv');
		writeFileSync(
			tsvPath,
			rows.map(([name, tarballName]) => `packages/x\t${name}\t2.0.0\t${name}@2.0.0\t${tarballName}\n`).join(''),
		);
		return tsvPath;
	};

	beforeAll(async () => {
		server = createServer((req, res) => {
			const url = decodeURIComponent((req.url ?? '/').slice(1));
			if (url.startsWith('tarballs/')) {
				const entry = registry[url.slice('tarballs/'.length)];
				if (!entry) return void res.writeHead(404).end();
				return void res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(entry.tarball);
			}
			const entry = registry[url];
			if (!entry) return void res.writeHead(404).end('{}');
			const dist = {
				integrity: entry.integrity ?? integrityOf(entry.tarball),
				tarball: entry.tarballUrl ?? `${origin}/tarballs/${encodeURIComponent(url)}`,
			};
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ versions: { '2.0.0': { dist } } }));
		});
		await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', () => resolveListen()));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		// registry.js reads the registry URL when it is first loaded.
		process.env.npm_config_registry = origin;
		jest.isolateModules(() => {
			// Plain CommonJS shared with the release pipeline; no declaration file.
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			verify = (require('../../release/verify-registry-tarballs') as VerifyRegistryTarballs).verifyRegistryTarballs;
		});
	});

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'web3-verify-registry-'));
		for (const name of Object.keys(registry)) delete registry[name];
	});

	afterEach(() => rmSync(directory, { recursive: true, force: true }));

	afterAll(async () => {
		delete process.env.npm_config_registry;
		await new Promise<void>(resolveClose => server.close(() => resolveClose()));
	});

	it('accepts a rebuild with the published contents and replaces it with the registry bytes', async () => {
		publish('@scope/a', 'same');
		publish('@scope/b', 'also same');
		const rebuiltA = rebuild('scope-a-2.0.0.tgz', 'same');
		rebuild('scope-b-2.0.0.tgz', 'also same');
		expect(rebuiltA.equals(registry['@scope/a'].tarball)).toBe(false);

		const result = await verify(plan(['@scope/a', 'scope-a-2.0.0.tgz'], ['@scope/b', 'scope-b-2.0.0.tgz']), directory);

		expect(result.failed).toEqual([]);
		expect(result.verified.map(row => row.name)).toEqual(['@scope/a', '@scope/b']);
		expect(readFileSync(join(directory, 'scope-a-2.0.0.tgz')).equals(registry['@scope/a'].tarball)).toBe(true);
		expect(readFileSync(join(directory, 'scope-b-2.0.0.tgz')).equals(registry['@scope/b'].tarball)).toBe(true);
	});

	it('fails a rebuild whose contents differ and replaces no tarball', async () => {
		publish('@scope/a', 'same');
		publish('@scope/b', 'published');
		const rebuiltA = rebuild('scope-a-2.0.0.tgz', 'same');
		rebuild('scope-b-2.0.0.tgz', 'rebuilt differently');

		const result = await verify(plan(['@scope/a', 'scope-a-2.0.0.tgz'], ['@scope/b', 'scope-b-2.0.0.tgz']), directory);

		expect(result.failed).toEqual(['@scope/b@2.0.0']);
		// One failure leaves every rebuilt tarball in place, so nothing is attested.
		expect(readFileSync(join(directory, 'scope-a-2.0.0.tgz')).equals(rebuiltA)).toBe(true);
	});

	it('fails when the downloaded tarball does not match the registry integrity', async () => {
		publish('@scope/a', 'same');
		registry['@scope/a'].integrity = integrityOf(Buffer.from('something else'));
		rebuild('scope-a-2.0.0.tgz', 'same');

		const result = await verify(plan(['@scope/a', 'scope-a-2.0.0.tgz']), directory);

		expect(result.failed).toEqual(['@scope/a@2.0.0']);
	});

	it('refuses a tarball URL outside the registry and a version that is not published', async () => {
		publish('@scope/a', 'same');
		registry['@scope/a'].tarballUrl = 'https://attacker.example/scope-a-2.0.0.tgz';
		rebuild('scope-a-2.0.0.tgz', 'same');
		rebuild('scope-missing-2.0.0.tgz', 'same');

		const result = await verify(
			plan(['@scope/a', 'scope-a-2.0.0.tgz'], ['@scope/missing', 'scope-missing-2.0.0.tgz']),
			directory,
		);

		expect(result.failed).toEqual(['@scope/a@2.0.0', '@scope/missing@2.0.0']);
	});
});
