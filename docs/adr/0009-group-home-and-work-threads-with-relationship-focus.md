# ADR-0009: Group Home and work threads with relationship focus

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-04
- **Owners:** Zyra maintainers
- **Specification:** [Phase Two — relationship-first interaction](../architecture/voice-agent/relationship-first-interaction.md)
- **Depends on:** [ADR-0008](0008-offer-relationship-first-interaction-as-an-optional-second-phase.md)
- **Refines:** [ADR-0001](0001-voice-is-a-canonical-conversation-mode.md), [ADR-0005](0005-continuity-as-a-materialized-view.md), and [ADR-0007](0007-canonical-chat-and-explicit-voice-foreground-routing.md)

## Context

Phase Two needs one persistent Zyra entry point and many scoped work conversations. Treating them as one transcript would destroy context locality. Treating scope changes as ordinary page navigation would lose the requested Voice continuity. Existing `ForegroundRoute` records authorize output for one canonical conversation and should retain that meaning.

## Decision

Phase Two adds one idempotently bootstrapped `AssistantRelationship` per local `user_space_id`, which is separate from prompt profiles, provider accounts, projects, and model settings. It groups one active Home generation, canonical RelationshipConversationBinding records, folder/work-thread references, and one relationship-wide server-authoritative `RelationshipFocusLease`. Home and every work thread retain separate canonical conversation IDs and JSONL histories. Other clients may mirror or explicitly request takeover; they cannot silently move the lease owner’s focus or routes.

A `WorkThread` binds one canonical conversation to an origin, substantial objective, optional folder, simple tasks, private execution records, and artifacts. Threads do not nest in the first Phase Two release. A standalone task cannot change its Phase One `conversation_id`; promotion safely releases/cancels it with the existing reason, creates a new thread-bound successor using existing `supersedes_task_id`, and appends a separate Phase Two `TaskContinuation` for the forward/audit link while preserving provenance and preventing operation replay.

The relationship focus lease identifies active/parked/retired lifecycle, optional owner attachment, lease revision/heartbeat/expiry, focus generation, and focused conversation/thread/task. Detached state preserves one parked focus snapshot but accepts no relationship interaction; reattachment claims a fresh generation. Organization removal consumes parked focus into terminal `retired`; later V2 enablement bootstraps a new relationship ID rather than reviving it. It composes with, rather than replaces, each conversation’s foreground route. A Voice focus change compares the lease plus both route heads, prepares a new immutable target provider-thread/session binding, then atomically updates the lease and source/target routes. Stale lease, focus, route, provider-thread, or physical-session generations cannot produce accepted output. Takeover requires current-owner yield, trusted UI confirmation under the takeover policy, or reconciled expiry/disconnect. One CAS transaction quiesces/terminalizes the old attachment/session, increments generation, activates the new owner/route binding, and returns explicit winner/loser receipts; old generations reject all interaction.

The visible conversation canvas and composer remain stable during a focus change; Voice presence stays mounted only when the visit began in active Voice, while Chat/TUI visits never start Realtime. Provider context isolation remains mandatory: a lower transport may switch only by creating a separately identified immutable provider-thread/session binding, otherwise adapters hand off to a prewarmed physical session or reconnect. A provider thread maps to one canonical conversation for life. Unknown isolation capability fails closed for Voice preparation; typed V2 remains and may offer an explicit Chat-modality fallback whose decline leaves attention pending.

Home/work-thread creation crosses JSONL and controller stores through a deterministic ConversationCreationIntent/Receipt. Binding, metadata, initial/successor tasks, promotion terminal link, and Home activity remain inactive until the exact intended canonical session/header is durably flushed and receipted and the controller atomically appends its initial Chat route; recovery reconciles the same intent and dispatches no orphan.

Messages never move or copy between Home and a work thread. Home receives idempotent provenance-linked **controller activity receipts** for launches, attention, failures, and verified outcomes. These are projections, not canonical assistant messages. Natural Home text/speech uses the existing gateway/narration path only under an active Home foreground claim.

