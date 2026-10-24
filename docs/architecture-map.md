# Architecture Map

This map is an audit navigation aid for the QRL Web3.js monorepo. It focuses on
source packages, public API entrypoints, local package dependency direction, and
the paths that handle signing, key material, providers, RPC, ABI/contract
encoding, docs generation, and release packaging.

Generated `lib/`, `dist/`, coverage, and tarball output are out of source-audit
scope. See `docs/artifact-hygiene.md` for the generated artefact policy.

## Package Layers

The workspace is structured in four practical layers:

1. Foundation: `@theqrl/web3-types`, `@theqrl/web3-errors`,
   `@theqrl/web3-validator`, `@theqrl/web3-utils`, and `@theqrl/abi`.
2. Core transport: `@theqrl/web3-providers-*`, `@theqrl/web3-core`, and
   `@theqrl/web3-rpc-methods`.
3. QRL domain modules: `@theqrl/web3-qrl-accounts`, `@theqrl/web3-qrl-abi`,
   `@theqrl/web3-qrl`, `@theqrl/web3-qrl-contract`,
   `@theqrl/web3-qrl-qrns`, and `@theqrl/web3-net`.
4. User-facing aggregate and tooling: `@theqrl/web3`, docs, release scripts,
   package templates, and the plugin example.

Local dependency direction should flow from higher layers to lower layers. The
main aggregate package, `@theqrl/web3`, intentionally depends on almost every
runtime package to assemble the default user API.

## Package Map

| Package | Public entrypoint | Local dependencies | Primary audit focus |
| --- | --- | --- | --- |
| `@theqrl/web3` | `packages/web3/src/index.ts`, `packages/web3/src/web3.ts` | Core, providers, QRL, contract, accounts, ABI, QRNS, net, utils, validator, types, errors | Umbrella API assembly, shared context propagation, account wallet wiring, browser bundle config |
| `@theqrl/web3-qrl` | `packages/web3-qrl/src/index.ts`, `packages/web3-qrl/src/web3_qrl.ts` | Core, net, WS provider, accounts, QRL ABI, RPC methods, utils, validator, types, errors | QRL RPC facade, transaction population, local wallet transaction signing and send flow, subscriptions |
| `@theqrl/web3-qrl-accounts` | `packages/web3-qrl-accounts/src/index.ts` | QRL crypto packages, wallet.js, utils, validator, types, errors | Seed/public-key parsing, account creation, keystore encryption, ML-DSA signing, transaction serialization/signature verification |
| `@theqrl/web3-qrl-contract` | `packages/web3-qrl-contract/src/index.ts`, `packages/web3-qrl-contract/src/contract.ts` | Core, QRL, QRL ABI, utils, validator, types, errors | Contract method/event binding, ABI encoding/decoding, send/call/estimate paths, log subscriptions |
| `@theqrl/web3-qrl-abi` | `packages/web3-qrl-abi/src/index.ts` | `@theqrl/abi`, wallet.js, utils, validator, types, errors | QRVM ABI encoding/decoding facade, QRL typed-data encoding, contract error decoding |
| `@theqrl/abi` | `packages/abi/src/index.ts` | Utils | Foundational ABI coder fragments/interface compatibility |
| `@theqrl/web3-core` | `packages/web3-core/src/index.ts` | HTTP/WS providers, utils, validator, types, errors | `Web3Context`, request manager, batch manager, subscription manager, plugin context sharing |
| `@theqrl/web3-rpc-methods` | `packages/web3-rpc-methods/src/index.ts` | Core, validator, types | Raw `qrl_*` and `net_*` request wrappers and parameter validation |
| `@theqrl/web3-providers-http` | `packages/web3-providers-http/src/index.ts` | Utils, types, errors | HTTP JSON-RPC POST transport, URL validation, response/error handling |
| `@theqrl/web3-providers-ws` | `packages/web3-providers-ws/src/index.ts` | Utils, types, errors | WebSocket transport, reconnect behavior, response chunk parsing, subscription support |
| `@theqrl/web3-providers-ipc` | `packages/web3-providers-ipc/src/index.ts` | Utils, types, errors | Node IPC transport, socket path validation, reconnect behavior |
| `@theqrl/web3-net` | `packages/web3-net/src/index.ts`, `packages/web3-net/src/net.ts` | Core, RPC methods, utils, types | Network ID, peer count, listening RPC wrappers and formatting |
| `@theqrl/web3-qrl-qrns` | `packages/web3-qrl-qrns/src/index.ts`, `packages/web3-qrl-qrns/src/qrns.ts` | Core, net, QRL, contract, utils, validator, types, errors | QRNS registry/resolver contract calls, network detection, sync checks |
| `@theqrl/web3-utils` | `packages/web3-utils/src/index.ts` | QRL cryptography, validator, types, errors | Bytes/number conversion, hashing, JSON-RPC payload helpers, formatter, socket base provider |
| `@theqrl/web3-validator` | `packages/web3-validator/src/index.ts` | QRL cryptography, types, errors | Shared validation schemas and address/data validation rules |
| `@theqrl/web3-types` | `packages/web3-types/src/index.ts` | none | Shared public TypeScript contracts for APIs, providers, wallets, transactions, ABI, contracts |
| `@theqrl/web3-errors` | `packages/web3-errors/src/index.ts` | Types | Shared error taxonomy, RPC error mapping, transaction/contract/account errors |
| `@theqrl/web3-packagetemplate` | `tools/web3-packagetemplate/src/index.ts` | none | Package scaffolding template, not runtime-critical |
| `@theqrl/web3-plugin-example` | `tools/web3-plugin-example/src/index.ts` | Core, QRL ABI, contract, utils, types | Example plugin RPC and contract wrappers |
| `@theqrl/eslint-config-base-web3` | `tools/eslint-config-base-web3/index.cjs` | none | Shared lint configuration; `"private": true`, never published, consumed through `workspace:` links only |

