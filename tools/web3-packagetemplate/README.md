# @theqrl/web3.js - Package Template

![ES Version](https://img.shields.io/badge/ES-2020-yellow)
![Node Version](https://img.shields.io/badge/node-18.x-green)
[![NPM Package](https://img.shields.io/npm/v/@theqrl/web3-packagetemplate)](https://www.npmjs.com/package/@theqrl/web3-packagetemplate)
[![Downloads](https://img.shields.io/npm/dm/@theqrl/web3-packagetemplate)](https://www.npmjs.com/package/@theqrl/web3-packagetemplate)

This is a sub-package of [@theqrl/web3.js](https://github.com/theqrl/web3.js).

`@theqrl/web3-packagetemplate` contains the ideal setup for a Web3.js package.

## Installation

You can install the package either using [NPM](https://www.npmjs.com/package/@theqrl/web3-packagetemplate) or using [Yarn](https://yarnpkg.com/package/@theqrl/web3-packagetemplate)

### Using NPM

```bash
npm install @theqrl/web3-packagetemplate
```

### Using Yarn

```bash
yarn add @theqrl/web3-packagetemplate
```

## Getting Started

-   :writing_hand: If you have questions [submit an issue](https://github.com/theqrl/web3.js/issues/new) or join us on [Discord](https://theqrl.org/discord)
    ![Discord](https://img.shields.io/discord/357604137204056065.svg?label=Discord&logo=discord)

## Prerequisites

-   :gear: [NodeJS](https://nodejs.org/) (LTS/Fermium)
-   :toolbox: [Yarn](https://yarnpkg.com/)/[Lerna](https://lerna.js.org/)

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
[repo]: https://github.com/theqrl/web3.js/tree/main/tools/web3-packagetemplate
[npm-image]: https://img.shields.io/github/package-json/v/theqrl/web3.js/main?filename=tools%2Fweb3-packagetemplate%2Fpackage.json
[npm-url]: https://npmjs.org/package/@theqrl/web3-packagetemplate
[downloads-image]: https://img.shields.io/npm/dm/@theqrl/web3-packagetemplate?label=npm%20downloads
