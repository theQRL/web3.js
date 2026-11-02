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
import { spawn, spawnSync } from 'child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'fs';
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
if [ "$NPM_FAKE_WAIT" = "$1" ]; then
  exec node -e '
    const fs = require("fs");
    if (process.env.NPM_FAKE_IGNORE_SIGNALS === "1") {
      process.on("SIGINT", () => {});
      process.on("SIGTERM", () => {});
    }
    fs.writeFileSync(process.env.NPM_FAKE_READY + ".tmp", JSON.stringify({ pid: process.pid, cache: process.env.npm_config_cache, project: process.cwd() }));
    fs.renameSync(process.env.NPM_FAKE_READY + ".tmp", process.env.NPM_FAKE_READY);
    setInterval(() => {}, 1000);
  '
fi
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
      const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
      if (!process.cwd().endsWith("smoke-" + manifest.type)) throw new Error("incorrect project module type");
      const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
      for (const [name, spec] of Object.entries(lock.packages[""].dependencies)) {
        if (process.env.NPM_FAKE_OMIT === "package" && name === "@scope/a") continue;
        if (!fs.existsSync(spec.replace(/^file:/, ""))) throw new Error("missing tarball " + spec);
        fs.mkdirSync("node_modules/" + name, { recursive: true });
        fs.writeFileSync("node_modules/" + name + "/package.json", JSON.stringify({ name, version: "0.5.0", main: "index.js" }));
        fs.writeFileSync("node_modules/" + name + "/index.js", (process.env.NPM_FAKE_OMIT === "dependency" ? "require(" + JSON.stringify("@scope/workspace-only") + ");" : "") + "module.exports = { name: " + JSON.stringify(name) + " };\\n");
      }
    ' ;;
  *) echo "unexpected npm command $1" >&2; exit 2 ;;
