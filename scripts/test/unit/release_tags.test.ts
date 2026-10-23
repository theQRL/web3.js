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
import { execFileSync, spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';

interface Tags {
	compareVersions: (a: string, b: string) => number;
	highestVersion: (versions: string[]) => string | undefined;
	lastReleaseAt: (name: string, commit: string, cwd?: string) => { version: string; tag: string } | undefined;
	latestReleasesFromTags: (tags: string[]) => Map<string, { version: string; tag: string }>;
	parseReleaseTag: (tag: string) => { name: string; version: string } | undefined;
	substituteWorkspaceVersion: (specifier: string, version: string) => string;
	tagCommit: (tag: string, cwd?: string) => string;
}

// Plain CommonJS shared with the release pipeline; no declaration file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tags = require('../../release/tags') as Tags;

const root = resolve(__dirname, '../../..');
const scripts = join(root, 'scripts/release');

describe('release tag helpers (P4-M-12)', () => {
	it('parses stable release tags only', () => {
		expect(tags.parseReleaseTag('@theqrl/web3-utils@1.0.4')).toEqual({ name: '@theqrl/web3-utils', version: '1.0.4' });
		expect(tags.parseReleaseTag('web3@10.2.0')).toEqual({ name: 'web3', version: '10.2.0' });
		expect(tags.parseReleaseTag('v1.0.0')).toBeUndefined();
		expect(tags.parseReleaseTag('@theqrl/web3@1.0.0-rc.1')).toBeUndefined();
	});

	it('orders versions numerically and picks the highest release per package', () => {
		expect(tags.highestVersion(['0.9.0', '0.10.0', '0.9.12'])).toBe('0.10.0');
		expect(tags.compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
		const latest = tags.latestReleasesFromTags(['@s/a@1.0.0', '@s/a@1.0.2', '@s/a@1.0.1', '@s/b@0.1.0', 'junk']);
		expect(latest.get('@s/a')).toEqual({ version: '1.0.2', tag: '@s/a@1.0.2' });
		expect(latest.get('@s/b')).toEqual({ version: '0.1.0', tag: '@s/b@0.1.0' });
	});

	it('substitutes workspace specifiers the way multi-semantic-release does', () => {
		expect(tags.substituteWorkspaceVersion('workspace:^', '1.2.3')).toBe('^1.2.3');
		expect(tags.substituteWorkspaceVersion('workspace:~', '1.2.3')).toBe('~1.2.3');
		expect(tags.substituteWorkspaceVersion('workspace:*', '1.2.3')).toBe('1.2.3');
		expect(tags.substituteWorkspaceVersion('workspace:>=1.0.0', '1.2.3')).toBe('>=1.0.0');
		expect(tags.substituteWorkspaceVersion('^0.5.0', '1.2.3')).toBe('^0.5.0');
	});
});

// A workspace with two publishable packages and a private tool, released twice:
// run 1 tags a@1.0.0 and b@1.0.0 on commit 1, run 2 tags a@1.0.1 on commit 2.
// The registry stand-in knows a@1.0.0 and b@1.0.0 only, so a@1.0.1 is a
// tagged-but-unpublished version.
describe('tagged releases against the registry (P4-M-12)', () => {
	let repo: string;
	let commit1: string;
	let commit2: string;
	let server: Server;
	let registry: string;
	const published: Record<string, string[]> = { '@scope/a': ['1.0.0'], '@scope/b': ['1.0.0'] };

	const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
	const write = (relativePath: string, value: unknown) => {
		mkdirSync(dirname(join(repo, relativePath)), { recursive: true });
		writeFileSync(join(repo, relativePath), `${JSON.stringify(value, null, '\t')}\n`);
	};
	const manifest = (name: string, extra: Record<string, unknown> = {}) => ({
		name,
		version: '0.5.0',
		publishConfig: { access: 'public' },
		...extra,
	});
	// The registry stub lives in this process, so the scripts must be spawned
	// asynchronously: a blocking spawnSync could never let it answer.
	const run = (file: string, args: string[], extraEnv: Record<string, string> = {}) =>
		new Promise<{ status: number | null; stdout: string; stderr: string }>(resolveRun => {
			const child = spawn(process.execPath, [join(scripts, file), ...args], {
				cwd: repo,
				env: { ...process.env, npm_config_registry: registry, ...extraEnv },
			});
			let stdout = '';
			let stderr = '';
			child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk));
			child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk));
			const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
			child.on('close', status => {
				clearTimeout(timer);
				resolveRun({ status, stdout, stderr });
			});
		});
	const readManifest = (relativePath: string) =>
		JSON.parse(readFileSync(join(repo, relativePath), 'utf8')) as Record<string, Record<string, string> | string>;

	beforeAll(async () => {
		server = createServer((req, res) => {
			const name = decodeURIComponent((req.url ?? '/').slice(1));
			if (!published[name]) {
				res.writeHead(404).end('{}');
				return;
			}
			const versions = Object.fromEntries(published[name].map(version => [version, {}]));
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ versions, 'dist-tags': { latest: published[name][published[name].length - 1] } }));
		});
		await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', () => resolveListen()));
		registry = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

		repo = mkdtempSync(join(tmpdir(), 'web3-release-tags-'));
		git('init', '-q');
		git('config', 'user.email', 'test@example.com');
		git('config', 'user.name', 'test');
		write('package.json', { name: 'root', private: true });
		write('packages/a/package.json', manifest('@scope/a', {
			dependencies: { '@scope/b': 'workspace:^', 'left-pad': '^1.0.0' },
			devDependencies: { '@scope/tool': 'workspace:^' },
		}));
		write('packages/b/package.json', manifest('@scope/b'));
		write('tools/tool/package.json', { name: '@scope/tool', version: '0.5.0', private: true });
		mkdirSync(join(repo, 'packages/a/src'), { recursive: true });
		writeFileSync(join(repo, 'packages/a/src/version.ts'), "export const info = { version: '0.5.0' };\n");
		git('add', '-A');
		git('commit', '-q', '-m', 'release 1');
		commit1 = git('rev-parse', 'HEAD');
		git('tag', '@scope/a@1.0.0');
		git('tag', '-a', '-m', 'b', '@scope/b@1.0.0');

		writeFileSync(join(repo, 'packages/a/src/index.ts'), 'export {};\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'fix(a): release 2');
		commit2 = git('rev-parse', 'HEAD');
		git('tag', '@scope/a@1.0.1');
	});

	afterAll(async () => {
		await new Promise<void>(resolveClose => server.close(() => resolveClose()));
		rmSync(repo, { recursive: true, force: true });
	});

	it('finds the last release reachable from a commit, through lightweight and annotated tags', () => {
		expect(tags.lastReleaseAt('@scope/a', commit1, repo)).toEqual({ version: '1.0.0', tag: '@scope/a@1.0.0' });
		expect(tags.lastReleaseAt('@scope/a', commit2, repo)).toEqual({ version: '1.0.1', tag: '@scope/a@1.0.1' });
		expect(tags.lastReleaseAt('@scope/b', commit2, repo)).toEqual({ version: '1.0.0', tag: '@scope/b@1.0.0' });
		expect(tags.lastReleaseAt('@scope/tool', commit2, repo)).toBeUndefined();
		expect(tags.tagCommit('@scope/b@1.0.0', repo)).toBe(commit1);
	});

	it('published-versions --tags --check fails while a tagged version is missing from the registry', async () => {
		const result = await run('published-versions.js', ['--tags', '--check']);
		expect(result.status).toBe(1);
		expect(result.stdout).toContain('@scope/a  1.0.1');
		expect(result.stdout).toContain('missing');
		expect(result.stdout).toContain('@scope/b  1.0.0');
		expect(result.stdout).toContain('published');
		expect(result.stderr).toContain('1 package(s) have a release that is not on the registry: @scope/a@1.0.1');
		expect(result.stderr).toContain('workflow_dispatch');
	});

	it('republish-plan "all-missing" plans exactly the tagged-but-unpublished versions', async () => {
		const result = await run('republish-plan.js', ['all-missing', '.release']);
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`Republishing @scope/a@1.0.1 from ${commit2}`);
		expect(readFileSync(join(repo, '.release/republish.tsv'), 'utf8')).toBe(
			`${commit2}\tpackages/a\t@scope/a\t1.0.1\t@scope/a@1.0.1\tscope-a-1.0.1.tgz\n`,
		);
		expect(readFileSync(join(repo, '.release/released-packages.tsv'), 'utf8')).toBe(
			'packages/a\t@scope/a\t1.0.1\t@scope/a@1.0.1\tscope-a-1.0.1.tgz\n',
		);
		expect(JSON.parse(readFileSync(join(repo, '.release/released-packages.json'), 'utf8'))).toEqual([
			{
				path: 'packages/a',
				name: '@scope/a',
				version: '1.0.1',
				private: false,
				access: 'public',
				releaseTag: '@scope/a@1.0.1',
				tarballName: 'scope-a-1.0.1.tgz',
			},
		]);
	});

	it('republish-plan with explicit tags skips published versions and rejects unknown ones', async () => {
		const outputPath = join(repo, 'github-output.txt');
		writeFileSync(outputPath, '');
		const result = await run('republish-plan.js', ['@scope/b@1.0.0,@scope/a@1.0.1', '.release-explicit'], {
			GITHUB_OUTPUT: outputPath,
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('Skipping @scope/b@1.0.0 (already on the registry)');
		expect(result.stdout).toContain('Republishing @scope/a@1.0.1');
		expect(readFileSync(outputPath, 'utf8')).toBe('released=true\ncount=1\npackages=@scope/a\n');

		expect((await run('republish-plan.js', ['@scope/a@9.9.9', '.release-x'])).stderr).toContain(
			'@scope/a@9.9.9 does not exist in this checkout',
		);
		expect((await run('republish-plan.js', ['v1.0.0', '.release-x'])).stderr).toContain('is not a release tag');
		expect((await run('republish-plan.js', ['@scope/tool@1.0.0', '.release-x'])).stderr).toContain(
			'does not name a publishable workspace package',
		);

		writeFileSync(outputPath, '');
		const nothing = await run('republish-plan.js', ['@scope/b@1.0.0', '.release-none'], { GITHUB_OUTPUT: outputPath });
		expect(nothing.status).toBe(0);
		expect(nothing.stdout).toContain('Nothing to republish');
		expect(readFileSync(outputPath, 'utf8')).toBe('released=false\ncount=0\npackages=\n');
	});

	it('restore-tag-manifests rewrites version and sibling ranges exactly as the release run did', async () => {
		git('checkout', '-q', '--detach', commit2);
		const result = await run('restore-tag-manifests.js', [commit2]);
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('Restored @scope/a@1.0.1 (packages/a)\n');
		const a = readManifest('packages/a/package.json');
		expect(a.version).toBe('1.0.1');
		// b was not released in run 2: its range is b's last release before commit 2.
		expect(a.dependencies).toEqual({ '@scope/b': '^1.0.0', 'left-pad': '^1.0.0' });
		// the private tool is not a multi-semantic-release package: untouched.
		expect(a.devDependencies).toEqual({ '@scope/tool': 'workspace:^' });
		expect(readFileSync(join(repo, 'packages/a/src/version.ts'), 'utf8')).toContain("version: '1.0.1'");
		expect(readManifest('packages/b/package.json').version).toBe('0.5.0');

		git('checkout', '-q', '--', '.');
		git('checkout', '-q', '--detach', commit1);
		const first = await run('restore-tag-manifests.js', [commit1]);
		expect(first.status).toBe(0);
		expect(first.stdout).toBe('Restored @scope/a@1.0.0 (packages/a)\nRestored @scope/b@1.0.0 (packages/b)\n');
		expect(readManifest('packages/a/package.json').dependencies).toEqual({ '@scope/b': '^1.0.0', 'left-pad': '^1.0.0' });
		expect(readManifest('packages/b/package.json').version).toBe('1.0.0');
		expect(existsSync(join(repo, 'packages/a/src/index.ts'))).toBe(false);

		git('checkout', '-q', '--', '.');
		git('checkout', '-q', '--detach', commit2);
		writeFileSync(join(repo, 'untagged.txt'), '');
		git('add', '-A');
		git('commit', '-q', '-m', 'chore: no release');
		const untagged = await run('restore-tag-manifests.js', ['HEAD']);
		expect(untagged.status).toBe(1);
		expect(untagged.stderr).toContain('carries no release tag of a publishable package');
	});
});
