# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Fixed-size ABI byte inputs (`bytesN`) must contain exactly N bytes; callers must pad deliberately instead of relying on implicit padding. Seed strings require a lowercase `0x` prefix.
- Updated the fixture compiler to `@theqrl/hypc` 0.2.0 and regenerated contract ABIs and bytecode with optimization enabled (200 runs), keeping PublicResolver within go-qrl's deployed code size limit.
- Limited `compile:contracts` to generating and formatting contract fixtures.
- Configured local testnet client and helper images using published tags, including a compatible AMD64 genesis generator.

### Fixed

- Socket providers (WebSocket, IPC) no longer crash the process on a `[null]` reply, no longer treat unparseable or non-object messages as a lost connection, reset their chunk parser on every (re)connection, and accept `0`/`""` as JSON-RPC ids. WebSocket frames are parsed independently, so one malformed frame can no longer poison every response that follows it.
- IPC incomplete-message timeouts expire 15 seconds after the first chunk even under continuous traffic. Parser errors reject affected requests without detaching the live socket's listeners, allowing later replies to succeed.
- `ResponseError`, `InvalidResponseError` and the JSON-RPC shape predicates tolerate `null` entries in batch responses instead of throwing a `TypeError`.
- Setting `defaultCommon` on a context no longer makes local signing fail with `CommonOrChainAndHardforkError`, an explicit `chain`/`hardfork` pair takes precedence over it, the transaction `chainId` is taken from the adopted `common` instead of being left unset, and the context's `defaultCommon` object is no longer mutated during signing.
- Removed unused runtime dependencies (`@theqrl/wallet.js` and `crc-32` from web3-qrl-abi, `util` from web3-validator, `@ethersproject/strings` from abi).
- Replaced stale Ethereum-era examples (secp256k1 keys, 65-byte signatures, legacy raw transactions, 20-byte addresses) in the accounts and Web3QRL documentation and in the secrets template.
- Made the ESLint regression test use an on-disk fixture and exercise both CI and local parser modes.
- Resolved Jest types in ESLint's strict TypeScript project so valid test assertions no longer inflate warning counts, and lowered the warning budgets to match.
- Contract compilation now exits unsuccessfully on compiler errors, missing contract artifacts, and filesystem errors. Compilation failures preserve the existing fixtures; warnings do not prevent successful builds.
- WebSocket integration tests now connect to the local testnet's WebSocket port (8546).
- Updated the local testnet to the upstream QRL package with compatible Qrysm startup flags and epoch settings for its compiled state limits.
- Updated revert and access-list gas expectations for the regenerated contract fixtures.
- `encodeParameter`/`encodeParameters` accept negative decimal strings for signed integer types narrower than 256 bits (for example `'-57'` for `int8`); decimal strings are no longer zero-padded before encoding, only hex strings are width-normalised.
- `waitForTransactionReceipt` (and therefore `sendTransaction`/`sendSignedTransaction`) stops polling `qrl_getTransactionReceipt` once the polling or block timeout has rejected, including when the initial block-number request fails or stalls. Late block-watcher setup is cleaned up, and cancelled subscription watchers cannot restart polling through their fallback timer or late error events.
- `trySendTransaction` handles failed or stalled block-watcher setup within the send timeout and cleans up its timer, preventing a later unhandled `TransactionSendTimeoutError` from terminating Node. Setup that finishes after the timeout is cleaned up without sending the transaction.
- Replies whose `error` member is `null`, or whose revert `data` / `data.originalError` is `null`, surface as `ResponseError` / `ContractExecutionError` instead of a raw `TypeError`. `isResponseWithError` requires `error` to be an object, as JSON-RPC 2.0 defines it, and the request manager no longer returns such a malformed envelope from a legacy or EIP-1193 provider as if it were a result.
- Event logs delivered without `topics` no longer throw a `TypeError` on the `allEvents` path; a declared anonymous event with more indexed inputs than topics reports an `AbiError`; a subscription that cannot decode a notification reports it on its own `error` event instead of only the provider's.
- Keystore decryption reports a wrong password or tampered ciphertext as `KeyStoreDecryptionError` (new, code 715), a wrong-length IV as `IVLengthError`, and a non-bytes salt as a validation error, instead of leaking a WebCrypto `DOMException` or a library `TypeError`. Encryption and decryption report out-of-range Argon2id parameters and salts shorter than 8 bytes as `InvalidKdfError`, preserving the validation reason; accepted salt byte arrays are normalized before key derivation.

### Security

- The HTTP provider refuses redirects by default (`redirect: 'error'`), so the JSON-RPC body and custom authentication headers are never re-sent to another host; callers can opt in through `providerOptions.redirect`.
- Keystore decryption rejects any `crypto.cipher` other than `aes-256-gcm` with `InvalidCipherError`.
- `seedToAccount` validates every seed through `parseAndValidateSeed`: exactly 51 bytes, as a `0x`-prefixed hex string or a byte array, with no whitespace or separators.
- The ABI decoder rejects non-canonical words (non-zero high bits in integers, booleans other than 0 or 1, non-zero padding in fixed-size bytes) instead of decoding them silently, matching the on-chain decoder.
- `sendSignedTransaction` only uses the sender embedded in a raw transaction for the pre-flight simulation when the transaction's signature verifies.
- Raised the `launch-editor` patch floor to 2.14.2 (CVE-2026-112942, command injection) so the Trivy supply-chain gate passes again.
- Pinned the `@theqrl/qrl-contracts` archive's SHA-512 integrity in the lockfile so pnpm rejects altered downloads. `pnpm run doctor` guards the archive pin and checks the installed tree against a reviewed digest.
- Updated vulnerable tooling dependencies and documented the temporary exception for the unfixed `braces` advisory, whose glob patterns are controlled by repository/tool configuration.
- Upgraded `image-size` to the fixed release verified against its Codeberg source and removed its two advisory exceptions.
- The IPC chunk parser finds message boundaries with one linear scan (string and escape aware bracket depth) instead of re-parsing an ever-growing prefix after every unparseable fragment, so a peer can no longer block the event loop for tens of seconds per 15-second window with a few hundred KB of garbage. Garbage and malformed segments are reported once per `data` event.

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
