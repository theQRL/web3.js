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
	npmrcPolicyFailures: (text: string) => string[];
	allowBuildsFailures: (workspaceYaml: string, lockfileText: string) => string[];
	listWorkspaceBlockItems: (workspaceYaml: string, blockName: string) => string[] | undefined;
	listWorkspaceBlockKeys: (workspaceYaml: string, blockName: string) => string[] | undefined;
	lockfileHasPackage: (lockfileText: string, packageName: string) => boolean;
	minimumReleaseAgeExcludeFailures: (workspaceYaml: string) => string[];
	parseCalendarDate: (value: string) => Date | undefined;
	trivyActionSettings: (
		workflowYaml: string,
	) => { version: string | undefined; includeDevDeps: boolean } | undefined;
	trivyIgnoreFailures: (trivyIgnoreText: string, today?: string) => string[];
}

// Plain CommonJS shared with scripts/doctor.js; no declaration file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const doctorChecks = require('../../doctor-checks') as DoctorChecks;
const {
	allowBuildsFailures,
	listWorkspaceBlockItems,
	listWorkspaceBlockKeys,
	lockfileHasPackage,
	minimumReleaseAgeExcludeFailures,
	parseCalendarDate,
	trivyActionSettings,
	trivyIgnoreFailures,
} = doctorChecks;

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

		it('reads a block indented with four spaces, nested values and a flow mapping (pass-4 doctor gaps)', () => {
			const fourSpaces = [
				'packages:',
				'    - "packages/*"',
				'allowBuilds:',
				'    keccak: true',
				'    "@parcel/watcher":',
				'        nested: true',
				'    bufferutil: true',
				'strictDepBuilds: true',
				'',
			].join('\n');
			expect(listWorkspaceBlockKeys(fourSpaces, 'allowBuilds')).toEqual([
				'keccak',
				'@parcel/watcher',
				'bufferutil',
			]);
			expect(allowBuildsFailures(fourSpaces, lockfile)).toEqual([
				'pnpm-workspace.yaml allowBuilds pre-approves build scripts for keccak, which is not in pnpm-lock.yaml; remove the stale entry',
			]);
			expect(
				listWorkspaceBlockKeys(
					'allowBuilds: {keccak: true, "@parcel/watcher": true} # flow\n',
					'allowBuilds',
				),
			).toEqual(['keccak', '@parcel/watcher']);
			expect(
				listWorkspaceBlockKeys(
					'allowBuildsExtra:\n  x: true\nallowBuilds:\n  y: true\n',
					'allowBuilds',
				),
			).toEqual(['y']);
		});
	});

	describe('minimumReleaseAgeExclude pins (P4-L-47)', () => {
		it('checks flow-style sequences, including multiline and comments', () => {
			const yaml = "minimumReleaseAgeExclude: [ '@theqrl/*', # own packages\n 'braces' ]\n";
			expect(listWorkspaceBlockItems(yaml, 'minimumReleaseAgeExclude')).toEqual([
				'@theqrl/*',
				'braces',
			]);
			expect(minimumReleaseAgeExcludeFailures(yaml)).toHaveLength(1);
		});

		const excludes = (entries: string[]) =>
			[
				'minimumReleaseAge: 10080',
				'minimumReleaseAgeExclude:',
				...entries.map(entry => `- '${entry}'`),
				'overrides:',
				'  a: 1',
				'',
			].join('\n');

		it('lists the entries of the block', () => {
			expect(
				listWorkspaceBlockItems(
					excludes(['@theqrl/*', 'postcss@8.5.18']),
					'minimumReleaseAgeExclude',
				),
			).toEqual(['@theqrl/*', 'postcss@8.5.18']);
			expect(
				listWorkspaceBlockItems('packages:\n', 'minimumReleaseAgeExclude'),
			).toBeUndefined();
		});

		it('accepts @theqrl/* and exact versions, rejects name-only and range entries', () => {
			expect(
				minimumReleaseAgeExcludeFailures(
					excludes([
						'@theqrl/*',
						'brace-expansion@1.1.20||2.1.6||5.0.11',
						'@babel/core@7.29.7',
						'postcss@8.5.18',
					]),
				),
			).toEqual([]);
			const failures = minimumReleaseAgeExcludeFailures(
				excludes([
					'postcss',
					'@babel/plugin-transform-modules-systemjs',
					'fast-uri@^3.1.7',
					'@scope/*',
				]),
			);
			expect(failures).toHaveLength(4);
			expect(failures[0]).toContain(
				'minimumReleaseAgeExclude entry postcss is not pinned to exact versions',
			);
			expect(failures[2]).toContain('fast-uri@^3.1.7');
		});

		it('passes on the committed workspace manifest', () => {
			expect(minimumReleaseAgeExcludeFailures(read('pnpm-workspace.yaml'))).toEqual([]);
		});
	});

	describe('Trivy step parity (P4-M-7)', () => {
		it('reads the version input and the dev-dependency switch of the committed CI step', () => {
			expect(trivyActionSettings(read('.github/workflows/ci.yml'))).toEqual({
				version: 'v0.70.0',
				includeDevDeps: true,
			});
			expect(read('package.json')).toContain(
				'scan fs --scanners vuln --include-dev-deps --severity HIGH,CRITICAL',
			);
		});

		it('ignores comments and reports a missing env switch', () => {
			const workflow = [
				'jobs:',
				'  supply-chain:',
				'    steps:',
				'      # version: v0.70.0 mentioned in a comment only',
				'      - name: Trivy',
				'        uses: aquasecurity/trivy-action@abc # v0.36.0',
				'        with:',
				'          scan-type: fs',
				"          version: 'v0.69.0' # pinned",
				'      - name: Next step',
				'        env:',
				'          TRIVY_INCLUDE_DEV_DEPS: "true"',
				'        run: echo',
				'',
			].join('\n');
			expect(trivyActionSettings(workflow)).toEqual({
				version: 'v0.69.0',
				includeDevDeps: false,
			});
			expect(
				trivyActionSettings(
					workflow.replace("          version: 'v0.69.0' # pinned\n", ''),
				),
			).toEqual({
				version: undefined,
				includeDevDeps: false,
			});
			expect(trivyActionSettings('jobs: {}\n')).toBeUndefined();
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

		it('rejects a non-calendar date instead of rolling it over, and bounds the horizon at two years', () => {
			expect(parseCalendarDate('2026-02-30')).toBeUndefined();
			expect(parseCalendarDate('2028-02-29')?.toISOString()).toBe('2028-02-29T00:00:00.000Z');
			expect(
				trivyIgnoreFailures('CVE-1  # x; revisit by 2026-02-30\n', '2026-10-22'),
			).toEqual(['.trivyignore:1 CVE-1 has an invalid revisit date 2026-02-30']);
			expect(
				trivyIgnoreFailures('CVE-2  # x; revisit by 2028-10-22\n', '2026-10-22'),
			).toEqual([]);
			expect(
				trivyIgnoreFailures('CVE-3  # x; revisit by 2028-10-23\n', '2026-10-22'),
			).toEqual([
				'.trivyignore:1 CVE-3 has a revisit date 2028-10-23 more than two years out (latest accepted: 2028-10-22); an accepted advisory must be re-assessed within two years',
			]);
			expect(
				trivyIgnoreFailures('CVE-4  # x; revisit by 9999-12-31\n', '2026-10-22'),
			).toHaveLength(1);
			expect(
				trivyIgnoreFailures(
					'CVE-5  # revisit by 2026-11-04 (old); revisit by 2020-01-01\n',
					'2026-10-22',
				),
			).toEqual([
				'.trivyignore:1 CVE-5 has 2 "revisit by" markers; keep exactly one so the date that applies is unambiguous',
			]);
		});

		it('accepts the committed .trivyignore as of its review date', () => {
			expect(trivyIgnoreFailures(read('.trivyignore'), '2026-10-22')).toEqual([]);
		});
	});
});

