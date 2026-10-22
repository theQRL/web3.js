<p align="center">
  <img src="assets/logo/web3js.jpg" width="300" alt="web3.js" />
</p>

# QRL Web3.js

[![CI](https://github.com/theQRL/web3.js/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/theQRL/web3.js/actions/workflows/ci.yml)
[![Actionlint](https://github.com/theQRL/web3.js/actions/workflows/actionlint.yml/badge.svg?branch=main)](https://github.com/theQRL/web3.js/actions/workflows/actionlint.yml)
[![npm downloads][downloads-image]][npm-url]
![Commit Activity](https://img.shields.io/github/commit-activity/m/theQRL/web3.js/main?label=commit%20activity)
![Contributors](https://img.shields.io/github/contributors/theQRL/web3.js?label=contributors)

![ES Version](https://img.shields.io/badge/ES-2020-yellow)
![Node Version](https://img.shields.io/badge/node-%3E%3D20-green)

QRL Web3.js is a TypeScript implementation of QRL JSON-RPC client tooling maintained by [The QRL Contributors](https://theqrl.org/).

This fork is being prepared for audit and first release under the `@theqrl` npm organization. Until that release is cut, treat `main` as unreleased.

## Installation

Published releases will be available from [npm](https://www.npmjs.com/package/@theqrl/web3). Local development uses [pnpm](https://pnpm.io/).

After the first audited release:

```bash
npm install @theqrl/web3
```

```bash
pnpm add @theqrl/web3
```

## Getting Started

-   If you have questions [submit an issue](https://github.com/theQRL/web3.js/issues/new/choose) or join us on [Discord](https://theqrl.org/discord).
    ![Discord](https://img.shields.io/discord/357604137204056065.svg?label=Discord&logo=discord)

## Prerequisites

-   [NodeJS](https://nodejs.org/) (20 or newer)
-   [pnpm](https://pnpm.io/) and [Turbo](https://turbo.build/)

## Useful links

-   [QRL website](https://theqrl.org/)
-   [QRL Discord](https://theqrl.org/discord)
-   [Repository issues](https://github.com/theQRL/web3.js/issues/new/choose)

## Architecture Overview

Package names follow the repository policy in
[`docs/package-naming.md`](docs/package-naming.md); `@theqrl/abi` is the
documented foundational ABI-coder exception to the `@theqrl/web3-*` runtime
package pattern.

| Package                                                                                                   | npm                                                               | Docs                                                   | Description                                                                        |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`@theqrl/abi`](https://github.com/theQRL/web3.js/tree/main/packages/abi)                                 | [npm](https://www.npmjs.com/package/@theqrl/abi)                  | [API](https://docs.theqrl.org/api/abi)                 | ABI encoding and decoding helpers.                                                 |
| [`@theqrl/web3`](https://github.com/theQRL/web3.js/tree/main/packages/web3)                               | [npm](https://www.npmjs.com/package/@theqrl/web3)                 | [API](https://docs.theqrl.org/api/web3)                | Main QRL Web3.js package.                                                          |
| [`@theqrl/web3-core`](https://github.com/theQRL/web3.js/tree/main/packages/web3-core)                     | [npm](https://www.npmjs.com/package/@theqrl/web3-core)            | [API](https://docs.theqrl.org/api/web3-core)           | Shared core classes, request management, subscriptions, and plugin infrastructure. |
| [`@theqrl/web3-errors`](https://github.com/theQRL/web3.js/tree/main/packages/web3-errors)                 | [npm](https://www.npmjs.com/package/@theqrl/web3-errors)          | [API](https://docs.theqrl.org/api/web3-errors)         | Shared error types.                                                                |
| [`@theqrl/web3-net`](https://github.com/theQRL/web3.js/tree/main/packages/web3-net)                       | [npm](https://www.npmjs.com/package/@theqrl/web3-net)             | [API](https://docs.theqrl.org/api/web3-net)            | Network metadata helpers for QRL JSON-RPC providers.                               |
| [`@theqrl/web3-providers-http`](https://github.com/theQRL/web3.js/tree/main/packages/web3-providers-http) | [npm](https://www.npmjs.com/package/@theqrl/web3-providers-http)  | [API](https://docs.theqrl.org/api/web3-providers-http) | HTTP provider.                                                                     |
| [`@theqrl/web3-providers-ipc`](https://github.com/theQRL/web3.js/tree/main/packages/web3-providers-ipc)   | [npm](https://www.npmjs.com/package/@theqrl/web3-providers-ipc)   | [API](https://docs.theqrl.org/api/web3-providers-ipc)  | IPC provider.                                                                      |
| [`@theqrl/web3-providers-ws`](https://github.com/theQRL/web3.js/tree/main/packages/web3-providers-ws)     | [npm](https://www.npmjs.com/package/@theqrl/web3-providers-ws)    | [API](https://docs.theqrl.org/api/web3-providers-ws)   | WebSocket provider.                                                                |
| [`@theqrl/web3-qrl`](https://github.com/theQRL/web3.js/tree/main/packages/web3-qrl)                       | [npm](https://www.npmjs.com/package/@theqrl/web3-qrl)             | [API](https://docs.theqrl.org/api/web3-qrl)            | QRL blockchain and smart-contract APIs.                                            |
| [`@theqrl/web3-qrl-abi`](https://github.com/theQRL/web3.js/tree/main/packages/web3-qrl-abi)               | [npm](https://www.npmjs.com/package/@theqrl/web3-qrl-abi)         | [API](https://docs.theqrl.org/api/web3-qrl-abi)        | QRVM ABI helpers.                                                                  |
| [`@theqrl/web3-qrl-accounts`](https://github.com/theQRL/web3.js/tree/main/packages/web3-qrl-accounts)     | [npm](https://www.npmjs.com/package/@theqrl/web3-qrl-accounts)    | [API](https://docs.theqrl.org/api/web3-qrl-accounts)   | QRL account and signing helpers.                                                   |
| [`@theqrl/web3-qrl-contract`](https://github.com/theQRL/web3.js/tree/main/packages/web3-qrl-contract)     | [npm](https://www.npmjs.com/package/@theqrl/web3-qrl-contract)    | [API](https://docs.theqrl.org/api/web3-qrl-contract)   | Contract wrappers and method/event helpers.                                        |
| [`@theqrl/web3-qrl-qrns`](https://github.com/theQRL/web3.js/tree/main/packages/web3-qrl-qrns)             | [npm](https://www.npmjs.com/package/@theqrl/web3-qrl-qrns)        | [API](https://docs.theqrl.org/api/web3-qrl-qrns)       | Quantum Resistant Name Service helpers.                                            |
| [`@theqrl/web3-rpc-methods`](https://github.com/theQRL/web3.js/tree/main/packages/web3-rpc-methods)       | [npm](https://www.npmjs.com/package/@theqrl/web3-rpc-methods)     | [API](https://docs.theqrl.org/api/web3-rpc-methods)    | Low-level RPC method wrappers.                                                     |
| [`@theqrl/web3-types`](https://github.com/theQRL/web3.js/tree/main/packages/web3-types)                   | [npm](https://www.npmjs.com/package/@theqrl/web3-types)           | [API](https://docs.theqrl.org/api/web3-types)          | Shared TypeScript types.                                                           |
| [`@theqrl/web3-utils`](https://github.com/theQRL/web3.js/tree/main/packages/web3-utils)                   | [npm](https://www.npmjs.com/package/@theqrl/web3-utils)           | [API](https://docs.theqrl.org/api/web3-utils)          | Utility functions for QRL applications.                                            |
| [`@theqrl/web3-validator`](https://github.com/theQRL/web3.js/tree/main/packages/web3-validator)           | [npm](https://www.npmjs.com/package/@theqrl/web3-validator)       | [API](https://docs.theqrl.org/api/web3-validator)      | Runtime validation helpers.                                                        |
| [`@theqrl/web3-packagetemplate`](https://github.com/theQRL/web3.js/tree/main/tools/web3-packagetemplate)  | [npm](https://www.npmjs.com/package/@theqrl/web3-packagetemplate) | -                                                      | Package template for maintainers.                                                  |
| [`@theqrl/web3-plugin-example`](https://github.com/theQRL/web3.js/tree/main/tools/web3-plugin-example)    | [npm](https://www.npmjs.com/package/@theqrl/web3-plugin-example)  | -                                                      | Example plugin package.                                                            |

## Package.json Scripts

Root scripts (run with `pnpm run <script>`):

| Script | Description |
| --- | --- |
| `bootstrap` | `pnpm install --frozen-lockfile` |
| `build` / `build:cjs` / `build:esm` / `build:types` | Turbo-driven `tsc` builds of every package and tool (`build` cleans first via `prebuild`) |
| `build:web` / `build:web:analyze` | webpack browser bundles for `@theqrl/web3` and `@theqrl/web3-validator` (`:analyze` adds the bundle report) |
| `build:docs` | Docusaurus/TypeDoc documentation build (`docs/`) |
| `clean` | `scripts/clean.sh`: removes generated `lib/`, `dist/`, coverage and docs output (never `node_modules`) |
| `doctor` | Toolchain, lockfile, override/allowBuilds inventory, `.trivyignore` and package-dependency checks (`scripts/doctor.js`) |
| `check:dependencies` | Declared-vs-imported dependency cross-check of every package (`scripts/check-package-dependencies.js`) |
| `hygiene` | Repository hygiene checks (`scripts/check-repo-hygiene.js`), also the `pre-commit` hook |
| `lint` / `lint:fix` / `lint:budget` | ESLint across packages and tools; `lint:budget` enforces the per-package warning budget |
| `format` | Prettier across packages, tools and scripts |
| `test` / `test:unit` | Jest unit suites of every package plus the script tests under `scripts/test` |
| `test:integration` / `test:coverage:unit` / `test:coverage:integration` | Integration suites (need a node) and coverage variants |
| `test:e2e:gqrl:http` / `test:e2e:gqrl:ws` / `test:e2e:testnet:*` / `test:e2e:mainnet:*` / `test:e2e:coverage` | `scripts/test-runner.sh` wrappers for a local gqrl node or the public networks |
| `pos:start` / `pos:stop` | Start and stop the local test network (`scripts/local_testnet`) |
| `compile:contracts` | Compiles the Hyperion test fixtures with the pinned `@theqrl/hypc` |
| `audit:supply-chain` | Pinned Trivy scan of `pnpm-lock.yaml` (HIGH/CRITICAL) |
| `release:*` | Release helpers (`packages`, `inspect-packages`, `pack-packages`, `smoke-tarballs`, `published-versions`, `publish-tarballs`, `touch-packages`, `dry-run`); see `RELEASE.md` |
| `changelog` | Changelog tooling under `scripts/changelog` |
| `husky:install` / `husky:uninstall` | Install or remove the git hooks (`.husky/pre-commit`, `.husky/pre-push`) |

[npm-url]: https://npmjs.org/package/@theqrl/web3
[downloads-image]: https://img.shields.io/npm/dm/@theqrl/web3?label=npm%20downloads
