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
import { execFileSync, spawnSync } from 'child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';

const root = resolve(__dirname, '../../..');

// The hygiene script resolves the repository root from its own location, so a
// copy inside a throwaway git repository checks that repository
// (tmp/agents/scripts/poc-hygiene).
describe('repository hygiene (P4-L-45, P4-L-46, P4-L-50)', () => {
	let repo: string;

	const write = (relativePath: string, contents = '') => {
		mkdirSync(dirname(join(repo, relativePath)), { recursive: true });
		writeFileSync(join(repo, relativePath), contents);
	};
	const link = (relativePath: string, target: string) => {
		mkdirSync(dirname(join(repo, relativePath)), { recursive: true });
		symlinkSync(target, join(repo, relativePath));
	};
	const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
	const hygiene = () =>
		spawnSync(process.execPath, [join(repo, 'scripts/check-repo-hygiene.js')], {
			cwd: repo,
			env: { ...process.env, NODE_PATH: join(root, 'node_modules') },
			encoding: 'utf8',
			timeout: 30_000,
		});

	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), 'web3-hygiene-'));
		git('init', '-q');
		mkdirSync(join(repo, 'scripts'));
		copyFileSync(
			join(root, 'scripts/check-repo-hygiene.js'),
			join(repo, 'scripts/check-repo-hygiene.js'),
		);
		copyFileSync(
			join(root, 'scripts/doctor-checks.js'),
			join(repo, 'scripts/doctor-checks.js'),
		);
		write('.gitignore', '.secrets.json\n.env\n.env.*\ndist/\nlib/\nnode_modules\n');
		write('packages/foo/src/index.ts', 'export {};\n');
		write('config/tsconfig.cjs.json', '{}\n');
		write('fixtures/build/Basic.ts', 'export {};\n');
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	it('passes a clean tree with symlinks into the allowed targets', () => {
		link('packages/foo/tsconfig.cjs.json', '../../config/tsconfig.cjs.json');
		link('packages/foo/test/shared_fixtures', '../../../fixtures');
		link('packages/foo/test/fixtures/Basic.ts', '../../../../fixtures/build/Basic.ts');
		git('add', '-A');

		const result = hygiene();
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('Repository hygiene checks passed');
	});

	it.each(['.pnpmfile.cjs', 'packages/foo/.pnpmfile.cjs', 'packages/foo/pnpm-workspace.yaml'])(
		'rejects alternate install policy at %s even when untracked',
		name => {
			write(name, '{}');
			const result = hygiene();
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(`${name} can override the root install policy`);
		},
	);

	it('rejects nested npmrc runtime overrides even when untracked', () => {
		write(
			'packages/foo/.npmrc',
			'use-node-version=22.99.0\nnode-mirror:release=https://example.invalid/\n',
		);
		const result = hygiene();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('packages/foo/.npmrc');
		expect(result.stderr).toContain('usenodeversion');
		expect(result.stderr).toContain('nodemirror:release');
	});

	it('requires Markdown link targets to exist in the index as well as on disk', () => {
		write('CHANGELOG.md', '[evidence](docs/audit-evidence.md#checks)');
		write('docs/audit-evidence.md', '# Checks');
		git('add', 'CHANGELOG.md');
		expect(hygiene().stderr).toContain(
			'missing or untracked Markdown file docs/audit-evidence.md',
		);
		git('add', 'docs/audit-evidence.md');
		expect(hygiene().status).toBe(0);
		rmSync(join(repo, 'docs/audit-evidence.md'));
		expect(hygiene().status).toBe(1);
	});

	it.each([
		'[evidence](docs/missing.md "title")',
		'[evidence](<docs/missing.md>)',
		'[evidence][ref]\n\n[ref]: docs/missing.md "title"',
		'[ref]\n\n[ref]: docs/missing.md',
		'<a href="docs/missing.md">evidence</a>',
		'<a href="docs/missing%zz.md">evidence</a>',
		'<Link to="docs/missing.mdx">evidence</Link>',
		'[evidence](docs/missing.md?view=1#checks)',
		'[evidence](docs/missing%20file.md)',
	])('checks rendered Markdown links: %s', source => {
		write('README.md', source);
		git('add', 'README.md');
		expect(hygiene().stderr).toContain('missing or untracked Markdown file');
	});
	it.each([
		'`[example](docs/missing.md)`',
		'``[example](docs/missing.md)``',
		'~~~markdown\n[example](docs/missing.md)\n~~~',
		'````markdown\n```\n[example](docs/missing.md)\n````',
		'    [example](docs/missing.md)',
		'<!-- [example](docs/missing.md) -->',
		'<!-- <a href="docs/missing.md">example</a> -->',
	])('ignores code and comment examples: %s', source => {
		write('README.md', source);
		git('add', 'README.md');
		expect(hygiene().status).toBe(0);
	});

	it('checks tracked symlinks named like excluded directories (dist, node_modules)', () => {
		link('packages/foo/dist', '/etc');
		link('packages/foo/node_modules', '../../../../../../../../..');
		git('add', '-A');

		const result = hygiene();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'FAIL packages/foo/dist must use a relative symlink target, not /etc',
		);
		expect(result.stderr).toContain(
			'FAIL packages/foo/node_modules points outside the repository',
		);
	});

	it('enforces the allowed symlink target prefixes of docs/symlink-template-policy.md', () => {
		write('packages/foo/lib/index.js', '');
		write('docs/build/index.html', '');
		link('packages/foo/test/built', '../lib');
		link('packages/foo/test/site', '../../../docs/build');
		link('packages/foo/test/src-link', '../src/index.ts');
		git('add', '-A');

		const result = hygiene();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'FAIL packages/foo/test/built points outside the allowed symlink targets',
		);
		expect(result.stderr).toContain(
			'FAIL packages/foo/test/site points outside the allowed symlink targets',
		);
		expect(result.stderr).toContain(
			'FAIL packages/foo/test/src-link points outside the allowed symlink targets',
		);
	});

	it('rejects tracked generated output under tools/* as well as packages/*', () => {
		write('tools/bar/lib/index.js', '');
		write('packages/foo/.coverage/unit/coverage.json', '{}');
		git('add', '-A', '-f');

		const result = hygiene();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'FAIL tools/bar/lib/index.js is generated package output and must not be tracked',
		);
		expect(result.stderr).toContain(
			'FAIL packages/foo/.coverage/unit/coverage.json is generated coverage output and must not be tracked',
		);
	});

	it('accepts an untracked, gitignored .secrets.json and .env but fails when they are tracked', () => {
		write('.secrets.json', '{"MAINNET":{}}');
		write('packages/foo/.env', 'KEY=1');
		git('add', '-A');
		expect(hygiene().status).toBe(0);

		git('add', '-f', '.secrets.json', 'packages/foo/.env');
		const result = hygiene();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'FAIL .secrets.json is a local secret file and must not be tracked',
		);
		expect(result.stderr).toContain(
			'FAIL packages/foo/.env is a local secret file and must not be tracked',
		);
	});

	it('fails when a local secret file is not covered by .gitignore', () => {
		copyFileSync(
			join(root, 'scripts/doctor-checks.js'),
			join(repo, 'scripts/doctor-checks.js'),
		);
		write('.gitignore', 'dist/\n');
		write('.env.production', 'KEY=1');
		git('add', '.gitignore', 'packages', 'scripts', 'config', 'fixtures');

		const result = hygiene();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'FAIL .env.production is a local secret file that .gitignore does not cover; it would be tracked by the next git add',
		);
	});
});
