#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { checkPackageDependencies } = require('./check-package-dependencies');
const {
	allowBuildsFailures,
	listWorkspaceBlockKeys,
	minimumReleaseAgeExcludeFailures,
	trivyActionSettings,
	trivyIgnoreFailures,
} = require('./doctor-checks');
const { digestInstalledPackage, installedPackageRoot } = require('./git-dependency-digest');

const root = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];

const expectedNodeFloor = '20.19.0';
const expectedNodeRange = `>=${expectedNodeFloor}`;
const expectedPackageManager = 'pnpm@10.27.0';
const expectedPnpmMajor = '10.';

// The supply-chain gate must run the same scanner, with the same scope, locally
// and in CI. The image digest is what `pnpm run audit:supply-chain` executes;
// the version string is what the pinned trivy-action step in ci.yml is told to
// install; both must scan devDependencies (`--include-dev-deps` locally,
// `TRIVY_INCLUDE_DEV_DEPS` in the action's env). Bump all three together — the
// checks below fail if any of them stops agreeing.
const expectedTrivyVersion = '0.70.0';
const trivyScanFlags =
	'fs --scanners vuln --include-dev-deps --severity HIGH,CRITICAL --exit-code 1 --ignorefile .trivyignore pnpm-lock.yaml';
const expectedTrivyImage =
	'ghcr.io/aquasecurity/trivy:0.70.0@sha256:be1190afcb28352bfddc4ddeb71470835d16462af68d310f9f4bca710961a41e';

const isWindows = process.platform === 'win32';
const localBin = name => path.join(root, 'node_modules', '.bin', `${name}${isWindows ? '.cmd' : ''}`);

const fail = message => failures.push(message);
const warn = message => warnings.push(message);

const exists = relativePath => fs.existsSync(path.join(root, relativePath));
const readText = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = relativePath => JSON.parse(readText(relativePath));

function run(command, args, options = {}) {
	return spawnSync(command, args, {
		cwd: root,
		encoding: 'utf8',
		shell: false,
		...options,
	});
}

function checkCommand(command, args, label, required = true) {
	const result = run(command, args);
	if (result.status === 0) return result.stdout.trim();

	const message = `${label} is unavailable or failed to run`;
	if (required) fail(message);
	else warn(message);
	return '';
}

function listPackageJsonFiles() {
	try {
		return Array.from(
			new Set(
				execFileSync(
					'git',
					[
						'ls-files',
						'package.json',
						'packages/*/package.json',
						'tools/*/package.json',
						'docs/package.json',
						'packages/web3/test/*_black_box/package.json',
					],
					{ cwd: root, encoding: 'utf8' },
				)
					.trim()
					.split('\n')
					.filter(Boolean),
			),
		);
	} catch {
		fail('Unable to list package manifests with git');
		return [];
	}
}

const listWorkspaceOverrideKeys = workspaceYaml => listWorkspaceBlockKeys(workspaceYaml, 'overrides');

