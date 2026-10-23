# Supply Chain Security

This repository uses pnpm 10 with a committed `pnpm-lock.yaml`. Dependency
changes must be reviewed as code changes because they affect the release
artefacts and the transitive code executed during docs, package, and test
builds.

## Install Policy

The workspace install policy is defined in `pnpm-workspace.yaml`:

- `minimumReleaseAge: 10080` prevents installing package versions published in
  the last seven days.
- `minimumReleaseAgeExclude` is the reviewed list of exemptions from that
  quarantine: `@theqrl/*` (first-party releases) plus the exact security patch
  releases the overrides below resolve to (`name@x.y.z`, several joined with
  `||`). An exemption never names a package without a version — that would
  exempt every future release of it — and `pnpm run doctor` fails on a
  name-only entry. Remove an exemption once its release is older than the
  quarantine window.
- The quarantine applies to pnpm installs. The release smoke test installs the
  packed tarballs with `npm ci` from a lockfile the `prepare` job resolves and
  ships inside the release-candidate artifact (`scripts/release/smoke-tarballs.js`),
  so the smoke install is pinned and integrity-checked, but it is not
  quarantined: first-party siblings released inside the window must remain
  installable.
- `blockExoticSubdeps: true` blocks transitive dependencies that resolve through
  exotic specifiers.
- `strictDepBuilds: true` fails installs when dependencies have unreviewed build
  scripts.
- `allowBuilds` is the reviewed allowlist of dependencies whose install-time
  build scripts are expected for the current lockfile. Every entry must name a
  package that is present in `pnpm-lock.yaml`; `pnpm run doctor` fails on a
  stale entry, because it would pre-approve the install script of whatever a
  future dependency change brings in under that name.

Do not widen `allowBuilds`, add pnpm overrides, or relax these settings without
explaining the reason in the pull request.

Known install warnings and the current remediation plan are tracked in
[`docs/dependency-warning-triage.md`](dependency-warning-triage.md).

## Declared Dependencies

Each package must declare everything it imports. The workspace uses
`nodeLinker: hoisted`, so an undeclared module still resolves during
development and tests and the gap only surfaces when a consumer installs the
package from the registry under a strict resolver (pnpm's isolated linker, Yarn
PnP). `scripts/check-package-dependencies.js` (`pnpm run check:dependencies`,
also part of `pnpm run doctor` and of `pnpm run release:inspect-packages`)
parses every package's `src/**/*.ts` with the TypeScript compiler and, once
built, its `lib/**/*.js`, and fails when:

- a runtime import is not in `dependencies`, `peerDependencies` or
  `optionalDependencies` (a `devDependency` only satisfies `import type`);
- the built output of a publishable package loads a Node built-in module.
  Only `@theqrl/web3-providers-ipc` (`net`, `fs`) is Node-only; every other
  package must stay bundler-safe for Vite/esbuild/Rollup consumers, which is
  why the event emitter is a dependency-free implementation in
  `@theqrl/web3-utils` rather than Node's `events`.

It warns about a dependency that nothing imports and about a plain (non
`import type`) import of a Node built-in in a browser-facing package's source.

## Git-hosted Dependency Integrity

`@theqrl/qrl-contracts`, the Hyperion contract library the test fixtures are
compiled against, is a GitHub-hosted dependency pinned to a commit and a SHA-512
archive checksum in `pnpm-lock.yaml`. pnpm 10.27.0 does not generate this integrity
field automatically, but enforces it when supplied: an incorrect archive checksum
fails installation with `ERR_PNPM_TARBALL_INTEGRITY`.
`pnpm run doctor` checks that the lockfile retains the reviewed checksum and URL.
It also hashes the installed package tree (`scripts/git-dependency-digest.js`)
and compares it with the reviewed tree digest in `scripts/doctor.js`.

When the pinned commit changes, download its codeload archive and review the
source diff. Compute the archive's SHA-512 checksum, prefix the base64 output
with `sha512-`, and record it as `resolution.integrity` alongside `tarball` in
the lockfile and in `scripts/doctor.js`:

```sh
openssl dgst -sha512 -binary qrl-contracts.tar.gz | openssl base64 -A
```

Install with the updated lockfile, review the installed files, and record the
new tree digest in `scripts/doctor.js`:

```sh
pnpm install --frozen-lockfile
node scripts/git-dependency-digest.js @theqrl/qrl-contracts
```

