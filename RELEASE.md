# @theqrl/web3.js Release Guidelines

This repository uses pnpm, Turbo, and `multi-semantic-release`. Releases are intended to be produced by GitHub Actions from `main` after the audit-readiness gates are complete and the repository is pushed under the `theQRL/web3.js` upstream project.

Until the first audited release, `main` is treated as unreleased. Do not publish packages manually from a workstation.

## Release Strategy

Packages are versioned independently by `multi-semantic-release` using Conventional Commits. When a release is enabled, CI analyzes commits merged to `main`, decides which workspace packages need new versions, creates Git tags and draft GitHub releases with generated release notes, and publishes public packages to the `@theqrl` npm organization. The draft releases become public only after every tarball has been published.

Nothing is written back to the repository: the pipeline does not commit changelog or `package.json` changes. Git tags (`@theqrl/<package>@<version>`) are the record of what was released, release notes live on the GitHub Releases, and `multi-semantic-release` derives the next version of each package from its last tag, not from the committed `version` field.

Release publishing is guarded by:

- The workflow must run in `theQRL/web3.js`.
- The repository variable `RELEASES_ENABLED` must be set to `true`.
- The protected GitHub environment `npm-publish` must approve the job.
- The CI workflow must pass first.
- Release tarballs must pass CommonJS and ESM smoke tests on Node 20.19.0 (the advertised `engines.node` floor) before publish.
- npm publishing must run from Node 22.15.0 (the version pinned in `.github/workflows/release.yml`) with npm 11.5.1 or newer so npm trusted publishing can use OIDC.
- npm publishing must use provenance (`NPM_CONFIG_PROVENANCE=true`).

## Commit Message Format

Use Conventional Commits:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Release-triggering commits:

| Commit type | Version bump |
| --- | --- |
| `fix:` | Patch |
| `perf:` | Patch |
| `feat:` | Minor |
| `feat!:` or `BREAKING CHANGE:` | Major |

Non-release changes should use prefixes such as `docs:`, `test:`, `ci:`, `chore:`, `refactor:`, or `style:`.

## Publishable Packages And Private Tools

`node scripts/release/packages.js list` is the source of truth for what gets released: every workspace package with a `version`, `publishConfig.access: public` and no `"private": true`. The shared lint configuration `@theqrl/eslint-config-base-web3` under `tools/` is `"private": true`: it is consumed through `workspace:` links only, is never packed or published, and needs no trusted-publishing configuration. `multi-semantic-release` runs with `--ignore-private-packages`, so it is skipped there too.

## Cross-Package Version Ranges

Inside the workspace every sibling dependency is declared as `workspace:^`. What reaches the registry is a caret range:

- `multi-semantic-release` runs with `--deps.prefix=^`. For every sibling released in the same run it rewrites the `workspace:^` entry (in `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies`) to `^<new version>`. Without the flag the tool would write an exact pin, which turns the plugin example's peer dependencies into exact pins and lets two consumers end up with duplicate `@theqrl/web3-utils`/`@theqrl/web3-errors` copies (and failing `instanceof` checks) as soon as patch levels diverge.
- For siblings that were not released in that run, `pnpm pack` substitutes `workspace:^` with `^<current version>` while packing.

Either way a published manifest reads `"@theqrl/web3-core": "^0.5.1"`, so a consumer can install any compatible patch or minor release of a sibling. A dependency on a sibling with a breaking change is a `feat!:` of the dependant and gets its own major bump through `--deps.release` (default `patch`: a dependant is re-released at least as a patch whenever one of its dependencies is).

## Keeping Package Versions In Sync

`multi-semantic-release` releases packages based on committed changes in each package path. If maintainers need to deliberately keep all publishable package versions aligned, run this locally before opening the release-prep PR:

```sh
pnpm run release:touch-packages
```

This writes a package-local `.release-touch` marker into every publishable package (private tools are skipped). Commit those marker changes with a release-triggering Conventional Commit such as `fix(release): refresh package release markers`. The marker files are intentionally outside the package `files` allowlists and are excluded from npm tarballs; `pnpm run release:inspect-packages` verifies the pack contents.

Do not run `release:touch-packages` inside the release workflow. Uncommitted files created by CI are not part of the commit history analyzed by semantic-release and should not be used to force package releases.

## Pre-Release Requirements

Before setting `RELEASES_ENABLED=true`, the release owner must confirm:

- No tests/CI blockers.
- Required branch protection is configured for `main`
- `CODEOWNERS` review is enforced.
- The `npm-publish` environment is protected and limited to release maintainers.
- npm organization access and trusted-publishing configuration for all `@theqrl/*` packages listed by `pnpm run release:packages` is ready.
- Trusted publishing is scoped to `.github/workflows/release.yml`.
- `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm run doctor`,
  `pnpm run audit:supply-chain`, and required build/test gates pass in CI.
- `pnpm run release:dry-run` has been reviewed from a release-prep branch.

## CI Release Flow

The release workflow:

