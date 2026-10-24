# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pass 6 audit corrections

- Detect reorg execution-status changes in decimal-string receipts as well as the other number formats; both polling and new-head watchers report the error and stop (P6R-2).
- Confirm receipts using FMT_NUMBER.STR, accept full 512-bit storage proof values, reject null fields according to their specific RPC schema, and return typed errors for gas-limit and gas × fee overflow (P6-QRL-1 through P6-QRL-4).
- Report throwing confirmation listeners without stopping confirmation counting in either watcher (P6-QRL-5).
- Proof nodes use variable-length bytes; storage proof keys accept quantity or bytes32 shapes and retain their wire representation under scalar oneOf formatting.

### Fixed

- Retry receipt-wait timeout setup after broadcast; honor the signing caller context; validate RPC result fields and fee bounds; diagnose mined reverts at N-1 and preserve broadcast error data. Confirmation watchers tolerate transient missing receipts and report changed status after reorgs (P5-QRL-1 through P5-QRL-8).

### Changed

- **Breaking:** Receipt schemas no longer include `TransactionReceipt.root`; `FeeHistory.baseFeePerGas` is an array; log topics use `bytes64` to match VM64.

### Removed

- **Breaking:** Removed `getProtocolVersion`, `getCompilers`, and `compileHyperion`; go-qrl does not implement the corresponding RPC methods.

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
