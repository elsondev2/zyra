# ADR-0005: Build continuity as a materialized view

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-02
- **Specification:** [Context and continuity](../architecture/voice-agent/context-and-continuity.md)
- **Phase Two relationship scope refined by:** [ADR-0009](0009-group-home-and-work-threads-with-relationship-focus.md) and [ADR-0011](0011-use-attention-items-focus-visits-and-home-receipts.md)

## Context

Physical realtime sessions expire, disconnect, and consume allowance. The logical conversation and background tasks must continue. Replaying complete conversation/worker transcripts is too large and exposes internal noise. Waking the strong model or a third summarizer merely to reconnect adds latency, cost, and another source of state.

## Decision

A deterministic continuity service maintains a bounded resume packet as a materialized view over canonical conversation, task, and private-agent records.

The packet prioritizes exact pending approval actions/hashes/scopes and decision options, active blockers, exact constraints/corrections, active task state/ownership, decisions, current focus, recent verbatim turns, and retrieval references. It includes complete source watermarks, permission/revocation/writer safety state, integrity metadata, and narration delivery state. Critical records cannot be truncated.

A new physical session receives the packet silently as reference context. State that changes during connection arrives as ordered, typed, hash-checked, nontruncated silent deltas behind a hydration barrier. The foreground waits for user speech unless an urgent pending event qualifies for narration.

No third model is introduced for resume.

## Consequences

### Benefits

- Voice can close and reconnect without losing logical identity.
- Strong work continues while media is absent.
- Resume latency and context size are bounded.
- Canonical ledgers remain the only source of truth.
- Already narrated updates are not replayed.

### Costs

- Deterministic priority/truncation and retrieval must be implemented.
- Provider-specific startup context limits require testing.
- Model-authored checkpoints still require validation and provenance.

## Alternatives considered

### Replay full history

Rejected because size, latency, and private execution noise grow without bound.

### Summarize on every reconnect with a third model

Rejected because it adds an active model, cost, delay, and summary drift.

### Wake the primary to brief Voice

Rejected because Voice must resume even when no strong task is active or usage is exhausted.

## Verification

- Packet stays within the adapter budget while retaining mandatory records, or fails closed when the critical set cannot fit.
- Startup creates no synthetic user turn or greeting.
- Delta gaps, hash failures, unknown records, and oversized deltas trigger a fresh snapshot.
- Repeated session expiry preserves exact active constraints and tasks.
- Resume causes no third-model call.
