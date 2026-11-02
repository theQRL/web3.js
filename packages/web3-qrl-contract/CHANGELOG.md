# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pass 13 audit corrections

- Narrow allEvents filter validation by explicit signature topics, copy nested filters before reads or subscriptions, and treat empty topic lists as omitted consistently (P13-CT-1–3). Allow topic alternatives in ContractEventOptions.

### Pass 12 audit corrections

- Use own enumerable filter keys consistently for historical reads, subscription replay and live delivery, ignoring inherited and non-enumerable properties (P12R-1).
- Validate filters across all compatible layouts, including explicit topics, and reject empty OR lists before requests (P12-CT-1/2). Snapshot top-level subscription filter values and reject non-array topics.

### Pass 11 audit corrections

- Apply active subscription filters to live delivery, removed logs and replay independently of topic breadth, including non-indexed keys and `allEvents`; validate values before requests (P11R-1).
- Apply broad filters to subscription replay, validate values before requests, preserve anonymous indexed topics and use prefix filters for compatible indexed counts (P11-CT-1–4). Document `eventFilterNeedsBroadTopics` and `matchesEventFilter`.

### Pass 10 audit corrections

- Treat omitted anonymous as false and ignore nullish filter keys during layout selection. Broaden topic queries and post-filter live values when compatible layouts place keys at different positions; validate live log fields before decoding (P10-CT-1 through P10-CT-4).
- Reject ABI parameter nesting beyond 64 combined tuple/array levels while cloning contract interfaces (P10-ABI-1).

### Pass 9 audit corrections

- Encode sibling-layout indexed filters and post-filter historical logs with their selected ABI; reject unknown filter keys typed. Live subscriptions rely on node topic filtering and never locally post-filter values (P9-CT-1).
- Restore an optional registry for public decodeEventABI, prefer a matching caller fragment, copy selected fragments, and reject non-string topic entries (P9-CT-2/3/4).
- Document P9-CT-5: same-signature layouts with equal indexed counts cannot be distinguished. Named decoding prefers its bound fragment, allEvents the first match; supply the actual contract/version ABI.

### Pass 8 audit corrections

- Preserve public `decodeEventABI` support for raw ABI fragments: derive a missing signature for both the named event and interface candidates without modifying caller input (P8R-2).

- Require exact indexed-topic counts for declared anonymous events and exclude signatures of declared non-anonymous events. Choose the matching indexed layout when fragments share a signature (P8-CT-1/5).
- Throwing data/error listeners no longer abort replay or live delivery, skip other listeners, or tear down the subscription (P8-CT-3/4).
- Document fromBlock delivery as concurrent historical/live streams that can overlap, arrive out of order or leave a pre-registration gap; consumers must reconcile checkpoints and deduplicate log identities (P8-CT-2).

### Pass 7 audit corrections

- Replay historical logs only after live subscription succeeds, report terminal setup failure once, and release late subscription replies. getPastEvents skips topic-count mismatches while retaining other valid logs; live/backfill errors include the log identity (P7-CT-1/2/3).

### Pass 6 audit corrections

- Keep request/subscription managers shared by clone() and deployment results so provider changes continue to propagate. Explicit constructor provider overrides still create independent managers (P6-CT-1).
- Isolate undecodable backfill logs, report each error and replay valid entries. Reject topic-count mismatches for named events and release the live subscription on terminal backfill failure (P6-CT-2, P6-CT-3).
- Indexed array filters take one array value. OR-lists of array values are unsupported and invalid nested scalar values now throw instead of becoming integers (P6-CT-4).

### Fixed

- Deploying from an addressed instance creates a new contract; explicit deployment destinations are rejected. Preserve backfill signature checks, indexed-array filter semantics, provider overrides and immutable error ABI fragments (P5-CT-1 through P5-CT-4, P5-ABI-3).
- Encode indexed function filters as 64-byte hash topics, including OR filters, and match returned function hashes in `getPastEvents`.

### Changed

- **Breaking:** A decoded `EventLog.signature` is the 32-byte keccak event-signature hash extracted from the 64-byte log topic. Hashed indexed event parameters likewise decode to their 32-byte hash.