describe('pass-6 workspace policy parsing', () => {
	it.each([
		'base: &base\n  minimumReleaseAgeExclude: [lodash]\n<<: *base\n',
		'base: &base { evil: true }\nallowBuilds: *base\n',
	])('refuses merges and aliases rather than disagreeing with pnpm', yaml => {
		expect(() => minimumReleaseAgeExcludeFailures(yaml)).toThrow(/aliases|merge/);
		expect(() => allowBuildsFailures(yaml, '')).toThrow(/aliases|merge/);
	});
	it('reads multi-line flow mappings for build approvals', () => {
		expect(
			allowBuildsFailures('allowBuilds: {\n evil: true,\n bufferutil: true\n}\n', lockfile),
		).toEqual([expect.stringContaining('evil')]);
	});
	it.each([
		'minimum-release-age-exclude[]',
		'only-built-dependencies[]',
		'minimumReleaseAgeExclude',
		'allow-builds',
		'dangerously-allow-all-builds',
	])('refuses .npmrc policy key %s', key => {
		expect(doctorChecks.npmrcPolicyFailures(`${key}=lodash`)).toHaveLength(1);
	});
	it('allows normal npmrc settings and comments', () => {
		expect(
			doctorChecks.npmrcPolicyFailures(
				'# minimum-release-age-exclude[]=lodash\nengine-strict=true\nregistry=https://registry.npmjs.org/',
			),
		).toEqual([]);
	});
});