Run `pnpm run doctor` after recording both digests. Do not remove the archive
integrity field when refreshing the lockfile.

## Audit Gate

The required local and CI audit command is:

```sh
pnpm run audit:supply-chain
```

npm's `/security/audits` endpoint is retired and answers HTTP 410, so `pnpm
audit` cannot be the gate. The gate scans `pnpm-lock.yaml` with Trivy instead
and fails on high and critical vulnerabilities in production *and* development
dependencies: Trivy's pnpm analyzer drops dev-only importers unless
`--include-dev-deps` is passed, and the development toolchain (semantic-release,
typedoc, webpack, Docusaurus) executes in CI, in the docs build and in the
release job with write-capable tokens.

Local and CI runs are pinned to the same scanner:

- The local script runs Trivy `0.70.0` from a digest-pinned container image, so
  the gate is reproducible without a separate Trivy install and cannot silently
  pick up a different scanner version. Docker is the only prerequisite; if it is
  missing, the script prints the pinned image and the equivalent flags instead
  of failing with `command not found`.
- `.github/workflows/ci.yml` runs the same Trivy release through a digest-pinned
  `aquasecurity/trivy-action` step with `version: v0.70.0`, the same
  `--severity HIGH,CRITICAL` gate, the same `.trivyignore`, and the same scope
  (`TRIVY_INCLUDE_DEV_DEPS: "true"` in the step's environment, the action's
  equivalent of `--include-dev-deps`).
- `pnpm run doctor` parses the Trivy step of the workflow (not a substring
  search a comment could satisfy) and fails if the pinned version or the
  dev-dependency scope stops agreeing with the local script, so the two cannot
  drift apart. Bump them together, along with the constants in
  `scripts/doctor.js`.
- `pnpm run doctor` also *warns*, without failing, when the scanner cannot run
  on the current machine, and prints how to obtain the pinned version.

The command prints `trivy version` after the scan, so the scanner version and
the vulnerability database timestamp appear in the output and a saved result can
be dated as release evidence. The repository is mounted read-only into the
scanner container; only the named volume holding the vulnerability database is
writable.

The scan covers the whole locked dependency graph, not only production
dependencies. High and critical findings are release blockers unless a
maintainer documents why the affected dependency is unreachable and records a
time-bounded follow-up; accepted advisories are recorded in `.trivyignore` with
that reasoning and a `revisit by YYYY-MM-DD` marker. `pnpm run doctor` fails
when the marker is missing, the date is not a real calendar day, has passed, or
lies more than two years ahead, so an exception cannot silently become
permanent: re-assess the advisory and either drop the entry or record a new
date. A development-only vulnerability that can execute in CI, release
packaging, docs generation, or local developer install/build paths is
release-relevant even though it is not part of package runtime dependencies.

Dependabot and the Dependency Review workflow are review inputs alongside this
gate, not substitutes for it.

## Pull Request Dependency Review

`.github/workflows/dependency-review.yml` runs GitHub's Dependency Review Action
on pull requests. It fails dependency changes that introduce high or critical
vulnerabilities in runtime, development, or unknown scopes.

Every pull request that changes `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `.npmrc`, workflow dependencies, or release tooling must
include:

- The reason for the dependency change.
- The relevant lockfile diff reviewed by a maintainer.
- The output of `pnpm install --frozen-lockfile --ignore-scripts`.
- The output of `pnpm run audit:supply-chain`.
- Any new build-script allowlist entries and why they are needed.

## Overrides

pnpm overrides are allowed only for narrow, documented security or compatibility
fixes. Prefer removing the override once the direct dependency has released a
compatible fixed version.

`pnpm-workspace.yaml` is the source of truth for the inventory below. Keep the
two in step when an override is added or removed: `pnpm run doctor` fails when
this table lists an override that no longer exists, or omits one that does.

<!-- overrides:start -->

### Security patch floors

These force the locked graph past a known high or critical advisory. Remove each
one once every dependent has released a compatible fixed version.

