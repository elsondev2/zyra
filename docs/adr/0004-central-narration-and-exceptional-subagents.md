# ADR-0004: Keep one central narrator and exceptional subagents

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-02
- **Specification:** [Narration and interaction](../architecture/voice-agent/narration-and-interaction.md)

## Context

Coding agents produce noisy internal activity: tools, commands, diffs, tests, logs, worker discussions, and partial findings. Letting every worker talk directly would create competing identities, interruptions, unverified claims, and accidental disclosure.

Eager subagent spawning also raises context, usage, integration, permission, and writer-conflict costs.

## Decision

The realtime foreground agent is the sole user-facing narrator.

- Primary and child agents emit structured events and private evidence.
- A deterministic narration scheduler selects, redacts, deduplicates, and times user-visible updates.
- Each speech request has durable delivery state, a deterministic canonical message ID, provider/session identity, and terminal watermark semantics.
- Raw tools, logs, code, tests, and internal discussion never enter TTS.
- Decisions, approvals, blockers, failures, meaningful progress, and verified completion can become speakable narration items.
- One strong primary normally works alone and owns integration and verification.
- Subagents require an explicit exceptional reason, narrow context, attenuated capabilities, and typed return contract.
- Child results remain untrusted until the primary validates them.

## Consequences

### Benefits

- The user experiences one stable Zyra identity.
- Speech remains calm, useful, and safer for private coding output.
- Completion authority is clear.
- Default cost and concurrency remain bounded.

### Costs

- Narration needs event semantics, scheduling, and explicit-speech support.
- Worker outputs need safe summaries and inspectable task details.
- The primary can become an integration bottleneck for legitimately large parallel work.

## Alternatives considered

### Workers speak directly

Rejected because it fragments identity and bypasses validation/narration policy.

### Spawn specialist agents by default

Rejected because normal tasks benefit from one owner and because coordination overhead is measurable.

### Hide all background activity until completion

Rejected because blockers, approvals, meaningful progress, and user steering require timely visibility.

## Verification

- Speech corpus contains no raw tool/log/code/private output.
- Child completion cannot produce root completion or user speech.
- Crash-point tests produce at most one canonical message and never replay unknown-outcome speech.
- Default task starts with zero subagents.
- Every child records reason, scope, return contract, and integration owner.
