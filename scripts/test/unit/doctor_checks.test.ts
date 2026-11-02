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

interface GitDependency {
	tarball: string;
	integrity: string;
	treeDigest: string;
}

interface DoctorChecks {
	expectedGitDependencies: Record<string, GitDependency>;
	gitDependencyLockfileFailures: (
		lockfileYaml: string,
		packageName: string,
		expected: GitDependency,
	) => string[];
	lockfilePolicyFailures: (text: string) => string[];
	manifestPolicyFailures: (manifest: object) => string[];
	workspacePolicyFailures: (text: string) => string[];
	overridePolicyFailures: (workspace: string, lockfile: string) => string[];
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

describe('pass-7 install policy sources', () => {
	// eslint-disable-next-line no-null/no-null -- exercise explicit null from untyped callers
	it.each([{ pnpm: { overrides: { lodash: '1.0.0' } } }, { resolutions: {} }, { pnpm: null }])(
		'refuses root manifest policy even when empty',
		manifest => {
			expect(doctorChecks.manifestPolicyFailures(manifest)).toHaveLength(1);
		},
	);
	it('checks lockfile override values and keys, independent of order', () => {
		const workspace = 'overrides: {a: "1.0.0", b: "2.0.0"}';
		expect(
			doctorChecks.overridePolicyFailures(workspace, 'overrides: {b: "2.0.0", a: "1.0.0"}'),
		).toEqual([]);
		for (const other of [
			'overrides: {a: "1.0.0"}',
			'overrides: {a: "1.0.1", b: "2.0.0"}',
			'packages: {}',
		]) {
			expect(doctorChecks.overridePolicyFailures(workspace, other)).toHaveLength(1);
		}
		expect(
			doctorChecks.overridePolicyFailures(
				read('pnpm-workspace.yaml'),
				read('pnpm-lock.yaml'),
			),
		).toEqual([]);
	});
	it.each([
		'%YAML 1.1\n---\n!!merge : {minimumReleaseAgeExclude: [lodash]}',
		'\uFEFF%YAML 1.1\n---\nminimumReleaseAge: 10080',
		'!!merge : {minimumReleaseAgeExclude: [lodash]}',
		'%TAG !x! tag:yaml.org,2002:\n---\n!x!merge : {minimumReleaseAgeExclude: [lodash]}',
		'unknown: !unresolved value',
		'123: value',
	])('rejects ambiguous YAML: %s', yaml => {
		expect(() => minimumReleaseAgeExcludeFailures(yaml)).toThrow();
	});
	it.each(['dangerously-allow-all-builds', 'only-built-dependencies[]', 'pnpmfile', 'lockfile'])(
		'rejects bare npmrc policy key %s',
		key => {
			expect(doctorChecks.npmrcPolicyFailures(`engine-strict=true\n${key}\n`)).toHaveLength(
				1,
			);
		},
	);
	it('requires a seven-day quarantine and both install safeguards', () => {
		const valid = 'minimumReleaseAge: 10080\nblockExoticSubdeps: true\nstrictDepBuilds: true\n';
		expect(doctorChecks.workspacePolicyFailures(valid)).toEqual([]);
		for (const age of ['0', '10079', '10080.5', '"10080"']) {
			expect(doctorChecks.workspacePolicyFailures(valid.replace('10080', age))).toHaveLength(
				1,
			);
		}
		expect(doctorChecks.workspacePolicyFailures('{}')).toHaveLength(3);
		expect(doctorChecks.workspacePolicyFailures(valid.replace(/true/g, 'false'))).toHaveLength(
			2,
		);
	});
});

describe('git dependency lockfile pin (doctor substring check)', () => {
	const name = '@theqrl/qrl-contracts';
	const expected = doctorChecks.expectedGitDependencies[name];
	const pinnedLockfile = (options: {
		version?: string;
		integrity?: string;
		extraEntry?: string;
		comment?: string;
	}) =>
		[
			"lockfileVersion: '9.0'",
			'importers:',
			'  .:',
			'    devDependencies:',
			`      '${name}':`,
			'        specifier: github:theQRL/qrl-contracts#abc',
			`        version: ${options.version ?? expected.tarball}`,
			'packages:',
			`  '${name}@${expected.tarball}':`,
			`    resolution: {integrity: ${options.integrity ?? expected.integrity}, tarball: ${expected.tarball}}`,
			...(options.extraEntry
				? [
						`  '${name}@${options.extraEntry}':`,
						`    resolution: {integrity: sha512-other, tarball: ${options.extraEntry}}`,
					]
				: []),
			...(options.comment ? [options.comment] : []),
			'',
		].join('\n');

	it('accepts the committed lockfile and a minimal pinned lockfile', () => {
		expect(
			doctorChecks.gitDependencyLockfileFailures(read('pnpm-lock.yaml'), name, expected),
		).toEqual([]);
		expect(
			doctorChecks.gitDependencyLockfileFailures(pinnedLockfile({}), name, expected),
		).toEqual([]);
	});

	it('is not satisfied by the expected resolution text outside the package entry', () => {
		const text = pinnedLockfile({
			integrity: 'sha512-tampered',
			comment: `# resolution: {integrity: ${expected.integrity}, tarball: ${expected.tarball}}`,
		});
		expect(text).toContain(
			`resolution: {integrity: ${expected.integrity}, tarball: ${expected.tarball}}`,
		);
		expect(doctorChecks.gitDependencyLockfileFailures(text, name, expected)).toHaveLength(1);
	});

	it('rejects an importer resolving another archive and a second package entry', () => {
		const other = 'https://codeload.github.com/theQRL/qrl-contracts/tar.gz/0000';
		expect(
			doctorChecks.gitDependencyLockfileFailures(
				pinnedLockfile({ version: other }),
				name,
				expected,
			),
		).toHaveLength(1);
		expect(
			doctorChecks.gitDependencyLockfileFailures(
				pinnedLockfile({ extraEntry: other }),
				name,
				expected,
			),
		).toHaveLength(1);
		expect(
			doctorChecks.gitDependencyLockfileFailures("lockfileVersion: '9.0'\n", name, expected),
		).toHaveLength(2);
	});
});

describe('pass-8 alternate install policy', () => {
	it.each([
		'pnpmfile',
		'globalPnpmfile',
		'ignorePnpmfile',
		'packageExtensions',
		'patchedDependencies',
		'configDependencies',
		'supportedArchitectures',
		'dangerouslyAllowAllBuilds',
		'onlyBuiltDependencies',
		'onlyBuiltDependenciesFile',
		'neverBuiltDependencies',
		'ignoredBuiltDependencies',
		'ignoreDepScripts',
		'verifyStoreIntegrity',
		'lockfile',
		'trustPolicy',
	])('refuses workspace policy source %s even when empty', key => {
		const valid = 'minimumReleaseAge: 10080\nblockExoticSubdeps: true\nstrictDepBuilds: true\n';
		expect(doctorChecks.workspacePolicyFailures(`${valid}${key}: {}\n`)).toHaveLength(1);
	});
	it.each(['pnpmfileChecksum', 'packageExtensionsChecksum', 'patchedDependencies'])(
		'refuses lockfile evidence of %s',
		key => {
			expect(doctorChecks.lockfilePolicyFailures(`${key}: ""\n`)).toHaveLength(1);
		},
	);
	it.each([
		'global-pnpmfile',
		'config-dependencies',
		'package-extensions',
		'patched-dependencies',
	])('refuses npmrc alternate policy %s', key => {
		expect(doctorChecks.npmrcPolicyFailures(`${key}=hooks.cjs`)).toHaveLength(1);
	});
	it('accepts the committed lockfile and workspace', () => {
		expect(doctorChecks.lockfilePolicyFailures(read('pnpm-lock.yaml'))).toEqual([]);
		expect(doctorChecks.workspacePolicyFailures(read('pnpm-workspace.yaml'))).toEqual([]);
	});
});

test.each([
	'use-node-version',
	'useNodeVersion',
	'executionEnv',
	'execution_env',
	'node-mirror:release',
	'nodeMirror:nightly',
	'manage-package-manager-versions',
	'MANAGEPACKAGEMANAGERVERSIONS',
])('refuses runtime selection policy from npmrc and workspace: %s', key => {
	expect(doctorChecks.npmrcPolicyFailures(`${key}=x`)).toHaveLength(1);
	expect(
		doctorChecks.workspacePolicyFailures(
			`minimumReleaseAge: 10080\nblockExoticSubdeps: true\nstrictDepBuilds: true\n${key}: x`,
		),
	).toHaveLength(1);
});

test.each(['use-node-version', 'dangerously-allow-all-builds', 'pnpmfile', 'trust-policy'])(
	'rejects ini comment and quote spellings of policy key %s',
	key => {
		for (const spelling of [
			key + ' #comment',
			key + ' ;comment',
			key + '#',
			'"' + key + '"',
			"'" + key + "'",
			key + '[]',
		]) {
			expect(doctorChecks.npmrcPolicyFailures(spelling + '=x')).toHaveLength(1);
		}
	},
);

test('decodes quoted JSON escapes and preserves escaped comment characters like ini', () => {
	expect(
		doctorChecks.npmrcPolicyFailures(String.raw`"\u0075se-node-version"=22.99.0`),
	).toHaveLength(1);
	expect(doctorChecks.npmrcPolicyFailures(String.raw`use-node-version\#literal=x`)).toEqual([]);
	expect(doctorChecks.npmrcPolicyFailures(String.raw`use-node-version\;literal=x`)).toEqual([]);
});

describe('pass-11 configuration key decoding', () => {
	it.each([
		'${X-use-node-version}',
		'${X:-node-mirror:release}',
		'${X}',
		'prefix${X}',
		'"\\u0024{X-use-node-version}"',
	])('rejects environment-dependent npmrc key %s', key => {
		expect(doctorChecks.npmrcPolicyFailures(`${key}=value`)).toHaveLength(1);
	});
	it.each(['${X-useNodeVersion}', '${X:-node-mirror:release}', '${X}'])(
		'rejects workspace key %s',
		key => {
			expect(
				doctorChecks.workspacePolicyFailures(
					read('pnpm-workspace.yaml') + `\n"${key}": value\n`,
				),
			).toEqual(['pnpm-workspace.yaml must not use environment substitution in keys']);
		},
	);
	it('checks each bare-CR line and preserves environment substitution in values', () => {
		expect(
			doctorChecks.npmrcPolicyFailures(
				'save-exact=true\ruse-node-version=22.99.0\rnode-mirror:release=http://example.test',
			),
		).toHaveLength(2);
		expect(
			doctorChecks.npmrcPolicyFailures('//example.test/:_authToken=${TOKEN}\r# ${COMMENT}'),
		).toEqual([]);
	});
});