// Reads the override keys documented in the generated-by-hand inventory table,
// which is fenced by HTML markers so this stays a table lookup and not a
// full-document scan.
function listDocumentedOverrideKeys(doc) {
	const start = doc.indexOf('<!-- overrides:start -->');
	const end = doc.indexOf('<!-- overrides:end -->');
	if (start === -1 || end === -1 || end < start) return undefined;

	return doc
		.slice(start, end)
		.split('\n')
		.map(line => /^\|\s*`([^`]+)`\s*\|/.exec(line))
		.filter(Boolean)
		.map(match => match[1]);
}

// Drops any prerelease suffix so nightly/rc builds (23.0.0-nightly...) compare
// on their numeric release components rather than parsing to NaN.
const toVersionTuple = version => version.split('-')[0].split('.').map(Number);

function satisfiesFloor(version, floor) {
	const actual = toVersionTuple(version);
	const minimum = toVersionTuple(floor);
	if (actual.length < minimum.length || actual.some(part => !Number.isInteger(part))) return false;

	for (let index = 0; index < minimum.length; index += 1) {
		if (actual[index] > minimum[index]) return true;
		if (actual[index] < minimum[index]) return false;
	}

	return true;
}

if (!satisfiesFloor(process.versions.node, expectedNodeFloor)) {
	fail(`Node ${process.versions.node} does not satisfy ${expectedNodeRange}`);
}

const rootPackage = readJson('package.json');
if (rootPackage.packageManager !== expectedPackageManager) {
	fail(`Root packageManager must be ${expectedPackageManager}`);
}

if (!rootPackage.engines || rootPackage.engines.node !== expectedNodeRange) {
	fail(`Root package.json must declare engines.node as ${expectedNodeRange}`);
}

if (!rootPackage.engines || rootPackage.engines.pnpm !== '>=10.27.0') {
	fail('Root package.json must declare engines.pnpm as >=10.27.0');
}

const pnpmVersion = checkCommand('pnpm', ['--version'], 'pnpm');
if (pnpmVersion && !pnpmVersion.startsWith(expectedPnpmMajor)) {
	fail(`pnpm ${pnpmVersion} is not pnpm 10.x`);
}

if (!exists('pnpm-workspace.yaml')) {
	fail('Missing pnpm-workspace.yaml');
} else {
	const workspaceYaml = readText('pnpm-workspace.yaml');
	for (const required of ['linkWorkspacePackages: true', 'nodeLinker: hoisted']) {
		if (!workspaceYaml.includes(required)) fail(`pnpm-workspace.yaml must include ${required}`);
	}

	// docs/supply-chain-security.md is a control document, so its override
	// inventory is checked against the executable config rather than trusted.
	const overrideKeys = listWorkspaceOverrideKeys(workspaceYaml);
	if (!overrideKeys) {
		fail('pnpm-workspace.yaml must declare an overrides block');
	} else if (!exists('docs/supply-chain-security.md')) {
		fail('Missing docs/supply-chain-security.md');
	} else {
		const documentedKeys = listDocumentedOverrideKeys(readText('docs/supply-chain-security.md'));
		if (!documentedKeys) {
			fail('docs/supply-chain-security.md must fence its override inventory with <!-- overrides:start --> and <!-- overrides:end -->');
		} else {
			const undocumented = overrideKeys.filter(key => !documentedKeys.includes(key));
			const stale = documentedKeys.filter(key => !overrideKeys.includes(key));
			if (undocumented.length > 0) {
				fail(`docs/supply-chain-security.md does not document pnpm overrides: ${undocumented.join(', ')}`);
			}
			if (stale.length > 0) {
				fail(`docs/supply-chain-security.md documents pnpm overrides that no longer exist: ${stale.join(', ')}`);
			}
		}
	}
}

// allowBuilds is reviewed per lockfile: an entry for a package that the
// lockfile no longer contains would pre-approve a future install script.
if (exists('pnpm-workspace.yaml') && exists('pnpm-lock.yaml')) {
	for (const message of allowBuildsFailures(readText('pnpm-workspace.yaml'), readText('pnpm-lock.yaml'))) {
		fail(message);
	}
}

// Quarantine exclusions are reviewed per release: a name-only entry would let
// every future version of the package bypass the seven-day minimum release age.
if (exists('pnpm-workspace.yaml')) {
	for (const message of minimumReleaseAgeExcludeFailures(readText('pnpm-workspace.yaml'))) fail(message);
}

// Accepted advisories are time-bounded exceptions; a passed revisit date fails
// the toolchain check until the advisory is re-assessed.
if (!exists('.trivyignore')) {
	fail('Missing .trivyignore');
} else {
	for (const message of trivyIgnoreFailures(readText('.trivyignore'))) fail(message);
}

// The supply-chain gate is only reproducible if the local script and the CI step
// name the same scanner and scan the same scope. All assertions are offline
// string checks, so they are safe to fail on; scanner availability is checked
// separately and only warns.
const auditScript = (rootPackage.scripts && rootPackage.scripts['audit:supply-chain']) || '';
if (!auditScript.includes(expectedTrivyImage)) {
	fail(`audit:supply-chain must run the pinned Trivy image ${expectedTrivyImage}`);
}
if (!auditScript.includes(`scan ${trivyScanFlags}`)) {
	fail(
		`audit:supply-chain must scan with "${trivyScanFlags}": devDependencies are in scope (--include-dev-deps) because the release, docs and CI toolchain executes them`,
	);
}

if (!exists('.github/workflows/ci.yml')) {
	fail('Missing .github/workflows/ci.yml');
} else {
	const trivyStep = trivyActionSettings(readText('.github/workflows/ci.yml'));
	if (!trivyStep) {
		fail('.github/workflows/ci.yml must run the Supply Chain Audit through an aquasecurity/trivy-action step');
	} else {
		if (trivyStep.version !== `v${expectedTrivyVersion}`) {
			fail(
				`.github/workflows/ci.yml must pin the Trivy action input version: v${expectedTrivyVersion} to match pnpm run audit:supply-chain (found ${trivyStep.version ?? 'no version input'})`,
			);
		}
		if (!trivyStep.includeDevDeps) {
			fail(
				'.github/workflows/ci.yml must set TRIVY_INCLUDE_DEV_DEPS: "true" in the env of the Trivy step so the CI scan covers devDependencies like pnpm run audit:supply-chain',
			);
		}
	}
}

if (!exists('.npmrc')) {
	fail('Missing .npmrc');
} else {
	const npmrc = readText('.npmrc');
	for (const required of ['engine-strict=true']) {
		if (!npmrc.includes(required)) fail(`.npmrc must include ${required}`);
	}
}

if (!exists('pnpm-lock.yaml')) {
	fail('Missing root pnpm-lock.yaml');
}

for (const unsupportedLockfile of ['package-lock.json', 'yarn.lock', 'docs/yarn.lock']) {
	if (exists(unsupportedLockfile)) fail(`${unsupportedLockfile} is unsupported in this pnpm-managed repo`);
}

for (const lockfile of [
	'packages/web3/test/cjs_black_box/yarn.lock',
	'packages/web3/test/esm_black_box/yarn.lock',
	'packages/web3/test/cjs_black_box/pnpm-lock.yaml',
	'packages/web3/test/esm_black_box/pnpm-lock.yaml',
]) {
	if (exists(lockfile)) {
		fail(`${lockfile} should be generated during black-box tests, not committed`);
	}
}

for (const manifestPath of listPackageJsonFiles()) {
	const manifest = readJson(manifestPath);
	if (!manifest.engines || manifest.engines.node !== expectedNodeRange) {
		fail(`${manifestPath} must declare engines.node as ${expectedNodeRange}`);
	}
	if (manifest.engines && Object.prototype.hasOwnProperty.call(manifest.engines, 'npm')) {
		fail(`${manifestPath} still declares an npm engine`);
	}
}

// Every bare import in src/ (and in lib/ once built) must be declared by the
// package itself; hoisting hides a missing declaration until a consumer
// installs the package from the registry.
const dependencyCheck = checkPackageDependencies({ root });
for (const message of dependencyCheck.warnings) warn(message);
for (const message of dependencyCheck.failures) fail(message);

for (const [name, args] of [
	['turbo', ['--version']],
	['eslint', ['--version']],
	['tsc', ['--version']],
	['jest', ['--version']],
]) {
	if (!fs.existsSync(localBin(name))) {
		fail(`Missing local ${name}; run pnpm install --frozen-lockfile`);
		continue;
	}
	checkCommand('pnpm', ['exec', name, ...args], name);
}

checkCommand('git', ['--version'], 'git');
checkCommand('bash', ['--version'], 'bash');
checkCommand('curl', ['--version'], 'curl', false);

// pnpm enforces a supplied integrity hash for GitHub tarballs, but does not generate
// one automatically. Keep the reviewed archive checksum in the lockfile, in addition
// to checking the installed tree. See docs/supply-chain-security.md for updates.
const expectedGitDependencies = {
	'@theqrl/qrl-contracts': {
		tarball: 'https://codeload.github.com/theQRL/qrl-contracts/tar.gz/d3c84eedac4e051f6e99892397c5e42f0f0a2266',
		integrity: 'sha512-l7G9mP4DJR1cF+8Vht3hN9Rk9KjY+/jz2C5BMUq5OaQ0IPcL1exO6Jcb4HgwFuZ3TuecSCVvWnZW2OATzQITAA==',
		treeDigest: 'ba165d2f1305116539092a351a2c476a0cd3425336183ef6fd5b35f996f2d5b7',
	},
};

const dependencyLockfile = readText('pnpm-lock.yaml');
for (const [packageName, { tarball, integrity, treeDigest }] of Object.entries(expectedGitDependencies)) {
	if (!dependencyLockfile.includes(`resolution: {integrity: ${integrity}, tarball: ${tarball}}`)) {
		fail(`${packageName} must retain its reviewed archive integrity and URL in pnpm-lock.yaml`);
	}
	const actualDigest = digestInstalledPackage(installedPackageRoot(root, packageName));
	if (!actualDigest) {
		fail(`${packageName} is not installed; run pnpm install --frozen-lockfile before pnpm run doctor`);
	} else if (actualDigest !== treeDigest) {
		fail(
			`${packageName} installed tree digest ${actualDigest} does not match the reviewed digest ${treeDigest}; the installed content changed`,
		);
	}
}

// Advisory only. `pnpm run doctor` is a required step on every CI leg and on
// machines that never run the supply-chain gate, so a missing scanner must not
// fail the toolchain check — it only tells you how to get the pinned one.
const dockerVersion = checkCommand('docker', ['--version'], 'docker', false);
if (!dockerVersion) {
	warn(
		`Supply-chain scanner unavailable: pnpm run audit:supply-chain runs Trivy ${expectedTrivyVersion} from ${expectedTrivyImage} and needs Docker. Install Docker, or install Trivy ${expectedTrivyVersion} yourself and run: trivy ${trivyScanFlags}`,
	);
}

for (const message of warnings) {
	console.warn(`WARN ${message}`);
}

if (failures.length > 0) {
	for (const message of failures) {
		console.error(`FAIL ${message}`);
	}
	process.exit(1);
}

console.info('Environment checks passed');
