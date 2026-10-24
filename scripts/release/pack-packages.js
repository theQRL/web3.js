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

// Sibling ranges in the packed manifests. In the release workflow
// `multi-semantic-release --deps.prefix=^` has already rewritten EVERY
// `workspace:^` entry of a released package to a caret range: `^<new version>`
// for a sibling released in the same run and `^<sibling's last release tag>`
// for one that was not (it derives both from git tags, never from the committed
// `version` field — node_modules/multi-semantic-release/lib/updateDeps.js).
// Outside a release (CI's package inspection, local evidence runs, this script)
// the manifests still carry `workspace:^`, which `pnpm pack` substitutes with
// `^<committed sibling version>`; those tarballs are inspected and smoke-tested
// but never published. See RELEASE.md, "Cross-Package Version Ranges".
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
