# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking:** Packed encoding and `hyperionSha3` now treat bare `uint`, `int`, and inferred integers as 256-bit values. This changes their packed bytes and hashes. Use explicit `uint512` or `int512` to retain 512-bit scalar encoding.
- Packed integer array elements now occupy 64-byte VM words, including sign extension for negative values.

### Added

- Packed `function` values use the compact 68-byte address-plus-selector representation. Function array elements occupy two 64-byte words, matching Hyperion.

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
