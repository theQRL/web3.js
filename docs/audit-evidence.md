# Audit Evidence Commands

This document defines the command evidence expected before audit freeze and
before an npm release. It gives auditors and maintainers a stable checklist for
install, lint, build, unit, integration, e2e, docs, package, tarball smoke, and
coverage verification.

Run commands from the repository root unless a command says otherwise. Capture
the command, date, Node version, pnpm version, exit status, and any generated
artefact paths in the audit evidence bundle.

## Environment

Use the same baseline as CI:

```sh
node --version
pnpm --version
corepack enable
```

Expected result:

- Node is within the supported `>=20.19.0` range.
- pnpm is the Corepack-managed pnpm 10 line used by the lockfile.
- `corepack enable` exits `0`.

## Required Local Evidence

| Area | Command | Expected passing evidence |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile --ignore-scripts` | Exit `0`; lockfile is unchanged; dependency build scripts are not executed during this install. |
| Install with reviewed scripts | `pnpm install --frozen-lockfile` | Exit `0`; any dependency build scripts are limited to the reviewed `allowBuilds` list in `pnpm-workspace.yaml`. |
| Toolchain | `pnpm run doctor` | Exit `0`; Node, pnpm, lockfile, TypeScript/Jest/ESLint, and required local toolchain checks pass. |
| Repository hygiene | `pnpm run hygiene` | Exit `0`; prints `Repository hygiene checks passed`; no tracked generated output, local secrets, Yarn artefacts, copied files, or invalid symlinks. |
| Workflow lint | `actionlint .github/workflows/*.yml` and `zizmor --persona pedantic --config .github/zizmor.yml .github/workflows/` | Exit `0` for actionlint; zizmor reports no finding beyond the documented `self-repository` style note. |
| Whitespace | `git diff --check` | Exit `0`; no trailing whitespace, conflict markers, or whitespace errors. |
| Supply chain audit | `pnpm run audit:supply-chain` | Exit `0`; no high or critical advisories in the locked graph, production and development dependencies alike (`--include-dev-deps`). |
| Workspace lint | `pnpm run lint` | Exit `0`; warnings are acceptable only if already present in the current baseline and not from changed code. |
| Package build | `pnpm run build` | Exit `0`; Turbo reports all package/tool build tasks successful. |
| Browser build | `pnpm run build:web` | Exit `0`; browser bundles build for `@theqrl/web3` and `@theqrl/web3-validator`. |
| Unit tests | `pnpm run test:unit` | Exit `0`; all workspace unit suites and script tests pass. |
| Docs | `pnpm run build:docs` | Exit `0`; Docusaurus build completes with broken links treated as errors. |
| Package list | `pnpm run release:packages` | Exit `0`; lists the publishable public packages and versions expected for release. |
| Package inspection | `pnpm run release:inspect-packages` | Exit `0`; dry-run pack output has all declared entrypoints and no forbidden package contents. |
| Pack | `pnpm run release:pack-packages` | Exit `0`; writes `dist/released-packages.tsv`, `dist/released-packages.json`, and package tarballs under `dist/tarballs/`. |
| Smoke import | `pnpm run release:smoke-tarballs dist/released-packages.tsv dist/tarballs` | Exit `0`; each packed tarball can be installed into fresh CommonJS and ESM projects, required, and imported. |
| Coverage | `pnpm run test:coverage:unit` | Exit `0`; package-local JSON coverage artefacts are written under `packages/*/.coverage/unit/` and `tools/*/.coverage/unit/`. |

## CI Evidence

Required GitHub status checks should match the commands above:

- `Verify (Node 22.x)` and `Verify (Node 24.x)` run frozen ignored-script
  install, doctor, hygiene, lint, build, browser build, and unit tests. The
  advertised `engines.node` floor (`>=20.19.0`) is deliberately not exercised
  here — the dev toolchain cannot install on it (`.npmrc` sets
  `engine-strict=true`; `semantic-release` requires `^22.14.0 || >=24.10.0`).
  The floor is proven against published tarballs on 20.19.0 by the release
  smoke job, plus `scripts/doctor.js` and the `package_engines` metadata test.
- `Supply Chain Audit` runs the pinned Trivy 0.70.0 lockfile scan over
  production and development dependencies, failing on HIGH/CRITICAL. Reproduce
  locally with `pnpm run audit:supply-chain` (same version, from a
  digest-pinned image, same scope).
- `Package Inspection` builds, inspects, packs, and smoke-tests release
  tarballs.
- `Unit Coverage` runs unit coverage and uploads configured JSON artefacts to
  Codecov.
- `Docs Build` runs the Docusaurus/TypeDoc docs build.
- `Lint workflow files` runs actionlint and zizmor.
- `Dependency Review` blocks high/critical vulnerable dependency changes in pull
  requests.

For local GitHub Actions parity, record at least:

```sh
act pull_request -W .github/workflows/ci.yml --dryrun
act workflow_dispatch -W .github/workflows/ci.yml --action-offline-mode --pull=false
```

Expected result:

- Dry-run parses the workflow and planned jobs successfully.
- Full `act` runs may require Docker registry/network access. If registry DNS or
  package download failures occur inside Docker while the equivalent local pnpm
  commands pass, record the Docker/network failure as environment-blocked rather
  than a source failure.

## Integration And E2E Evidence

Integration and e2e checks are not yet required fast PR gates. Before audit
freeze, either make them green and required, or document the exact release
exception and follow-up issue.

| Area | Command | Expected passing evidence |
| --- | --- | --- |
| Workspace integration | `pnpm run test:integration` | Exit `0` against the configured provider/backend; integration suites pass. |
| Local GQRL HTTP e2e | `pnpm run test:e2e:gqrl:http` | Exit `0` after a local GQRL-compatible node is started and accounts are available. |
| Local GQRL WS e2e | `pnpm run test:e2e:gqrl:ws` | Exit `0` after a local GQRL-compatible WebSocket endpoint is available. |
| Local GQRL IPC | covered by `pnpm run test:integration` (`packages/web3/test/integration/ipc.test.ts`, `packages/web3-providers-ipc/test/integration`) | Exit `0` with `WEB3_SYSTEM_TEST_PROVIDER` pointing at the node's `gqrl.ipc` socket; there is no separate `test:e2e:gqrl:ipc` script. |
| Remote testnet HTTP/WS | `pnpm run test:e2e:testnet:http` and `pnpm run test:e2e:testnet:ws` | Exit `0` against the documented testnet endpoint and credentials. |
| Remote mainnet HTTP/WS | `pnpm run test:e2e:mainnet:http` and `pnpm run test:e2e:mainnet:ws` | Exit `0` for read-only mainnet checks only; no private key or value-transfer dependency. |
| E2E coverage | `pnpm run test:e2e:coverage` | Exit `0`; integration/e2e coverage artefacts are generated. |

`scripts/test-runner.sh` only exports the `WEB3_SYSTEM_TEST_*` variables and
dispatches to `test:integration`, `test:coverage:integration` or
`test:e2e:<backend>`; it does not start a node. The local gqrl backend must be
running first (`pnpm run pos:start`, see `scripts/local_testnet/README.md`,
and `pnpm run pos:stop` afterwards) with the funded accounts from
`scripts/accounts.json` available. Record the node version and the exact
`WEB3_SYSTEM_TEST_*` values with the evidence.

## Artefacts To Preserve

For an audit handoff, preserve:

- Terminal logs for every command in this document.
- `dist/released-packages.tsv`, `dist/released-packages.json`, and the tarballs
  under `dist/tarballs/` from the package evidence run.
- Unit coverage JSON artefacts under package/tool `.coverage/unit/` directories.
- CI run URLs for required status checks.
- Any environment-blocked evidence notes, including exact failing command,
  failing environment, and the equivalent local command that passed.

Generated artefacts should remain untracked. Run `pnpm run clean` before final
source handoff if ignored build/test output should be removed from the working
tree.
