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
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

interface InspectPackages {
	forbiddenLabels: (file: string) => string[];
}

// Plain CommonJS shared with the release pipeline; no declaration file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { forbiddenLabels } = require('../../release/inspect-packages') as InspectPackages;

const root = resolve(__dirname, '../../..');

test.each([
	{ shared: false, fail: false },
	{ shared: false, fail: true },
	{ shared: true, fail: false },
])('cleans only its own package-inspection cache (%j)', ({ shared, fail }) => {
	const directory = mkdtempSync(join(tmpdir(), 'web3-inspect-cache-test-'));
	try {
		const cache = join(directory, 'caller-cache');
		mkdirSync(cache);
		writeFileSync(join(cache, 'sentinel'), 'keep');
		const log = join(directory, 'cache.log');
		writeFileSync(
			join(directory, 'npm'),
			`#!/usr/bin/env node\nrequire('fs').appendFileSync(process.env.CACHE_LOG, process.env.npm_config_cache + '\\n');\nconsole.log('[{"files":[]}]');\nprocess.exit(${fail ? 1 : 0});\n`,
			{ mode: 0o755 },
		);
		const script = join(root, 'scripts/release/inspect-packages.js');
		const result = spawnSync(
			process.execPath,
			[
				'-e',
				`const {packDryRun} = require(${JSON.stringify(script)}); packDryRun(process.cwd()); packDryRun(process.cwd());`,
			],
			{
				cwd: directory,
				encoding: 'utf8',
				env: {
					...process.env,
					PATH: `${directory}:${process.env.PATH}`,
					TMPDIR: directory,
					CACHE_LOG: log,
					npm_config_cache: shared ? cache : '',
				},
			},
		);
		expect(result.status).toBe(fail ? 1 : 0);
		const paths = readFileSync(log, 'utf8').trim().split('\n');
		expect(new Set(paths).size).toBe(1);
		expect(paths).toHaveLength(fail ? 1 : 2);
		expect(existsSync(paths[0])).toBe(shared);
		expect(readFileSync(join(cache, 'sentinel'), 'utf8')).toBe('keep');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('package inspection forbidden patterns (P4-L-46)', () => {
	// The npm packlist of a package whose `files` are `lib/**`, `src/**` and
	// `dist/**` (tmp/agents/scripts/poc-packlist): secrets and keys land below
	// those directories, never at the tarball root.
	it.each([
		['src/.secrets.json', '.secrets.json'],
		['lib/.secrets.json', '.secrets.json'],
		['.secrets.json', '.secrets.json'],
		['src/.env', '.env'],
		['src/.env.production', '.env'],
		['dist/.env.local', '.env'],
		['src/key.pem', 'PEM key or certificate'],
		['lib/server.key', 'private key'],
		['src/node_modules/left-pad/index.js', 'node_modules'],
		['node_modules/x/index.js', 'node_modules'],
		['lib/.coverage/lcov.info', 'coverage'],
		['src/coverage/lcov.info', 'coverage'],
		['src/.turbo/turbo-build.log', '.turbo'],
		['src/yarn.lock', 'yarn.lock'],
		['lib/pnpm-lock.yaml', 'pnpm-lock.yaml'],
		['lib/package-lock.json', 'package-lock.json'],
		['src/index copy.ts', 'copy file'],
	])('rejects %s at any depth as %s', (file, label) => {
		expect(forbiddenLabels(file)).toContain(label);
	});

	it.each([
		'package.json',
		'README.md',
		'lib/commonjs/index.js',
		'lib/types/index.d.ts',
		'src/index.ts',
		'src/environment.ts',
		'src/config.env.ts',
		'src/keys.ts',
		'dist/web3.min.js',
	])('accepts %s', file => {
		expect(forbiddenLabels(file)).toEqual([]);
	});

	it('is enforced by the release inspection script and documented', () => {
		const script = readFileSync(resolve(root, 'scripts/release/inspect-packages.js'), 'utf8');
		expect(script).toContain('for (const label of forbiddenLabels(file))');
		expect(readFileSync(resolve(root, '.gitignore'), 'utf8')).toMatch(/^\.env\n\.env\.\*$/m);
	});
});

describe('release sibling ranges', () => {
	const { siblingRangeFailures, selectReleasePackages } =
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		require('../../release/inspect-packages') as {
			siblingRangeFailures: (manifest: unknown, siblings: Set<string>) => string[];
			selectReleasePackages: (
				args: string[],
				packages: { name: string }[],
			) => { name: string }[];
		};
	it('inspects all development packages but only selected release manifests', () => {
		const packages = [{ name: '@probe/a' }, { name: '@probe/b' }];
		expect(selectReleasePackages([], packages)).toEqual(packages);
		expect(selectReleasePackages(['--release', '@probe/b'], packages)).toEqual([packages[1]]);
		expect(() => selectReleasePackages(['--release'], packages)).toThrow('Usage');
		expect(() => selectReleasePackages(['--release', '@probe/missing'], packages)).toThrow(
			'Unknown',
		);
	});
	it.each([
		'workspace:*',
		'workspace:^',
		'file:../b',
		'*',
		'~1.2.3',
		'01.2.3',
		'1.2.3-01',
		'1.2.3-rc..1',
	])('rejects %s in a publishable sibling dependency', range => {
		expect(
			siblingRangeFailures(
				{ name: '@probe/a', dependencies: { '@probe/b': range } },
				new Set(['@probe/b']),
			),
		).toHaveLength(1);
	});
	it.each(['1.2.3', '^1.2.3', '^1.2.3-rc.1'])('accepts %s for a publishable sibling', range => {
		expect(
			siblingRangeFailures(
				{ name: '@probe/a', dependencies: { '@probe/b': range } },
				new Set(['@probe/b']),
			),
		).toEqual([]);
	});
});
