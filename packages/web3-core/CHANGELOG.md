# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pass 6 audit corrections

- Retry an initial registration once when it spans a reconnect, releasing the uncertain id first. A second connection change reports a specific retryable error. Completed retries are skipped by queued recovery, and cancellation or provider replacement never restarts a registration (P6R-1).
- Prevent reconnect recovery from overlapping initial registrations; release replies spanning connection generations. Queued stale-id cancellation succeeds even if the node refuses the old id, and cancellation does not wait for best-effort release (P6-CORE-1, P6-CORE-3, P6-CORE-4).
- `hasSubscription()` reports owner intent, including pending registrations. `unsubscribe()` cancels pending registration; `removeSubscription()` may resolve `undefined` before a node id exists. Recovery failures can emit transient subscription errors while the subscription remains eligible for retry.
- Configuration snapshots are frozen and `config` is getter-only; direct assignment or in-place mutation throws a JavaScript TypeError in strict mode. Use validated setters or `setConfig()`. Batch transport errors now use the same mapping as single requests.

### Changed

- Configuration snapshots are immutable. Use setters or `setConfig()` to update nested values. Unsupported `defaultChain` and `defaultHardfork` values now fail at assignment; use `mainnet`/`zond` and `defaultCommon.customChain` for custom chain identifiers.

### Fixed

- Reconnect recovery now serializes attempts, respects cancellation and lifecycle changes, and retries failed subscriptions. Configuration batches validate atomically with immutable snapshots; malformed RPC envelopes and provider rejection codes are handled consistently (P5-CORE-1 through P5-CORE-10).

- Reject request promises when response processing throws inside asynchronous legacy provider callbacks.
- Validate single-response IDs before processing results or errors, preserving ID types and accepting matching zero and empty-string IDs.
- Match batch response IDs without numeric coercion and reject duplicate or unrelated IDs.
- Reject pending batch entries on provider failures and ignore responses that arrive after the batch timeout.

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
