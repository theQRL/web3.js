# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pass 6 audit corrections

- Validate the path before replacing an explicitly reconnected live socket, preserving in-flight requests when validation fails. Explicit connect cancels any pending reconnect timer (P6-TR-2, P6-TR-5).

### Fixed

- Fail affected requests on a chunk timeout regardless of reconnect configuration and replace/destroy sockets on explicit reconnect (P5-TR-2/3).

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
