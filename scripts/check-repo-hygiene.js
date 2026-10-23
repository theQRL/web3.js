#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const failures = [];

// Real directories the walk does not descend into. A symlink carrying one of
// these names is NOT excluded: it is checked like every other symlink, because
// `.gitignore`'s `dist/` does not match a symlink and `git add` tracks it
// (audit P4-L-45).
const excludedDirs = new Set(['.git', 'node_modules', '.pnpm-store', 'dist']);

// Where a tracked symlink may resolve to (docs/symlink-template-policy.md):
// shared configs, templates, shared fixtures, and package-local test fixture
// directories. Generated output is never an acceptable target.
const allowedSymlinkTargetPrefixes = ['config', 'templates', 'scripts', 'fixtures'];
const packageLocalFixturePattern = /^(packages|tools)\/[^/]+\/test\//;
// `fixtures/build` holds the committed compiled contract fixtures and is not
// generated output; the docs build directories are.
const generatedOutputPattern = /(^|\/)(lib|dist|coverage|\.coverage|node_modules|\.turbo)(\/|$)/;
const docsOutputPattern = /^docs\/(build|\.docusaurus)(\/|$)/;

const isAllowedSymlinkTarget = relativeTarget =>
	!generatedOutputPattern.test(relativeTarget) &&
	!docsOutputPattern.test(relativeTarget) &&
	(allowedSymlinkTargetPrefixes.some(
		prefix => relativeTarget === prefix || relativeTarget.startsWith(`${prefix}/`),
	) ||
		packageLocalFixturePattern.test(relativeTarget));

// Local secret files: never tracked, and always covered by .gitignore so that
// `git add -A` cannot pick them up. An untracked, ignored `.secrets.json` is
// the normal developer state (`pnpm run init:secrets`) and passes.
const isLocalSecretFile = baseName => baseName === '.secrets.json' || /^\.env(\.|$)/.test(baseName);

function isGitIgnored(relativePath) {
	const result = spawnSync('git', ['check-ignore', '-q', '--', relativePath], { cwd: root, encoding: 'utf8' });
	return result.status === 0;
}

const fail = message => failures.push(message);

const toPosix = value => value.split(path.sep).join('/');

function pathExists(relativePath) {
	return fs.existsSync(path.join(root, relativePath));
}

function trackedFiles() {
	try {
		const output = execFileSync('git', ['ls-files', '-z', '--cached'], {
			cwd: root,
			encoding: 'utf8',
		});

		return output
			.split('\0')
			.filter(Boolean)
			.filter(relativePath => pathExists(relativePath));
	} catch {
		fail('Unable to list tracked files with git');
		return [];
	}
}

function walk(relativeDir, visitor) {
	const absoluteDir = path.join(root, relativeDir);
	let entries;

	try {
		entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
	} catch {
		fail(`Unable to read ${relativeDir || '.'}`);
		return;
	}

	for (const entry of entries) {
		// Only a real directory is skipped; a symlink named `dist` or
		// `node_modules` is visited (and never descended into).
		if (excludedDirs.has(entry.name) && entry.isDirectory()) continue;

		const relativePath = path.join(relativeDir, entry.name);
		visitor(relativePath, entry);

		if (entry.isDirectory()) {
			walk(relativePath, visitor);
		}
	}
}

function checkTrackedForbiddenFiles() {
	const forbiddenExactPaths = new Set([
		'yarn.lock',
		'docs/yarn.lock',
		'packages/web3/test/cjs_black_box/.yarnrc',
		'packages/web3/test/cjs_black_box/yarn.lock',
		'packages/web3/test/esm_black_box/.yarnrc',
		'packages/web3/test/esm_black_box/yarn.lock',
		'packages/web3/test/fixtures/transactions copy.json',
	]);

	for (const relativePath of trackedFiles()) {
		const posixPath = toPosix(relativePath);
		const baseName = path.posix.basename(posixPath);

		if (forbiddenExactPaths.has(posixPath)) {
			fail(`${posixPath} must not be tracked`);
		}

		if (isLocalSecretFile(baseName)) {
			fail(`${posixPath} is a local secret file and must not be tracked`);
		}

		if (baseName === '.yarnrc' || baseName === 'yarn.lock') {
			fail(`${posixPath} is a Yarn artifact in a pnpm-managed repo`);
		}

		if (/(^|\/)\.?coverage\//.test(posixPath)) {
			fail(`${posixPath} is generated coverage output and must not be tracked`);
		}

		if (/^(packages|tools)\/[^/]+\/(lib|dist)(\/|$)/.test(posixPath)) {
			fail(`${posixPath} is generated package output and must not be tracked`);
		}

		if (/ copy\.[^/]+$/.test(baseName)) {
			fail(`${posixPath} looks like an accidental copied file`);
		}
	}
}

