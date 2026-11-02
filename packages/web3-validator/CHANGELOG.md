# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### PR review corrections

- The `bool` format accepts `0n` and `1n`, the values the ABI `bool` coder and `formatParam` accept.

### Pass 13 audit corrections

- Treat array-buffer views from every realm as atomic during budget checks and summarize large views before rendering validation errors (P13-QRL-3).

### Pass 10 audit corrections

- Bound ABI tuple/array schema nesting to 64 levels and reject excessive dimensions with Web3ValidatorError (P10-ABI-1).
- Convert byte arrays to hex in bounded chunks and refuse decimal integer strings longer than 155 digits before BigInt conversion (P10-CORE-2).

### Pass 8 audit corrections

- Return false for odd-length hexadecimal bloom membership values instead of throwing InvalidBytesError.

### Pass 6 audit corrections

- Preserve the total validation issue count and omitted-issue count while retaining at most 100 errors (P6-VAL-1).
- Zod 4 rejects Infinity and -Infinity for number schemas and changes native validation message text. ValidationError is a local path/message type, Web3ValidationOptions.silent is optional, and unsupported or array-valued schema types now throw instead of falling back to object validation.

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
