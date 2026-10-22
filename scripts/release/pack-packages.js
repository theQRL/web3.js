#!/usr/bin/env node

const { mkdirSync, writeFileSync } = require('fs');
const { resolve } = require('path');
const { execFileSync } = require('child_process');

const { publishablePackages, releaseTag, tarballName } = require('./packages');

const [outputDirectory = 'dist'] = process.argv.slice(2);
const tarballDirectory = resolve(outputDirectory, 'tarballs');

mkdirSync(tarballDirectory, { recursive: true });

const releasedPackages = publishablePackages().map(pkg => ({
	...pkg,
	releaseTag: releaseTag(pkg),
	tarballName: tarballName(pkg),
}));

// Sibling ranges in the packed manifests come from two places. In the release
// workflow `multi-semantic-release --deps.prefix=^` has already rewritten the
// `workspace:^` entries of released siblings to `^<version>`; for siblings that
// were not released in that run (and for every entry when this script runs
// outside a release, e.g. in CI's package inspection) `pnpm pack` substitutes
// `workspace:^` with `^<current version>`. Either way the tarballs carry caret
// ranges and install under any package manager; see RELEASE.md.
for (const pkg of releasedPackages) {
	console.info(`Packing ${pkg.name}@${pkg.version}`);
	execFileSync('pnpm', ['pack', '--pack-destination', tarballDirectory], {
		cwd: pkg.path,
		stdio: 'inherit',
	});
}

const tsv = releasedPackages
	.map(pkg => [pkg.path, pkg.name, pkg.version, pkg.releaseTag, pkg.tarballName].join('\t'))
	.join('\n');

writeFileSync(resolve(outputDirectory, 'released-packages.tsv'), `${tsv}\n`);
writeFileSync(resolve(outputDirectory, 'released-packages.json'), `${JSON.stringify(releasedPackages, undefined, 2)}\n`);

console.info(`Packed ${releasedPackages.length} publishable packages into ${tarballDirectory}`);
