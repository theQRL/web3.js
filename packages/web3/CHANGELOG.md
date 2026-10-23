# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Account transaction signing now checks `from` against the signing seed and derives the sender from that seed when populating a missing nonce.
- Snapshot mutable transaction signing seeds before asynchronous preparation so buffer changes cannot switch the signing account.

### Removed

- **Breaking:** Removed the `@theqrl/web3-qrl-iban` package integration and `web3.qrl.Iban`, `web3.qrl.iban`, and `Web3.modules.Iban`. QRL has no IBAN/ICAP address format.

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
