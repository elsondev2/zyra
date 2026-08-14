# ADR-0003: Keep task authority in deterministic ledgers

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-02
- **Specification:** [Lifecycle and routing](../architecture/voice-agent/lifecycle-and-routing.md)

## Context

Long-running coding work survives model turns, UI detachment, provider failures, approvals, and user corrections. Model memory cannot reliably own task state, idempotency, permissions, context propagation, or completion authority.

Zyra already has canonical Pi conversation JSONL, server event journals, and event-sourced fleet/workflow records.

## Decision

A deterministic task controller owns first-class tasks and typed `task.*` events.

- The conversation ledger remains canonical for user-visible messages.
- An agent-server-owned canonical `controller.sqlite` stores append-only task/orchestration events, immutable context/decision/approval/lease records, attempts, snapshots, idempotency receipts, and the side-effect outbox transactionally.
- Private agent records retain worker transcripts and detailed evidence.
- Agent-server journals support reconnect; Desktop search/timeline SQLite and renderer stores remain projections.
- First-class task events reuse and migrate existing orchestration/fleet authority rather than create a parallel agent platform.
- Models propose events; controller validation commits them.

## Consequences

### Benefits

- State can replay and recover deterministically.
- Decisions, approvals, and corrections target the right task and descendants.
- Consequential retries use intent/receipt and idempotency rules.
- UI and realtime sessions can reconnect from watermarks.

### Costs

- Schema migrations and reducer compatibility become maintained interfaces.
- Provider events require normalization.
- Recovery must reconcile durable intent with external process state.

## Alternatives considered

### Store task state only in model transcripts

Rejected because transitions, permissions, and recovery would depend on model interpretation.

### Let Desktop SQLite own tasks

Rejected because the agent server and TUI need the same authority and client caches are rebuildable.

### Independent voice task store

Rejected because it would duplicate the existing fleet/controller domain.

## Verification

- Full event replay equals snapshot-plus-suffix replay.
- Illegal transitions and stale context completion are rejected.
- Client restart preserves exact pending decisions/approvals and current safety state.
- Unknown events hold the affected task read-only; unknown consequential outcomes are not replayed automatically.
- Interrupted storage migrations restore the validated backup or complete atomically.
