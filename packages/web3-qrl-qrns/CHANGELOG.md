# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### PR review corrections

- `Registry.getOwner` and `QRNS.getOwner` return an `Address` and reject a reply that is not an address. An unowned name returns the zero address.
- `Resolver.setAddress` rejects a malformed address with `InvalidAddressError` before any request.

### Pass 8 audit corrections

- Reject null/undefined names with InvalidStringError; only an empty string selects the root node.

### Added

- Added `getText(name, key)`, `getName(address)` with forward verification, and `setAddress(name, address, txConfig)`.

### Changed

- **Breaking:** `getPubkey` returns `{ publicKey, descriptor }` for ML-DSA-87 instead of `{ x, y }`; `PubkeyChanged` uses the same new fields.
- **Breaking:** Removed the unverified fixture address from `registryAddresses.main`. Configure a deployed registry through the constructor or `registryAddress`. Unconfigured queries fail before a contract call; `checkNetwork()` rejects networks without a verified deployment unless a custom registry is configured.
- `normalize` and `namehash` remain available from the package root.

### Removed

- **Breaking:** Removed the `normalizeWithSource` export. Use `normalize(name)` for the normalized name; the source-tracking result is no longer provided.

### Fixed

- For coin type 60, `getAddress` uses `addr(bytes32)`, returns a checksummed Q address, and rejects zero or malformed addresses. Other coin types retain raw address bytes from `addr(bytes32,uint256)`.

<!-- EXAMPLE

## [1.0.0]

### Added

- I've added feature XY (#1000)

### Changed

- I've cleaned up XY (#1000)

### Deprecated

- I've deprecated XY (#1000)

### Removed

- I've removed XY (#1000)

### Fixed

- I've fixed XY (#1000)

### Security

- I've improved the security in XY (#1000)

-->
