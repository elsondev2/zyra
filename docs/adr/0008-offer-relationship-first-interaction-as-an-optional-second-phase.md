# ADR-0008: Offer relationship-first interaction as an optional second phase

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-04
- **Owners:** Zyra maintainers
- **Specification:** [Phase Two — relationship-first interaction](../architecture/voice-agent/relationship-first-interaction.md)
- **Depends on:** [ADR-0007](0007-canonical-chat-and-explicit-voice-foreground-routing.md)
- **Refines:** [ADR-0001](0001-voice-is-a-canonical-conversation-mode.md), [ADR-0002](0002-two-model-roles-and-bounded-foreground-tools.md), [ADR-0004](0004-central-narration-and-exceptional-subagents.md), and [ADR-0005](0005-continuity-as-a-materialized-view.md)

## Context

Phase One makes an ordinary canonical conversation the home surface. A user selects or creates that conversation, types directly to the strong agent, and may explicitly attach Voice without losing its active work.

That interaction remains useful and should ship independently. A later product phase can offer a more persistent-assistant posture: the user addresses Zyra before choosing a work thread, substantial work branches into background conversations, and Zyra brings unresolved work back at a natural moment. Users may prefer either posture, so Phase Two must not replace or invalidate Phase One.

A single lifetime transcript would create unsafe context mixing, unbounded retrieval, difficult deletion, and poor project locality. Separate workers speaking directly would fragment Zyra’s identity. Invisible background work would become easy to lose. Hard page navigation between Home and work threads would also break the low-friction Voice experience.

## Decision

Zyra will define two product interaction profiles after Phase One is complete:

1. **Phase One / `conversation_scoped`** — the user selects a canonical conversation and optionally starts Voice inside it. This profile remains independently supported.
2. **Phase Two / `relationship_first`** — the user enters a distinguished Zyra Home conversation, talks immediately, and lets substantial work launch or resume conversation-first work threads.

The V1/V2 labels describe product profiles, not protocol or storage versions.

Phase Two adds an `AssistantRelationship` aggregate above canonical conversations. A unique user-space mapping—distinct from prompt profiles and provider accounts—groups one generated Home conversation, folders, revisioned relationship-conversation bindings, work-thread references, attention projections, interaction preferences, and one relationship-wide conversational focus lease. Every message still belongs to exactly one canonical conversation. The relationship is not a merged transcript or execution authority source.

A work thread represents a substantial chunk or set of work. It binds one canonical conversation to an objective, origin, optional folder, simple tasks, execution records, and results. Threads do not nest in the first release. A standalone task may continue through a safely released, linked successor inside a new thread; its immutable conversation/task history is never reparented and completed/unknown operations are never replayed.

The request ladder is:

- realtime answers or inspects within its bounded Voice capability;
- a mostly invisible, read-only strong consultation handles deeper one-shot reasoning;
- the strong coordinator creates or resumes a simple task or substantial work thread;
- dedicated workers execute privately and escalate missing context to the strong coordinator;
- the coordinator performs scoped, provenance-bearing retrieval before creating user attention;
- Zyra remains the sole user-facing identity.

Default `ask_if_ambiguous` policy launches a thread automatically only for explicit substantial-work intent; discussion, ideas, and unclear ownership stay conversational until the user chooses. Proactive behavior is limited to quiet projections plus actionable attention/verified outcomes at natural pauses and never starts Voice or moves focus.

Phase Two presents running work through a compact active-work strip and one hybrid Inbox with `Needs you`, `Active`, and `Completed` views. Needs you contains only work requiring user input or deliberate review; routine verified outcomes enter Completed directly. Routine progress stays in the source thread. Home receives deterministic structured activity receipts for launches, attention, failures, and verified outcomes. Natural assistant text/speech still requires an ordinary route-bound foreground delivery.

When user input is required, Zyra offers a purpose-bound `FocusVisit` at a natural pause. After acceptance, the same visible conversation canvas changes scope to the target thread while target hydration, relationship focus-lease ownership, and foreground-route authority remain deterministic. A Chat/TUI visit stays Chat with no realtime binding. A visit entered from already-active Voice receives an immutable target provider-thread/session binding; physical transport may be replaced behind the stable UI. Resolution creates a scoped context revision. Source rehydration and worker acknowledgement run in parallel; an independent return deadline restores source Chat for Chat visits or source Voice with safe Chat/degraded-Voice fallback for Voice visits without waiting for the later acknowledgement deadline. Late acknowledgement updates work asynchronously; rejection/timeout creates a blocker without trapping the user.

