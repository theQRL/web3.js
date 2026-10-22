# Threat Model

This threat model covers the QRL Web3.js fork as a JavaScript/TypeScript
library, its published npm packages, and the repository controls used to build
and release those packages. It is paired with `docs/architecture-map.md`, which
maps the packages and runtime flows referenced below.

## Security Objectives

- Preserve local seed, keystore password, wallet, and signing-material
  confidentiality.
- Ensure local signing creates transactions/messages exactly matching the
  user's intent.
- Treat RPC providers, browser-injected providers, dApps, contract ABIs, QRNS
  responses, and registry/package inputs as untrusted.
- Keep package releases reproducible from reviewed source and CI-controlled
  build steps.
- Prevent accidental inclusion of secrets, generated artefacts, dependency
  manager files, or local build outputs in source or release packages.

## Assets

- QRL seeds, extended seeds, descriptors, public keys, keystore JSON, keystore
  passwords, wallet entries, signatures, and locally signed raw transactions.
- User transaction intent: recipient, sender, value, nonce, gas, fees, chain ID,
  network ID, data/input, access lists, and contract method arguments.
- Provider responses used to populate or verify transactions: nonce, chain ID,
  network ID, gas estimates, fee data, blocks, receipts, logs, QRNS registry
  data, and contract call results.
- Published npm package contents, package metadata, lockfile, release tarballs,
  SBOMs, checksums, and GitHub/npm provenance.
- Repository CI settings, protected branches, release environment approvals,
  GitHub Actions permissions, and dependency update configuration.

## Trust Boundaries