Active Home cannot be directly deleted. Reset requires trusted non-speech confirmation after active/preparing Voice returns to a fresh quiescent Chat route and physical Realtime closes. It then CAS-installs a durable generation-bound writer fence after validating requester-owned Home focus and relationship/Home-route/focus/visit/operation heads. All input/output, narration, visit, takeover, profile-switch, and Home activity-projection writers reject new generation-bound mutation while pre-fence operation/receipt/NarrationDelivery streams drain exactly and uncertain speech becomes nonreplayable `outcome_unknown`; background-source receipts wait generation-unassigned while the replacement header is receipted. Final activation revalidates the fence token, physical-Realtime absence, and drained/unchanged operation/receipt/narration heads, atomically appends the new epoch-1 Chat route/binding, advances Home/focus generations, assigns post-fence receipt intents to the selected generation, retires the old target, and releases the fence; pre-fence receipts never copy. Recovery resumes or safely aborts that same fenced intent and copies no messages. Reset discloses that old Home is archived/searchable under existing retention; erasure is a separate trusted post-activation content cascade and is never implied by reset. V2 disablement deletes nothing. Trusted non-speech removal of relationship organization terminalizes bindings/projections while preserving canonical V1 sources; deleting contained content is a separate trusted-control explicit per-source manifest cascade that closes dependent attention/visits first.

## Consequences

### Benefits

- One logical Zyra relationship can span bounded project and work contexts.
- Existing canonical-conversation integrity and deletion rules remain usable.
- Voice can feel continuous without assuming unsafe provider-session reuse.
- V1 can expose every Phase Two conversation without understanding relationship focus.
- Every projected/running/actionable source has a current binding; verified ambiguity uses `ordinary_reference`, while an unverifiable active source blocks V2 rather than being guessed.

### Costs

- Cross-conversation focus transitions require coordinated transactions and recovery.
- Continuity needs a relationship-level index plus per-focus packets.
- Multi-client attachment needs explicit focus arbitration.
- Receipts and search must preserve source provenance without copying private detail.

## Alternatives considered

### One global canonical transcript

Rejected because project isolation, retention, deletion, context budgets, and conflict handling require separate conversations.

### Overload `ForegroundRoute` with relationship scope

Rejected because its current interface is deep and precise: one conversation, one route epoch, one response owner. A separate focus record composes the existing authority without changing its meaning.

### Always reuse the current realtime session

Rejected because most providers cannot prove that prior scope context has been removed.

## Verification

- Home and each work thread preserve distinct message ledgers.
- One nonretired relationship has one current active-or-parked focus snapshot, at most one active owner/generation, and a silent parked state while detached; takeover has one CAS winner and explicit loser.
- Target hydration completes before a focus transition commits; Chat/TUI keeps null realtime binding, and only already-active Voice performs provider/route handoff.
- Cross-conversation route/focus changes are atomic or leave the source authoritative.
- Stale source/target provider callbacks cannot append after the transition, and provider thread IDs never rebind across conversations.
- Profile rollback exposes underlying Home/thread conversations and unresolved source affordances through V1 without copying messages or requiring WorkThread semantics.
- Promotion never changes Phase One task schema/conversation ID or transfers leases/operations; existing `supersedes_task_id` plus separate TaskContinuation represent lineage.
- Crashes across canonical conversation creation and controller activation cannot duplicate or dispatch an orphan Home/work thread.
- Home activity receipts cannot bypass foreground owner claims to create assistant messages.
- Reset Home first proves quiescent Chat/no physical Realtime; its fence rejects conversation/narration/focus/projection mutation and revalidates drained operation/receipt/NarrationDelivery heads before activate/abort.
- Organization removal consumes parked focus into terminal `retired`; re-enable creates a new relationship ID.
