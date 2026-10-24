# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pass 6 audit corrections

- Error messages now distinguish simulation/broadcast rejection from mined reverts when no receipt exists. MissingGasError, InvalidMaxPriorityFeePerGasOrMaxFeePerGas, TransactionMissingReceiptOrBlockHashError and ConfigChainMismatchError also have updated messages; consumers should use error types/codes instead of matching text.

### Fixed

- Bound remote text in error messages and make diagnostic `toJSON()` values safe for bigint and cyclic nested data while retaining the original fields (P5-TR-5, P5-TR-6).

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
