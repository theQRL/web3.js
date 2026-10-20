# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Updated the fixture compiler to `@theqrl/hypc` 0.2.0 and regenerated contract ABIs and bytecode with optimization enabled (200 runs), keeping PublicResolver within go-qrl's deployed code size limit.
- Limited `compile:contracts` to generating and formatting contract fixtures.
- Configured local testnet client and helper images using published tags, including a compatible AMD64 genesis generator.

### Fixed

- Resolved Jest types in ESLint's strict TypeScript project so valid test assertions no longer inflate warning counts, and lowered the warning budgets to match.
- Contract compilation now exits unsuccessfully on compiler errors, missing contract artifacts, and filesystem errors. Compilation failures preserve the existing fixtures; warnings do not prevent successful builds.
- WebSocket integration tests now connect to the local testnet's WebSocket port (8546).
- Updated the local testnet to the upstream QRL package with compatible Qrysm startup flags and epoch settings for its compiled state limits.
- Updated revert and access-list gas expectations for the regenerated contract fixtures.

### Security

- Updated vulnerable tooling dependencies and documented the temporary exception for the unfixed `braces` advisory, whose glob patterns are controlled by repository/tool configuration.
- Upgraded `image-size` to the fixed release verified against its Codeberg source and removed its two advisory exceptions.

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
