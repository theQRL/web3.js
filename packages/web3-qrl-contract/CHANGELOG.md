# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Deploying from an addressed instance creates a new contract; explicit deployment destinations are rejected. Preserve backfill signature checks, indexed-array filter semantics, provider overrides and immutable error ABI fragments (P5-CT-1 through P5-CT-4, P5-ABI-3).
- Encode indexed function filters as 64-byte hash topics, including OR filters, and match returned function hashes in `getPastEvents`.

### Changed

- **Breaking:** A decoded `EventLog.signature` is the 32-byte keccak event-signature hash extracted from the 64-byte log topic. Hashed indexed event parameters likewise decode to their 32-byte hash.
