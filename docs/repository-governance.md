# Repository Governance

This document defines the GitHub repository controls expected before enabling
releases from `theQRL/web3.js`.

## Branch Protection

Protect the `main` branch with these rules:

- Require pull requests before merging.
- Require at least one approving review.
- Require review from Code Owners.
- Dismiss stale approvals when new commits are pushed.
- Require conversation resolution before merging.
- Require branches to be up to date before merging.
- Restrict force pushes and branch deletion.
- Do not allow bypasses except for an explicitly approved release or repository
  administration group.

The required status checks for `main` must include:

- `Verify (Node 22.x)`
- `Verify (Node 24.x)`
- `Supply Chain Audit`
- `Package Inspection`
- `Docs Build`
- `Dependency Review`
- `Lint workflow files`
- `zizmor (Actions security analysis)`

`Package Inspection` is release-relevant: it builds packages, builds browser
bundles, inspects package metadata, packs tarballs, and smoke-tests the packed
CommonJS and ESM installs. Do not remove it from required checks while package
publishing is enabled.

## Ownership

`.github/CODEOWNERS` is the source of truth for required review routing.

The current ownership model is:

- Repository default: `@theQRL/core`
- QRL account, transaction, and contract packages: `@theQRL/crypto`
- CI/CD and repository automation: `@theQRL/devops` — `.github/`,
  `scripts/release/`, `.releaserc.json`, and the manifests that decide what the
  release pipeline installs and publishes: the root `package.json`,
  `pnpm-workspace.yaml` and `pnpm-lock.yaml`.

Review teams must exist in the upstream GitHub organization before branch
protection is enabled. If a team name changes, update `CODEOWNERS` and this
document in the same pull request.

## Release Environment

Create a protected GitHub environment named `npm-publish`.

The environment must:

- Be restricted to the `main` branch.
- Require approval from release maintainers before jobs proceed.
- Exclude ordinary contributors and automation-only accounts from approvers.
- Be used only by the `prepare` and `publish` jobs of
  `.github/workflows/release.yml` (a push release and a manual re-publish run
  each need both approvals).

The release workflow is additionally guarded by `github.repository ==
'theQRL/web3.js'`, pushes to `refs/heads/main`, and the repository variable
`RELEASES_ENABLED == 'true'`. Keep `RELEASES_ENABLED=false` until audit freeze
and release-readiness sign-off are complete.

## Actions Permissions

Set default repository Actions permissions to read-only. Workflows should request
write permissions only on jobs that need them.

The release workflow needs elevated permissions only for release preparation
(`prepare`: `contents: write` for tags and draft releases), publishing
(`publish`: `id-token: write` only), attestation and release uploads (`attest`
and the SLSA jobs). SBOM generation runs third-party tooling and therefore gets
neither an OIDC token nor write permissions; every job that consumes the
release-candidate artifact verifies it against the digests the `prepare` job
recorded as job outputs before using it. Ordinary pull-request CI must keep
`contents: read`.

## npm Trusted Publishing

Each publishable `@theqrl/*` npm package (the list printed by
`node scripts/release/packages.js list`; private workspace tools such as
`@theqrl/eslint-config-base-web3` are not published) must be configured for
trusted publishing with:

- GitHub owner: `theQRL`
- GitHub repository: `web3.js`
- Workflow: `.github/workflows/release.yml`
- Environment: `npm-publish`

npm scopes the trust to the repository, the workflow file and the environment;
it cannot name a job. The workflow therefore keeps the two apart itself: the
`publish` job is the only one that combines `environment: npm-publish` with
`id-token: write`, and it runs nothing but the artifact verification and
`npm publish`. The jobs that also need an OIDC token (`attest` for the GitHub
attestations, the SLSA generator) run outside the environment, so a token
minted there is rejected by npm's environment check even if one of their
third-party steps were compromised.

Do not add long-lived npm tokens for the normal release path. If a break-glass
token is ever needed, document its owner, expiry, storage location, and
revocation plan outside the public repository.

Package naming policy and documented exceptions are tracked in
[`docs/package-naming.md`](package-naming.md). Do not add or rename a
publishable package without updating that document and the trusted-publishing
configuration for the affected package name.

## Dependabot And Security Settings

Enable these repository security controls before the first audited release:

- Dependabot version updates for GitHub Actions and pnpm workspace packages.
- Dependabot security updates.
- Dependency graph.
- Secret scanning.
- Push protection for supported secret types.
- Private vulnerability reporting, if available for the repository.

Dependabot pull requests must pass the same required checks and CODEOWNERS
review as ordinary pull requests.

## Supply Chain Gates

Dependency policy, pnpm hardening settings, audit commands, and lockfile review
requirements are documented in
[`docs/supply-chain-security.md`](supply-chain-security.md).

The publish job pins `NODE_PUBLISH_VERSION` to [Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1) and fails before publishing unless its bundled npm is at least 11.5.1. Release inspection (`inspect-packages.js --release <package-name> ...`) rejects non-semver sibling ranges, including `workspace:*`, for packages selected for publication. Ordinary workspace inspection permits development manifests with `workspace:^`.
