# @theqrl/web3.js - Web3 QRL Accounts

![ES Version](https://img.shields.io/badge/ES-2020-yellow)
![Node Version](https://img.shields.io/badge/node-%3E%3D20-green)
[![NPM Package](https://img.shields.io/npm/v/@theqrl/web3-qrl-accounts)](https://www.npmjs.com/package/@theqrl/web3-qrl-accounts)
[![Downloads](https://img.shields.io/npm/dm/@theqrl/web3-qrl-accounts)](https://www.npmjs.com/package/@theqrl/web3-qrl-accounts)

This is a sub-package of [@theqrl/web3.js](https://github.com/theqrl/web3.js).

`@theqrl/web3-qrl-accounts` contains functionality for managing QRL accounts and signing.

## Installation

You can install the package either using [NPM](https://www.npmjs.com/package/@theqrl/web3-qrl-accounts) or using [pnpm](https://pnpm.io/)

### Using NPM

```bash
npm install @theqrl/web3-qrl-accounts
```

### Using pnpm

```bash
pnpm add @theqrl/web3-qrl-accounts
```

## Getting Started

-   :writing_hand: If you have questions [submit an issue](https://github.com/theqrl/web3.js/issues/new) or join us on [Discord](https://theqrl.org/discord)
    ![Discord](https://img.shields.io/discord/357604137204056065.svg?label=Discord&logo=discord)

## Keystores

`encrypt` writes and `decrypt` reads the go-qrl v1 keystore format (AES-256-GCM, Argon2id). Keystores
interoperate with go-qrl in both directions:

-   `encrypt` uses go-qrl's standard profile by default (`m = 262144` KiB, `t = 8`, `p = 1`) and refuses
    to create a keystore below the OWASP Argon2id floor (`m >= 19456`); `dklen` is always 32.
-   `decrypt` additionally accepts keystores written by `gqrl --lightkdf` (`m = 4096`), so an existing
    light keystore can always be read, while this library never creates one.
-   An empty password is accepted on both sides, as in go-qrl. A string password is encoded as its raw
    UTF-8 bytes.

## Prerequisites

-   :gear: [NodeJS](https://nodejs.org/) (20 or newer)
-   :toolbox: [pnpm](https://pnpm.io/) and [Turbo](https://turbo.build/)

## Package.json Scripts

| Script           | Description                                        |
| ---------------- | -------------------------------------------------- |
| clean            | Uses `rimraf` to remove `dist/`                    |
| build            | Uses `tsc` to build package and dependent packages |
| lint             | Uses `eslint` to lint package                      |
| lint:fix         | Uses `eslint` to check and fix any warnings        |
| format           | Uses `prettier` to format the code                 |
| test             | Uses `jest` to run unit tests                      |
| test:integration | Uses `jest` to run tests under `/test/integration` |
| test:unit        | Uses `jest` to run tests under `/test/unit`        |

[docs]: https://docs.theqrl.org/
[repo]: https://github.com/theqrl/web3.js/tree/main/packages/web3-qrl-accounts
[npm-image]: https://img.shields.io/github/package-json/v/theqrl/web3.js/main?filename=packages%2Fweb3-qrl-accounts%2Fpackage.json
[npm-url]: https://npmjs.org/package/@theqrl/web3-qrl-accounts
[downloads-image]: https://img.shields.io/npm/dm/@theqrl/web3-qrl-accounts?label=npm%20downloads
