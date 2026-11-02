# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### PR review corrections

- `addSubscription` sends `qrl_unsubscribe` for the id the node returned when the subscription lost its id while subscribing, so the node does not keep a subscription nobody owns.
- A JSON-RPC parse error (-32700) or invalid request error (-32600) with `id: null` answers the single request it was sent for. With `useRpcCallSpecification` it is raised as its RPC error class instead of `InvalidResponseError`; it is never treated as a revert.

### Pass 13 audit corrections

- Bound batch-failure, mismatched-id and non-JSON-RPC provider messages (P13-TR-2). Purge retired subscription notifications, including an active flush remainder, before a node can reuse an id.

### Pass 12 audit corrections

- Stop early-notification flushes when a listener changes providers or connections, clears or disposes the manager (P12-CORE-1).

### Pass 11 audit corrections

- Keep acknowledged notification bursts outside the unknown-id count limit so delayed registration can retain subsequent notifications (P11-CORE-1).

### Pass 10 audit corrections

- Retain acknowledged subscription bursts when a custom request wrapper resumes in a later timer turn, including reconnect registration. Per-subscription order and cancellation cleanup are preserved (P10-CORE-1).

### Pass 9 audit corrections

- Defer socket notifications for an acknowledged subscription until registration promises resume, then flush parked notifications for installed ids before live delivery; the count/size cap applies only while ids are unknown. Provider-change callbacks are isolated per listener so throws/rejections cannot interrupt a swap. Non-Error subscription listener failures become `SubscriptionError` (P9-CORE-1/2).
- Async listener rejections are reported after the rejected promise settles and can follow later data events. Base/contract subscriptions without error listeners drop these reports; attach an error listener to observe them.

### Pass 8 audit corrections

- Install subscription ids before emitting connected; contain synchronous and asynchronous listener failures per listener. Buffer early notifications during registration/recovery (128 notifications and 1,048,576 serialized UTF-16 code units per manager), delivering them after awaiting subscribers can attach listeners. Cancellation and provider changes discard pending notifications. Buffer overflow is reported on the manager error event.
- Treat connection-loss errors during an already-written unsubscribe as successful local removal (P8-CORE-1–4).

### Pass 7 audit corrections

- Allow immediate re-subscription after cancelling a pending registration; late replies cannot remove the replacement. Treat unsubscribe during socket backoff as stale cleanup, and ignore remote refusals when releasing superseded ids while retaining transport errors (P7-CORE-1/3/4).
- Preserve explicit null notification results for validation instead of forwarding their envelope.

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
