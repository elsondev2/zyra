# ADR-0007: Keep canonical Chat primary and make Voice an explicit foreground route

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-02
- **Owners:** Zyra maintainers
- **Specification:** [Voice-agent architecture](../architecture/voice-agent/README.md)
- **Refines:** [ADR-0001](0001-voice-is-a-canonical-conversation-mode.md), [ADR-0002](0002-two-model-roles-and-bounded-foreground-tools.md), and [ADR-0004](0004-central-narration-and-exceptional-subagents.md)
- **Phase Two relationship focus refined by:** [ADR-0008](0008-offer-relationship-first-interaction-as-an-optional-second-phase.md) and [ADR-0009](0009-group-home-and-work-threads-with-relationship-focus.md)

## Context

A user may want an ordinary coding-agent conversation in which typed messages go directly to the strong agent and commands, tools, diffs, and tests remain inspectable. On any later turn, the same user may want to start a low-latency voice conversation without creating another chat or cancelling work already in progress.

The earlier architecture assigned every conversational response to the realtime foreground. That rule would require a realtime session for normal text chat, add an unnecessary model hop, and prevent the strong agent from providing the familiar direct coding-chat experience.

## Decision

> **Phase Two refinement:** The rule below is the permanent Phase One `conversation_scoped` profile and remains the per-conversation route contract inside Phase Two. ADR-0008 adds optional Zyra Home navigation; ADR-0009 composes separate conversation routes through one relationship focus.

The canonical chat is the home surface. It has one durable foreground route at a time:

1. **Chat route** — an ordinary typed or image-backed send assigns foreground response ownership to the strong primary role. The strong agent responds directly through the conversation gateway. Structured command, tool, diff, test, and artifact events can render inline without becoming assistant prose.
2. **Voice route** — the user explicitly starts Voice. After complete hydration and an atomic route handoff, the realtime foreground owns conversational responses and selective speech. The strong primary continues durable execution privately.

Each committed [`ForegroundRoute`](../architecture/voice-agent/schemas/foreground-route.schema.json) has a monotonic conversation route epoch and a non-authorizing owner claim. Epoch 1 is always Chat (`conversation_open` or proven legacy `migration`); later activation reasons encode and validate the exact Chat → Voice, Voice → Voice, Voice → Chat, failure, or recovery predecessor. The controller store requires exactly one active route for every non-deleted conversation before accepting input or output. Canonical user and assistant messages reference the route and epoch that accepted them; assistant messages also reference a durable commit receipt created while that route was active. Provider events from an older route epoch cannot commit messages.

Starting Voice while a strong-primary attempt is running does not cancel, pause, park, or release that attempt. The new realtime session receives current task state through the continuity service and becomes the narrator while the task continues with the same attempt, slot, locks, leases, and context obligations. If strong-agent text is currently streaming, the gateway first quiesces the response lane and commits its completed or interrupted prefix. Voice context is materialized only after that commit, and the route switches only after hydration includes it and all startup deltas; tool execution may continue.

Exiting Voice closes or detaches the physical realtime session and atomically activates a Chat route. The next typed turn goes directly to the strong agent. Automatic model-selected foreground routing and a per-message route selector are outside the initial release.

The strong agent has two output lanes:

- a **foreground Chat lane** that may produce one gateway-controlled canonical response while it owns the active route;
- a **private execution lane** that emits task events, tools, evidence, and completion candidates while Realtime owns Voice.

Background agents remain unable to address the user. Realtime remains the only spoken narrator while Voice is active.

## Consequences

### Benefits

- Normal text chat works without establishing a realtime session.
- Users can see familiar coding-agent activity and receive the strong model’s answer directly.
- Starting Voice preserves the same history, task, approvals, execution attempt, and artifacts.
- Route epochs give message commits and stale-provider rejection a deterministic owner.
- Voice allowance and microphone access begin only after explicit activation.

### Costs

- The strong-agent adapter needs a gateway-controlled direct-turn lane in addition to private task sessions.
- Route handoff must coordinate response interruption, canonical partial commits, hydration, and stale event quarantine.
- Timeline projections must render structured execution activity without copying raw logs into canonical model history or TTS.
- Continuity and recovery must retain the active foreground route as critical state.

## Alternatives considered

### Require Realtime for every typed conversation

Rejected because normal Chat would incur an unnecessary realtime dependency and model hop.

### Let Chat and Voice answer concurrently

Rejected because duplicate or contradictory assistant turns would have no deterministic owner.

### Automatically choose the foreground model for every message

Deferred because invisible routing weakens predictability. Explicit Chat sends and explicit Voice activation establish understandable ownership.

### Cancel the active task when Voice starts

Rejected because interaction-surface choice should not discard or restart durable work.

## Verification

- A typed Chat turn receives exactly one strong-agent canonical response and starts no realtime session.
- Starting Voice atomically supersedes the Chat route only after hydration includes the final completed/interrupted Chat prefix; stale strong output cannot append afterward.
- Failed Voice preparation rekeys Chat to a fresh route epoch/owner claim before direct output resumes.
- A running attempt retains its attempt ID, slot, writer locks, and valid leases across Voice activation.
- Voice receives current task status and can steer the continuing task through context revisions.
- Exiting Voice activates Chat without creating a new conversation or task.
- Tool and command events are visible as structured timeline activity, remain absent from TTS, and enter canonical model context only through bounded validated summaries.
