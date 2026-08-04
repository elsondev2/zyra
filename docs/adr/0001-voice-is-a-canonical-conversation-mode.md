# ADR-0001: Voice is a mode of the canonical conversation

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-02
- **Owners:** Zyra maintainers
- **Specification:** [Voice-agent architecture](../architecture/voice-agent/README.md)
- **Refined by:** [ADR-0007](0007-canonical-chat-and-explicit-voice-foreground-routing.md) and Phase Two [ADR-0009](0009-group-home-and-work-threads-with-relationship-focus.md)

## Context

Zyra already has a canonical Pi session identity shared by Desktop and TUI, server-owned runtime lifetime, and rebuildable client projections. An isolated Voice Lab proved media and protocol behavior but maintains an ephemeral thread and separate presentation state.

A production voice feature that creates its own chat, history, composer, permission state, or task identity would split user context and make handoff/resume unreliable.

## Decision

> **Phase Two refinement:** This remains the complete Phase One behavior and remains true within each focused Home/work-thread conversation. ADR-0009 adds explicit cross-conversation relationship focus without merging their histories.

Voice becomes a mode of the existing canonical conversation.

- Spoken, typed, and image messages share one conversation ID and canonical history.
- The normal Chat surface routes directly to the strong agent; an explicit Start Voice action attaches Realtime to that same conversation.
- Voice reuses the existing composer, attachments, settings, permission policy, task controller, and runtime.
- A physical realtime session is disposable and never becomes the chat identity.
- Starting Voice attaches to a running task without cancelling or restarting its execution attempt.
- Closing Voice detaches media, returns foreground ownership to Chat, and leaves durable tasks running.
- The Lab remains experimental evidence and is not promoted as a second production chat product.

## Consequences

### Benefits

- Cross-surface continuity follows existing canonical-chat rules.
- Users can switch between speech, text, and images without losing task context.
- Permissions, approvals, history, and task status have one source.
- WebRTC expiration does not imply conversation loss.

### Costs

- Voice integration must map provider item identity into canonical messages.
- Existing Lab state must be migrated or discarded explicitly.
- The canonical conversation UI must support realtime transcript and media states.

## Alternatives considered

### Separate Voice chat product

Rejected because it duplicates identity, history, permissions, and task state.

### Copy Voice summaries into the main chat after each call

Rejected because summaries lose exact turns, corrections, attachments, and live task steering.

## Verification

- A voice turn and subsequent typed turn use the same canonical conversation ID.
- Desktop/TUI replay contains final voice messages once.
- Ending Voice leaves an active primary task running.
- Reconnecting creates a new physical session without a new chat.
