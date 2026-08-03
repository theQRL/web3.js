# Supply Chain Security

This repository uses pnpm 10 with a committed `pnpm-lock.yaml`. Dependency
changes must be reviewed as code changes because they affect the release
artefacts and the transitive code executed during docs, package, and test
builds.

## Install Policy

The workspace install policy is defined in `pnpm-workspace.yaml`:

- `minimumReleaseAge: 10080` prevents installing package versions published in
  the last seven days.
- `minimumReleaseAgeExclude` is the reviewed list of packages exempt from that
  quarantine: `@theqrl/*` (first-party releases) plus individual packages whose
  security-only patch releases are needed before the window elapses.
- `blockExoticSubdeps: true` blocks transitive dependencies that resolve through
  exotic specifiers.
- `strictDepBuilds: true` fails installs when dependencies have unreviewed build
  scripts.
- `allowBuilds` is the reviewed allowlist of dependencies whose install-time
  build scripts are expected for the current lockfile.

Do not widen `allowBuilds`, add pnpm overrides, or relax these settings without
explaining the reason in the pull request.

Known install warnings and the current remediation plan are tracked in
[`docs/dependency-warning-triage.md`](dependency-warning-triage.md).

## Audit Gate

The required local and CI audit command is:

```sh
pnpm run audit:supply-chain
```

