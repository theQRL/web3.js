# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pass 6 audit corrections

- Cap the default wire limit at min(2 × maxResponseBytes, 536,870,888 bytes), below the ws int32 and V8 string ceilings. Explicit maxPayload values, including zero (unlimited), also respect that ceiling; invalid values are rejected (P6-TR-1).
- Report peer close code 1009 as ConnectionCloseError with the peer reason; only locally detected oversized responses use ResponseTooLargeError (P6-TR-3).

### Fixed

- Keep the default wire limit above the parser limit, map wire-size failures to ResponseTooLargeError, and drop oversized notifications without rejecting unrelated requests (P5-TR-1).

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