## Critical Runtime Flows

### Provider And RPC Flow

1. Users pass a provider string or provider object into `Web3`, `Web3QRL`,
   `Net`, `Contract`, or `QRNS`.
2. `Web3Context` stores the shared context in
   `packages/web3-core/src/web3_context.ts`.
3. `Web3RequestManager` in `packages/web3-core/src/web3_request_manager.ts`
   autodetects `http(s)://` and `ws(s)://` string providers and dispatches JSON
   RPC payloads through the selected provider.
4. HTTP transport is implemented in
   `packages/web3-providers-http/src/index.ts`; WebSocket and IPC transports
   are implemented in `packages/web3-providers-ws/src/index.ts` and
   `packages/web3-providers-ipc/src/index.ts`.
5. Raw RPC method names and low-level parameter validation live in
   `packages/web3-rpc-methods/src/qrl_rpc_methods.ts` and
   `packages/web3-rpc-methods/src/net_rpc_methods.ts`.
6. Higher-level formatting and response normalization lives in
   `packages/web3-qrl/src/rpc_method_wrappers.ts` and
   `packages/web3-net/src/rpc_method_wrappers.ts`.

### Signing And Key Material Flow

1. User seed input enters through `packages/web3-qrl-accounts/src/account.ts`,
   `packages/web3-qrl-accounts/src/wallet.ts`, or through
   `packages/web3-qrl/src/utils/transaction_builder.ts` when a send flow has a
   local seed.
2. `parseAndValidateSeed` and `parseAndValidatePublicKey` in
   `packages/web3-qrl-accounts/src/account.ts` enforce byte-length and hex
   parsing rules.
3. `packages/web3-qrl-accounts/src/qrl_wallet.ts` wraps `@theqrl/wallet.js` for
   descriptors, extended seeds, addresses, ML-DSA signing, and verification.
   `packages/web3-qrl-accounts/src/qrl_crypto.ts` exposes the ML-DSA public key
   length constant from `@theqrl/mldsa87`.
4. Message signing uses `hashMessage` and `sign` in
   `packages/web3-qrl-accounts/src/account.ts`.
5. Transaction signing uses `TransactionFactory` and the transaction classes
   under `packages/web3-qrl-accounts/src/tx/`. The base transaction class signs
   `getMessageToSign(...)`, attaches descriptor/public key/signature values, and
   verifies signatures with `verifyMLDSA87Signature`.
6. Keystore encryption/decryption uses AES and Argon2id from
   `@theqrl/qrl-cryptography` in `packages/web3-qrl-accounts/src/account.ts`.
