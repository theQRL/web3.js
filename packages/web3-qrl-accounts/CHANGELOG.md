# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Calculate contract creation's initcode gas surcharge using 64-byte words, matching go-qrl. This avoids overcharging intrinsic gas and rejecting deployments with a valid gas limit.
- Keep account message signing tied to the imported seed snapshot when the caller mutates the original seed buffer.

### Changed

- **Breaking:** The `zond` hardfork gas table changes `depositroot` from 19,992 to 18,000 gas, adds `mldsa87Verify` at 125,000 gas, and raises `initialBaseFee` from 1 gwei to 100 gwei (`100000000000`).

### Removed

- **Breaking:** Removed Ethereum EC precompile gas parameters `ecAdd`, `ecMul`, `ecPairing`, and `ecPairingWord` from the `zond` hardfork.

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
