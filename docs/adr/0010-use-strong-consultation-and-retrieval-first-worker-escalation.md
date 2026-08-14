# ADR-0010: Use strong consultation and retrieval-first worker escalation

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-04
- **Owners:** Zyra maintainers
- **Specification:** [Phase Two — relationship-first interaction](../architecture/voice-agent/relationship-first-interaction.md)
- **Depends on:** [ADR-0008](0008-offer-relationship-first-interaction-as-an-optional-second-phase.md)
- **Refines:** [ADR-0002](0002-two-model-roles-and-bounded-foreground-tools.md), [ADR-0003](0003-deterministic-task-controller-and-ledgers.md), and [ADR-0004](0004-central-narration-and-exceptional-subagents.md)

## Context

Realtime Voice should answer quickly, but some questions need stronger reasoning without becoming durable work. Substantial work needs decomposition and dedicated execution. Workers may later need information that already exists in Home, a project, or a related thread. Asking the user immediately would make the system forgetful; giving every worker every conversation would create leakage and noise.

## Decision

Phase Two preserves the two provider-role families—realtime foreground and strong agent—while adding explicit strong-agent lanes:

1. **Strong consultation** — bounded, read-only, one-shot reasoning requested by the Voice foreground. It returns facts, provenance, and uncertainty to Zyra and creates no task/thread unless the original request already carries explicit substantial-work intent or the user accepts one promotion Ask.
2. **Strong coordination** — decomposition, task/thread routing, authorized context retrieval, and escalation quality; no default editing or artifact integration.
3. **Strong primary execution** — one task owner for execution, artifact integration, verification evidence, and completion inside a thread. Cross-thread synthesis is another controller-managed task with one primary.

One model/provider may implement all strong lanes. They remain separate domain contracts so authority and usage do not blur. Strong consultations cannot mutate or address the user. Strong primaries and exceptional children remain private while Voice owns the foreground.

A worker missing context sends a structured request to the coordinator. Before retrieval, the controller issues a non-bearer ContextRetrievalAuthorization binding requester task/attempt/owner, exact purpose, allowed source IDs/data classes, policy/context revisions, redaction and size limits, expiry, and use budget. Relationship or folder membership grants nothing by itself. Each request produces a durable access receipt listing requested/returned/denied sources and watermarks.

Within that authorization, the coordinator searches acknowledged task context, current thread, project decisions, provenance-linked Home exchanges, and explicitly related threads/artifacts. Found information becomes a versioned scoped context revision with provenance and owner acknowledgements. Stale, conflicting, unavailable, injected, or authority-bearing information creates one revision-bound user attention item.

Work threads do not make subagents routine by definition. Each thread has a normal strong primary; exceptional child delegation retains ADR-0004 justification, attenuation, and integration rules.

## Consequences

### Benefits

- Voice can obtain stronger reasoning without creating thread clutter.
- Workers reuse trustworthy context before interrupting the user.
- Context remains least-privilege and auditable.
- Existing primary ownership and exceptional-child policy remain intact.

### Costs

- The strong adapter needs consultation, coordination, and execution telemetry.
- Retrieval requires provenance, freshness, conflict, and policy checks.
- Promotion must preserve consultation evidence without treating it as authority.
- Coordinator bottlenecks and usage need atomic relationship-level budgets/reservations and health reporting.

## Alternatives considered

### Let Realtime decide and execute everything

Rejected because provider capability, reasoning depth, tool safety, and durable verification differ.

### Ask the user whenever a worker is uncertain

Rejected because relevant accepted context may already exist and unnecessary interruption damages continuity.

### Give every worker all relationship history

Rejected because it violates least privilege, context budgets, project isolation, and deletion expectations.

### Treat every strong consultation as a task

Rejected because one-shot reasoning should remain lightweight and mostly invisible.

## Verification

- A consultation cannot call mutation or protected tools.
- A consultation that exceeds its budget returns exact `promotion_required` request/evidence; work launches only from already-explicit substantial-work intent or one accepted Ask.
- Worker context requests never reach the user before authorized retrieval is attempted.
- Every retrieval is bounded by an exact authorization and durable access receipt; every answer has source, scope, freshness, redaction, and conflict evidence.
- Context revisions reach and are acknowledged by affected workers.
- Unresolved or conflicting context creates one user attention item.
- Workers and consultations never produce user-facing speech or canonical answers directly.
- Coordinator and consultation/thread launches reserve relationship usage/concurrency atomically before dispatch and reconcile provider receipts conservatively.
