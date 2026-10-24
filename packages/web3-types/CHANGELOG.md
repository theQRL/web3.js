# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `FeeHistory.gasUsedRatio` is a JSON floating-point `number[]`, independent of quantity formatting, matching go-qrl (P5-QRL-6).

### Changed

- **Breaking:** Renamed `Eip712TypedData` and `Eip712TypeDetails` to `QRLTypedData` and `QRLTypedDataTypeDetails`. The domain type is `QRLTypedDataDomain`; hashes produced with the old `EIP712Domain` schema are incompatible.
- **Breaking:** `FeeHistory.baseFeePerGas` is an array of block base fees, including the next block.
- **Breaking:** `Topic` now uses `HexString64Bytes` for 64-byte QRVM log topics.

### Removed

- **Breaking:** Removed `CompileResultAPI` and the execution-API definitions for `qrl_protocolVersion`, `qrl_getCompilers`, and `qrl_compileHyperion`.
- **Breaking:** Removed the pre-Byzantium `TransactionReceipt.root` field.

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