Profile switching is additive and reversible. It never merges or copies messages, changes task/attempt authority, grants permission, cancels work, or deletes Phase Two records. V2 can be disabled while V1 exposes all underlying canonical conversations, including Zyra Home, plus each unresolved kickoff question/decision/approval/blocker/review through V1-compatible server-normalized affordances. V1 need not interpret WorkThread or relationship projections.

## Consequences

### Benefits

- Users can address one persistent Zyra identity without organizing a conversation first.
- Existing thread-oriented workflows remain available.
- Background work stays discoverable through live receipts, active work, and Inbox attention.
- Voice can move into and out of work contexts without exposing worker personalities.
- Context questions are resolved from trustworthy existing records before interrupting the user.
- Conversation, project, deletion, permission, and provider scopes remain bounded.
- Once V2 is implemented, Phase One remains both a complete interaction-profile fallback on that same runtime and a preference choice; executable downgrade is separate.

### Costs

- The controller needs relationship, work-thread, attention, focus, visit, receipt, and consultation records.
- Cross-conversation Voice focus requires coordinated route transitions and provider-session isolation.
- Desktop and TUI need scope-preserving navigation, return anchors, and consistent Inbox projections.
- Retrieval must detect stale or conflicting cross-thread context rather than silently merging it.
- Multiple work threads increase concurrency, usage, notification, and writer-scope pressure.
- Phase Two requires its own migration, recovery, accessibility, and multi-client tests.

## Alternatives considered

### Replace all conversations with one permanent transcript

Rejected because context, deletion, privacy, project locality, and provider limits require bounded canonical conversations.

### Replace Phase One when Phase Two ships

Rejected because some users prefer explicit thread selection, V1 is easier to reason about, and it remains the safe fallback when relationship routing is disabled.

### Make every user request a work thread

Rejected because explanation, brainstorming, and bounded actions should remain lightweight. Threads are reserved for substantial chunks of work.

### Let workers ask the user directly

Rejected because multiple speakers fragment identity, bypass context arbitration, and can expose unverified or private worker output.

### Reuse one realtime model session across every thread

Rejected as a default because most providers cannot prove that prior scoped context has been removed. A stable UI may hide a safe physical-session replacement.

### Surface all background progress in Zyra Home

Rejected because routine mechanics would drown the relationship timeline and spoken conversation. Home receives attention and verified outcomes by default.

## Verification

- Phase One passes its release suite without enabling relationship-first modules.
- V1 and V2 display the same canonical messages, tasks, approvals, and artifacts without copying records.
- Casual discussion/ideas create no durable work; explicit substantial-work intent may launch one visible thread, while ambiguous ownership asks before dispatch.
- Proactive behavior never starts Voice or changes focus and offers at most one actionable item at a natural pause outside explicit Inbox review.
- Substantial work creates one work thread, at least one task before execution, and one deterministic launch activity receipt.
- A worker asks the strong coordinator for context before one user attention item is created.
- Trusted context resumes work silently; stale/conflicting/missing context reaches the user.
- A declined visit safely holds work and remains in Needs you without repeated interruption.
- An accepted visit hydrates its target before focus changes and accepts output from only the current relationship focus lease plus route/provider binding.
- Resolution propagates one context revision, restores the exact source scope by an independent return deadline with safe Chat/degraded-Voice fallback, and records later acknowledgement/blocker safely.
- Routine completion enters Completed without Needs you; deliberate review remains attention.
- Active Home deletion is rejected; trusted-control Reset first ends Voice to quiescent Chat, fences conversation/narration/focus/projection writers, drains operation/receipt/NarrationDelivery heads, and revalidates exact watermarks before generation activation without copying messages or replaying uncertain speech.
- Approval discussion through Voice cannot authorize the protected action.
- Disabling V2 preserves every canonical conversation and running attempt, surfaces unresolved source items through V1, and returns the user to the V1 conversation selector.
