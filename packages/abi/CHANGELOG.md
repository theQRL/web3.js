# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking:** ABI values occupy 64-byte VM words. Explicit integer widths extend through `uint512` / `int512`; bare `uint` / `int` retain Hyperion 0.2.0's 256-bit bounds.
- **Breaking:** Decoding an ABI address returns a checksummed Q address.
- **Breaking:** The ABI `function` type contains a 64-byte address and four-byte selector (68 bytes), encoded in two 64-byte words.
