# ADR-0002: Use two model roles with bounded foreground tools

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-02
- **Specification:** [System architecture](../architecture/voice-agent/system-architecture.md)

## Context

A passive speech shell would route every meaningful utterance through a slower strong model. An unrestricted realtime model would hold excessive authority and expose shell/write/control operations to a low-latency conversational loop. A third summarization model would add cost, state, and failure modes.

## Decision

Zyra uses two logical model roles:

1. A capable **realtime foreground agent** owns conversation, clarification, direct answers, and bounded read/search/inspection/status tools.
2. One **strong primary agent** activates on demand for writes, commands, tests, Git, consequential actions, deep investigation, and durable work. The initial production policy allows one active strong-primary attempt per canonical conversation.

The foreground has no generic shell, writes, tests, Git mutation, deployment, or desktop-control authority. A deterministic controller promotes requests and enforces the capability boundary.

The physical provider/model can change behind an adapter while these roles remain stable.

## Consequences

### Benefits

- Low-latency conversation remains useful without waking the strong model for every turn.
- Mutation and consequential authority stay behind established sandbox/approval paths.
- Costs and usage can be attributed to voice and strong work separately.
- Provider replacement does not change domain roles.

### Costs

- Promotion and steering require an explicit client-managed contract.
- Foreground and primary context must be synchronized through versioned records.
- Provider capability gaps need fallback routes.

## Alternatives considered

### Strong model for every utterance

Rejected because it increases latency and agent-work usage and reduces foreground capability.

### Unrestricted realtime model

Rejected because prompt instructions cannot safely enforce a write/control boundary.

### Third summarization/router model

Rejected for continuity and ordinary routing. Deterministic services build resume context; the two active roles emit checkpoints during normal work.

## Verification

- Foreground attempts to mutate state fail at the tool seam.
- Direct explanations and bounded inspections complete without a primary run.
- Write/test/deep requests promote with exact intent preserved.
- Resume does not invoke a third model.