| Boundary | Trusted side | Untrusted side | Main code paths |
| --- | --- | --- | --- |
| Browser app to library | Library source and typed APIs | Web page code, injected providers, browser storage, user input | `packages/web3/src/web3.ts`, `packages/web3-qrl-accounts/src/wallet.ts` |
| Node app to library | Library source and typed APIs | Application input, local filesystem paths, environment configuration | Provider packages, account/keystore helpers |
| Library to RPC provider | Local formatting/validation and request manager | HTTP/WS/IPC endpoint, remote node, injected EIP-1193 provider | `packages/web3-core/src/web3_request_manager.ts`, provider packages, `web3-rpc-methods` |
| Library to dApp/contract data | ABI/contract wrappers and validators | ABI JSON, contract addresses, event logs, revert data, QRNS records | `web3-qrl-contract`, `web3-qrl-abi`, `web3-qrl-qrns` |
| Local signing boundary | Seed validation, wallet wrapper, transaction classes | Transaction objects, seed strings, keystore JSON/passwords from callers | `web3-qrl-accounts`, `web3-qrl/src/utils/transaction_builder.ts` |
| Dependency boundary | Reviewed lockfile and pnpm policy | npm registry, transitive packages, install scripts | `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `docs/supply-chain-security.md` |
| Release boundary | Protected CI/release workflow and reviewed source | Contributor PRs, compromised tokens, package registry, generated artefacts | `.github/workflows/*.yml`, `scripts/release/`, `docs/repository-governance.md` |

## Threat Actors

- Malicious web page or dApp embedding the library.
- Malicious or compromised browser-injected provider.
- Malicious, compromised, or out-of-sync QRL RPC node.
- Malicious contract, ABI, event log, QRNS registry, or resolver response.
- Local attacker with access to browser storage, process memory, filesystem, or
  developer machine configuration.
- Compromised npm package, dependency maintainer, package registry, or registry
  transport path.
- Malicious contributor, compromised GitHub account, compromised CI runner, or
  misconfigured release environment.

## Threat Scenarios And Controls

### Browser Consumers

Threats:

- A dApp passes misleading transaction objects, ABI data, QRNS names, or provider
  responses into the library.
- Browser storage exposes saved wallet data to same-origin script, XSS, browser
  extensions, or a compromised host page.
- An injected provider lies about chain/network state, account lists, gas/fee
  data, receipts, logs, or signatures.

Current controls:

- The library keeps browser provider interaction behind `Web3Context` and
  `Web3RequestManager` rather than spreading transport code through packages.
- Wallet persistence is explicit through `web3-qrl-accounts`; keystore
  encryption/decryption uses Argon2id and AES from `@theqrl/qrl-cryptography`.
- Address, bytes, block, and transaction field validation is centralized through
  `@theqrl/web3-validator` and package schemas.
- The runtime packages are bundler-safe: no publishable package other than the
  Node-only `@theqrl/web3-providers-ipc` loads a Node built-in module (the
  event emitter is a dependency-free implementation in `@theqrl/web3-utils`),
  so Vite/esbuild/Rollup consumers get working code rather than an empty
  polyfill stub. `scripts/check-package-dependencies.js` fails `pnpm run
  doctor` and the release inspection if a built-in import is reintroduced.

Residual risks:

- Browser storage is not a secure enclave. Host-page compromise can expose
  keystores, passwords entered into the page, unsigned transaction intent, and
  wallet metadata.
- The library cannot independently prove that a browser-injected provider or
  remote node returned canonical chain data.

### Node Consumers

Threats:

- Applications pass unvalidated file paths, IPC socket paths, transaction data,
  keystore JSON, passwords, or provider URLs.
- Local process memory, logs, crash dumps, shell history, or debug output expose
  seeds, passwords, keystores, or raw signed transactions.
- IPC connections target the wrong local node socket or a malicious local
  service.

Current controls:

- Provider URL/path validation exists in HTTP, WebSocket, and IPC provider
  constructors.
- Local key operations are concentrated in `@theqrl/web3-qrl-accounts`, making
  audit and defensive review tractable.
- Repository hygiene rejects local `.secrets.json`, Yarn artefacts, copied
  files, broken symlinks, and tracked generated artefacts.

Residual risks:

- Node applications are responsible for protecting process memory, keystore
  files, environment variables, and filesystem permissions.
- IPC security depends on local OS permissions and correct socket selection.

### Malicious RPC Provider

Threats:

- Provider returns false nonce, chain ID, network ID, gas estimate, fee data, or
  QRNS registry address, causing mispriced, replayable, delayed, or unintended
  transactions.
- Provider censors, reorders, drops, or fabricates receipts, logs,
  subscriptions, and confirmation events.
- Provider returns malformed JSON-RPC responses to trigger parser, formatter, or
  error-handling bugs.
- Provider-controlled remote signing methods sign or submit data different from
  the caller's expectation.

Current controls:

- `Web3RequestManager` normalizes JSON-RPC payloads and response/error handling.
- Low-level RPC wrappers validate many typed parameters before requests are sent.
- Higher-level QRL wrappers format returned numbers/bytes through shared
  schemas and utilities.
- Local signing is separated from remote `qrl_sign`, `qrl_signTransaction`, and
  `qrl_sendTransaction` RPC paths.

Residual risks:

- RPC data is authoritative only to the degree the selected node/provider is
  trusted. Consumers that require high assurance should compare multiple
  providers or run their own node.
- Gas, fee, nonce, block, receipt, and QRNS data returned by a malicious
  provider can still influence caller decisions before final signing.

### Malicious dApp Input

Threats:

- Transaction objects include conflicting `data` and `input`, unexpected sender
  or recipient fields, oversized numeric values, wrong chain/network data, or
  local-wallet indexes that select a different account.
- ABI JSON or contract method arguments trigger incorrect selector encoding,
  event topic matching, revert decoding, or parameter coercion.
- QRNS names or resolver records return malicious addresses or content hashes.

Current controls:

- Transaction population checks `data`/`input` consistency, fills missing fields
  in a defined order, and throws on missing local wallet accounts.
- Transaction classes validate integer bounds, gas data fee rules, signatures,
  and sender derivation.
- ABI and contract encoding are centralized in `web3-qrl-abi`,
  `web3-qrl-contract`, and `@theqrl/abi`.

Residual risks:

- The library cannot determine user intent from arbitrary application-provided
  transaction or ABI data. Callers must show users the normalized transaction
  before signing.
- QRNS resolution is only as trustworthy as the selected network, registry,
  resolver, and provider responses.

### Local Key Handling

Threats:

- Seeds, extended seeds, descriptors, keystore passwords, decrypted key material,
  signatures, or raw transactions leak through storage, logs, exceptions,
  memory, or application telemetry.
- Malformed seed/public-key input bypasses length or format validation.
- Transaction signing signs a hash over fields different from the serialized
  transaction submitted to the provider.
- Keystore encryption parameters are downgraded or malformed keystore JSON is
  accepted.

Current controls:

- Seed and public-key parsing enforce hex/byte conversion and expected lengths.
- Signing and verification route through typed wrappers for `@theqrl/wallet.js`
  and `@theqrl/mldsa87`.
- Transaction signing attaches descriptor, signature, and public key values and
  verifies signed transaction validity before returning results.
- Keystore JSON is validated against the account keystore schema before
  decryption.

Residual risks:

- JavaScript runtimes do not provide reliable memory zeroization for sensitive
  values.
- Application code controls password handling and may accidentally log or retain
  secrets.
- The signing path remains a primary audit target because it defines the
  transaction intent bytes.

### Package Registry And Dependency Compromise

Threats:

- A malicious dependency version, compromised maintainer, install script, or
  exotic dependency specifier executes code during install, build, docs, tests,
  or release packing.
- A new dependency release is published and compromised before the community can
  detect it.
- Lockfile or package metadata changes smuggle unintended transitive code into
  release artefacts.

Current controls:

- pnpm install policy enforces a seven-day minimum release age, blocks exotic
  subdependencies, enables strict dependency-build handling, and uses an
  allowlist for reviewed build-script dependencies.
- `pnpm run audit:supply-chain` (a pinned Trivy lockfile scan failing on
  `HIGH,CRITICAL`), Dependabot, and GitHub Dependency Review gate high/critical
  dependency changes.
- Pull requests that change package manager or dependency files must document
  lockfile review and install/audit outputs.
- Package inspection rejects forbidden dependency-manager, secret, generated, and
  copied-file artefacts in npm pack output, and cross-checks the built output
  against each manifest so a package never depends on hoisting to resolve a
  module it does not declare.
- `pnpm run doctor` rejects `allowBuilds` entries for packages absent from the
  lockfile and `.trivyignore` exceptions without a current revisit date.
- The release pipeline publishes the GitHub releases only after every tarball
  is on npm; the npm publish loop is idempotent so a failed run is re-driven
  rather than recovered by hand (`RELEASE.md`).

Residual risks:

- Dependency audit databases are incomplete and time-lagged.
- Development dependencies can still affect docs, CI, package inspection, and
  release packaging, so they must be treated as release-relevant when executable
  in those paths.

### Release Pipeline

Threats:

- A malicious contributor changes source, package manifests, workflow files, or
  release scripts to publish unintended packages.
- A compromised GitHub account bypasses review or release approval controls.
- CI publishes from unreviewed source, a fork, a non-main branch, or with a
  long-lived npm token.
- Release tarballs include generated junk, secrets, local artefacts, wrong
  entrypoints, or stale `gitHead` metadata.

Current controls:

- Release publishing is designed for `theQRL/web3.js` on `main`, guarded by
  required CI, the `RELEASES_ENABLED` variable, protected `npm-publish`
  environment approval, and npm trusted publishing.
- Branch protection and CODEOWNERS expectations are documented in
  `docs/repository-governance.md`.
- Release inspection checks package entrypoints and forbidden pack contents
  before packing/publishing.
- CI includes actionlint, dependency review, supply-chain audit, docs build,
  package inspection, package packing, and tarball smoke tests.

Residual risks:

- Some controls require upstream repository configuration outside this working
  tree before the first audited release.
- CI runner compromise and maintainer account compromise remain high-impact
  scenarios; protected environments and least-privilege Actions permissions
  reduce but do not eliminate them.

## Open Audit Questions

Closed by the third audit pass (2026-10-22, section 12.5 of the audit report):

- The signing preimage and the cross-implementation vectors. A Go harness
  (`govec`, kept with the audit evidence outside the repository) was built
  against two go-qrl trees from the module cache, `b92884a` (2026-06-08) and
  `f3864c4` (2026-10-20), plus go-qrllib v0.8.0/v0.10.0 and the Hyperion
  compiler source, and generated deterministic vectors for address derivation
  from the extended seed, the typed transaction preimage
  (`0x02 ‖ RLP[...]`) and its keccak, deterministic ML-DSA-87 signatures, the
  signed raw encoding, transaction hash and sender recovery, intrinsic gas and
  chain parameters, `\x19QRL Signed Message:\n` hashing, typed-data hashing,
  keystore files (both directions) and the address checksum. 145 of 145
  comparisons with the library matched, Go verified the library's artefacts in
  the reverse direction, and the checked-out go-qrl tree of 2026-04-09 was
  identified as a previous generation and excluded as a reference. The
  remaining divergences are tracked as findings, not open questions: go-qrl's
  `--lightkdf` keystores are rejected by the stricter Argon2id bound (L-72),
  indexed array/tuple event filters (L-71), reply fields the formatter drops
  (L-73) and the non-empty `extraParams` acceptance (L-15).

Still open:

- Keep the vectors current: regenerate them against each new go-qrl release
  that touches `core/types`, `accounts/keystore` or `signer/core/apitypes`,
  and turn the harness output into committed fixtures once the Go module
  versions are pinned in-repo.
- Decide which integration/e2e provider checks are required before release
  freeze and which remain scheduled/manual.
- Re-run tarball smoke tests and local `act` install/package paths when Docker
  registry access is stable.
- Finalize upstream GitHub branch protection, protected environment, trusted
  publishing, secret scanning, and Dependabot/security settings.

## Review Cadence

Update this document when:

- A package is added, removed, renamed, or given a new public entrypoint.
- Signing, keystore, transaction serialization, provider, ABI, contract, QRNS,
  dependency, or release-publishing behavior changes.
- A new audit finding changes the asset model, trust boundaries, controls, or
  residual risks.
