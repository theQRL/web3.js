# Package Naming

This document records the package naming policy for the `@theqrl` web3.js
workspace and the current audit decision for naming exceptions.

## Policy

- The main consumer package is `@theqrl/web3`.
- Public runtime packages that are part of the Web3.js surface should use the
  `@theqrl/web3-*` prefix.
- Tooling packages that are published from this repository may also use the
  `@theqrl/web3-*` prefix when their purpose is specific to this workspace.
- Low-level forked or foundational packages may use a shorter
  `@theqrl/<domain>` name only when they are intentionally not the primary
  Web3.js consumer surface and the exception is documented here.

Do not add a second npm package name for an existing package without a migration
plan that covers internal imports, docs, npm trusted publishing, package smoke
tests, and deprecation or compatibility handling for the old package name.

## Current Decision

Keep `packages/abi` published as `@theqrl/abi`.

Reasons:

- `@theqrl/abi` already exists on npm at version `0.4.0`.
- The package is a low-level ABI coder forked from ethers, not the QRL-facing
  Web3.js ABI convenience package.
- The QRL-facing ABI package is already named `@theqrl/web3-qrl-abi` and
  depends on `@theqrl/abi`.
- Renaming `@theqrl/abi` to `@theqrl/web3-abi` would create a new public package
  name while leaving the existing npm package behind, so it should be treated as
  a deliberate compatibility migration rather than a source-hygiene cleanup.

`@theqrl/web3-abi` was not present on npm when checked on 2026-05-01, but this
repository does not currently use or reserve that name.

## Publishable Package Names

The release helper is the source of truth for publishable packages:

```sh
node scripts/release/packages.js list
```

Current publishable package names follow this shape:

- `@theqrl/web3` for the main package.
- `@theqrl/web3-*` for Web3.js runtime packages and published workspace tools.
- `@theqrl/abi` as the documented foundational ABI-coder exception.

Private workspace tools are outside this policy because they are never
published: `@theqrl/eslint-config-base-web3` (`tools/eslint-config-base-web3`)
is `"private": true`, consumed only through `workspace:` links, skipped by
`multi-semantic-release --ignore-private-packages` and absent from the release
helper's list. Making it publishable would require renaming it to
`@theqrl/web3-*`, adding `files` and `repository.directory`, and configuring
trusted publishing for the new name.

