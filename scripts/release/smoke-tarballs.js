#!/usr/bin/env node

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

// Installs the packed tarballs into fresh CommonJS and ESM projects and
// `require()`s / `import()`s every released package.
//
// The dependency tree is resolved once, with `npm install --package-lock-only`
// (metadata only, no code is fetched or executed), into <lock directory>/
// package-lock.json; both smoke projects then install it with `npm ci`, which
// refuses anything the lockfile does not name and verifies every integrity
// hash. In the release workflow the `prepare` job resolves the lockfile, ships
// it inside the release-candidate artifact and records its digest, so the
// smoke job on the advertised Node floor executes exactly the tree `prepare`
// pinned rather than whatever the registry serves at that moment
// (audit P4-M-10). Run without an existing lockfile (CI's package inspection,
// local evidence runs) the script resolves one first.
//
// Usage: smoke-tarballs.js [--resolve-only] [released-packages.tsv] [tarball directory] [lock directory]
// Defaults: dist/released-packages.tsv, dist/tarballs, <tarball directory>/../smoke.
// `NPM_EXECUTABLE` overrides the npm binary (used by the unit test).

const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { basename, dirname, join, relative, resolve, sep } = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const resolveOnly = args.includes('--resolve-only');
const positional = args.filter(arg => arg !== '--resolve-only');

const [
	releasedPackagesPath = 'dist/released-packages.tsv',
	tarballDirectoryArg = 'dist/tarballs',
	lockDirectoryArg,
] = positional;
const tarballDirectory = resolve(tarballDirectoryArg);
const lockDirectory = resolve(lockDirectoryArg ?? join(tarballDirectory, '..', 'smoke'));
const npm = process.env.NPM_EXECUTABLE || 'npm';

const releasedPackages = readFileSync(releasedPackagesPath, 'utf8')
	.trim()
	.split('\n')
	.filter(Boolean)
	.map(line => {
		const [packagePath, name, version, releaseTag, tarballName] = line.split('\t');
		return { packagePath, name, version, releaseTag, tarballName };
	});

if (releasedPackages.length === 0) {
	console.log('No released packages to smoke test');
	process.exit(0);
}

const tarballs = releasedPackages.map(pkg => resolve(tarballDirectory, pkg.tarballName));
for (const tarball of tarballs) {
	if (!existsSync(tarball)) {
		console.error(`Missing tarball ${tarball}`);
		process.exit(1);
	}
}

const npmCache = process.env.npm_config_cache || mkdtempSync(resolve(tmpdir(), 'web3-release-npm-cache-'));

const run = (command, commandArgs, cwd) => {
	execFileSync(command, commandArgs, {
		cwd,
		stdio: 'inherit',
		env: {
			...process.env,
			npm_config_audit: 'false',
			npm_config_fund: 'false',
			npm_config_ignore_scripts: 'true',
			npm_config_cache: npmCache,
		},
	});
};

// `file:` specifiers relative to the lock directory. The smoke projects are
// created next to it, so the same relative paths resolve from there too.
const toPosix = value => value.split(sep).join('/');
const dependencies = Object.fromEntries(
	releasedPackages.map((pkg, index) => [pkg.name, `file:${toPosix(relative(lockDirectory, tarballs[index]))}`]),
);
const smokeManifest = { name: 'web3-release-smoke', private: true, dependencies };

const lockfilePath = join(lockDirectory, 'package-lock.json');
const lockManifestPath = join(lockDirectory, 'package.json');

const resolveLockfile = () => {
	mkdirSync(lockDirectory, { recursive: true });
	rmSync(lockfilePath, { force: true });
	writeFileSync(lockManifestPath, `${JSON.stringify(smokeManifest, null, 2)}\n`);
	run(npm, ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], lockDirectory);
	if (!existsSync(lockfilePath)) {
		console.error(`npm did not write ${lockfilePath}`);
		process.exit(1);
	}
	console.log(`Resolved the smoke-test dependency tree into ${lockfilePath}`);
};

if (!existsSync(lockfilePath)) {
	resolveLockfile();
} else {
	// A lockfile that was handed over (release artifact) must describe exactly
	// the tarballs listed in the TSV.
	const lockManifest = JSON.parse(readFileSync(lockManifestPath, 'utf8'));
	const expected = JSON.stringify(dependencies, Object.keys(dependencies).sort());
	const actual = JSON.stringify(lockManifest.dependencies ?? {}, Object.keys(lockManifest.dependencies ?? {}).sort());
	if (expected !== actual) {
		console.error(
			`${lockManifestPath} does not list the released tarballs: expected ${expected}, found ${actual}`,
		);
		process.exit(1);
	}
	console.log(`Installing the dependency tree pinned by ${lockfilePath}`);
}

if (resolveOnly) {
	process.exit(0);
}

const makeProject = type => {
	const directory = resolve(lockDirectory, '..', `smoke-${type}`);
	rmSync(directory, { recursive: true, force: true });
	mkdirSync(directory, { recursive: true });
	const manifest = JSON.parse(readFileSync(lockManifestPath, 'utf8'));
	writeFileSync(join(directory, 'package.json'), `${JSON.stringify({ ...manifest, type }, null, 2)}\n`);
	copyFileSync(lockfilePath, join(directory, 'package-lock.json'));
	run(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
	return directory;
};

const cjsProject = makeProject('commonjs');
writeFileSync(
	resolve(cjsProject, 'smoke.cjs'),
	`const packages = ${JSON.stringify(releasedPackages.map(pkg => pkg.name), null, 2)};
for (const name of packages) {
\tconst mod = require(name);
\tif (mod == null) throw new Error(\`No CommonJS export for \${name}\`);
\tconsole.log(\`required \${name}\`);
}
`,
);
run(process.execPath, ['smoke.cjs'], cjsProject);

const esmProject = makeProject('module');
writeFileSync(
	resolve(esmProject, 'smoke.mjs'),
	`const packages = ${JSON.stringify(releasedPackages.map(pkg => pkg.name), null, 2)};
for (const name of packages) {
\tconst mod = await import(name);
\tif (mod == null) throw new Error(\`No ESM export for \${name}\`);
\tconsole.log(\`imported \${name}\`);
}
`,
);
run(process.execPath, ['smoke.mjs'], esmProject);

console.log(
	`Smoke-tested ${releasedPackages.length} package tarball${releasedPackages.length === 1 ? '' : 's'} from ${basename(
		dirname(tarballs[0]),
	)}`,
);
