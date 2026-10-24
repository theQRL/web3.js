
# @theqrl/Web3 RPC Methods

![ES Version](https://img.shields.io/badge/ES-2020-yellow)
![Node Version](https://img.shields.io/badge/node-%3E%3D20-green)
[![NPM Package](https://img.shields.io/npm/v/@theqrl/web3-rpc-methods)](https://www.npmjs.com/package/@theqrl/web3-rpc-methods)
[![Downloads](https://img.shields.io/npm/dm/@theqrl/web3-rpc-methods)](https://www.npmjs.com/package/@theqrl/web3-rpc-methods)

This is a sub-package of [@theqrl/web3.js](https://github.com/theqrl/web3.js).

`@theqrl/web3-rpc-methods` contains the raw `qrl_*` and `net_*` JSON-RPC method wrappers used by the higher-level packages.

## Installation

You can install the package either using [NPM](https://www.npmjs.com/package/@theqrl/web3-rpc-methods) or using [pnpm](https://pnpm.io/)

### Using NPM

```bash
npm install @theqrl/web3-rpc-methods
```

### Using pnpm

```bash
pnpm add @theqrl/web3-rpc-methods
```

## Getting Started

-   :writing_hand: If you have questions [submit an issue](https://github.com/theqrl/web3.js/issues/new) or join us on [Discord](https://theqrl.org/discord)
    ![Discord](https://img.shields.io/discord/357604137204056065.svg?label=Discord&logo=discord)

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
[repo]: https://github.com/theqrl/web3.js/tree/main/packages/web3-rpc-methods
[npm-image]: https://img.shields.io/github/package-json/v/theqrl/web3.js/main?filename=packages%2Fweb3-rpc-methods%2Fpackage.json
[npm-url]: https://npmjs.org/package/@theqrl/web3-rpc-methods
[downloads-image]: https://img.shields.io/npm/dm/@theqrl/web3-rpc-methods?label=npm%20downloads
