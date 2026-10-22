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
const script = join(root, 'scripts/release/publish-tarballs.js');

// A stand-in for npm that records every invocation and answers `view` and
// `publish` per package name: `already` is on the registry, `fresh` was never
// published (E404), `broken` exists but its publish fails.
const fakeNpm = `#!/usr/bin/env bash
echo "$*" >> "$NPM_FAKE_LOG"
case "$1" in
  view)
    case "$2" in
      @scope/already) echo '["0.4.0","0.5.0"]' ;;
      @scope/fresh) echo "npm ERR! code E404" >&2; exit 1 ;;
      @scope/broken) echo '["0.4.0"]' ;;
      *) echo "unexpected package $2" >&2; exit 2 ;;
    esac ;;
  publish)
    case "$2" in
      *scope-broken*) echo "npm ERR! publish failed" >&2; exit 1 ;;
      *) echo "+ $2" ;;
    esac ;;
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

describe('release publish loop (L-68)', () => {
	let directory: string;
	let logPath: string;

	const run = (names: string[]) => {
		writeFileSync(
			join(directory, 'dist/released-packages.tsv'),
			`${names.map(row).join('\n')}\n`,
		);
		return spawnSync(
			process.execPath,
			[script, 'dist/released-packages.tsv', 'dist/tarballs'],
			{
				cwd: directory,
				encoding: 'utf8',
				timeout: 30_000,
				env: {
					...process.env,
					NPM_EXECUTABLE: join(directory, 'npm'),
					NPM_FAKE_LOG: logPath,
				},
			},
		);
	};

	const npmCalls = () =>
		existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n') : [];

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'web3-publish-tarballs-'));
		mkdirSync(join(directory, 'dist/tarballs'), { recursive: true });
		logPath = join(directory, 'npm-calls.log');
		writeFileSync(join(directory, 'npm'), fakeNpm);
		chmodSync(join(directory, 'npm'), 0o755);
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	it('skips versions already on the registry and publishes the rest', () => {
		const result = run(['already', 'fresh']);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('Skipping @scope/already@0.5.0: already on the registry');
		expect(result.stdout).toContain('Publishing @scope/fresh@0.5.0');
		expect(result.stdout).toContain(
			'Published 1, skipped 1 already-published, failed 0 of 2 package(s)',
		);
		expect(npmCalls()).toEqual([
			'view @scope/already versions --json',
			'view @scope/fresh versions --json',
			`publish ${join(directory, 'dist/tarballs/scope-fresh-0.5.0.tgz')} --access public`,
		]);
	});

	it('keeps publishing after a failure and reports every failed package', () => {
		const result = run(['broken', 'fresh', 'already']);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Publishing @scope/broken@0.5.0 failed with exit status 1');
		expect(result.stderr).toContain('Failed: @scope/broken@0.5.0. Re-run the publish job');
		expect(result.stdout).toContain(
			'Published 1, skipped 1 already-published, failed 1 of 3 package(s)',
		);
		expect(npmCalls().filter(call => call.startsWith('publish'))).toEqual([
			`publish ${join(directory, 'dist/tarballs/scope-broken-0.5.0.tgz')} --access public`,
			`publish ${join(directory, 'dist/tarballs/scope-fresh-0.5.0.tgz')} --access public`,
		]);
	});

	it('does not publish when the registry check fails for another reason', () => {
		const result = run(['unknown-package']);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'Not publishing @scope/unknown-package@0.5.0: registry check failed',
		);
		expect(npmCalls().some(call => call.startsWith('publish'))).toBe(false);
	});

	it('exits successfully with nothing to publish', () => {
		const result = run([]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('No released packages to publish');
	});
});