esac
`;

const row = (name: string) =>
	[
		`packages/${name}`,
		`@scope/${name}`,
		'0.5.0',
		`@scope/${name}@0.5.0`,
		`scope-${name}-0.5.0.tgz`,
	].join('\t');

const killGroup = (pid: number) => {
	try {
		process.kill(-pid, 'SIGKILL');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
	}
};

describe('release smoke test (P4-M-10)', () => {
	let directory: string;
	let logPath: string;
	let missing: string;

	const run = (...args: string[]) =>
		spawnSync(process.execPath, [script, ...args], {
			cwd: directory,
			encoding: 'utf8',
			timeout: 60_000,
			env: {
				...process.env,
				NPM_EXECUTABLE: join(directory, 'npm'),
				NPM_FAKE_LOG: logPath,
				NPM_FAKE_OMIT: missing,
				NODE_PATH: join(directory, 'node_modules'),
				npm_config_cache: join(directory, 'npm-cache'),
			},
		});
	const npmCalls = () =>
		existsSync(logPath)
			? readFileSync(logPath, 'utf8')
					.trim()
					.split('\n')
					.map(line =>
						line
							.replace(`${directory}/`, '')
							.replace(/^.*\/web3-release-smoke-[^/]+\//, 'isolated/'),
					)
			: [];

	beforeEach(() => {
		missing = '';
		directory = mkdtempSync(join(tmpdir(), 'web3-smoke-tarballs-'));
		mkdirSync(join(directory, 'dist/tarballs'), { recursive: true });
		logPath = join(directory, 'npm-calls.log');
		writeFileSync(join(directory, 'npm'), fakeNpm);
		chmodSync(join(directory, 'npm'), 0o755);
		writeFileSync(
			join(directory, 'dist/released-packages.tsv'),
			`${['a', 'b'].map(row).join('\n')}\n`,
		);
		for (const name of ['a', 'b']) {
			writeFileSync(join(directory, `dist/tarballs/scope-${name}-0.5.0.tgz`), 'tarball');
		}
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	it('warns on cleanup failure without changing a successful smoke result', () => {
		const hook = join(directory, 'fail-cleanup.cjs');
		writeFileSync(
			hook,
			`const fs = require('fs'); const remove = fs.rmSync; fs.rmSync = (path, options) => { if (String(path).includes('web3-release-smoke-')) throw new Error('simulated cleanup failure'); return remove(path, options); };`,
		);
		const previous = process.env.NODE_OPTIONS;
		try {
			process.env.NODE_OPTIONS = `--require=${hook}`;
			const result = run();
			expect(result.status).toBe(0);
			expect(result.stderr).toContain('Unable to remove smoke directory');
			expect(result.stderr).toContain('simulated cleanup failure');
			const smokeRoot = /Isolated smoke projects: (.+)/.exec(result.stdout)?.[1];
			expect(smokeRoot).toBeDefined();
			rmSync(smokeRoot!, { recursive: true, force: true });
		} finally {
			if (previous === undefined) delete process.env.NODE_OPTIONS;
			else process.env.NODE_OPTIONS = previous;
		}
	});

	it('resolves a lockfile once and installs both smoke projects from it with npm ci', () => {
		const result = run('dist/released-packages.tsv', 'dist/tarballs');

		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(npmCalls()).toEqual([
			'dist/smoke install --package-lock-only --ignore-scripts --no-audit --no-fund',
			'isolated/smoke-commonjs ci --ignore-scripts --no-audit --no-fund',
			'isolated/smoke-module ci --ignore-scripts --no-audit --no-fund',
		]);
		const lockManifest = JSON.parse(
			readFileSync(join(directory, 'dist/smoke/package.json'), 'utf8'),
		);
		expect(lockManifest.dependencies).toEqual({
			'@scope/a': 'file:../tarballs/scope-a-0.5.0.tgz',
			'@scope/b': 'file:../tarballs/scope-b-0.5.0.tgz',
		});
		const moduleProject = readFileSync(logPath, 'utf8')
			.split('\n')
			.find(line => line.includes('/smoke-module ci '))!
			.split(' ci ')[0];
		expect(moduleProject.startsWith(directory)).toBe(false);
		expect(existsSync(moduleProject)).toBe(false);
		expect(result.stdout).toContain('required @scope/a');
		expect(result.stdout).toContain('imported @scope/b');
		expect(result.stdout).toContain('Smoke-tested 2 package tarballs from tarballs');
	});

	it.each(['package', 'dependency'])(
		'does not resolve a missing %s from workspace node_modules or NODE_PATH',
		mode => {
			missing = mode;
			for (const name of ['a', 'workspace-only']) {
				const target = join(directory, 'node_modules/@scope', name);
				mkdirSync(target, { recursive: true });
				writeFileSync(join(target, 'index.js'), 'module.exports = { workspace: true };');
			}
			const result = run('dist/released-packages.tsv', 'dist/tarballs');
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('Cannot find module');
		},
	);

	it('with --resolve-only writes the lockfile for the release artifact and installs nothing', () => {
		const result = run('--resolve-only', 'dist/released-packages.tsv', 'dist/tarballs');

		expect(result.status).toBe(0);
		expect(npmCalls()).toEqual([
			'dist/smoke install --package-lock-only --ignore-scripts --no-audit --no-fund',
		]);
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
			'isolated/smoke-commonjs ci --ignore-scripts --no-audit --no-fund',
			'isolated/smoke-module ci --ignore-scripts --no-audit --no-fund',
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

	it.each([
		{ signal: 'SIGINT', phase: 'install' },
		{ signal: 'SIGTERM', phase: 'install' },
		{ signal: 'SIGHUP', phase: 'install' },
		{ signal: 'SIGINT', phase: 'ci' },
		{ signal: 'SIGTERM', phase: 'ci' },
		{ signal: 'SIGHUP', phase: 'ci' },
		{ signal: 'SIGINT', phase: 'ci', group: true },
		{ signal: 'SIGTERM', phase: 'ci', group: true },
		{ signal: 'SIGTERM', phase: 'ci', keep: true },
		{ signal: 'SIGTERM', phase: 'ci', sharedCache: true },
		{ signal: 'SIGTERM', phase: 'ci', ignoreSignals: true },
	])(
		'cancels the active child and cleans up according to policy: %j',
		async options => {
			const { signal, phase, group, keep, sharedCache, ignoreSignals } = options;
			const ready = join(directory, 'npm-ready.json');
			const temporary = join(directory, 'tmp');
			const callerCache = join(directory, 'caller-cache');
			mkdirSync(temporary);
			mkdirSync(callerCache);
			writeFileSync(join(callerCache, 'sentinel'), 'keep');
			const env = {
				...process.env,
				TMPDIR: temporary,
				NPM_EXECUTABLE: join(directory, 'npm'),
				NPM_FAKE_LOG: logPath,
				NPM_FAKE_WAIT: phase,
				NPM_FAKE_READY: ready,
				NPM_FAKE_IGNORE_SIGNALS: ignoreSignals ? '1' : '',
				WEB3_KEEP_SMOKE_PROJECTS: keep ? '1' : '',
				npm_config_cache: sharedCache ? callerCache : undefined,
			};
			const child = spawn(process.execPath, [script], {
				cwd: directory,
				env,
				detached: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			let output = '';
			child.stdout.on('data', chunk => {
				output += String(chunk);
			});
			child.stderr.on('data', chunk => {
				output += String(chunk);
			});
			const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
				(resolveExit, reject) => {
					child.once('error', reject);
					child.once('close', (code, exitSignal) =>
						resolveExit({ code, signal: exitSignal }),
					);
				},
			);
			let npmPid: number | undefined;
			try {
				const deadline = Date.now() + 10_000;
				while (!existsSync(ready)) {
					if (
						Date.now() > deadline ||
						typeof child.exitCode === 'number' ||
						typeof child.signalCode === 'string'
					)
						throw new Error(`npm did not become ready: ${output}`);
					// Wait for the child's atomic readiness file before delivering a signal.
					// eslint-disable-next-line no-await-in-loop
					await new Promise(resolveWait => setTimeout(resolveWait, 20));
				}
				const state = JSON.parse(readFileSync(ready, 'utf8')) as {
					pid: number;
					cache: string;
					project: string;
				};
				npmPid = state.pid;
				process.kill(group ? -child.pid! : child.pid!, signal as NodeJS.Signals);
				let timer: ReturnType<typeof setTimeout> | undefined;
				const result = await Promise.race([
					completed,
					new Promise<never>((_, reject) => {
						timer = setTimeout(
							() => reject(new Error('smoke runner ignored cancellation')),
							10_000,
						);
					}),
				]).finally(() => clearTimeout(timer));
				expect(result.code).toBeNull();
				expect(result.signal).toBe(signal);
				expect(() => process.kill(state.pid, 0)).toThrow();
				expect(existsSync(state.cache)).toBe(keep === true || sharedCache === true);
				expect(existsSync(state.project)).toBe(phase === 'install' || keep === true);
				expect(readFileSync(join(callerCache, 'sentinel'), 'utf8')).toBe('keep');
				expect(output).not.toContain('Smoke-tested');
				expect(npmCalls().some(call => call.includes('smoke-module'))).toBe(false);
			} finally {
				// Own both groups so a failed assertion cannot leave a waiting fixture behind.
				for (const pid of [npmPid, child.pid]) {
					if (pid) killGroup(pid);
				}
				await completed;
			}
		},
		25_000,
	);
});
