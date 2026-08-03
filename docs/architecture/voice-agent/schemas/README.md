# Voice-agent schemas

These files are JSON Schema Draft 2020-12 contracts for the proposed Zyra voice-agent architecture.

| Schema | Record |
|---|---|
| [`common.schema.json`](common.schema.json) | Shared IDs, timestamps, actors, artifacts, errors, usage, and source references |
| [`foreground-route.schema.json`](foreground-route.schema.json) | Exclusive Chat/Voice response ownership for one conversation route epoch |
| [`legacy-message-route-binding.schema.json`](legacy-message-route-binding.schema.json) | Hash-verified route/receipt metadata for immutable pre-routing canonical messages |
| [`task.schema.json`](task.schema.json) | Reduced durable task snapshot |
| [`task-event.schema.json`](task-event.schema.json) | Append-only typed task event envelope and payloads |
| [`execution-attempt.schema.json`](execution-attempt.schema.json) | Reduced view of one strong-primary slot ownership period |
| [`attempt-event.schema.json`](attempt-event.schema.json) | Append-only execution-attempt transitions and authority snapshots |
| [`operation-intent.schema.json`](operation-intent.schema.json) | Side-effect or route-bound canonical-message intent, dispatch, receipt, and unknown-outcome state |
| [`completion-candidate.schema.json`](completion-candidate.schema.json) | Primary evidence package submitted before task verification |
| [`context-revision.schema.json`](context-revision.schema.json) | Versioned constraints, corrections, decisions, focus, and attachments |
| [`decision-request.schema.json`](decision-request.schema.json) | Meaningful user-choice request and resolution |
| [`approval-request.schema.json`](approval-request.schema.json) | Permission request and immutable trusted-control resolution |
| [`capability-lease.schema.json`](capability-lease.schema.json) | Scoped, expiring execution authority issued after acceptance |
| [`delegation-packet.schema.json`](delegation-packet.schema.json) | Primary-agent start contract preserving verbatim intent |
| [`resume-packet.schema.json`](resume-packet.schema.json) | Bounded continuity materialized view |
| [`resume-delta.schema.json`](resume-delta.schema.json) | Ordered, lossless change set after a prepared packet |
| [`narration-item.schema.json`](narration-item.schema.json) | Safe visual/speech scheduling input |
| [`narration-delivery.schema.json`](narration-delivery.schema.json) | Crash-safe speech and canonical-message delivery state |
| [`usage-snapshot.schema.json`](usage-snapshot.schema.json) | Separate voice and agent-work usage meters |
| [`provider-capabilities.schema.json`](provider-capabilities.schema.json) | Independently expiring runtime capability report for one realtime or strong-agent adapter |

## Versioning

- `schema_version` is required on persisted records.
- Adapter-only transport envelopes MAY add optional fields before normalization. Persisted domain records stay strict; additive persisted fields require a reader-compatible schema revision.
- A changed invariant, renamed required field, or altered meaning requires a new schema version and migration.
- Event payloads remain immutable after append. A live current-version producer cannot append an unknown event. If recovery/import encounters an already durable newer type/version, its raw bytes are retained and projection stops before that sequence until a compatible reader is installed; it is never skipped.
- Producers SHOULD retain their adapter and provider version beside capture metadata when behavior is experimental.

## Current versions and migration

| Contract | Current version | Migration rule |
|---|---:|---|
| Foreground route | 1 | New contract; create an initial Chat route and verified legacy message bindings when enabling this architecture |
| Legacy message-route binding | 1 | New migration-only contract; preserve canonical JSONL bytes and bind each verified existing record to the migration route/manifest |
| Operation intent | 2 | Add null foreground fields to non-message operations; reconstruct canonical-message route binding only from proven ledger identity, otherwise retain v1 read-only and block replay |
| Narration delivery | 2 | Bind pending delivery to a proven Voice route or mark it nonreplayable/`outcome_unknown`; terminal v1 history remains archival |
| Resume packet and delta | 3 | Regenerate v2 caches from canonical sources; copy canonical conversation-message sequences, revisioned-stream source sequences, the complete operation revision index, retaining every terminal identity tombstone, each active task’s revision/event-sequence head, and each current attempt’s exact state/event-sequence head and `writer_lock_ids`; never infer authority from owner/scope text or mutate a stale cache in place |
| Provider capability report | 2 | Discard v1 combined/expired reports and probe each realtime or strong adapter independently |

Other schemas remain version 1. A reader MUST dispatch by the record’s `schema_version`; it cannot validate an older record against a newer schema and silently fill authority fields. Migration follows the backup, validation, atomic activation, and downgrade rules in [Security and privacy](../security-and-privacy.md).

## Validation

Examples under [`../examples/`](../examples/) validate against these schemas. Run `npm run test:voice-agent-contracts` from the repository root to compile every schema, validate every fixture/event, run rejection mutations, and check the cross-record semantic graph for load-bearing invariants. A production implementation should compile schemas during startup/CI and reject invalid persistence writes before append.

JSON identity and coverage counters are capped at `Number.MAX_SAFE_INTEGER` (`9,007,199,254,740,991`). A future implementation needing larger values must introduce a string/big-integer schema version; readers must not round them as JSON numbers.

Byte limits described in the architecture are application-level encoded-byte checks. JSON Schema character counts do not replace those checks.