| Override | Resolves to | Reason |
| --- | --- | --- |
| `braces@<3.0.3` | `3.0.3` | Patched release for the `braces` redos advisory. |
| `brace-expansion@<1.1.20` | `1.1.20` | CVE-2026-102276 / CVE-2026-102278 recursion DoS (high), brace-expansion 1 line. |
| `brace-expansion@>=2.0.0 <2.1.6` | `2.1.6` | CVE-2026-102276 / CVE-2026-102278 recursion DoS (high), brace-expansion 2 line. |
| `brace-expansion@>=5.0.0 <5.0.11` | `5.0.11` | CVE-2026-102276 / CVE-2026-102278 recursion DoS (high), brace-expansion 5 line. |
| `undici@<6.28.1` | `6.28.1` | CVE-2026-19534 request handling (high) and the earlier Undici 6 advisories (reached through `@actions/http-client` in the semantic-release npm plugin). |
| `undici@>=7.0.0 <7.29.1` | `7.29.1` | CVE-2026-13697 / CVE-2026-19534 / CVE-2026-84961 incl. TLS certificate validation bypass in `BalancedPool` (high), Undici 7 line via `@semantic-release/github`; also the version required for Node 20 compatibility in CI. |
| `fast-uri@<3.1.7` | `3.1.7` | CVE-2026-84292 / CVE-2026-84394 authority injection and host confusion (high), plus the earlier URI parsing fixes; also quarantine-excluded so a fix can land inside the seven-day window. |
| `postcss@<8.5.18` | `8.5.18` | Patched release for GHSA-r28c-9q8g-f849; quarantine-excluded for the security update. |
| `svgo@>=3.0.0 <3.3.5` | `3.3.5` | Patched 3.x release for GHSA-2p49-hgcm-8545 and GHSA-w27v-7q3p-w38r (removeScripts executable links, high); quarantine-excluded for the security update. |
| `shell-quote@<1.11.0` | `1.11.0` | CVE-2026-102422 command injection through a line terminator after a comment token (critical). |
| `handlebars@<4.7.10` | `4.7.10` | CVE-2026-106445 / CVE-2026-106446 JavaScript injection (critical); release tooling via `conventional-changelog-writer` in the semantic-release commit analyzer and release-notes generator. |
| `ws@>=7.0.0 <7.5.11` | `7.5.11` | Memory-exhaustion DoS advisory (high), ws 7 line. |
| `ws@>=8.0.0 <8.21.0` | `8.21.0` | Memory-exhaustion DoS advisory (high), ws 8 line. |
| `serialize-javascript` | `7.0.5` | Patched version for GHSA-5c6j-r48x-rmvq in the Docusaurus/webpack graph. |

### Development-tooling patch floors

High or critical advisories reachable only through dev tooling (docs build, dev
server, release tooling). They still fail the Trivy `HIGH,CRITICAL` gate, and
they execute on developer and CI machines, so they are remediated the same way.