7. Browser wallet persistence goes through `Wallet.getStorage()` and wallet
   save/load paths in `packages/web3-qrl-accounts/src/wallet.ts`.

Network-controlled signing is separate from local key handling: `qrl_sign`,
`qrl_signTransaction`, and `qrl_sendTransaction` are raw RPC calls in
`packages/web3-rpc-methods/src/qrl_rpc_methods.ts` and depend on the connected
node/provider.

### Transaction Send Flow

1. Public send APIs are exposed from `Web3QRL` in
   `packages/web3-qrl/src/web3_qrl.ts`.
2. `packages/web3-qrl/src/utils/transaction_builder.ts` fills sender, nonce,
   chain/network IDs, gas, data/input, and fee fields.
3. Local signing uses `@theqrl/web3-qrl-accounts` transaction classes. Remote
   signing or node-controlled accounts use the `qrl_*` RPC methods.
4. Submission and receipt/confirmation handling are split across
   `packages/web3-qrl/src/rpc_method_wrappers.ts` and helper files under
   `packages/web3-qrl/src/utils/`.

### ABI And Contract Flow

1. Low-level ABI fragments, coder, interface, and result types are exported by
   `@theqrl/abi` from `packages/abi/src/index.ts`.
2. QRL ABI helpers are exported by `@theqrl/web3-qrl-abi` from
   `packages/web3-qrl-abi/src/index.ts`.
3. Contract instances are implemented in
   `packages/web3-qrl-contract/src/contract.ts`; method/event encoding and
   decoding live in `packages/web3-qrl-contract/src/encoding.ts`.
4. Contract calls and sends ultimately use the QRL module wrappers from
   `@theqrl/web3-qrl`.

### QRNS Flow

1. The umbrella `Web3` class attaches `web3.qrl.qrns` using `QRNS` from
   `packages/web3-qrl-qrns/src/qrns.ts`.
2. QRNS checks provider sync state with `isSyncing`, reads the network ID with
   `getId`, selects a registry address from `packages/web3-qrl-qrns/src/config.ts`,
   and then uses `Registry` and `Resolver` contract wrappers.

## Docs And Release Generation

API docs are generated by Docusaurus and TypeDoc in `docs/docusaurus.config.js`.
The TypeDoc package entrypoints are the runtime packages under `packages/`, not
the private lint tooling package. The docs build writes generated output under
the docs build directories and is validated by `pnpm run build:docs`.

Release package inspection and tarball assembly live under `scripts/release/`:

- `scripts/release/packages.js` enumerates publishable packages.
- `scripts/release/inspect-packages.js` runs `npm pack --dry-run`, verifies
  declared entrypoints, blocks generated/secret/dependency-manager artefacts,
  and rejects committed `gitHead` fields.
- `scripts/release/pack-packages.js` writes release tarballs and package
  metadata into `dist/`.
- `scripts/release/smoke-tarballs.js` performs CJS and ESM import smoke tests
  from packed tarballs.

## Audit Hot Spots

- Key material: `packages/web3-qrl-accounts/src/account.ts`,
  `packages/web3-qrl-accounts/src/wallet.ts`,
  `packages/web3-qrl-accounts/src/qrl_wallet.ts`, and
  `packages/web3-qrl-accounts/src/tx/`.
- Transaction population and submission:
  `packages/web3-qrl/src/utils/transaction_builder.ts`,
  `packages/web3-qrl/src/rpc_method_wrappers.ts`, and
  `packages/web3-qrl/src/web3_qrl.ts`.
- Provider trust boundary: `packages/web3-core/src/web3_request_manager.ts`,
  `packages/web3-providers-http/src/index.ts`,
  `packages/web3-providers-ws/src/index.ts`, and
  `packages/web3-providers-ipc/src/index.ts`.
- Contract/ABI boundary: `packages/web3-qrl-contract/src/contract.ts`,
  `packages/web3-qrl-contract/src/encoding.ts`,
  `packages/web3-qrl-abi/src/`, and `packages/abi/src/`.
- Release boundary: `.github/workflows/ci.yml`,
  `.github/workflows/release.yml`, `scripts/release/`,
  `docs/supply-chain-security.md`, and `docs/repository-governance.md`.
