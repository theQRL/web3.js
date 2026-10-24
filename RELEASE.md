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
- Every release tag of a publishable package must already be on the registry (pre-flight, see "Recovering From A Failed Release Run").
- Release tarballs must pass CommonJS and ESM smoke tests on Node 20.19.0 (the advertised `engines.node` floor) before publish, installed with `npm ci` from a lockfile the `prepare` job resolved.
- Every job that consumes the release-candidate artifact first verifies it against the SHA-256 digests the `prepare` job recorded as job outputs (`scripts/release/verify-artifact-digests.sh`); the artifact store of a running workflow is not trusted.
- npm publishing runs on Node 24 with its bundled npm (11.5.1 or newer) so npm trusted publishing can use OIDC, in a job that does nothing but verify and publish.
- npm publishing must use provenance (`NPM_CONFIG_PROVENANCE=true`).
- A version that already exists on the registry is skipped only when its `dist.integrity` equals the SHA-512 of the tarball this run built; any other bytes fail the run.

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

Inside the workspace every sibling dependency is declared as `workspace:^`. What reaches the registry is a caret range, written by `multi-semantic-release` (`--deps.prefix=^`) into the manifest of every package it releases, for every `workspace:^` entry on a publishable sibling (in `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies`):

- `^<new version>` for a sibling released in the same run;
- `^<last release>` for a sibling that is not released in the run, where the last release is the sibling's highest release tag reachable from the commit being released (`node_modules/multi-semantic-release/lib/updateDeps.js`: `dependency._nextRelease || dependency._lastRelease`).

Both come from git tags, never from the committed `version` field (which stays at its historical value, see "Release Strategy"). The consequence that matters for recovery: a sibling version that was tagged but never published produces an uninstallable `^<missing version>` range in every dependant released afterwards, which is why the pipeline refuses to start while a tagged version is missing from the registry (below). `workspace:` ranges on the private tools are left alone and substituted by `pnpm pack` with the tool's committed version. Outside a release run (CI's package inspection, local evidence runs) the manifests still carry `workspace:^`, which `pnpm pack` substitutes with `^<committed sibling version>`; those tarballs are inspected and smoke-tested but never published. `scripts/release/restore-tag-manifests.js` re-creates the released manifest state from the tags when a tagged version has to be rebuilt.

Without `--deps.prefix=^` the tool would write an exact pin, which turns the plugin example's peer dependencies into exact pins and lets two consumers end up with duplicate `@theqrl/web3-utils`/`@theqrl/web3-errors` copies (and failing `instanceof` checks) as soon as patch levels diverge. A published manifest therefore reads `"@theqrl/web3-core": "^1.0.4"`, so a consumer can install any compatible patch or minor release of a sibling. A dependency on a sibling with a breaking change is a `feat!:` of the dependant and gets its own major bump through `--deps.release` (default `patch`: a dependant is re-released at least as a patch whenever one of its dependencies is).

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

The release workflow (`.github/workflows/release.yml`), on a push to `main`:

