
# @theqrl/web3.js - Zond Contract Package

![ES Version](https://img.shields.io/badge/ES-2020-yellow)
![Node Version](https://img.shields.io/badge/node-14.x-green)
[![NPM Package](https://img.shields.io/npm/v/@theqrl/web3-zond-contract)](https://www.npmjs.com/package/@theqrl/web3-zond-contract)
[![Downloads](https://img.shields.io/npm/v/@theqrl/web3-zond-contract)](https://www.npmjs.com/package/@theqrl/web3-zond-contract)

This is a sub-package of [@theqrl/web3.js](https://github.com/theqrl/web3.js).

`@theqrl/web3-zond-contract` contains the contract package used in `@theqrl/web3-zond`.

## Installation

You can install the package either using [NPM](https://www.npmjs.com/package/@theqrl/web3-zond-contract) or using [Yarn](https://yarnpkg.com/package/@theqrl/web3-zond-contract)

### Using NPM

```bash
npm install @theqrl/web3-zond-contract
```

### Using Yarn

```bash
yarn add @theqrl/web3-zond-contract
```

## Getting Started

-   :writing_hand: If you have questions [submit an issue](https://github.com/theqrl/web3.js/issues/new) or join us on [Discord](https://theqrl.org/discord)
    ![Discord](https://img.shields.io/discord/357604137204056065.svg?label=Discord&logo=discord)

## Prerequisites

-   :gear: [NodeJS](https://nodejs.org/) (LTS/Fermium)
-   :toolbox: [Yarn](https://yarnpkg.com/)/[Lerna](https://lerna.js.org/)

## Usage

You can initialize the typesafe Contract API instance with the following.

```ts
import { Contract } from '@theqrl/web3-zond-contract';

const abi = [...] as const;

const contract = new Contract(abi);
```

-   We prefer that you use `web3.zond.Contract` API in normal usage.
-   The use of `as const` is necessary to have fully type-safe interface for the contract.
-   As the ABIs are not extensive in size, we suggest declaring them `as const` in your TS project.
-   This approach is more flexible and seamless compared to other approaches of off-line compiling ABIs to TS interfaces (such as [TypeChain](https://github.com/dethcrypto/TypeChain).

## Compatibility

We have tested the Typescript interface support for the ABIs compiled with hyperion version `v0.4.x` and above. If you face any issue regarding the contract typing, please create an issue to report to us.

The Typescript support for fixed length array types are supported up 30 elements. This limitation is only to provide more performant developer experience in IDEs. In future we may come up with a workaround to avoid this limitation. If you have any idea feel free to share.

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
[repo]: https://github.com/theqrl/web3.js/tree/main/packages/web3-zond-contract
[npm-image]: https://img.shields.io/github/package-json/v/theqrl/web3.js/main?filename=packages%2Fweb3-zond-contract%2Fpackage.json
[npm-url]: https://npmjs.org/package/@theqrl/web3-zond-contract
[downloads-image]: https://img.shields.io/npm/dm/@theqrl/web3-zond-contract?label=npm%20downloads