npm's `/security/audits` endpoint is retired and answers HTTP 410, so `pnpm
audit` cannot be the gate. The gate scans `pnpm-lock.yaml` with Trivy instead
and fails on high and critical vulnerabilities.

Local and CI runs are pinned to the same scanner:

- The local script runs Trivy `0.70.0` from a digest-pinned container image, so
  the gate is reproducible without a separate Trivy install and cannot silently
  pick up a different scanner version. Docker is the only prerequisite; if it is
  missing, the script prints the pinned image and the equivalent flags instead
  of failing with `command not found`.
- `.github/workflows/ci.yml` runs the same Trivy release through a digest-pinned
  `aquasecurity/trivy-action` step with `version: v0.70.0`, the same
  `--severity HIGH,CRITICAL` gate, and the same `.trivyignore`.
- `pnpm run doctor` fails if the pinned version in the script and the pinned
  version in the workflow stop agreeing, so the two cannot drift apart. Bump
  them together, along with the constants in `scripts/doctor.js`.
- `pnpm run doctor` also *warns*, without failing, when the scanner cannot run
  on the current machine, and prints how to obtain the pinned version.

The command prints `trivy version` after the scan, so the scanner version and
the vulnerability database timestamp appear in the output and a saved result can
be dated as release evidence.

The scan covers the whole locked dependency graph, not only production
dependencies. High and critical findings are release blockers unless a
maintainer documents why the affected dependency is unreachable and records a
time-bounded follow-up; accepted advisories are recorded in `.trivyignore` with
that reasoning. A development-only vulnerability that can execute in CI, release
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
| `brace-expansion@<1.1.18` | `1.1.18` | CVE-2026-69152 unbounded intermediate-array DoS (high), brace-expansion 1 line. |
| `brace-expansion@>=2.0.0 <2.1.4` | `2.1.4` | CVE-2026-69152 unbounded intermediate-array DoS (high), brace-expansion 2 line. |
| `brace-expansion@>=5.0.0 <5.0.9` | `5.0.9` | CVE-2026-69152 unbounded intermediate-array DoS (high), brace-expansion 5 line. |
| `undici@<6.27.0` | `6.27.0` | Patch floor for the Undici 6 line. |
| `undici@>=7.0.0 <7.28.0` | `7.28.0` | Patch floor for the Undici 7 line; also the version required for Node 20 compatibility in CI. |
| `fast-uri@<3.1.5` | `3.1.5` | Patched release for GHSA-7p8r-x3mc-p8w7; also quarantine-excluded so the fix can land inside the seven-day window. |
| `postcss@<8.5.18` | `8.5.18` | Patched release for GHSA-r28c-9q8g-f849; quarantine-excluded for the security update. |
| `svgo@>=3.0.0 <3.3.4` | `3.3.4` | Patched 3.x release for GHSA-2p49-hgcm-8545; quarantine-excluded for the security update. |
| `shell-quote@<1.8.4` | `1.9.0` | Newline-escaping advisory (critical). |
| `ws@>=7.0.0 <7.5.11` | `7.5.11` | Memory-exhaustion DoS advisory (high), ws 7 line. |
| `ws@>=8.0.0 <8.21.0` | `8.21.0` | Memory-exhaustion DoS advisory (high), ws 8 line. |
| `path-to-regexp` | `0.1.13` | Patched version for GHSA-37ch-88jc-xwx2. |
| `serialize-javascript` | `7.0.5` | Patched version for GHSA-5c6j-r48x-rmvq in the Docusaurus/webpack graph. |

### Development-tooling patch floors

High or critical advisories reachable only through dev tooling (docs build, dev
server, release tooling). They still fail the Trivy `HIGH,CRITICAL` gate, and
they execute on developer and CI machines, so they are remediated the same way.

| Override | Resolves to | Reason |
| --- | --- | --- |
| `adm-zip@<0.6.0` | `0.6.0` | GHSA-xcpc-8h2w-3j85 path traversal (high); via hardhat. |
| `http-proxy-middleware@<2.0.10` | `2.0.10` | Patch floor, 2.x line. |
| `http-proxy-middleware@>=4.0.0 <4.1.1` | `4.2.0` | Patch floor, 4.x line. |
| `linkify-it@<5.0.1` | `5.0.2` | Patch floor. |
| `tmp@<0.2.6` | `0.2.7` | Patch floor. |
| `websocket-driver@<0.7.5` | `0.7.5` | Patch floor. |
| `@babel/plugin-transform-modules-systemjs@<7.29.4` | `7.29.4` | Patch floor; also quarantine-excluded so the fix can land inside the seven-day window. |
| `@babel/core@<7.29.6` | `7.29.7` | Patch floor. |
| `qs@>=6.11.1 <6.15.2` | `6.15.3` | Patch floor. |
| `cookie@<0.7.0` | `0.7.2` | Patch floor. |
| `markdown-it@<14.2.0` | `14.3.0` | Patch floor. |
| `joi@<17.13.4` | `17.13.4` | Patch floor. |
| `launch-editor@<2.14.1` | `2.14.1` | Patch floor. |
| `webpack-dev-server@<5.2.5` | `5.2.6` | Patch floor. |
| `uuid@<11.1.1` | `11.1.1` | Patch floor. |
| `js-yaml@>=3.0.0 <4.0.0` | `3.15.0` | Patch floor, js-yaml 3 line. |
| `js-yaml@>=4.0.0 <4.2.0` | `4.3.0` | Patch floor, js-yaml 4 line. |

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
| `baseline-browser-mapping` | `2.8.9` | Keeps browser-target resolution on reviewed metadata. |
| `browserslist` | `4.26.3` | Keeps browser-target resolution on reviewed metadata. |
| `es-module-lexer` | `2.0.0` | Holds webpack's lexer dependency on a reviewed version. |
| `express` | `5.2.1` | Holds the docs/dev-server graph on one reviewed Express release. |
| `loader-runner` | `4.3.1` | Holds webpack's loader runner on a reviewed version. |
| `schema-utils@4>ajv` | `8.17.1` | Keeps modern schema validation on a reviewed Ajv 8 version while avoiding loader stacks that require Ajv 6. |
| `socks` | `2.8.7` | Holds npm registry proxy support on a reviewed transitive version. |
| `webpack` | `5.107.1` | Holds the whole graph on the reviewed webpack version declared in the root `devDependencies`. |
| `webpack-sources` | `3.3.3` | Holds webpack on a reviewed source-map dependency. |

<!-- overrides:end -->
