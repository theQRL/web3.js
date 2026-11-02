# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### PR review corrections

- `EventEmitter` calls ordinary function listeners with the emitter as `this`, from both `emit` and `emitSafe`, as Node's emitter does.
- A `once` listener runs at most once when an earlier listener re-emits the same event. A `once` listener removed during an emission still runs from that emission's snapshot.
- `numberToHex` accepts decimal and hex strings across the whole `uint512` range, matching bigint input. Number and string inputs outside `int512` and `uint512` are rejected; bigints are not range checked.
- **Breaking:** `toPlanck` and `fromPlanck` throw `InvalidUnitError` for `noquanta`, as in 1.x. The rewritten conversion had returned the amount unchanged.

### Pass 11 audit corrections

- Document the provider acknowledgement contract, notification park and decoded UTF-8 byte accounting. Clarify that the 155-digit decimal bound applies to `toBigInt` and its callers; `toNumber`, `toHex` and `toPlanck` remain uncapped.

### Pass 10 audit corrections

- Count socket response limits in UTF-8 bytes, including split surrogate pairs; document residual key-dense JSON heap amplification and concurrency sizing (P10-TR-1, P10-TR-2).
- Avoid the bytes-to-hex round trip for strict hex output; bound `toBigInt` decimal strings to 155 digits, sufficient for uint512; format zero planck values without a trailing decimal point (P10-CORE-2, P10-CORE-3).

### Pass 9 audit corrections

- Defer notifications for ids acknowledged by outstanding subscribe requests until awaiting callers can attach listeners. Keep ordering across coalesced WS/IPC bursts and clear deferred items on connection reset (P9-CORE-1).

- Bound JSON object/array counts before parsing to max(1024, floor(maxResponseBytes / 16)), including empty containers; share the structure scan with HTTP. The budget admits dense struct-logger traces with empty memory arrays near the byte cap (P9R-2). Increase default depth to 4096 and expose validated maxResponseDepth across all providers, preserving full 1024-frame traces. Structural violations use InvalidResponseError and socket parsing recovers for following messages (P9-TR-1/2/3).

### Pass 8 audit corrections

- Reject JSON messages nested beyond 1024 levels before JSON.parse in frame and stream modes; attribute the typed error to ids in the retained prefix and continue parsing subsequent messages. Discarded size-limited streams may use a non-contiguous retained prefix plus closing-piece head to identify requests.
- Isolate provider callbacks per listener, including rejected async callbacks, so error/change/connect/disconnect/message handlers cannot prevent recovery or wedge a receiver. Manual connect failures during backoff reuse the automatic attempt slot without increasing its exponential delay (P8-TR-1–3, P8-CORE-2).

### Pass 7 audit corrections

- Keep the last known chain id and accounts when handshake probes fail, without spurious change events. Throwing probe-error listeners cannot suppress connect or reject the handshake task (P7-CORE-2/5).
- Limit maxResponseBytes to 536,870,888; bound oversized-message prefix assembly and reset stream state on allocation failure. Re-arm automatic recovery if a manual connect fails during backoff (P7-TR-1/2).

### Pass 6 audit corrections

- Emit `connect` after the current handshake settles even when a gateway rejects its RPC probes; failed fields use an empty chain id or account list, and failures are reported on `error`. Stale handshakes stay suppressed. `isConnected()` reports whether the current connection emitted `connect` (P6-CORE-2).
- Cancel a scheduled reconnect when explicitly connecting, and unref best-effort promise timeout timers (P6-TR-2, P6-CORE-4).

### Changed

- **Breaking:** `ValueTypes` and `toHex(value, true)` report `uint512` / `int512` for numeric inputs instead of `uint256` / `int256`. This type label is separate from the 256-bit default used by packed encoding.

- **Breaking:** Packed encoding and `hyperionSha3` now treat bare `uint`, `int`, and inferred integers as 256-bit values. This changes their packed bytes and hashes. Use explicit `uint512` or `int512` to retain 512-bit scalar encoding.
- Packed integer array elements now occupy 64-byte VM words, including sign extension for negative values.

### Added

- Packed `function` values use the compact 68-byte address-plus-selector representation. Function array elements occupy two 64-byte words, matching Hyperion.

### Fixed

- Serialize asynchronous interval checks; reject explicit zero/NaN deferred timeouts; correlate oversized socket messages by envelope IDs and emit connect after the current-connection handshake settles (P5-CORE-11/12, P5-TR-1/2).
- Pad boolean and fixed-size byte array elements to 64-byte words in packed encoding, matching Hyperion. This corrects the output of `encodePacked`, `hyperionSha3`, and `hyperionSha3Raw` for affected arrays.

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
