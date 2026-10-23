# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking:** Renamed `getEncodedEip712Data` to `getEncodedQRLTypedData`. Typed data must define `QRLTypedDataDomain` instead of `EIP712Domain`, changing its hashes.
- **Breaking:** ABI-decoded addresses are checksummed Q addresses. `decodeLog` returns the 32-byte keccak hash for hashed indexed parameters, extracted from the 64-byte QRVM topic.
- **Breaking:** Bare `uint` and `int` now mean `uint256` and `int256`, matching Hyperion 0.2.0. They still occupy one 64-byte ABI word. Use explicit `uint512` or `int512` for wider values. Function, event, and error signatures also expand these aliases to 256 bits.

### Added

- ABI `function` values accept a 68-byte hex string or byte array containing a 64-byte address followed by a 4-byte selector. Encoding uses two 64-byte words, with the selector right-aligned in the second word. Arrays, tuples, and return values use the same layout.

### Fixed

- Encode finite messages with self-referencing or mutually recursive typed-data schemas without overflowing the stack.
- Accept `Uint8Array` and Node.js `Buffer` values for `bytes` and fixed-byte ABI arguments without losing their binary contents.
- Decode compiler-generated `Error(string)` and `Panic(uint256)` even when absent from the supplied ABI. Explicit error definitions take precedence. Panic payloads use selector `0x4e487b71` followed by one 64-byte code word.

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
