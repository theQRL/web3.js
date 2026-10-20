# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Updated the fixture compiler to `@theqrl/hypc` 0.2.0 and regenerated contract ABIs and bytecode with optimization enabled (200 runs), keeping PublicResolver within go-qrl's deployed code size limit.
- Limited `compile:contracts` to generating and formatting contract fixtures.

### Fixed

- Contract compilation now exits unsuccessfully on compiler errors, missing contract artifacts, and filesystem errors. Compilation failures preserve the existing fixtures; warnings do not prevent successful builds.

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
