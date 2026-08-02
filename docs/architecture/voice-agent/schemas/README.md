# Voice-agent schemas

These files are JSON Schema Draft 2020-12 contracts for the proposed Zyra voice-agent architecture.

| Schema | Record |
|---|---|
| [`common.schema.json`](common.schema.json) | Shared IDs, timestamps, actors, artifacts, errors, usage, and source references |
| [`task.schema.json`](task.schema.json) | Reduced durable task snapshot |
| [`task-event.schema.json`](task-event.schema.json) | Append-only typed task event envelope and payloads |
| [`execution-attempt.schema.json`](execution-attempt.schema.json) | Reduced view of one strong-primary slot ownership period |
| [`attempt-event.schema.json`](attempt-event.schema.json) | Append-only execution-attempt transitions and authority snapshots |
| [`operation-intent.schema.json`](operation-intent.schema.json) | Side-effect intent, dispatch, receipt, and unknown-outcome state |
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
| [`provider-capabilities.schema.json`](provider-capabilities.schema.json) | Runtime capability discovery for adapters |

## Versioning

- `schema_version` is required on persisted records.
- Adapter-only transport envelopes MAY add optional fields before normalization. Persisted domain records stay strict; additive persisted fields require a reader-compatible schema revision.
- A changed invariant, renamed required field, or altered meaning requires a new schema version and migration.
- Event payloads remain immutable after append. A live current-version producer cannot append an unknown event. If recovery/import encounters an already durable newer type/version, its raw bytes are retained and projection stops before that sequence until a compatible reader is installed; it is never skipped.
- Producers SHOULD retain their adapter and provider version beside capture metadata when behavior is experimental.

## Validation

Examples under [`../examples/`](../examples/) validate against these schemas. Run `npm run test:voice-agent-contracts` from the repository root to compile every schema, validate every fixture/event, run rejection mutations, and check the cross-record semantic graph for load-bearing invariants. A production implementation should compile schemas during startup/CI and reject invalid persistence writes before append.

Byte limits described in the architecture are application-level encoded-byte checks. JSON Schema character counts do not replace those checks.