| Override | Resolves to | Reason |
| --- | --- | --- |
| `http-proxy-middleware@<2.0.10` | `2.0.10` | Patch floor, 2.x line. |
| `http-proxy-middleware@>=4.0.0 <4.1.1` | `4.2.0` | Patch floor, 4.x line. |
| `linkify-it@<5.0.1` | `5.0.2` | Patch floor. |
| `tmp@<0.2.6` | `0.2.7` | Patch floor. |
| `websocket-driver@<0.7.5` | `0.7.5` | Patch floor. |
| `@babel/plugin-transform-modules-systemjs@<7.29.4` | `7.29.4` | Patch floor; also quarantine-excluded so the fix can land inside the seven-day window. |
| `@babel/core@<7.29.6` | `7.29.7` | Patch floor. |
| `qs@>=6.11.1 <6.15.2` | `6.15.3` | Patch floor. |
| `cookie@<0.7.0` | `0.7.2` | Patch floor. |
| `markdown-it@>=14.0.0 <14.3.3` | `14.3.3` | CVE-2026-111758 / CVE-2026-111759 DoS (high); docs build via `typedoc`. |
| `joi@<17.13.7` | `17.13.7` | CVE-2026-92599 validation DoS (high), retaining the Joi 17 line. |
| `launch-editor@<2.14.2` | `2.14.2` | CVE-2026-112942 command injection through an unvalidated file path (high); patch floor. |
| `webpack-dev-server@<5.2.5` | `5.2.6` | Patch floor. |
| `uuid@<11.1.1` | `11.1.1` | Patch floor. |
| `js-yaml@>=3.0.0 <3.15.2` | `3.15.2` | GHSA-2883-xcg3-v3hh and GHSA-5p4m-2wfm-xmqj parsing DoS (high), js-yaml 3 line. |
| `js-yaml@>=4.0.0 <4.3.2` | `4.3.2` | GHSA-2883-xcg3-v3hh and GHSA-5p4m-2wfm-xmqj parsing DoS (high), js-yaml 4 line. |
| `nanoid@<3.3.18` | `3.3.18` | GHSA-2v37-7h3g-55p8 and GHSA-28wg-ghj8-5hjv DoS (high); via the Docusaurus/webpack graph. |
| `compression@<1.8.2` | `1.8.2` | CVE-2026-87776 memory leak on prematurely closed responses (high). |
| `follow-redirects@<1.16.1` | `1.16.1` | CVE-2026-111755 / CVE-2026-111756 cross-origin credential disclosure (high). |
| `http-cache-semantics@<4.3.0` | `4.3.0` | Source-backed upstream release fixing Vary handling (CVE-2026-93750); the separate max-stale report CVE-2026-93748 against 4.2.0 is [disputed by the maintainer](https://github.com/kornelski/http-cache-semantics/issues/56). |
| `image-size@>=2.0.0 <2.0.4` | `2.0.4` | CVE-2025-71329 / CVE-2025-71330 image parser infinite loops (high), plus ICO/CUR validation. Verified against the [Codeberg fix](https://codeberg.org/image-size/image-size/commit/e6e83a5578961de81f6d5834d90fb7430d8f29a5) and [2.0.4 release commit](https://codeberg.org/image-size/image-size/commit/763bf4e92e36dd903e0f7d0b0d4d5a43d0e3d5cb); replaces the previous advisory exceptions. |
| `proxy-addr@<2.0.8` | `2.0.8` | CVE-2026-90711 proxy address validation bypass (critical). |
| `source-map-js@<1.2.2` | `1.2.2` | CVE-2026-93749 source map parsing DoS (high). |
| `tinypool@<2.1.2` | `2.1.2` | CVE-2026-104848 / CVE-2026-104849 prototype pollution gadgets (critical). Docusaurus uses the default export and worker_threads API retained in 2.x; validate with the docs build. |
| `webpack-dev-middleware@>=7.0.0 <7.4.6` | `7.4.6` | CVE-2026-76844 directory traversal (high), retaining the webpack middleware 7 line. |

### Resolution pins

Version pins that hold part of the graph on a single reviewed release, either
for compatibility or to keep resolution off releases that are still inside the
seven-day `minimumReleaseAge` quarantine.

| Override | Resolves to | Reason |
| --- | --- | --- |
| `@docusaurus/core` | `3.10.1` | Holds the docs stack on one reviewed Docusaurus release. |
| `@docusaurus/mdx-loader` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/module-type-aliases` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-content-blog` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-content-docs` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-content-pages` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-css-cascade-layers` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-debug` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-google-analytics` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-google-gtag` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-google-tag-manager` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-sitemap` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/plugin-svgr` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/preset-classic` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/theme-classic` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/theme-common` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/theme-live-codeblock` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/theme-search-algolia` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/types` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/utils` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/utils-common` | `3.10.1` | Docusaurus release-line pin. |
| `@docusaurus/utils-validation` | `3.10.1` | Docusaurus release-line pin. |
| `baseline-browser-mapping` | `2.11.21` | Keeps browser-target resolution on reviewed metadata; the floor browserslist 4.28.x requires. |
| `browserslist` | `4.28.9` | Keeps browser-target resolution on reviewed metadata; 4.28.7 is the patched floor for GHSA-73wf-gq98-2v4g and GHSA-c83g-rgw3-j3cx (prototype pollution and DoS, high). |
| `es-module-lexer` | `2.0.0` | Holds webpack's lexer dependency on a reviewed version. |
| `express` | `5.2.1` | Holds the docs/dev-server graph on one reviewed Express release. |
| `loader-runner` | `4.3.1` | Holds webpack's loader runner on a reviewed version. |
| `schema-utils@4>ajv` | `8.17.1` | Keeps modern schema validation on a reviewed Ajv 8 version while avoiding loader stacks that require Ajv 6. |
| `webpack` | `5.107.1` | Holds the whole graph on the reviewed webpack version declared in the root `devDependencies`. |
| `webpack-sources` | `3.3.3` | Holds webpack on a reviewed source-map dependency. |

<!-- overrides:end -->
