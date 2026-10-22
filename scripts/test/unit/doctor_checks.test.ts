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
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

interface DoctorChecks {
	allowBuildsFailures: (workspaceYaml: string, lockfileText: string) => string[];
	listWorkspaceBlockKeys: (workspaceYaml: string, blockName: string) => string[] | undefined;
	lockfileHasPackage: (lockfileText: string, packageName: string) => boolean;
	trivyIgnoreFailures: (trivyIgnoreText: string, today?: string) => string[];
}

// Plain CommonJS shared with scripts/doctor.js; no declaration file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const doctorChecks = require('../../doctor-checks') as DoctorChecks;
const { allowBuildsFailures, listWorkspaceBlockKeys, lockfileHasPackage, trivyIgnoreFailures } =
	doctorChecks;

const root = resolve(__dirname, '../../..');
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

const workspaceYaml = [
	'packages:',
	'  - "packages/*"',
	'overrides:',
	'  "braces@<3.0.3": "3.0.3"',
	'  # a comment inside the block',
	"  '@docusaurus/core': 3.10.1",
	'  socks: 2.8.7',
	'strictDepBuilds: true',
	'allowBuilds:',
	'  bufferutil: true',
	'',
	'  "@parcel/watcher": true',
	'  keccak: true',
	'',
].join('\n');

const lockfile = [
	'packages:',
	'',
	"  '@parcel/watcher@2.5.1':",
	'    resolution: {integrity: sha512-x}',
	'',
	'  bufferutil@4.1.0:',
	'    resolution: {integrity: sha512-y}',
	'',
	'  keccak-helper@1.0.0:',
	'    resolution: {integrity: sha512-z}',
	'',
].join('\n');

describe('doctor checks', () => {
	describe('listWorkspaceBlockKeys', () => {
		it('reads quoted and unquoted keys of a block, skipping comments and blank lines', () => {
			expect(listWorkspaceBlockKeys(workspaceYaml, 'overrides')).toEqual([
				'braces@<3.0.3',
				'@docusaurus/core',
				'socks',
			]);
			expect(listWorkspaceBlockKeys(workspaceYaml, 'allowBuilds')).toEqual([
				'bufferutil',
				'@parcel/watcher',
				'keccak',
			]);
			expect(listWorkspaceBlockKeys(workspaceYaml, 'missing')).toBeUndefined();
		});
	});

	describe('allowBuilds inventory (I-8)', () => {
		it('matches lockfile package headers exactly, quoted or not', () => {
			expect(lockfileHasPackage(lockfile, 'bufferutil')).toBe(true);
			expect(lockfileHasPackage(lockfile, '@parcel/watcher')).toBe(true);
			expect(lockfileHasPackage(lockfile, 'keccak')).toBe(false);
			expect(lockfileHasPackage(lockfile, 'buffer')).toBe(false);
		});

		it('fails for an allowBuilds entry whose package is not in the lockfile', () => {
			expect(allowBuildsFailures(workspaceYaml, lockfile)).toEqual([
				'pnpm-workspace.yaml allowBuilds pre-approves build scripts for keccak, which is not in pnpm-lock.yaml; remove the stale entry',
			]);
			expect(allowBuildsFailures('packages:\n  - "packages/*"\n', lockfile)).toEqual([
				'pnpm-workspace.yaml must declare an allowBuilds block',
			]);
		});

		it('passes on the committed workspace and lockfile', () => {
			expect(
				allowBuildsFailures(read('pnpm-workspace.yaml'), read('pnpm-lock.yaml')),
			).toEqual([]);
		});
	});

	describe('.trivyignore revisit dates (I-9)', () => {
		const ignoreFile = [
			'# header comment',
			'#   CVE-0000-00000  # unreachable: <reason>; revisit by <date>',
			'',
			'CVE-2026-1  # unreachable: tooling-only; revisit by 2026-11-04',
			'CVE-2026-2  # unreachable: tooling-only; revisit by 2026-01-01',
			'CVE-2026-3  # unreachable: tooling-only',
			'CVE-2026-4  # revisit by 2026-13-45',
			'',
		].join('\n');

		it('fails for a passed, missing or invalid revisit date and accepts future dates', () => {
			expect(trivyIgnoreFailures(ignoreFile, '2026-10-22')).toEqual([
				'.trivyignore:5 CVE-2026-2 was to be revisited by 2026-01-01; re-assess the advisory and either remove the exception or record a new date',
				'.trivyignore:6 CVE-2026-3 has no "revisit by YYYY-MM-DD" marker',
				'.trivyignore:7 CVE-2026-4 has an invalid revisit date 2026-13-45',
			]);
		});

		it('treats the revisit day itself as still valid and the day after as passed', () => {
			const single = 'CVE-2026-1  # unreachable: x; revisit by 2026-11-04\n';
			expect(trivyIgnoreFailures(single, '2026-11-04')).toEqual([]);
			expect(trivyIgnoreFailures(single, '2026-11-05')).toHaveLength(1);
		});

		it('accepts the committed .trivyignore as of its review date', () => {
			expect(trivyIgnoreFailures(read('.trivyignore'), '2026-10-22')).toEqual([]);
		});
	});
});