1. Runs the reusable CI workflow.
2. Uses Node 22.15.0 in the release-preparation job.
3. Installs dependencies from `pnpm-lock.yaml`.
4. Builds publishable packages and runs the package inspection (pack dry-run, entrypoints, forbidden files, dependency cross-check of the built output).
5. Snapshots current package versions.
6. Runs `multi-semantic-release --deps.prefix=^`, which updates the `package.json` versions and sibling ranges in the working tree, pushes one Git tag per released package and creates a **draft** GitHub release with the generated notes for each of them.
7. Rebuilds packages after version updates and inspects them again.
8. Packs released packages.
9. Generates SHA-256 and SHA-512 checksums.
10. Uploads tarballs and release metadata as a short-lived workflow artefact (`release-candidate-tarballs`, kept for 5 days).
11. Downloads the tarballs in a Node 20.19.0 job (the advertised floor) and smoke-tests CommonJS `require()` and ESM `import`.
12. Publishes the already-tested tarballs from a Node 22.15.0/npm 11 job using npm trusted publishing (`scripts/release/publish-tarballs.js`: versions already on the registry are skipped, a failure does not stop the loop).
13. Generates SPDX and CycloneDX SBOMs.
14. Creates GitHub attestations for release artefacts and SBOMs.
15. Uploads tarballs, checksums, and SBOMs to each draft release and then publishes the releases (`gh release edit --draft=false`).
16. Generates SLSA provenance for released tarballs.
17. Uploads `provenance.intoto.jsonl` to each package release.

Tags are pushed by semantic-release before anything is published; that order is inherent to the tool. What the pipeline guarantees instead is that nothing becomes *visible* (a public GitHub release) before the tarballs are on npm, and that a failed run can be re-driven, see below.

## Recovering From A Failed Release Run

The publish step is idempotent, so the first thing to try is always a re-run of the failed jobs of the same workflow run (GitHub "Re-run failed jobs"). This works while the `release-candidate-tarballs` artefact of that run still exists (5 days):

- Smoke test failed: the tags and draft releases already exist and nothing is on npm. Fix the cause with a normal commit; if the fix changes a package, the next run releases a new patch version on top of the existing tag. If it does not (an infrastructure failure), re-run the failed jobs: the same tarballs are smoke-tested and published.
- `npm publish` failed for some packages: re-run the `publish` job. Packages whose exact version is already on the registry are reported as skipped, the missing ones are published, and the draft releases are published once all are on npm.
- Artefact upload, attestation or SLSA steps failed after the tarballs were published: re-run the failed jobs; `gh release upload --clobber` and `gh release edit --draft=false` are idempotent.

If the artefact has expired, the run cannot be re-driven from GitHub. Recover manually, per package that is tagged but missing from the registry:

1. Check what the registry has: `pnpm run release:published-versions`.
2. From a clean checkout of the tag (`git checkout @theqrl/<package>@<version>`), run `pnpm install --frozen-lockfile --ignore-scripts`, set the manifest versions of the released packages to their tag versions (`node scripts/release/set-package-version.js <version>` inside each package directory, exactly as the pipeline's `prepareCmd` did), then `pnpm run build`, `pnpm run build:web`, `pnpm run release:inspect-packages`, `pnpm run release:pack-packages` and `pnpm run release:smoke-tarballs dist/released-packages.tsv dist/tarballs`.
3. Publish only through the trusted-publishing workflow identity: trigger `.github/workflows/release.yml` through the protected `npm-publish` environment rather than with a workstation token (no long-lived npm tokens exist for this project). If that is not possible, a break-glass publish must follow the procedure documented for the `npm-publish` environment owners and be recorded in the release notes.
4. Attach the tarball, checksums, SBOMs and provenance to the GitHub release (`gh release upload <tag> ... --clobber`) and publish the draft (`gh release edit <tag> --draft=false`).

Never delete and re-create a tag that a published npm version points at. If a tagged version must not be published at all, publish a follow-up fix release instead and leave the draft unpublished or delete it.

## Local Commands

Use these commands only for release preparation and verification:

```sh
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
pnpm run doctor
pnpm run audit:supply-chain
pnpm run build
pnpm run build:web
pnpm run release:inspect-packages
pnpm run release:pack-packages
pnpm run release:packages
pnpm run release:smoke-tarballs dist/released-packages.tsv dist/tarballs
pnpm run release:dry-run
```

`pnpm run release` and `pnpm run release:publish-tarballs` are for CI. Do not run them locally against the upstream repository.

## Package Artefacts

Release tarballs must be built from CI output. Generated `lib/` and `dist/` directories are not expected to be committed unless that policy is explicitly changed before audit freeze.

Each package release should have:

- npm provenance.
- GitHub release notes generated from Conventional Commits.
- The npm tarball attached to the GitHub release.
- SHA-256 and SHA-512 checksum files.
- SPDX and CycloneDX SBOMs.
- GitHub build-provenance and SBOM attestations.
- SLSA provenance as `provenance.intoto.jsonl`.

## Post-Release Verification

After a run completes, verify every released package from a machine that did not take part in the release:

1. `pnpm run release:published-versions` reports `in-sync` for every publishable package.
2. `npm view @theqrl/<package>@<version> dist.attestations` shows the provenance and publish attestations, and `npm audit signatures` in a fresh project that installs the released versions reports them as verified.
3. Download the tarball from npm (`npm pack @theqrl/<package>@<version>`) and compare its SHA-512 with `checksums-sha512.txt` attached to the GitHub release and with `npm view ... dist.integrity`.
4. `gh attestation verify <tarball> --repo theQRL/web3.js` succeeds for the tarball, the checksum files and both SBOMs.
5. `slsa-verifier verify-artifact <tarball> --provenance-path provenance.intoto.jsonl --source-uri github.com/theQRL/web3.js --source-tag @theqrl/<package>@<version>` succeeds.
6. The GitHub release is no longer a draft and lists the tarball, both checksum files, both SBOMs and the provenance file.

Record the outputs with the release evidence described in `docs/audit-evidence.md`.