1. Runs the reusable CI workflow.
2. `prepare` (environment `npm-publish`, `contents: write`): uses Node 22.15.0, installs dependencies from `pnpm-lock.yaml`, and fails if the last release tag of any publishable package is missing from the registry (`node scripts/release/published-versions.js --tags --check`).
3. Builds publishable packages and runs the package inspection (pack dry-run, entrypoints, forbidden files at any depth, dependency cross-check of the built output).
4. Snapshots current package versions.
5. Runs `multi-semantic-release --deps.prefix=^`, which updates the `package.json` versions and sibling ranges in the working tree, pushes one Git tag per released package and creates a **draft** GitHub release with the generated notes for each of them.
6. Rebuilds packages after version updates and inspects them again.
7. Packs released packages, generates SHA-256 and SHA-512 checksums, and resolves the smoke-test dependency tree into a lockfile (`npm install --package-lock-only`, metadata only).
8. Records the SHA-256 digest of every artifact file, and of the tarballs alone, as job outputs, then uploads the tarballs, metadata, checksums and smoke lockfile as the `release-candidate-tarballs` artifact (kept for 30 days, the maximum wait for an environment approval).
9. `smoke-node-floor`: downloads the artifact, verifies it against the `prepare` digests, and on Node 20.19.0 (the advertised floor) installs the tarballs with `npm ci` from the shipped lockfile and smoke-tests CommonJS `require()` and ESM `import`.
10. `publish` (environment `npm-publish`, `id-token: write` only): downloads and verifies the artifact, then publishes with npm trusted publishing from Node 24 and its bundled npm 11 (`scripts/release/publish-tarballs.js`: a version already on the registry is skipped only when its `dist.integrity` matches this run's tarball, a failure does not stop the loop). No dependency installation or build runs in this job.
11. `sbom` (no OIDC token, read-only): generates SPDX and CycloneDX SBOMs of the repository checkout — the whole locked dependency graph the tarballs were built from — records their digests as job outputs and uploads them.
12. `attest` (`id-token`, `attestations: write`, `contents: write`, deliberately **outside** the `npm-publish` environment so its OIDC tokens cannot publish to npm): verifies the artifact and the SBOMs against the recorded digests, creates the build-provenance attestation for the tarballs and checksum files and the two SBOM attestations with the same tarballs and checksum files as subjects, uploads tarballs, checksums and SBOMs to each draft release and publishes the releases (`gh release edit --draft=false`).
13. `slsa-provenance`: generates SLSA provenance from the tarball digests `prepare` recorded (not from a re-hash of a downloadable artifact).
14. `slsa-upload`: verifies the artifact metadata and uploads `provenance.intoto.jsonl` to each package release.

Tags are pushed by semantic-release before anything is published; that order is inherent to the tool. What the pipeline guarantees instead is that nothing becomes *visible* (a public GitHub release) before the tarballs are on npm, that every job acts on the bytes `prepare` built, and that a failed run can be re-driven or, when its tags were left unpublished, completed by a manual run, see below.

### Manual Run (`workflow_dispatch`)

Starting the Release workflow manually from `main` runs the same jobs for versions that were tagged by an earlier run but never reached the registry. The `tags` input is either `all-missing` (every publishable package whose last release tag is not on the registry) or a comma-separated list of release tags (`@theqrl/web3@1.0.4,@theqrl/web3-utils@1.0.4`). `scripts/release/republish-plan.js` resolves the request — a requested version that is already on the registry is reported and skipped, an unknown tag fails the run — and for every tagged commit the `prepare` job checks it out, installs its lockfile, restores the manifests the original run published (`scripts/release/restore-tag-manifests.js`: tag version, `^<last release>` sibling ranges), builds, inspects and packs the requested packages. From there the run is identical to a push release: digests, smoke test on the Node floor, approval of the `npm-publish` environment, publish, SBOMs, attestations, GitHub releases and SLSA provenance.

## Recovering From A Failed Release Run

Tags are pushed before anything is published, and `multi-semantic-release` derives the next version of a package and the sibling ranges of every dependant from the last tag, whether or not that version ever reached npm. A tagged-but-unpublished version therefore has to be dealt with before the next release: the `prepare` job's pre-flight (`node scripts/release/published-versions.js --tags --check`) fails every push release until it is.

The publish step is idempotent, so the first thing to try after a failure is a re-run of the failed jobs of the same workflow run (GitHub "Re-run failed jobs"). This works while the `release-candidate-tarballs` artifact of that run exists (30 days):

- Smoke test failed on an infrastructure problem: re-run the failed jobs; the same tarballs are verified, smoke-tested and published. If the smoke test found a real defect, the tagged versions must still be published or removed (below) — a fix commit alone leaves dependants pointing at the unpublished version.
- `npm publish` failed for some packages: re-run the `publish` job. Packages whose exact version is already on the registry with this run's integrity are reported as skipped, the missing ones are published, and the GitHub releases are published once all are on npm.
- `publish` reports an **integrity mismatch**: the registry already holds that version with bytes this run did not produce (a publish from outside the pipeline, or a rebuild that is not byte-identical). The run fails on purpose and nothing is attested or released for that package. Establish where the registry version came from before doing anything else; if it is legitimate, the GitHub release has to be completed by hand from the registry tarball (`npm pack @theqrl/<package>@<version>`, checksums, `gh release upload`, `gh release edit --draft=false`) and the run's remaining packages re-driven; if it is not, deprecate it (`npm deprecate`) and ship a follow-up release.
- Artifact upload, attestation or SLSA steps failed after the tarballs were published: re-run the failed jobs; `gh release upload --clobber` and `gh release edit --draft=false` are idempotent.
- The artifact expired, or the environment approval was rejected: the run can no longer be re-driven. Publish the tagged versions with a manual run instead.

Manual run for tagged-but-unpublished versions (no workstation publish; no long-lived npm tokens exist for this project):

1. Check what the registry has against the tags: `node scripts/release/published-versions.js --tags` (`pnpm run release:published-versions` compares the committed manifest versions instead, which is not what the pipeline publishes).
2. Start `.github/workflows/release.yml` manually on `main` ("Run workflow") with `tags` set to `all-missing`, or to the exact release tags to publish. The `prepare` job rebuilds every tagged commit with the manifests the original run published, and the run continues through the smoke test, the `npm-publish` approval, trusted publishing, attestations and the GitHub releases exactly like a push release.
3. If a tagged version must **never** be published (for example the smoke test exposed a defect), delete its draft release together with the tag — `gh release delete <tag> --cleanup-tag --yes --repo theQRL/web3.js` — for every package tagged in that run that is not on the registry, then land the fix. The next release derives versions from the previous tags again and re-releases the fixed packages. Never delete a tag that a published npm version points at; a published defective version is deprecated (`npm deprecate`) and superseded by a follow-up release.
4. Only if GitHub Actions itself is unavailable, a break-glass publish must follow the procedure documented for the `npm-publish` environment owners, be recorded in the release notes, and be completed with a manual run or re-run as soon as Actions is back so the attestations, SBOMs, provenance and GitHub releases exist. `publish-tarballs.js` then skips the version only if the break-glass tarball is byte-identical to the rebuilt one.

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
- SPDX and CycloneDX SBOMs. They describe the repository checkout the tarballs were built from — the whole `pnpm-lock.yaml` graph, production and development dependencies — because a packed tarball carries no dependency tree of its own to catalogue; the same two files are attached to every package release of the run.
- GitHub build-provenance and SBOM attestations whose subjects are the tarballs and the checksum files (the SBOM is the attestation's predicate, not its subject).
- SLSA provenance as `provenance.intoto.jsonl`.

## Post-Release Verification

After a run completes, verify every released package from a machine that did not take part in the release:

1. `pnpm run release:published-versions` reports `in-sync` for every publishable package.
2. `npm view @theqrl/<package>@<version> dist.attestations` shows the provenance and publish attestations, and `npm audit signatures` in a fresh project that installs the released versions reports them as verified.
3. Download the tarball from npm (`npm pack @theqrl/<package>@<version>`) and compare its SHA-512 with `checksums-sha512.txt` attached to the GitHub release and with `npm view ... dist.integrity`.
4. `gh attestation verify <tarball> --repo theQRL/web3.js` succeeds for the tarball and the checksum files (build provenance), and with `--predicate-type` set to the SBOM predicate (`https://spdx.dev/Document/v2.3` for SPDX, `https://cyclonedx.org/bom` for CycloneDX; `--format json` prints the recorded type) it returns the SBOM attestations of the same tarball. The SBOM files themselves are not attestation subjects.
5. `slsa-verifier verify-artifact <tarball> --provenance-path provenance.intoto.jsonl --source-uri github.com/theQRL/web3.js --source-tag @theqrl/<package>@<version>` succeeds.
6. The GitHub release is no longer a draft and lists the tarball, both checksum files, both SBOMs and the provenance file.

Record the outputs with the release evidence described in `docs/audit-evidence.md`.

### Build and attestation trust boundaries

The `prepare` job is the trust root for artifact contents: dependency installation, compilers,
bundlers and release plugins run there before digests are recorded. A compromise in that job
can produce malicious tarballs with matching digests and later valid provenance, and its
`contents: write` permission can modify tags and draft releases. It has no OIDC permission.
The digest checks protect transfers between jobs; they do not prove the source or build tools
were trustworthy. The `attest` job can mint attestations for arbitrary subjects and upload
release assets, though it cannot publish to npm.

Both push and recovery builds use `scripts/release/build-with-workspace-links.js`. It keeps
release package versions, temporarily restores all local dependency edges to `workspace:*`,
builds packages and bundles serially, and restores the exact release manifests in a `finally`
block before inspection or packing. This works without a warm Turbo cache even when a sibling
was not released at the same commit. Recovery still executes the tagged revision's build
scripts; historical releases made with a different dependency-prefix policy may not reproduce
byte for byte, and the publish integrity check must remain fail-closed.
