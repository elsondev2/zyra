# ADR-0011: Use attention items, focus visits, and Home receipts

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-04
- **Owners:** Zyra maintainers
- **Specification:** [Phase Two — relationship-first interaction](../architecture/voice-agent/relationship-first-interaction.md)
- **Depends on:** [ADR-0009](0009-group-home-and-work-threads-with-relationship-focus.md) and [ADR-0010](0010-use-strong-consultation-and-retrieval-first-worker-escalation.md)
- **Refines:** [ADR-0004](0004-central-narration-and-exceptional-subagents.md), [ADR-0005](0005-continuity-as-a-materialized-view.md), and [ADR-0006](0006-separate-involvement-from-permissions.md)

## Context

Background threads can become invisible, noisy, or cognitively expensive. Users need to know when work requires attention and to enter the relevant context without finding and opening several screens. The interaction must also preserve the difference between a product decision, a trusted approval, a review, and routine progress.

## Decision

Phase Two creates append-only `AttentionItem` records only for canonical decisions, approvals, blockers, kickoff gaps, reviews, or actionable failures that require user input. Each item binds the exact source ID/type/revision/watermark plus context, policy, and focus revisions. Routine verified completion enters Completed and receives a Home activity receipt directly; it does not enter Needs you. The hybrid Inbox and active-work strip are projections over canonical records. Needs you owns the notification count; Active shows live work; Completed shows recent verified outcomes whether or not they were opened.

During ordinary conversation, Zyra may offer one pending item at the next natural boundary. During explicit Inbox review, it may offer items sequentially. Declining defers rather than cancels or approves the source work. Repeated unsolicited offers are suppressed for the current conversational segment and respect explicit snooze instructions.

Offer/proposal reads projected item metadata only and performs no target retrieval, hydration, or provider allocation. Exact acceptance first CAS-creates a purpose-bound `FocusVisit` in `preparing`; offer/defer state remains on the AttentionItem before acceptance. The visit preserves immutable `chat`/`voice` modality and records source/target focus-lease/route identities, a provider scope binding required only for Voice and null for Chat, item/source revisions, hydration watermark, return anchor, required answer, resolution, delegated context revision, independent return/acknowledgement deadlines, acknowledgement result, return transport/state, and terminal recovery outcome. Resolution validates all current revisions atomically.

Chat/TUI acceptance remains Chat and never starts Realtime. Source hydration and worker acknowledgement begin in parallel. A separate bounded return deadline restores source Chat for Chat visits, or source Voice when ready with safe Chat/degraded Voice fallback for Voice visits; it never waits for the acknowledgement deadline. If the worker has not yet acknowledged, the visit becomes `returned_pending_ack`; later acknowledgement updates the thread/receipt, while timeout/rejection creates a new blocker without reopening the old visit or trapping the user.

The detailed focused conversation remains in the work thread. Zyra Home receives one deterministic, provenance-linked compact **controller activity receipt** for launch, resolved/deferred visit, failure, or verified outcome. It is not an assistant message and needs no fabricated Home route claim. When Home is actively focused, natural text/speech is a separate ordinary gateway/narration delivery. Routine progress and raw execution remain in the thread.

Voice may discuss and navigate to an approval, but trusted controls remain the only authorization path.

## Consequences

### Benefits

- Background work stays discoverable without flooding Home.
- Voice can conduct short contextual visits and restore the user’s prior topic.
- Inbox, active strip, and Home receipts share one source of truth.
- Decisions, approvals, and attention remain semantically distinct.

### Costs

- Natural-pause scheduling and deferral cadence require policy and evaluation.
- Focus visits need crash recovery and exact return anchors.
- Receipt redaction and idempotency span source records and the Home projection, while natural narration retains separate route ownership.
- Multiple attached clients require one authoritative offer/focus owner.

## Alternatives considered

### Put every background event in Home

Rejected because it would overwhelm conversation and speech with mechanics.

### Keep all attention inside thread pages

Rejected because forgotten work would remain forgotten and Voice would not feel relationship-first.

### Copy the focused visit transcript into Home

Rejected because duplication would corrupt chronology, retrieval, deletion, and model context.

### Let accepting a visit resolve approvals

Rejected because conversational focus and security authority are independent.

## Verification

- Needs you, Active, and Completed agree with canonical source records.
- One pending source event produces one attention identity.
- Source deletion/redaction/withdrawal terminalizes that item as non-actionable `source_unavailable`, safely closes/returns any visit, retains only a non-opening provenance tombstone, and rejects stale answers.
- Ordinary conversation offers at most one unsolicited item per segment.
- Deferral preserves the source item and grants no permission.
- A focus visit cannot enter before target hydration and user acceptance; Chat/TUI remains Chat with null realtime binding, while only already-active Voice creates a target provider binding.
- Resolution returns by its independent return deadline, with Chat/degraded-Voice fallback; pending acknowledgement has one later acknowledged/blocker terminal revision.
- Home receives one compact controller activity receipt, no route-less assistant message, and no copied detailed transcript.
- Restart cannot duplicate offers, receipts, speech, decisions, or worker steering.
- Trusted approval controls remain mandatory in every interaction profile.
- Routine completion enters Completed without increasing Needs you.
- A pre-task kickoff request remains actionable in V1 through a server-normalized pending question carrying exact request/action revision; canonical reply receipt plus CAS resolves once, while stale/wrong-card replies resolve nothing else.
- Stale source/item/context/focus revisions cannot resolve or steer work.
