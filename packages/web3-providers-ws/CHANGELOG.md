# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pass 11 audit corrections

- Document decoded UTF-8 byte accounting, `maxResponseDepth` and the distinction between sent close code 1009 and observed 1006 on wire-limit failures.

### Pass 9 audit corrections

- Enforce container-count limits and configurable maxResponseDepth (default 4096) before JSON.parse. Validate a single copy of socket options so a changing maxPayload getter cannot bypass validation (P9-TR-1/3).

### Pass 8 audit corrections

- Contain throwing provider listeners and reject excessively nested JSON before parsing. Copy socket options at construction so later caller mutation cannot remove the validated wire limit. Failed manual reconnects preserve the automatic attempt budget.

### Pass 7 audit corrections

- Validate maxPayload before connecting with ProviderError; explicit undefined uses the default. maxResponseBytes cannot exceed 536,870,888 (P7-TR-1/3).

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