function checkTrackedFileContents() {
	// Files that legitimately contain secret-shaped strings. Keep this list
	// tight: everything here is documented, synthetic, throwaway test data.
	const secretScanAllowlist = new Set([
		// Auto-approved local-testnet seed accounts (documented test fixtures).
		'scripts/accounts.json',
	]);

	// High-signal secret patterns only, to keep this pre-merge gate low-noise.
	// A private-key header is a hard failure: it is exactly what would have
	// caught a committed TLS key.
	const secretPatterns = [
		{
			regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/,
			describe: posixPath => `${posixPath} contains a private key header and must not be tracked`,
		},
		{
			regex: /\bAKIA[0-9A-Z]{16}\b/,
			describe: posixPath => `${posixPath} contains what looks like an AWS access key id`,
		},
		{
			regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
			describe: posixPath => `${posixPath} contains what looks like a Slack token`,
		},
	];

	for (const relativePath of trackedFiles()) {
		const posixPath = toPosix(relativePath);

		if (secretScanAllowlist.has(posixPath)) continue;

		let contents;
		try {
			contents = fs.readFileSync(path.join(root, relativePath));
		} catch {
			continue;
		}

		// Skip binary files: they will not hold copy-pasteable secrets and can
		// produce spurious matches.
		if (contents.includes(0)) continue;

		const text = contents.toString('utf8');

		for (const { regex, describe } of secretPatterns) {
			if (regex.test(text)) {
				fail(describe(posixPath));
			}
		}
	}
}

function checkSymlink(relativePath, absolutePath, posixPath) {
	const target = fs.readlinkSync(absolutePath);
	const absoluteTarget = path.isAbsolute(target)
		? target
		: path.resolve(path.dirname(absolutePath), target);

	if (path.isAbsolute(target)) {
		fail(`${posixPath} must use a relative symlink target, not ${target}`);
	}

	const relativeTarget = path.relative(root, absoluteTarget);
	const outside = relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget);
	if (outside) {
		fail(`${posixPath} points outside the repository -> ${target}`);
	}

	if (/\.eslint(ignore|rc)(\.|$)/.test(target)) {
		fail(`${posixPath} points at a removed ESLint legacy template -> ${target}`);
	}

	if (!outside && !isAllowedSymlinkTarget(toPosix(relativeTarget))) {
		fail(
			`${posixPath} points outside the allowed symlink targets (config/, templates/, scripts/, fixtures/ or a package-local test fixture directory; never generated output) -> ${target}`,
		);
	}

	if (!fs.existsSync(absoluteTarget)) {
		fail(`${posixPath} is a broken symlink -> ${target}`);
	}
}

function checkWorkspaceTree() {
	walk('', (relativePath, entry) => {
		const absolutePath = path.join(root, relativePath);
		const posixPath = toPosix(relativePath);
		const baseName = path.posix.basename(posixPath);

		// Symlinks first, before any name-based rule: a link named like an
		// excluded directory or a generated file is still a link.
		if (entry.isSymbolicLink()) {
			checkSymlink(relativePath, absolutePath, posixPath);
			return;
		}

		if (isLocalSecretFile(baseName) && !isGitIgnored(relativePath)) {
			fail(
				`${posixPath} is a local secret file that .gitignore does not cover; it would be tracked by the next git add`,
			);
		}

		if (baseName === '.yarnrc' || baseName === 'yarn.lock') {
			fail(`${posixPath} is a Yarn artifact in a pnpm-managed repo`);
		}

		if (/ copy\.[^/]+$/.test(baseName)) {
			fail(`${posixPath} looks like an accidental copied file`);
		}
	});
}

checkTrackedForbiddenFiles();
checkTrackedFileContents();
checkWorkspaceTree();

if (failures.length > 0) {
	for (const message of failures) {
		console.error(`FAIL ${message}`);
	}
	process.exit(1);
}

console.info('Repository hygiene checks passed');
