#!/usr/bin/env node

const { existsSync, mkdtempSync, readFileSync } = require('fs');
const { tmpdir } = require('os');
const { join, resolve } = require('path');
const { execFileSync } = require('child_process');

const { checkPackageDependencies } = require('../check-package-dependencies');
const { publishablePackages } = require('./packages');

const npmCache = () =>
	process.env.npm_config_cache || mkdtempSync(resolve(tmpdir(), 'web3-pack-npm-cache-'));

const normalizePackagePath = packagePath => packagePath.replace(/^\.\//, '').replace(/\\/g, '/');

const collectExportTargets = value => {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.flatMap(collectExportTargets);
	if (value && typeof value === 'object')
		return Object.values(value).flatMap(collectExportTargets);
	return [];
};

const declaredEntrypoints = manifest => {
	const entries = [];
	for (const key of ['main', 'module', 'types', 'typings']) {
		if (typeof manifest[key] === 'string') entries.push([key, manifest[key]]);
	}
	if (typeof manifest.browser === 'string') entries.push(['browser', manifest.browser]);
	for (const target of collectExportTargets(manifest.exports)) {
		entries.push(['exports', target]);
	}
	return entries
		.filter(
			([, target]) =>
				target.startsWith('./') || target.startsWith('lib/') || target.startsWith('dist/'),
		)
		.map(([key, target]) => [key, normalizePackagePath(target)]);
};

// Matched against every path npm would pack, at any depth: the `files`
// allowlists are `lib/**`, `src/**` and `dist/**`, so a stray secret or
// dependency-manager file lands below one of those directories, never at the
// tarball root (audit P4-L-46).
const forbiddenPatterns = [
	[/(^|\/)node_modules\//, 'node_modules'],
	[/(^|\/)\.?coverage\//, 'coverage'],
	[/(^|\/)\.turbo\//, '.turbo'],
	[/(^|\/)\.secrets\.json$/, '.secrets.json'],
	[/(^|\/)\.env(\.|$)/, '.env'],
	[/\.pem$/, 'PEM key or certificate'],
	[/\.key$/, 'private key'],
	[/(^|\/)yarn\.lock$/, 'yarn.lock'],
	[/(^|\/)pnpm-lock\.yaml$/, 'pnpm-lock.yaml'],
	[/(^|\/)package-lock\.json$/, 'package-lock.json'],
	[/ copy\./, 'copy file'],
];

// Labels of every forbidden pattern a packed path matches (empty when allowed).
const forbiddenLabels = file =>
	forbiddenPatterns.filter(([pattern]) => pattern.test(file)).map(([, label]) => label);

const provenanceRepositoryUrl = 'https://github.com/theQRL/web3.js';

const packDryRun = packagePath => {
	const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
		cwd: packagePath,
		encoding: 'utf8',
		env: {
			...process.env,
			npm_config_audit: 'false',
			npm_config_fund: 'false',
			npm_config_ignore_scripts: 'true',
			npm_config_cache: npmCache(),
		},
	});
	const [pack] = JSON.parse(output);
	return pack;
};

const versionNumber = '(?:0|[1-9][0-9]*)';
const prereleaseIdentifier = '(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)';
const releaseRange = new RegExp(
	`^\\^?${versionNumber}\\.${versionNumber}\\.${versionNumber}` +
		`(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?` +
		'(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$',
);

const siblingRangeFailures = (manifest, siblingNames) => {
	const errors = [];
	for (const field of [
		'dependencies',
		'optionalDependencies',
		'peerDependencies',
		'devDependencies',
	]) {
		for (const [name, range] of Object.entries(manifest[field] ?? {})) {
			if (
				siblingNames.has(name) &&
				(typeof range !== 'string' || !releaseRange.test(range))
			) {
				errors.push(
					`${manifest.name}: ${field}.${name} must use an exact or caret semver release range, got ${range}`,
				);
			}
		}
	}
	return errors;
};

// Development manifests intentionally use workspace:^. Only packages being
// published must already contain the release ranges written by the release tool.
const selectReleasePackages = (args, packages) => {
	if (args.length === 0) return packages;
	if (args[0] !== '--release' || args.length < 2) {
		throw new Error('Usage: inspect-packages.js [--release <package-name> ...]');
	}
	const names = new Set(args.slice(1));
	for (const name of names) {
		if (!packages.some(pkg => pkg.name === name)) {
			throw new Error(`Unknown publishable package: ${name}`);
		}
	}
	return packages.filter(pkg => names.has(pkg.name));
};

const main = () => {
	const errors = [];
	const summaries = [];

	// The built output is what gets packed: every module it loads must be a
	// declared dependency, and browser-facing packages must not load Node
	// built-ins. Runs here, after the build, so the release cannot skip it.
	const dependencyCheck = checkPackageDependencies({ root: process.cwd(), requireBuilt: true });
	for (const warning of dependencyCheck.warnings) console.warn(`WARN ${warning}`);
	errors.push(...dependencyCheck.failures);

	const packages = publishablePackages();
	const siblingNames = new Set(packages.map(pkg => pkg.name));
	const args = process.argv.slice(2);
	for (const pkg of selectReleasePackages(args, packages)) {
		const manifestPath = join(pkg.path, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		if (args[0] === '--release') errors.push(...siblingRangeFailures(manifest, siblingNames));
		const pack = packDryRun(pkg.path);
		const files = new Set(pack.files.map(file => normalizePackagePath(file.path)));
		const entrypoints = declaredEntrypoints(manifest);

		if (Object.prototype.hasOwnProperty.call(manifest, 'gitHead')) {
			errors.push(`${pkg.name}: package.json must not contain a committed gitHead`);
		}

		if (manifest.repository?.url !== provenanceRepositoryUrl) {
			errors.push(
				`${pkg.name}: repository.url must be ${provenanceRepositoryUrl} for npm provenance verification`,
			);
		}

		if (entrypoints.length === 0) {
			errors.push(`${pkg.name}: no package entrypoint declared`);
		}

		for (const [key, entrypoint] of entrypoints) {
			if (!files.has(entrypoint)) {
				errors.push(
					`${pkg.name}: ${key} target ${entrypoint} is missing from npm pack output`,
				);
			}
		}

		for (const file of files) {
			for (const label of forbiddenLabels(file)) {
				errors.push(`${pkg.name}: forbidden ${label} file in npm pack output: ${file}`);
			}
		}

		const packageJsonInTarball = files.has('package.json');
		if (!packageJsonInTarball || !existsSync(manifestPath)) {
			errors.push(`${pkg.name}: package.json was not included in pack output`);
		}

		summaries.push(`${pkg.name}: ${files.size} files, ${pack.unpackedSize} unpacked bytes`);
	}

	for (const summary of summaries) console.info(summary);

	if (errors.length > 0) {
		console.error('\nPackage inspection failed:');
		for (const error of errors) console.error(`- ${error}`);
		process.exit(1);
	}

	console.info(`Inspected ${summaries.length} publishable package dry-runs`);
};

if (require.main === module) main();

module.exports = {
	forbiddenLabels,
	forbiddenPatterns,
	siblingRangeFailures,
	selectReleasePackages,
};
