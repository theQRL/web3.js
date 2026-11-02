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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const root = resolve(__dirname, '../../..');
const script = join(root, 'scripts/release/verify-artifact-digests.sh');

describe('release artifact digest verification (P4-M-10)', () => {
	let directory: string;

	// What the `prepare` job records: `sha256sum` output from inside the artifact
	// directory, base64-encoded into a job output.
	const record = (...files: string[]) =>
		Buffer.from(execFileSync('sha256sum', files, { cwd: join(directory, 'dist'), encoding: 'utf8' })).toString(
			'base64',
		);
	const verify = (digests: string) =>
		spawnSync('bash', [script, 'dist', digests], { cwd: directory, encoding: 'utf8', timeout: 30_000 });

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'web3-verify-digests-'));
		mkdirSync(join(directory, 'dist/tarballs'), { recursive: true });
		writeFileSync(join(directory, 'dist/tarballs/theqrl-web3-1.0.4.tgz'), 'tarball bytes');
		writeFileSync(join(directory, 'dist/released-packages.tsv'), 'packages/web3\t@theqrl/web3\t1.0.4\n');
		writeFileSync(join(directory, 'dist/checksums-sha256.txt'), 'x  tarballs/theqrl-web3-1.0.4.tgz\n');
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	it('accepts an artifact whose files all match the recorded digests', () => {
		const result = verify(record('tarballs/theqrl-web3-1.0.4.tgz', 'released-packages.tsv', 'checksums-sha256.txt'));
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('3 file(s) in dist match the recorded digests');
	});

	it('rejects a replaced tarball', () => {
		const digests = record('tarballs/theqrl-web3-1.0.4.tgz', 'released-packages.tsv', 'checksums-sha256.txt');
		writeFileSync(join(directory, 'dist/tarballs/theqrl-web3-1.0.4.tgz'), 'other bytes');
		const result = verify(digests);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('theqrl-web3-1.0.4.tgz');
	});

	it('rejects an added file and a missing file', () => {
		const digests = record('tarballs/theqrl-web3-1.0.4.tgz', 'released-packages.tsv', 'checksums-sha256.txt');
		writeFileSync(join(directory, 'dist/tarballs/theqrl-web3-core-1.0.4.tgz'), 'smuggled');
		const added = verify(digests);
		expect(added.status).not.toBe(0);
		expect(added.stderr).toContain('unexpected file in artifact: tarballs/theqrl-web3-core-1.0.4.tgz');

		rmSync(join(directory, 'dist/tarballs/theqrl-web3-core-1.0.4.tgz'));
		rmSync(join(directory, 'dist/checksums-sha256.txt'));
		expect(verify(digests).status).not.toBe(0);
	});

	it('rejects an empty or malformed digest list', () => {
		expect(verify(Buffer.from('').toString('base64')).status).not.toBe(0);
		expect(verify(Buffer.from('not a digest line\n').toString('base64')).status).not.toBe(0);
	});
});
