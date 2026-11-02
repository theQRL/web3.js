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
| Workflow lint | `actionlint .github/workflows/*.yml` and `zizmor --persona pedantic --config .github/zizmor.yml .github/workflows/` | Exit `0` for both tools; the local reusable release-CI reference has one documented inline `self-repository` exemption, and other findings fail the status check. |
| Whitespace | `git diff --check` | Exit `0`; no trailing whitespace, conflict markers, or whitespace errors. |
| Supply chain audit | `pnpm run audit:supply-chain` | Exit `0`; no high or critical advisories in the locked graph, production and development dependencies alike (`--include-dev-deps`). |
| Workspace lint | `pnpm run lint` | Exit `0`; warnings are acceptable only if already present in the current baseline and not from changed code. |
| Package build | `pnpm run build` | Exit `0`; Turbo reports all package/tool build tasks successful. |
| Browser build | `pnpm run build:web` | Exit `0`; browser bundles build for `@theqrl/web3` and `@theqrl/web3-validator`. |
| Unit tests | `pnpm run test:unit` | Exit `0`; all workspace unit suites, script tests, and package-local coverage thresholds pass. Do not disable coverage when verifying this gate. |
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
- `Lint workflow files` runs actionlint; zizmor runs in its separate security-analysis job.
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

For execution-API checks without a consensus client, use the digest-pinned
standalone backend in
[`scripts/local_testnet/README.md`](../scripts/local_testnet/README.md#execution-api-checks-with-a-two-cpu-limit).
It provides the same public fixture accounts through Clef, real go-qrl HTTP/WS/IPC
endpoints, and Engine API block production. Pin both the launcher and Jest to
CPUs 0 and 1, use `--concurrency=1` for Turbo and `--runInBand` for Jest, and
preserve each transport's result separately. Record that consensus is simulated;
this does not establish qrysm/validator compatibility.

### PR #118 follow-up verification (2026-10-23 UTC)

Node 22.22.1 and pnpm 10.27.0 were used with the standalone backend above:
go-qrl 0.3.3-stable, commit `f3864c46b3f94662c514105da1efaf3466394fae`, image
`qrledger/go-qrl@sha256:72fb2a117d61d899e6cb763b91f1a37da4ab544a74530885032c99b4d7547912`.
The node used hash archive state, chain/network ID 1337, and the public fixture
accounts. HTTP was `http://127.0.0.1:18545`, WS was `ws://127.0.0.1:18546`, and
IPC used the launcher's printed `node/gqrl.ipc` path. Consensus was simulated
through the Engine API; no qrysm or validator compatibility claim is made.

All local commands and containers shared CPU affinity `0,1`. The node had a
two-CPU quota and `GOMAXPROCS=2`; Jest used `--runInBand --watchman=false`, with
`UV_THREADPOOL_SIZE=2` and `NODE_OPTIONS=--v8-pool-size=1`. Package suites ran
serially per transport. For direct Jest invocation, pass
`--config=./test/integration/jest.config.js --forceExit` from the package directory;
this matches the existing contract/QRL integration scripts' exit behavior.

| Package | HTTP passed | HTTP skipped | WS passed | WS skipped |
| --- | ---: | ---: | ---: | ---: |
| web3-qrl-contract | 109 | 15 | 122 | 2 |
| web3-qrl | 171 | 18 | 187 | 2 |
| web3-qrl-qrns | 14 | 2 | 16 | 0 |
| web3-qrl-accounts | 52 | 2 | 52 | 2 |
| web3 | 35 | 6 | 35 | 6 |
| web3-net | 4 | 0 | 4 | 0 |
| web3-providers-http | 7 | 0 | 6 | 1 |
| web3-providers-ws | 0 | 21 | 21 | 0 |
| web3-providers-ipc | 0 | 9 | 0 | 9 |

The 392 passing HTTP and 443 passing WS cases are the combined final results
after rerunning corrected suites, not a claim that the initial full invocations
passed. Skipped
cases include transport-specific suites and existing disabled tests; they do
not count as passes. IPC separately passed nine provider/reconnection tests and
one umbrella Web3 connection test. The launcher was initialized from an empty
state directory, its CPU quota/affinity were inspected, and Ctrl-C cleanup was
verified after the run.

The run exposed stale expectations for RPC errors versus execution reverts,
confirmation event fields, invalid default blocks/hardforks, deployment gas,
mocked chain IDs/transaction hashes, and WebSocket credentials in URLs. Those tests now match the existing
audit remediations. The added access-list case writes a long string, checks that
its VM64-derived hashed slots are 32-byte keys, and successfully submits the
node-generated list in a transaction. IPC reconnection fixtures use a private
alias of the configured socket and register listeners before disconnecting.
WebSocket proxies bind free ports and send credentials in explicit headers.
The latest-block transaction count is compared with the same stable head, so
newly mined empty blocks do not invalidate the assertion.

Additional passing checks: QRNS unit tests (118), Web3 unit tests (58),
hash/packed encoding tests (169), compiler CLI tests (6, including byte-for-byte
fixture reproduction), QRNS CJS/ESM/types build, doctor, repository hygiene,
changed-file lint (existing warnings only), and `git diff --check`.
The local proxy dependency was missing its `dist` directory; restoring it from
the exact npm tarball after verifying the lockfile SHA-512 fixed a misleading
fallback to hoisted v2 types. No dependency version or lockfile change was needed.

### Pass-5 remediation verification (2026-10-24 UTC)

Pass 5 addressed all 39 severity-rated findings. The verification below records
compatibility limits and remaining informational work.
Local verification used Node 22.22.1, pnpm 10.27.0, CPU affinity `0,1`, serial Jest
workers and Turbo concurrency 1. The standalone go-qrl version, digest, ports and
chain ID were the same as the 2026-10-23 run above. The container shared the two-CPU
affinity, with a two-CPU quota and `GOMAXPROCS=2`.

The initial package/tool/script unit run reported 6,408 passed, six skipped and one todo
with coverage disabled. It verified assertions but missed the three coverage failures
identified as P5R-3; see the follow-up verification in the remediation record.
After correcting P5R-1 and P5R-3, a full rerun with the unchanged package coverage settings
passed **6,425 tests in 272 suites**, with six skipped tests and one todo. All 19 package/tool
coverage gates passed. Logs and consolidated results are under `/tmp/web3-pass5r-*`.
All 19 package builds, both browser bundles, doctor, hygiene, dependency cross-check,
19 package inspections and CJS/ESM tarball smoke checks passed. The documentation
build passed with existing TypeDoc warnings. The lint gate passed with zero errors
and 1,257 warnings within the unchanged 1,267 budget; subsequent integration and
pending-block edits passed targeted lint. Trivy 0.70.0 with the 2026-10-24 database
reported no HIGH/CRITICAL findings under the committed exceptions. Actionlint
passed; offline Zizmor retained the documented low `self-repository` finding (exit 12).

| Package | HTTP passed / skipped | WS passed / skipped | IPC passed / skipped |
| --- | ---: | ---: | ---: |
| web3-qrl-contract | 111 / 15 | 124 / 2 | — |
| web3-qrl | 171 / 18 | 187 / 2 | — |
| web3-qrl-qrns | 14 / 2 | 16 / 0 | — |
| web3-qrl-accounts | 52 / 2 | 52 / 2 | — |
| web3 | 35 / 6 | 35 / 6 | 31 / 10 |
| web3-net | 4 / 0 | 4 / 0 | — |
| web3-providers-http | 7 / 0 | 6 / 1 | — |
| web3-providers-ws | 0 / 21 | 21 / 0 | — |
| web3-providers-ipc | 0 / 9 | 0 / 9 | 9 / 0 |
| **Total** | **394 / 73** | **445 / 22** | **40 / 10** |

These HTTP totals combine the final full runs with successful targeted reruns of
the configuration-copy and pending-block cases. Skips are summed from the individual
Jest reports: the audit's HTTP total of 61 was an arithmetic error; its own package
rows also sum to 73. The new live deployment checks
create two independent contracts from one addressed instance through both node
and wallet signing, including gas estimation and independent state reads.
go-qrl explicitly clears `hash` and `miner` for pending blocks in
`internal/qrlapi/api.go`; the RPC validator now accepts that pair and rejects a
null miner on a mined block. Both unit tests and the final browser bundle check it.

All WebSocket suites passed, including the audit's intermittent `subscribe` case.
The run also exposed a stale `confirmationNumber` assertion swallowed by the
library's listener-error isolation. That test now awaits the first confirmation
and asserts the current `confirmations` field outside the callback; explicit HTTP
and WebSocket reruns passed. The three previously failing IPC `handleRevert` cases
now use a provider object and pass. There are 879 passing transport-specific cases
in total; skipped cases are not counted as passes, and IPC packages marked `—`
were not run.

Initial integration attempts were interrupted by a build regenerating `lib/`
and by the disposable miner's RPC timeout during a concurrent documentation build.
The node was restarted from a fresh state directory after all builds completed.
Those failed attempts are preserved separately and are not counted as passes.
The script ESLint test exceeded its 30-second subprocess deadline during concurrent
checks and passed when rerun alone; no timeout or lint budget was increased.

Logs/Jest JSON are under `/tmp/web3-pass5-*`; final package artifacts are under
ignored `dist/pass5-final/`. The disposable container was stopped and its removal
verified after IPC testing. No package was published during this verification.

### VM64 storage-key width

Access-list keys remain **32 bytes**. go-qrl's
[`AccessTuple.StorageKeys`](https://github.com/theQRL/go-qrl/blob/f3864c46b3f94662c514105da1efaf3466394fae/core/types/tx_dynamic_fee.go)
is `[]common.Hash`, and
[`common.HashLength`](https://github.com/theQRL/go-qrl/blob/f3864c46b3f94662c514105da1efaf3466394fae/common/types.go)
is 32. `getStorageSlotNumForLongString` hashes a 64-byte VM word but returns a
32-byte keccak digest. Storage **values**, addresses, and log topics are 64 bytes;
their widths do not change the access-list key format. The contract access-list
integration suite checks the RPC path against a node.

## Pass 6 remediation (2026-10-24)

The six Medium and nineteen Low findings in `AUDIT_REPORT_2026-10-24_pass6.md`
are addressed by the following changes and regression coverage:

| Findings | Correction and coverage |
| --- | --- |
| P6-CORE-1–4 | Track initial registrations separately from recovery, release stale replies, retain connect notifications after failed handshake probes, accept stale-id cancellation, and detach best-effort cleanup from the caller. Real WebSocket handshake/reconnect cases and manager cancellation tests cover these paths. |
| P6-TR-1–5 | Cap WebSocket frames before string conversion, cancel manual-connect backoff, distinguish peer close 1009 from a local response limit, reject ignored native-fetch agents, and preflight live IPC replacement. Transport suites exercise real loopback sockets and request cleanup. |
| P6-QRL-1–5 | Accept decimal-string receipt formats, validate 512-bit storage values, type gas/fee overflows, scope nullable RPC fields by schema, and isolate confirmation listener failures. Polling/subscription, proof, and receipt tests cover the changes. |
| P6-CT-1–4 | Preserve clone/deployment managers, isolate malformed historical logs and clean up failed backfills, reject topic-count mismatches, and reject nested integer-array alternatives in indexed filters. |
| P6-ABI-1–2, P6-VAL-1 | Reject byte-like integers while retaining binary byte inputs and decoded BigNumber compatibility; align typed-data booleans/domains with node rules; report the full issue count while retaining at most 100 issues. |
| P6-SC-1–4 | Parse workspace policy once and reject YAML merges/aliases and `.npmrc` policy overrides; pin the publishing runtime and assert npm's minimum version; enforce exact/caret sibling ranges for packages selected for publication. Ordinary workspace inspection still permits development ranges. |

Related informational corrections update changelogs and the opt-in validator
budget description, remove expired quarantine exemptions, extend CODEOWNERS,
refuse secret-file symlinks, and run republish inspection from the dispatched
scripts. The lint budget is ratcheted down without raising any package allowance.

Local verification used Node 22.22.1 and pnpm 10.27.0, with builds and unit tests
restricted to CPUs 0 and 1. All 19 package/tool builds passed; the final WebSocket
and ABI edits were rebuilt, and both browser bundles passed (existing webpack
size warnings remain). The unit suites passed **6,495 tests in 275 suites**, with
six skipped tests and one todo, retaining all package coverage thresholds.
The final decimal-string confirmation test also passed after its lint correction.
Frozen offline install, doctor, hygiene, dependency checks, and all 19 package
dry-run inspections passed. Inspection was run from a copied scripts directory
with `NODE_PATH` pointing to the checkout, as in republishing; strict release
inspection correctly rejected unresolved workspace ranges. Actionlint passed;
offline Zizmor retained only the previously documented low `self-repository`
finding (exit 12).
The final lint gate reported zero errors and 1,257 warnings against the reduced
1,257 warning budget; `git diff --check` passed.

Command logs and package test summaries are under `/tmp/web3-pass6-*`.
Live-node integration, tarball installation smoke tests, and the documentation
site build were not rerun in this remediation; the pass-5 results above describe
the earlier tree, not this one.

GitHub/npm account settings, a live release workflow run, the contracts release
tag, published tool-package decisions, and the on-chain ReverseRegistrar
convention remain external follow-ups from the report. No package is published
as part of this remediation.

### Pass 6 residual follow-up (2026-10-25)

P6R-1 now retries an initial subscription once when its successful reply spans a
reconnect. The manager releases the uncertain id, keeps the registration excluded
from recovery while retrying, and skips a completed retry if an older recovery
finishes later. Cancellation, clearing, disposal, and provider replacement still
prevent registration. A second connection change is bounded by a specific
retryable error instead of the cancellation/provider-replacement message.

P6R-2 uses format-agnostic unsigned-integer validation when comparing execution
statuses. Strict node-response validation remains unchanged. Regression cases
cover polling and new-head watchers, all four number formats, both byte formats,
and both changed and unchanged execution status after a reorg, including cleanup.

Verification: the full core, QRL, and contract suites passed **2,183 tests in
88 suites** (four skipped), with their existing coverage thresholds. Final
focused reruns passed after lint corrections. Both changed packages rebuilt
CommonJS, ESM, and declarations, and the web3 browser bundle rebuilt with its
existing size warnings. ESLint reported zero errors and unchanged warning counts
(core 40, QRL 242); formatting and `git diff --check` passed. Re-running the
original status-flip reproduction now reports the reorg error and stops both
watchers for decimal strings and bigints. Logs are under `/tmp/web3-pass6r-*`
and the core/QRL/contract `/tmp/web3-pass6-unit-*.log` files.

## Pass 8 remediation (2026-10-25)

This follow-up addresses the 18 numbered findings in
`AUDIT_REPORT_2026-10-25_pass8.md` against `d7704fb`. The report itself and earlier
untracked audit documents are preserved as supplied. No dependency versions,
lockfile entries, publishing credentials, or external repository settings changed.

| Findings | Change and regression evidence |
| --- | --- |
| P8-QRL-1, P8-QRL-3 | Sync notifications validate the real Go-cased numeric status, including `KnownStates`/`PulledStates`, with a subscription schema. `isSyncing` accepts `false` or validates and formats a status object. Tests cover all number formats and malformed RPC results. |
| P8-QRL-2 | Receipt overflow falls back only for numbers; the requested bytes format survives in receipts, confirmations and resolver input. Both send paths cover success/revert with HEX and UINT8ARRAY bytes. |
| P8-CORE-1, P8-CORE-2, P8-TR-2 | Subscription ids enter the manager before `connected` fires. Provider/subscription emission contains each synchronous throw or rejected listener promise, allowing later listeners, handshake, recovery and cleanup to proceed. Throwing error listeners are warned about without escaping the transport callback. |
| P8-CORE-3 | A bounded registration buffer retains early notifications and delivers after awaiting callers can attach listeners. Limits are 128 entries and 1,048,576 serialized UTF-16 code units per manager. Cancellation and connection/provider changes discard the buffer. Real loopback WS and IPC checks cover a subscribe reply coalesced with the first notification, initially and after recovery. |
| P8-CORE-4 | An in-flight unsubscribe interrupted by transport loss completes local cleanup without rejecting; explicit RPC failures still propagate. |
| P8-TR-1 | Frame and stream parsers reject nesting beyond 1024 before `JSON.parse`. The stream discards the over-depth body while tracking its boundary, attributes errors using a bounded prefix, and accepts a subsequent valid reply. Tests use a roughly 1 MiB nested payload below the byte cap and a throwing error listener. |
| P8-TR-3, P8-TR-4 | Failed manual connects restore the cancelled automatic attempt slot instead of exhausting retries. HTTP docs accurately distinguish native-fetch credential-header stripping from custom header forwarding and 307/308 body replay. Use `redirect: 'error'` when forwarding must be refused. |
| P8-CT-1, P8-CT-5 | Anonymous logs must match their indexed count and cannot consume a known non-anonymous signature. ABI registration preserves distinct indexed layouts sharing a signature; decoding selects the layout matching topic count. Named/allEvents tests cover both ABI orders. |
| P8-CT-2 | The report's documentation remedy is applied: the event API and `LogsSubscription` explicitly describe replay/live overlap, possible disorder, duplicates and gaps, and checkpointed reconciliation. No ordered, gap-free or exactly-once delivery guarantee is introduced. |
| P8-CT-3, P8-CT-4 | Per-listener containment also covers replayed data and per-log decode errors. A throwing listener cannot discard valid neighboring logs or tear down a healthy live subscription. |
| P8-SC-1 | Doctor rejects setting-named hooks and alternate policy inputs in workspace YAML and npmrc, plus lockfile hook/extension/patch indicators, including empty checksum values. Regression tests cover each new source. |
| P8-SC-2 | CJS/ESM smoke projects and copied tarballs live under the OS temporary directory, outside checkout ancestry. `NODE_PATH` is cleared; root exports must resolve inside each install. Pinned file references are relocated without changing registry resolutions or integrity values. Negative tests prove workspace copies cannot mask missing packages or runtime dependencies. |

Related informational corrections copy WebSocket socket options, return `false`
for odd-length bloom candidates, reject nullish QRNS namehash inputs, correct
sync types/examples and parser/heartbeat wording, restore this evidence checklist,
repair dangling references, and make the zizmor action fail on findings with one
narrow documented reusable-CI exemption.

### Verification

Node v22.22.1 and pnpm 10.27.0 were used. Each test/build process was pinned to
one CPU, with at most CPUs 0 and 1 used across concurrent work. Unit tests retain
the repository's coverage thresholds.

- All 19 package/tool CommonJS, ESM and declaration builds passed via local
  TypeScript `--build` commands; the final contract changes were rebuilt.
- Both webpack browser builds passed with their three existing size/performance
  warnings each. The final web3 UMD smoke passed constructor, QRL API and
  `keccak256` checks.
- **6,664 tests passed in 277 suites across 20 package/tool/script groups**, with
  six skipped tests and no failures. Each group ran Jest `--runInBand
  --watchman=false` with its normal configuration and coverage thresholds.
  `/tmp/web3-pass8-verified-test-summary.json` combines the final successful
  reports, including corrected test-compilation/snapshot reruns.
- Doctor, repository hygiene and `check-package-dependencies.js --require-built`
  passed (20 workspace manifests). Actionlint passed on both changed workflows;
  pedantic offline zizmor passed across all workflows with zero findings and the
  one documented inline exemption.
- Package inspection passed for all 19 publishable packages. All 19 final
  tarballs were packed and smoke-tested through isolated CommonJS and ESM
  installs; every package resolved within its temporary project.
- The complete lint-budget check passed: **1,256 existing warnings, unchanged
  in every package**, with zero errors and no budget increase.
- The independent IPC coalescing/reconnect harness passed with no retained
  subscription; permanent WS regressions cover the corresponding path.
- `git diff --check` and formatting of changed TypeScript files passed. Targeted
  script ESLint has zero errors and two existing header warnings.

Logs and generated artifacts are under `/tmp/web3-pass8-*`; fresh release
artifacts are under `/tmp/web3-pass8-release-final/`. All builds, tests and installs are
local evidence, not an npm publication or a CI run. Full real-node integration,
e2e, docs generation and a new vulnerability scan were not rerun for this patch;
the earlier report's runs are not presented as verification of these changes.
The informational compatibility observations and external governance decisions
not listed above remain outside this remediation.

## Pass 8 residual verification (2026-10-26)

P8R-2 was confirmed independently: calling the public `decodeEventABI` with a
valid raw ABI event and no `signature` annotation threw `Web3ValidatorError`
before decoding. The helper now derives absent signatures for the named event
and interface candidates, accepts those raw fragments in its public types, and
leaves caller objects untouched. Four regressions cover named decoding with and
without an interface, allEvents decoding, and the topic-count error path.

The contract's CommonJS, ESM and declaration builds pass. Its full unit suite
passes **220 tests in 16 suites** with coverage thresholds. Contract ESLint
passes with zero errors and the same 41 warnings; neither changed file has lint
findings. The rebuilt web3 browser bundle and UMD smoke also pass, with the
existing three bundle-size warnings. The preceding 6,664-test total records the
original pass-8 run; it is
not a claim that every package was rerun for this four-test follow-up.

The review's 393/73/1 HTTP and 442/22/3 WS figures aggregate several packages.
The original QRL-only logs show 170/18/1 (HTTP) and 184/2/3 (WS). Its IPC total
of 40/10/0 covers web3 and web3-providers-ipc, not the QRL package. This follow-up
runs the QRL integration configuration itself over all three transports against
the repository's standalone go-qrl 0.3.3 execution testnet. HTTP passes with
171 passed, 18 skipped and zero failed tests. WS passes with 187 passed,
2 skipped and zero failed tests, removing all four reported failures.

The first full QRL IPC run found 179 passing, 2 skipped and 8 failing tests in
seven files. All failures traced to pre-existing test helpers passing the raw
IPC path into Web3/Web3QRL, including a timeout caused by a rejected helper
promise. The helpers now use `getSystemTestProvider()` and close their funding
connections. All seven affected files then passed: **34 tests, zero failures**. Combining
those reruns with the unaffected full-run cases gives **187 passed, 2 skipped,
0 failed IPC tests in 28 passing suites**; this is a full run plus affected-file
reruns, not a claim that the original full command exited successfully. The
original JSON reports are retained alongside
`/tmp/web3-pass8r-ipc-verified.json`. Helper lint remains at 135 warnings and
zero errors, unchanged from HEAD.

Evidence: `/tmp/web3-pass8r-*`. The new local node uses public development
accounts and simulated Engine API fork choice, not a consensus/validator network.
For P8R-1, this restored evidence file is staged for inclusion in the commit
alongside its referring documents.

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

## Pass 9 remediation (2026-10-26)

All 18 numbered findings in `AUDIT_REPORT_2026-10-26_pass9.md` are addressed.
P9-CT-5 uses the report's permitted documentation remedy: a log cannot identify
which of two equal-signature, equal-indexed-count layouts emitted it.

| Finding | Change and regression coverage |
| --- | --- |
| P9-CORE-1 | Socket providers defer notifications for ids acknowledged by outstanding subscribe requests until registration promises resume. Managers drain an installed id's parked notifications before live delivery. Unknown ids retain the cap of 128 items and 1,048,576 serialized UTF-16 code units, checked before serialization when full. Wire tests cover 200 coalesced items, initial registration and recovery; the original reproduction delivers 128, 129, 200 and 300-item streams without drops. |
| P9-CORE-2 | Provider-change callbacks use per-listener guarded emission; synchronous throws and asynchronous rejections cannot interrupt teardown, swapping or later listeners. |
| P9-TR-1, P9-TR-2 | Frame, stream and HTTP parsing count object/array containers before `JSON.parse`, including empty containers and HTTP error bodies. The initial `max(1024, floor(maxResponseBytes / 32))` cap was relaxed to `max(1024, floor(maxResponseBytes / 16))` for P9R-2 so dense struct-logger traces fit near the byte cap. Chain and sibling-array/object reproductions reject typed under a 256 MiB old-space limit, and parsers retain response-id attribution and recover at following message boundaries. |
| P9-TR-3 | All providers accept a validated positive-integer `maxResponseDepth`, default 4096. Tests accept full 1024-frame JSON traces and reject a lower caller-selected bound. Byte limits are documented as distinct from process heap limits. |
| P9-QRL-1, P9-QRL-2 | Reorg receipts undergo RPC schema validation before adoption. Polling resets its error count and advances confirmations only after successful formatting/delivery; repeated NUMBER overflow stops after five failures. Both watchers share receipt revalidation. |
| P9-QRL-3 | Broadcast races only the wall-clock send deadline. The receipt waiter starts the block deadline after the node returns the transaction hash; block headers during submission cannot reject the broadcast. |
| P9-QRL-4, P9-QRL-5 | Sync replies require startingBlock/currentBlock/highestBlock. Sync and both send wrappers normalize nullish return formats to the default before formatting/broadcast; tests exercise both send paths. |
| P9-CT-1 | Named filters select a compatible indexed layout before topic encoding. Historical value filters use the same fragment selection as decoding. Unknown keys fail typed; live filtering remains node-side and this limitation is documented. |
| P9-CT-2, P9-CT-3, P9-CT-4 | Public decoding supports an omitted/null registry, retains a matching caller fragment, copies selected registry fragments, and rejects non-string topics on live and direct paths. |
| P9-CT-5 | The smart-contract guide and package changelog document indistinguishable indexed layouts, named-fragment precedence and first-match allEvents behavior. Consumers must supply the emitting contract/version ABI. |
| P9-ABI-1 | Invalid parameter lists and tuple components raise `AbiError`, including signature derivation from a non-array input list. |
| P9-SC-1 | Doctor rejects runtime and package-manager selection keys, including normalized `node-mirror:*`, in workspace and every tracked npmrc. Hygiene checks untracked npmrc too; CODEOWNERS covers nested npmrc. |
| P9-SC-2 | Restore this file from blob `3e156abe31ec0a85fd0c82edc9afe6c2df3b37a5` and stage it. Remove its link to the untracked pass-5 remediation document, leaving that local file unchanged. Hygiene now requires inline relative Markdown-file link targets to exist on disk and in the Git index. |

Additional corrections wrap non-Error subscription listener failures, validate
one copied set of WebSocket options, update syncing TSDoc to bigint, and remove
tarball smoke directories on exit. `WEB3_KEEP_SMOKE_PROJECTS=1` retains smoke
projects for debugging. No GitHub settings, publication or deployment changes
are part of this remediation.

Verification uses Node 22.22.1, pnpm 10.27.0, serial Jest workers and CPU affinity
limited to CPUs 0 and 1. The final unit reports contain 6,722 passed tests in 278
suites, six skipped tests and one todo, with all coverage gates passing. Changed
transport suites were rerun after the acknowledgement-window correction; the
original mock-only burst regression did not expose that window. The real WS/IPC
reproduction now delivers every item with zero manager/subscription/provider
errors. The 10 MiB chain and sibling container cases and HTTP nesting case reject
without exhausting a 256 MiB V8 old-space limit; flat text and deep valid traces
remain accepted. CJS, ESM and declaration builds pass for all 19 packages.

Local logs and machine-readable results are under `/tmp/web3-pass9-*`.

The lint gate remains at 1,256/1,256 warnings with zero errors. Doctor, repository
hygiene, both webpack bundles, browser UMD smoke, the documentation build,
inspection and packing of all 19 publishable packages, and isolated CommonJS/ESM
tarball smoke installs all pass. Webpack still reports its existing bundle-size
advisories and TypeDoc its existing unresolved-type warnings.

Live `web3-qrl` integration against the repository's disposable go-qrl 0.3.3
execution node (`f3864c46`, chain `0x539`) also passes:

| Transport | Passed | Skipped | Failed |
| --- | ---: | ---: | ---: |
| HTTP | 171 | 18 | 0 |
| WebSocket | 187 | 2 | 0 |
| IPC | 187 | 2 | 0 |

These are the `web3-qrl` package suites, not the combined multi-package totals in
older audit summaries. The suites ran serially against public development
accounts. Logs and JSON reports are `/tmp/web3-pass9-integration-*`; the disposable
node's retained logs are in `/tmp/web3-execution.tn99Wh`.

### P9R-2: dense struct-logger traces (2026-10-27)

The shared container budget is now `max(1024, floor(maxResponseBytes / 16))`,
or 655,360 containers at the default 10 MiB byte limit. Empty arrays and objects
still count. The previous `/32` heuristic rejected a valid 9.54 MiB struct-logger
reply with 110,000 steps and empty memory arrays (330,003 containers). The new
budget admits it without exempting the empty containers used by allocation attacks.

Regression tests cover traces above 99% of both a 64 KiB configured limit and the
default 10 MiB limit in frame, split-stream and HTTP parsing. Empty-array and
empty-object floods still fail with typed errors; HTTP success and error bodies
are covered, and socket parsing recovers for the following reply.

Verification used serial Jest on one CPU. The four affected package suites pass
with their coverage thresholds: web3-utils 1,307 tests, HTTP 127, WebSocket 90 and
IPC 36 (1,560 tests across 34 suites). The web3-utils CommonJS, ESM and declaration
builds pass, as does an ESM import smoke check. ESLint on the four changed TypeScript
files reports no errors and only three existing HTTP-test warnings.

The original chain and empty-container reproductions still reject with
`InvalidResponseError` in both parser modes and over real WebSocket and IPC
connections with `--max-old-space-size=256`. HTTP nesting rejection, flat-text
controls and deep call traces also pass. The 9.54 MiB struct-logger control arrives
intact over real HTTP, WebSocket and IPC connections under the same old-space limit;
WebSocket and IPC report no error events. Logs and JSON results are under
`/tmp/web3-p9r2-*`. This follow-up reruns the affected suites and transport probes;
the full-workspace and live-chain integration totals above describe the earlier run.

## Pass 10 remediation (2026-10-27)

This section covers the 18 numbered findings in the pass-10 report against
`7abf7e9`. The report's informational observations remain separate from those
findings; the changes below do not claim to resolve every informational item.

| Finding | Change and regression coverage |
| --- | --- |
| P10-CORE-1 | Socket acknowledgements identify legitimate early notifications even when a `request()` wrapper resumes in another timer turn. Manager tests cover 300 coalesced items in order on initial and recovery registration, with and without the delayed wrapper. Unknown-id flood limits and cancellation cleanup remain in force. |
| P10-CORE-2 | Strict hex output bypasses the byte-array round trip, byte-array hex conversion uses bounded chunks, and decimal integer strings are limited to 155 digits before `BigInt`. This covers uint512; callers needing larger integers can use bigint or hex inputs. Network quantities are bounded before formatting. |
| P10-CORE-3 | Zero planck amounts format as `"0"` in every unit, including negative-zero and hex-zero inputs. |
| P10-CORE-4 | `net.getId` and `net.getPeerCount` normalize nullish return formats to the default. |
| P10-TR-1 | Apply the report-permitted documentation remedy: key-dense JSON can still consume about 14 times its text size, compared with about 4 times for measured container/number-dense cases. Plan at least `15 × maxResponseBytes × concurrent replies` of heap plus transport, text and application headroom. These measurements are not a fixed upper bound. The earlier empty-container measurement does not bound all JSON shapes. |
| P10-TR-2 | Socket parsers count UTF-8 bytes, including multibyte text and surrogate pairs split between stream chunks. Exact-limit replies pass; oversized replies reject with `ResponseTooLargeError` and request-id attribution. |
| P10-QRL-1 | Before recursive RLP decoding, scan headers iteratively and enforce 16 MiB serialized bytes, four list levels and 65,536 total items. Four levels permit transaction/access-list/entry/storage-key-list nesting. Hex-string entry points check size before conversion. Tests reject a deeply wrapped 5 MiB payload without calling the RLP decoder and accept a normal access-list transaction. |
| P10-QRL-2 | Subscription confirmations report the confirming header's hash, matching polling semantics. |
| P10-QRL-3 | Polling requires a 32-byte block hash and a block number equal to the request. Consecutive malformed replies consume the bounded error budget without advancing confirmation counts; pending/null blocks remain idle. |
| P10-QRL-4 | Transaction and receipt readers compare the returned transaction hash with the requested hash before formatting, ignoring hex case. Rechecks treat a foreign receipt as unknown and never adopt it. |
| P10-QRL-5 | Syncing subscriptions require starting, current and highest block fields before emitting progress. Partial status objects emit a typed error without changed/data events; complete go-qrl notifications still pass. |
| P10-CT-1 | Treat omitted `anonymous` and `anonymous: false` identically when selecting compatible event layouts. |
| P10-CT-2 | Ignore nullish filter values when selecting a layout or checking its active keys. |
| P10-CT-3 | When compatible layouts place a key at different indexed positions or have different topic counts, request signature-only topics and compare values locally, including live delivery. Tests apply node topic semantics in both ABI orders. Explicit topics and live `allEvents` keep their documented semantics. Indistinguishable same-signature/same-count layouts retain the P9-CT-5 limitation. |
| P10-CT-4 | Validate live contract logs against the RPC log schema before decoding. Malformed non-topic fields emit typed errors instead of data. |
| P10-ABI-1 | Bound combined tuple/array nesting to 64 levels in contract ABI cloning, signature flattening, ParamType construction and validator schema conversion. Excessive inputs reject with typed errors before recursive work. |
| P10-SC-1 | Decode npmrc key quotes, JSON escapes and unescaped comments as `ini` does before applying the policy-key checks. Tests include hash/semicolon comments, quotes, bracket suffixes and escaped comment characters. |
| P10-SC-2 | Use the already locked Markdown parser as a declared development dependency. Check rendered relative Markdown/MDX links, including titles, references and static HTML links, while excluding code and comments. Targets must exist on disk and in the index. |

The small release-smoke follow-ups remove the runner's owned npm cache as well
as its projects on exit, handle SIGINT/SIGTERM, preserve caller-supplied caches,
document `WEB3_KEEP_SMOKE_PROJECTS`, and assert the CJS/ESM project manifest type
inside the fake npm fixture. `encodeEventABI` also rejects a non-array event
registry with `AbiError`.

Original pass-10 reproductions were replayed against rebuilt packages. The
300-item acknowledgement burst arrives intact with plain, `setImmediate` and
`setTimeout` request wrappers. The 12 MB multibyte response rejects on all three
transports, and the 30 MB IPC response now rejects while retaining the connection.
The nested-RLP reproduction rejects under a 256 MiB old-space limit, including a
roughly 10 MB JSON response through the real HTTP provider. The event-layout,
live-log, receipt-identity, syncing and ABI-depth reproductions show the corrected
behavior. Local logs are `/tmp/web3-pass10-poc-*.log`.

The original formatting timing script now exits on the intentionally rejected
oversized decimal input. Its completed hex rows show roughly 17 ms for 10 MiB
hex formatting on this run; a separate control verifies typed decimal rejection
and zero round trips for every unit. These timings are observations on this host,
not performance guarantees.

Final verification (2026-10-28) used Node 22.22.1 and pnpm 10.27.0, with each
unit-test group run serially on one CPU and coverage thresholds enabled. All
20 groups pass: **6,800 tests in 278 suites**, with six skipped and one todo
(68 more passing tests than the pass-10 baseline). All 19 package builds pass,
including CommonJS, ESM and declarations. The frozen offline install, doctor,
hygiene, declared-dependency check, browser bundles, UMD smoke, documentation
build, package inspection, 19-package packing and isolated CJS/ESM tarball smoke
pass. Lint remains at **1,256 warnings against a budget of 1,256**, with no errors;
the final RLP size-boundary change also passes targeted lint with its existing
test warning. The smoke project directory was removed on exit.

Live-node verification covers the two packages affected by the transaction and
event changes. These are scoped results, not a rerun of every workspace
integration package:

| Package | Transport | Passed | Skipped | Failed |
| --- | --- | ---: | ---: | ---: |
| web3-qrl | HTTP | 171 | 18 | 0 |
| web3-qrl | WebSocket | 187 | 2 | 0 |
| web3-qrl | IPC | 187 | 2 | 0 |
| web3-qrl-contract | HTTP | 111 | 15 | 0 |
| web3-qrl-contract | WebSocket | 124 | 2 | 0 |

The first QRL WebSocket run reached the harness's 1,800-second timeout; a fresh
testnet retry with suite progress reporting completed in 491 seconds without a
code change. Both testnets were stopped after verification. The first docs run
timed out during search indexing; limiting the indexer's worker count to two
allowed the retry to finish. Logs are under `/tmp/web3-pass10-*`. The older
pass-5 through pass-9 PoC collections and the workflow/supply-chain scanners
were not rerun for this remediation; their earlier results remain historical.

## Pass 10 verification follow-ups (2026-10-28)

P10R-2 corrects the umbrella integration fixture: its mocked receipt now uses
`keccak256(sentRawTransaction)`, matching the hash returned by the broadcast
mock. The receipt-identity checks remain enforced. The complete `web3` integration
configuration now passes against the local execution testnet in all three modes:
HTTP **35 passed / 6 skipped**, WebSocket **35 / 6**, and IPC **31 / 10**, with
zero failures. The first HTTP attempt passed the corrected fixture but hit an
unrelated fixed-fee test before the fresh chain's base fee fell below its fee
cap; waiting for that condition and rerunning the HTTP suite passed. Both
disposable testnets were stopped after verification.

P10R-1 replaces synchronous smoke commands with awaited child processes. A signal
sent only to the runner now cancels the active command and its POSIX process
group, waits for the child to close, cleans up, and re-raises the signal. A child
that ignores cancellation is killed after five seconds. Caller-provided caches
remain untouched, and `WEB3_KEEP_SMOKE_PROJECTS=1` retains debugging files while
still allowing cancellation. Nine new regression cases cover SIGINT/SIGTERM
during lock resolution and installation, process-group signals, the retention
options, and an unresponsive child.

All **236 script tests in 17 suites** pass, including all 16 smoke-runner tests.
The original sleeping-npm reproduction now ends with SIGTERM/SIGINT (rather than
exit 0 after finishing the smoke) and leaves neither temporary directory behind.
The saved signal logs do not record elapsed time.
The real smoke imports and requires all 19 packed packages successfully using
the latest audit build's matching lockfile.
Targeted lint passes with only the existing script-header warning; hygiene and
`git diff --check` pass. Logs are under `/tmp/web3-pass10r-*`. These are focused
follow-up checks; the full-workspace totals above describe the earlier run.

## Pass 11 remediation (2026-10-29)

The nine findings in the pass-11 report are addressed in the working tree.

| Finding | Change and regression coverage |
| --- | --- |
| P11-CT-1 | Subscription backfill receives the same broad filter as live delivery. The merged-layout test checks replay and live matches in both ABI orders. Explicit topics retain their override semantics. |
| P11-CT-2 | Broad queries encode every active filter value and every OR alternative before issuing RPCs. Invalid filters fail before fetching or subscribing. |
| P11-CT-3 | Anonymous events retain the bound fragment's indexed topics; they never request a signature-only broad query. |
| P11-CT-4 | Indexed positions determine whether broad topics are necessary. Compatible layouts with different indexed counts use a prefix without trailing wildcard slots, including unfiltered named queries. |
| P11-SC-1 | Reject environment substitution in npmrc and workspace setting names after key decoding. Parse bare CR as well as LF separators. Credential substitution in values remains allowed. |
| P11-CORE-1 | Maintain the unknown-notification count separately from acknowledged entries. Real WebSocket tests delay registration by 30 ms, send a burst followed by a second batch, check order, and verify the 128-entry unknown-id cap still holds. |
| P11-QRL-1 | Require a 32-byte confirming header hash before advancing the subscription watcher. Missing and malformed hashes cannot suppress a subsequent valid header. |
| P11-QRL-2 | Check requested block hash/number, transaction block/index, and log address/positional topics before return formatting. Tests cover mismatches, missing fields, alternate input/return formats, OR/wildcard topics, null results, tags and pending transaction locations. |
| P11-QRL-3 | The serialized-size precheck only measures strings and Uint8Arrays, leaving other inputs to typed validators. Nullish and other invalid send/decode inputs raise Web3ValidatorError without broadcasting. |

Related cleanup handles SIGHUP and failed directory removal in the smoke runner,
checks literal link targets when percent decoding fails, and uses one streaming
UTF-8 decoder per IPC connection while preserving BOM handling. Public helper,
provider acknowledgement, byte/depth-limit and confirmation-hash contracts are
documented. Decimal length limits are explicitly scoped to `toBigInt` and its
callers. The two unsupported pass-10 timing/integrity narrative claims above were
removed or qualified.

Contract fixtures now apply node topic semantics where they model an honest node.
A reply containing logs outside its requested address/topics is tested as an
InvalidResponseError, rather than silently treated as a valid response. Snapshot
changes only add the manager's new unknown-notification counter.

Validation used Node 22.22.1 / pnpm 10.27.0, one CPU (`taskset -c 0`),
`UV_THREADPOOL_SIZE=1`, and Jest `--runInBand --watchman=false`. The workspace
build completed all 19 targets; final incremental CommonJS, ESM and declaration
builds passed for all eight changed TypeScript packages.

| Unit-test group | Passed | Skipped | Suites |
| --- | ---: | ---: | ---: |
| web3-core | 514 | 0 | 19 |
| web3-qrl | 1,586 | 4 | 57 |
| web3-qrl-contract | 242 | 0 | 16 |
| web3-qrl-accounts | 350 | 2 | 18 |
| web3-providers-ipc | 36 | 0 | 4 |
| Repository scripts | 248 | 0 | 17 |
| **Total** | **2,976** | **6** | **131** |

All package coverage thresholds passed. Doctor, repository hygiene and
`git diff --check` passed. Tests requiring child-process fixtures or local sockets
were rerun outside the sandbox after its EPERM refusals. Logs are under
`/tmp/web3-pass11-*.log`. These checks cover the remediation; live-node integration,
browser bundles, published-tarball smoke and supply-chain scans were not repeated.

The full lint-budget gate passed with zero errors and **1,256 warnings against
an unchanged budget of 1,256**. The final indexed-function mock retest also passed
all 19 tests after its lint cleanup; it is included in the contract total above.

### P11R-1 follow-up (2026-10-29)

Subscription post-filtering now depends on active filter keys, independently of
whether the node topic query needs broadening. Non-indexed filters apply to live
delivery, removed logs and `fromBlock` replay for single and merged layouts,
anonymous events and `allEvents`. Explicit topics retain their subscription override.
All active values and OR alternatives are validated before requests; `allEvents`
validates every layout containing all active keys. The contract guide documents
these semantics.

The new `non_indexed_event_filters.test.ts` adds 37 cases covering both ABI orders,
three return formats, replay/live/removed-log agreement, synchronous validation,
wildcards, empty OR lists and explicit-topic overrides. The full contract unit suite
passed **279 tests in 17 suites**, including all coverage thresholds, on one CPU.
After test lint cleanup, the 37-case suite passed again. CommonJS, ESM and declaration
builds passed. Targeted ESLint reported zero errors and the same five existing
warnings in `contract.ts`; formatting, repository hygiene and `git diff --check`
passed. Hygiene was rerun outside the sandbox because its Git subprocess was blocked.

The auditor's `poc11r_nonindexed_live.cjs` was replayed against the rebuilt package:
S1 and S4 now return 1/1/1 (past/replay/live), S2 returns 2/2/2, and S3/S5 retain
2/2/2. S3 was already correct before this follow-up; the report's 4/4 description
of that row is inaccurate. All 30 type/return-format rows in
`poc11_ct_broad_matrix.cjs` now produce the same two matching live and past results,
without errors. Explicit-topic and indexed-filter controls are unchanged.
Logs are `/tmp/web3-p11r-*.log`. The workspace-wide gates and real-node integration
suites were not repeated for this follow-up.

## Pass 12 remediation (2026-10-29)

The seven Low findings in `AUDIT_REPORT_2026-10-29_pass12.md` are addressed.

| Finding | Change and regression coverage |
| --- | --- |
| P12-CORE-1 | The notification flush checks manager and connection generations before each delivery or requeue. Tests switch providers, clear and dispose from a listener while another registration is pending, then check that a reused id receives no stale data. |
| P12-TR-1 | Batch error summaries inspect at most four entries and cap their combined text, retaining the complete `innerError` and `data`. A 30,000-entry unit case and the auditor's HTTP probe cover direct and HTTP-wrapped errors. |
| P12-QRL-1 | `ArrayBuffer.isView` applies the serialized-size bound across realms. Tests create an oversized array in a VM context and check refusal before RLP decoding, formatting or broadcast; the exact size boundary remains accepted by the precheck. |
| P12-QRL-2 | Raw log subscriptions and `getLogs` share the address/positional-topic matcher. Tests cover foreign and absent identities, address and topic alternatives, wildcards, prefix normalization and alternate return formats. Subscription topic types now include the documented OR lists. |
| P12-QRL-3 | Quantity errors name their result field, including missing block numbers and transaction indexes. Nested schema quantity checks preserve their field path too. |
| P12-CT-1 | Named events validate every compatible layout containing all active keys, also with explicit topics. A sibling missing a required key is dropped before encoding other expected values. Tests cover both ABI orders, reads, replay and live delivery. |
| P12-CT-2 | Empty OR lists raise `AbiError` before any request. Empty array-typed values remain valid. Tests cover scalar and tuple OR lists and the array-value control. |

Related corrections snapshot top-level subscription filter values, reject non-array
`topics`, restore coverage for selected layouts missing filter keys, and clarify
unfiltered topic prefixes, manager retention, the UTF-16 notification budget,
IPC decoder initialization and best-effort smoke cleanup. The original report
and its historical gate evidence are preserved.

Validation used Node 22.22.1, CPU 0, `UV_THREADPOOL_SIZE=1` and Jest
`--runInBand --watchman=false`. The wrapper `/tmp/web3-pass12-check.sh` records the
working directory, exact command, timestamps and exit status in every
`/tmp/web3-pass12-*.log`; the commands and statuses therefore remain available even
for successful TypeScript builds that emit no compiler output.

| Unit-test group | Passed | Skipped | Suites |
| --- | ---: | ---: | ---: |
| web3-core | 517 | 0 | 19 |
| web3-errors | 120 | 0 | 3 |
| web3-qrl-accounts | 351 | 2 | 18 |
| web3-qrl | 1,600 | 4 | 57 |
| web3-qrl-contract | 292 | 0 | 17 |
| **Total** | **2,880** | **6** | **114** |

The core total combines 503 passing tests from the full run with its 14 socket
cases rerun outside the sandbox after `listen EPERM`. Coverage thresholds were
enabled in each full package run and none failed. Test-only lint cleanup was
followed by focused reruns of the three affected suites.

CommonJS, ESM and declaration builds passed for all five packages with runtime code changes
(the sixth source package, `web3-providers-ipc`, had a documentation-only edit);
the final contract change also passed all three incremental builds. The full
lint-budget check retained **1,256 warnings against the unchanged 1,256 budget**.
Its eight test-lint errors were corrected, and final ESLint over all changed
TypeScript files reported zero errors. Formatting, repository hygiene and
`git diff --check` passed. Lint-budget, hygiene and localhost-server checks that
were blocked by sandbox subprocess/socket restrictions were rerun outside it.

Auditor probes against the rebuilt packages confirm an empty stale-notification
buffer after all three lifecycle actions; invalid named sibling filters rejected
with zero `getLogs` calls; and foreign raw subscription logs reported as
`InvalidResponseError` while matching/uppercase-address controls remain delivered.
The 28,646-entry HTTP batch probe now yields a 319-character `ResponseError` and a
408-character `HttpStatusError`, retaining every diagnostic entry. Original single
error messages remain bounded as before.

These checks cover the changed packages. Workspace-wide unit tests, live go-qrl
integration, browser bundles, release smoke, docs build and supply-chain scans
were not repeated for this remediation.

## Pass 12 residual P12R-1 remediation (2026-10-30)

Indexed topic encoding now uses the same own enumerable, non-nullish filter key
list as validation, layout selection and local matching. Inherited and
non-enumerable properties are ignored consistently by `getPastEvents`, subscription
replay and live delivery. The smart-contract guide documents this contract.

The 42 added cases in `non_indexed_event_filters.test.ts` cover inherited and
non-enumerable indexed keys, mixtures with own non-indexed keys, own-property
shadowing, null-prototype filters and a non-matching own-key control. Each case
compares past events, replay, live and removed logs across single, merged,
reversed, `allEvents` and anonymous layouts. Before the source fix, 12 cases
failed; after it, all **334 contract tests in 17 suites passed**, with the package
coverage thresholds enabled and met.

Forced CommonJS, ESM and declaration builds passed. ESLint reported zero errors
and warnings for the changed source and test. Checks used Node 22.22.1, CPU 0,
`UV_THREADPOOL_SIZE=1` and Jest `--runInBand --watchman=false`; exact commands,
timestamps and statuses are in `/tmp/web3-pass12-p12r1-{red,unit,build,eslint}.log`.
Formatting, repository hygiene and `git diff --check` also passed. The hygiene
check was rerun outside the sandbox after its Git subprocesses were blocked.

The auditor's inherited-filter probe was rerun against the rebuilt package:
the inherited-only filter now returns four logs on every path, while the ordinary
own-property control still returns two. The output is saved in
`/tmp/web3-pass12-p12r1-probe.log`. This focused follow-up did not repeat the
workspace-wide release gates or live testnet integration.


## Pass 13 remediation (2026-10-30)

All eight Low findings in `AUDIT_REPORT_2026-10-30_pass13.md` are addressed.

| Finding | Change and regression coverage |
| --- | --- |
| P13-CT-1 | `allEvents` validation respects the first explicit topic, including signature alternatives and wildcards. A pinned signature excludes anonymous layouts; known keys remain accepted when no declared signature is admitted. Tests use the ERC-1155 `TransferSingle`/`URI` shared `value` name. |
| P13-CT-2 | Historical reads and subscriptions copy filter values and topic alternatives before asynchronous work, including OR lists, tuple objects, arrays and byte buffers. Mutation tests cover reads, replay and live delivery. |
| P13-CT-3 | A shared predicate treats empty topics as omitted in encoding, historical reads and subscriptions. Tests ensure foreign event signatures are excluded and local value filters remain active. |
| P13-QRL-1 | Raw log subscriptions copy their arguments at construction and use that copy for historical replay. Tests mutate address lists, nested topics and block bounds. |
| P13-QRL-2 | Null, scalar and array log options fail with `SubscriptionError` before manager registration. Direct construction also rejects these inputs; the shared matcher tolerates a null filter. |
| P13-QRL-3 | Validation budget checks treat every array-buffer view as atomic. Large views are summarized before diagnostic rendering, retaining the original value in the validation issue. The regression checks that a cross-realm view is never enumerated. |
| P13-TR-1 | Error diagnostics retain bounded node messages independently of response id or JSON-RPC metadata. Tests cover `ResponseError`, `InvalidResponseError` and HTTP status wrapping. |
| P13-TR-2 | Both core batch-message sites and non-JSON-RPC provider descriptions truncate echoed text. Tests check bounded messages and settlement of every failed batch entry. |

Related fixes purge retired subscription notifications, including the active flush
snapshot, before an id can be reused; avoid duplicate validation of the bound ABI
fragment; format numeric subscription `toBlock`; name byte/access-list error
fields; remove the empty RPC errors source; and share and clean the package
inspector's owned npm cache. Script tests exercise successful/failed inspection,
caller-owned caches and smoke cleanup failure. Guides describe snapshot semantics,
empty topics, connection changes, supported subscription block tags and retained
testnet directories. Historical audit reports and existing temporary directories
are preserved.

Validation uses Node 22.22.1, CPU 0, `UV_THREADPOOL_SIZE=1` and Jest
`--runInBand --watchman=false`. `/tmp/web3-pass13-check.sh` records each exact
command, working directory, timestamps and exit status. Logs are
`/tmp/web3-pass13-*.log`; failed sandbox attempts and successful outside-sandbox
reruns have separate labels.

| Unit-test group | Passed | Skipped | Suites |
| --- | ---: | ---: | ---: |
| web3-core | 522 | 0 | 20 |
| web3-errors | 123 | 0 | 3 |
| web3-validator | 873 | 0 | 24 |
| web3-qrl | 1,605 | 4 | 57 |
| web3-qrl-contract | 348 | 0 | 18 |
| **Changed runtime packages** | **3,471** | **4** | **122** |
| Inspection and smoke scripts | 61 | 0 | 2 |

Package coverage thresholds were enabled and produced no failures. The core total
combines 508 passing cases from the full run with its 14 socket cases rerun outside
the sandbox after `listen EPERM`. The script suites also passed outside the sandbox
after subprocess capture failed inside it. Forced CommonJS, ESM and declaration
builds passed for the five runtime packages; `web3-rpc-methods` passed a clean build
in all three formats after removing its empty source file. Package inspection
passed for all 19 publishable packages. Changed-file ESLint reported zero errors,
and formatting and repository hygiene passed. The full lint-budget check passed
at **1,252 warnings against the unchanged 1,256 budget**. After the final
anonymous-layout refinement, all 348 contract tests and all three contract builds
passed again; package ESLint remained at its existing 41-warning limit with zero
errors. The docs build passed before the final anonymous-layout wording correction;
that text-only correction was checked with repository hygiene and `git diff --check`.

The rebuilt-library probes confirm the ERC-1155 query is admitted; nested mutation
does not change delivered values; empty topics preserve named-event signatures;
raw subscription options stay independent through resubscription; null options
create no orphan; and unsubscribed flush remainders are discarded before id reuse.
The 4 MiB cross-realm decode probe now refuses in **0.3 ms**, with RSS unchanged at
89 MiB in that run. The real HTTP probes produced **314-character** batch-failure
and **644-character** mismatched-id messages; the 980-entry matching control still
succeeded, and all 980 foreign-id entries settled with errors. Null-id error
messages retain the node's reason.

The original subscription-shape probe stops at its uncaught direct-constructor
null-options rejection. A scratch copy catches only that expected refusal and
continues through the remaining rows, including mutations and resubscription;
its output is `/tmp/web3-pass13-probe-q1-caught.log`. No per-log filtering speedup
is claimed: pass 13 attributes the earlier pass-12 timing difference to load/JIT
variation. Earlier evidence sections include interactive-session observations
whose failed attempts or diff checks were not separately retained in log files;
this remediation retains those records explicitly.

Workspace-wide unit tests, browser bundles, tarball installation smoke, live
execution-node integration and supply-chain scans were not repeated for this
remediation.
