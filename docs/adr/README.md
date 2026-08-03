# Architecture decision records

ADRs preserve Zyra’s load-bearing decisions so later implementation and review do not repeatedly reopen them without new evidence.

Status vocabulary:

- **Proposed** — under discussion.
- **Accepted design; implementation pending** — chosen direction, not yet a runtime claim.
- **Accepted and implemented** — current enforced architecture.
- **Superseded** — replaced by a linked later ADR.
- **Rejected** — considered and declined.

## Voice-agent decisions

- [ADR-0001: Voice is a mode of the canonical conversation](0001-voice-is-a-canonical-conversation-mode.md)
- [ADR-0002: Use two model roles with bounded foreground tools](0002-two-model-roles-and-bounded-foreground-tools.md)
- [ADR-0003: Keep task authority in deterministic ledgers](0003-deterministic-task-controller-and-ledgers.md)
- [ADR-0004: Keep one central narrator and exceptional subagents](0004-central-narration-and-exceptional-subagents.md)
- [ADR-0005: Build continuity as a materialized view](0005-continuity-as-a-materialized-view.md)
- [ADR-0006: Separate involvement preferences from permissions](0006-separate-involvement-from-permissions.md)
- [ADR-0007: Keep canonical Chat primary and make Voice an explicit foreground route](0007-canonical-chat-and-explicit-voice-foreground-routing.md)

## Format

Each ADR records context, decision, consequences, alternatives, and verification. A changed load-bearing decision creates a refining or superseding ADR rather than silently rewriting accepted history.
