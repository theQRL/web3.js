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
import { spawnSync } from 'child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const root = resolve(__dirname, '../../..');

// A stand-in ESLint that reports a fixed number of warnings for every package.
const fakeEslint = `#!/usr/bin/env bash
echo '[{"filePath":"x.ts","warningCount":24,"errorCount":0,"messages":[]}]'
`;

describe('lint budget (P4-L-49)', () => {
	let repo: string;

	const workspace = (dir: string, withLint: boolean) => {
		mkdirSync(join(repo, dir), { recursive: true });
		writeFileSync(
			join(repo, dir, 'package.json'),
			JSON.stringify({ name: dir, scripts: withLint ? { lint: 'eslint .' } : {} }),
		);
	};
	const budgets = (value: Record<string, number>) =>
		writeFileSync(join(repo, '.lint-budget.json'), JSON.stringify({ budgets: value }));
	const run = (...args: string[]) =>
		spawnSync(process.execPath, [join(repo, 'scripts/lint-budget.js'), ...args], {
			cwd: repo,
			encoding: 'utf8',
			timeout: 30_000,
		});

	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), 'web3-lint-budget-'));
		mkdirSync(join(repo, 'scripts'));
		copyFileSync(join(root, 'scripts/lint-budget.js'), join(repo, 'scripts/lint-budget.js'));
		mkdirSync(join(repo, 'node_modules/.bin'), { recursive: true });
		writeFileSync(join(repo, 'node_modules/.bin/eslint'), fakeEslint);
		chmodSync(join(repo, 'node_modules/.bin/eslint'), 0o755);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	it('passes when every budgeted package is linted within budget', () => {
		workspace('packages/web3-utils', true);
		workspace('packages/web3-providers-http', true);
		budgets({ 'packages/web3-utils': 24, 'packages/web3-providers-http': 37 });

		const result = run();
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('Lint budget check passed.');
	});

	it('fails when a budgeted package lost its lint script instead of counting it as zero warnings', () => {
		workspace('packages/web3-utils', true);
		workspace('packages/web3-providers-http', false);
		budgets({ 'packages/web3-utils': 24, 'packages/web3-providers-http': 37 });

		const result = run();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'Lint budget baseline names package(s) that were not linted: packages/web3-providers-http.',
		);
		expect(result.stdout).not.toContain('UNDER budget');
	});

	it('refuses to ratchet a budget away while the package still exists, and drops it once the directory is gone', () => {
		workspace('packages/web3-utils', true);
		workspace('packages/web3-providers-http', false);
		budgets({ 'packages/web3-utils': 24, 'packages/web3-providers-http': 37 });
		expect(run('--update').status).toBe(1);
		expect(JSON.parse(readFileSync(join(repo, '.lint-budget.json'), 'utf8')).budgets).toEqual({
			'packages/web3-utils': 24,
			'packages/web3-providers-http': 37,
		});

		rmSync(join(repo, 'packages/web3-providers-http'), { recursive: true });
		expect(run().status).toBe(1);
		const update = run('--update');
		expect(update.status).toBe(0);
		expect(update.stdout).toContain('Dropping the budget of removed package packages/web3-providers-http');
		expect(JSON.parse(readFileSync(join(repo, '.lint-budget.json'), 'utf8')).budgets).toEqual({
			'packages/web3-utils': 24,
		});
	});
});
