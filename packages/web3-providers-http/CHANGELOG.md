# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pass 11 audit corrections

- Document `maxResponseDepth` and response-body byte accounting alongside the shared provider bounds.

### Pass 9 audit corrections

- Apply pre-parse container and depth limits to successful and HTTP-error responses. maxResponseDepth defaults to 4096; structural violations surface as InvalidResponseError (P9-TR-2/3).

### Pass 8 audit corrections

- Correct redirect opt-in documentation: native fetch strips credential headers on an origin change (including port), while custom API-key headers can reach any redirect target (P8-TR-4).

### Pass 7 audit corrections

- Reject malformed dispatcher options and unsupported native-fetch agent options with ProviderError before fetch. Dispatchers are a Node-only native-fetch option (P7-TR-4).

### Pass 6 audit corrections

- Refuse node-fetch `agent` options under native fetch instead of silently ignoring proxy/TLS routing. Use an undici `dispatcher` with native Node fetch; the fallback still supports node-fetch options (P6-TR-4).

### Fixed

- Prefer native fetch when available and map truncated bodies and refused redirects to typed transport errors (P5-TR-4).
- Cancel unread response streams and abort the HTTP transport when rejecting oversized responses, including those rejected by `Content-Length`.
- Abort the HTTP transport on request timeouts and caller cancellations after headers arrive, preserving caller cancellation reasons and cleaning up abort listeners.

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
