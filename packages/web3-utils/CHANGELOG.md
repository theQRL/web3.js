# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking:** `ValueTypes` and `toHex(value, true)` report `uint512` / `int512` for numeric inputs instead of `uint256` / `int256`. This type label is separate from the 256-bit default used by packed encoding.

- **Breaking:** Packed encoding and `hyperionSha3` now treat bare `uint`, `int`, and inferred integers as 256-bit values. This changes their packed bytes and hashes. Use explicit `uint512` or `int512` to retain 512-bit scalar encoding.
- Packed integer array elements now occupy 64-byte VM words, including sign extension for negative values.

### Added

- Packed `function` values use the compact 68-byte address-plus-selector representation. Function array elements occupy two 64-byte words, matching Hyperion.

### Fixed

- Serialize asynchronous interval checks; reject explicit zero/NaN deferred timeouts; correlate oversized socket messages by envelope IDs and emit connect only after a successful current-connection handshake (P5-CORE-11/12, P5-TR-1/2).
- Pad boolean and fixed-size byte array elements to 64-byte words in packed encoding, matching Hyperion. This corrects the output of `encodePacked`, `hyperionSha3`, and `hyperionSha3Raw` for affected arrays.

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
