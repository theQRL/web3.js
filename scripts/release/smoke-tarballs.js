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
const { spawn } = require('child_process');

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
	console.info('No released packages to smoke test');
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
const cleanupPaths = process.env.npm_config_cache ? [] : [npmCache];
const cleanup = () => {
	if (process.env.WEB3_KEEP_SMOKE_PROJECTS !== '1')
		for (const directory of cleanupPaths) {
			try { rmSync(directory, { recursive: true, force: true }); }
			catch (error) { console.warn(`Unable to remove smoke directory ${directory}: ${error.message}`); }
		}
};
process.on('exit', cleanup);

let activeChild;
let interrupted;
let killTimer;
const killChild = signal => {
	if (!activeChild?.pid) return;
	try {
		// On POSIX, include npm's subprocesses without signalling the runner itself.
		if (process.platform === 'win32') activeChild.kill(signal);
		else process.kill(-activeChild.pid, signal);
	} catch (error) {
		if (error.code !== 'ESRCH') throw error;
	}
};
const finishInterrupted = () => {
	cleanup();
	process.removeAllListeners('SIGINT');
	process.removeAllListeners('SIGTERM');
	process.removeAllListeners('SIGHUP');
	process.kill(process.pid, interrupted);
};
const cancel = signal => {
	if (interrupted) return;
	interrupted = signal;
	if (!activeChild) {
		finishInterrupted();
		return;
	}
	killChild(signal);
	// A child that ignores cancellation must not keep the runner alive indefinitely.
	killTimer = setTimeout(() => killChild('SIGKILL'), 5000);
	killTimer.unref();
};
const onInterrupt = () => cancel('SIGINT');
const onTerminate = () => cancel('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);
process.on('SIGHUP', () => cancel('SIGHUP'));

const run = (command, commandArgs, cwd) => new Promise((resolveRun, reject) => {
	if (interrupted) {
		reject(new Error(`Smoke test interrupted by ${interrupted}`));
		return;
	}
	const child = spawn(command, commandArgs, {
		cwd,
		stdio: 'inherit',
		detached: process.platform !== 'win32',
		env: {
			...process.env,
			NODE_PATH: '',
			npm_config_audit: 'false',
			npm_config_fund: 'false',
			npm_config_ignore_scripts: 'true',
			npm_config_cache: npmCache,
		},
	});
	activeChild = child;
	child.once('error', reject);
	child.once('close', (code, signal) => {
		activeChild = undefined;
		clearTimeout(killTimer);
		if (interrupted || code !== 0)
			reject(new Error(`${command} failed (${interrupted || signal || `exit ${code}`})`));
		else resolveRun();
	});
});

// The artifact lockfile uses portable file: specifiers relative to its directory.
const toPosix = value => value.split(sep).join('/');
const dependencies = Object.fromEntries(
	releasedPackages.map((pkg, index) => [pkg.name, `file:${toPosix(relative(lockDirectory, tarballs[index]))}`]),
);
const smokeManifest = { name: 'web3-release-smoke', private: true, dependencies };

const lockfilePath = join(lockDirectory, 'package-lock.json');
const lockManifestPath = join(lockDirectory, 'package.json');

const resolveLockfile = async () => {
	mkdirSync(lockDirectory, { recursive: true });
	rmSync(lockfilePath, { force: true });
	writeFileSync(lockManifestPath, `${JSON.stringify(smokeManifest, undefined, 2)}\n`);
	await run(npm, ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], lockDirectory);
	if (!existsSync(lockfilePath)) {
		console.error(`npm did not write ${lockfilePath}`);
		process.exit(1);
	}
	console.info(`Resolved the smoke-test dependency tree into ${lockfilePath}`);
};

const main = async () => {
	if (!existsSync(lockfilePath)) {
		await resolveLockfile();
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
		console.info(`Installing the dependency tree pinned by ${lockfilePath}`);
	}

	if (resolveOnly) {
		process.exit(0);
	}

	// Keep runtime module resolution away from the checkout's node_modules. Rebase only
	// the pinned local tarballs; registry resolutions and integrity hashes stay unchanged.
	const smokeRoot = mkdtempSync(join(tmpdir(), 'web3-release-smoke-'));
	cleanupPaths.push(smokeRoot);
	const smokeTarballs = join(smokeRoot, 'tarballs');
	mkdirSync(smokeTarballs);
	const relocated = new Map(tarballs.map(tarball => {
		copyFileSync(tarball, join(smokeTarballs, basename(tarball)));
		return [tarball, `file:../tarballs/${basename(tarball)}`];
	}));
	const rebase = value => {
		if (typeof value === 'string' && value.startsWith('file:')) {
			const target = relocated.get(resolve(lockDirectory, value.slice(5)));
			if (!target) throw new Error(`Unexpected local dependency in smoke lockfile: ${value}`);
			return target;
		}
		if (Array.isArray(value)) return value.map(rebase);
		if (value && typeof value === 'object')
			return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rebase(entry)]));
		return value;
	};
	const makeProject = async type => {
		const directory = join(smokeRoot, `smoke-${type}`);
		mkdirSync(directory);
		const manifest = rebase(JSON.parse(readFileSync(lockManifestPath, 'utf8')));
		const lockfile = rebase(JSON.parse(readFileSync(lockfilePath, 'utf8')));
		writeFileSync(join(directory, 'package.json'), `${JSON.stringify({ ...manifest, type }, undefined, 2)}\n`);
		writeFileSync(join(directory, 'package-lock.json'), `${JSON.stringify(lockfile, undefined, 2)}\n`);
		await run(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
		return directory;
	};
	console.info(`Isolated smoke projects: ${smokeRoot}`);

	const cjsProject = await makeProject('commonjs');
	writeFileSync(
		resolve(cjsProject, 'smoke.cjs'),
		`const packages = ${JSON.stringify(releasedPackages.map(pkg => pkg.name), undefined, 2)};
	for (const name of packages) {
	\tconst path = require('node:path');
	\tif (!require.resolve(name).startsWith(path.join(__dirname, 'node_modules') + path.sep)) throw new Error(\`Package resolved outside smoke project: \${name}\`);
	\tconst mod = require(name);
	\tif (mod == null) throw new Error(\`No CommonJS export for \${name}\`);
	\tconsole.info(\`required \${name}\`);
	}
	`,
	);
	await run(process.execPath, ['smoke.cjs'], cjsProject);

	const esmProject = await makeProject('module');
	writeFileSync(
		resolve(esmProject, 'smoke.mjs'),
		`const packages = ${JSON.stringify(releasedPackages.map(pkg => pkg.name), undefined, 2)};
	for (const name of packages) {
	\tif (!import.meta.resolve(name).startsWith(new URL('./node_modules/', import.meta.url).href)) throw new Error(\`Package resolved outside smoke project: \${name}\`);
	\tconst mod = await import(name);
	\tif (mod == null) throw new Error(\`No ESM export for \${name}\`);
	\tconsole.info(\`imported \${name}\`);
	}
	`,
	);
	await run(process.execPath, ['smoke.mjs'], esmProject);

	console.info(
		`Smoke-tested ${releasedPackages.length} package tarball${releasedPackages.length === 1 ? '' : 's'} from ${basename(
			dirname(tarballs[0]),
		)}`,
	);
};

main().catch(error => {
	if (!interrupted) {
		console.error(error);
		process.exitCode = 1;
	}
}).finally(() => {
	if (interrupted) finishInterrupted();
});
