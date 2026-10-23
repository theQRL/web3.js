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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const root = resolve(__dirname, '../../..');
const script = join(root, 'scripts/release/smoke-tarballs.js');

// A stand-in for npm. `install --package-lock-only` writes a lockfile that
// records the manifest's dependencies; `ci` materialises node_modules from the
// lockfile only (never from package.json), the way the real command refuses
// anything the lockfile does not name.
const fakeNpm = `#!/usr/bin/env bash
set -e
echo "$PWD $*" >> "$NPM_FAKE_LOG"
case "$1" in
  install)
    node -e '
      const fs = require("fs");
      const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
      fs.writeFileSync("package-lock.json", JSON.stringify({ name: manifest.name, lockfileVersion: 3, packages: { "": manifest } }, null, 2));
    ' ;;
  ci)
    node -e '
      const fs = require("fs");
      const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
      for (const [name, spec] of Object.entries(lock.packages[""].dependencies)) {
        if (!fs.existsSync(spec.replace(/^file:/, ""))) throw new Error("missing tarball " + spec);
        fs.mkdirSync("node_modules/" + name, { recursive: true });
        fs.writeFileSync("node_modules/" + name + "/package.json", JSON.stringify({ name, version: "0.5.0", main: "index.js" }));
        fs.writeFileSync("node_modules/" + name + "/index.js", "module.exports = { name: " + JSON.stringify(name) + " };\\n");
      }
    ' ;;
  *) echo "unexpected npm command $1" >&2; exit 2 ;;
esac
`;

const row = (name: string) =>
	[`packages/${name}`, `@scope/${name}`, '0.5.0', `@scope/${name}@0.5.0`, `scope-${name}-0.5.0.tgz`].join('\t');

describe('release smoke test (P4-M-10)', () => {
	let directory: string;
	let logPath: string;

	const run = (...args: string[]) =>
		spawnSync(process.execPath, [script, ...args], {
			cwd: directory,
			encoding: 'utf8',
			timeout: 60_000,
			env: {
				...process.env,
				NPM_EXECUTABLE: join(directory, 'npm'),
				NPM_FAKE_LOG: logPath,
				npm_config_cache: join(directory, 'npm-cache'),
			},
		});
	const npmCalls = () =>
		existsSync(logPath)
			? readFileSync(logPath, 'utf8')
					.trim()
					.split('\n')
					.map(line => line.replace(`${directory}/`, ''))
			: [];

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'web3-smoke-tarballs-'));
		mkdirSync(join(directory, 'dist/tarballs'), { recursive: true });
		logPath = join(directory, 'npm-calls.log');
		writeFileSync(join(directory, 'npm'), fakeNpm);
		chmodSync(join(directory, 'npm'), 0o755);
		writeFileSync(join(directory, 'dist/released-packages.tsv'), `${['a', 'b'].map(row).join('\n')}\n`);
		for (const name of ['a', 'b']) {
			writeFileSync(join(directory, `dist/tarballs/scope-${name}-0.5.0.tgz`), 'tarball');
		}
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	it('resolves a lockfile once and installs both smoke projects from it with npm ci', () => {
		const result = run('dist/released-packages.tsv', 'dist/tarballs');

		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(npmCalls()).toEqual([
			'dist/smoke install --package-lock-only --ignore-scripts --no-audit --no-fund',
			'dist/smoke-commonjs ci --ignore-scripts --no-audit --no-fund',
			'dist/smoke-module ci --ignore-scripts --no-audit --no-fund',
		]);
		const lockManifest = JSON.parse(readFileSync(join(directory, 'dist/smoke/package.json'), 'utf8'));
		expect(lockManifest.dependencies).toEqual({
			'@scope/a': 'file:../tarballs/scope-a-0.5.0.tgz',
			'@scope/b': 'file:../tarballs/scope-b-0.5.0.tgz',
		});
		expect(JSON.parse(readFileSync(join(directory, 'dist/smoke-module/package.json'), 'utf8')).type).toBe('module');
		expect(result.stdout).toContain('required @scope/a');
		expect(result.stdout).toContain('imported @scope/b');
		expect(result.stdout).toContain('Smoke-tested 2 package tarballs from tarballs');
	});

	it('with --resolve-only writes the lockfile for the release artifact and installs nothing', () => {
		const result = run('--resolve-only', 'dist/released-packages.tsv', 'dist/tarballs');

		expect(result.status).toBe(0);
		expect(npmCalls()).toEqual(['dist/smoke install --package-lock-only --ignore-scripts --no-audit --no-fund']);
		expect(existsSync(join(directory, 'dist/smoke/package-lock.json'))).toBe(true);
		expect(existsSync(join(directory, 'dist/smoke-commonjs'))).toBe(false);
	});

	it('reuses a handed-over lockfile without resolving again', () => {
		expect(run('--resolve-only', 'dist/released-packages.tsv', 'dist/tarballs').status).toBe(0);
		rmSync(logPath);

		const result = run('dist/released-packages.tsv', 'dist/tarballs');
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('Installing the dependency tree pinned by');
		expect(npmCalls()).toEqual([
			'dist/smoke-commonjs ci --ignore-scripts --no-audit --no-fund',
			'dist/smoke-module ci --ignore-scripts --no-audit --no-fund',
		]);
	});

	it('refuses a lockfile that does not describe the released tarballs', () => {
		expect(run('--resolve-only', 'dist/released-packages.tsv', 'dist/tarballs').status).toBe(0);
		writeFileSync(join(directory, 'dist/released-packages.tsv'), `${row('a')}\n`);

		const result = run('dist/released-packages.tsv', 'dist/tarballs');
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('does not list the released tarballs');
		expect(npmCalls().some(call => call.includes(' ci '))).toBe(false);
	});

	it('fails before touching npm when a listed tarball is missing', () => {
		rmSync(join(directory, 'dist/tarballs/scope-b-0.5.0.tgz'));
		const result = run('dist/released-packages.tsv', 'dist/tarballs');
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Missing tarball');
		expect(npmCalls()).toEqual([]);
	});
});
