# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Upgrade Zod to 4.6.6 and bound validation to 64 nesting levels, with at most 100 reported issues and bounded excerpts (P5-SC-1).
- Remove the implicit 10,000-value cap on caller arguments, restoring large contract batch encoding (P5R-1). Both validation methods accept an optional `maxEntries` positive safe integer for untrusted data; the limit counts values across all nested containers and rejects oversized arrays before element traversal. No value-count limit applies by default.

### Changed

- **Breaking:** Renamed the validator format `eip712TypedData` to `qrlTypedData`; typed-data schemas must contain `QRLTypedDataDomain` instead of `EIP712Domain`.
- **Breaking:** Bare `uint`/`int` and the default bounds of `isUInt`/`isInt` now use 256 bits. Explicit integer widths up to 512 bits remain supported.

### Added

- Validate ABI `function` values as 68-byte hex strings or byte arrays, including values nested in arrays and tuples.

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
