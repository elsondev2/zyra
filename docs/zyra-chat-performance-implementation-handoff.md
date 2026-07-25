# Zyra Chat Performance: End-to-End Implementation Plan

**Status:** implementation handoff  
**Written:** 2026-07-16  
**Repository:** the Zyra repository containing `desktop/`, `src/`, and the root `package.json`  
**Goal:** make long chats open quickly, load older history correctly, stream smoothly, and scroll without jumps while preserving deletion, Review, tool activity, attachments, and live-event correctness.

This document is self-contained. An implementation agent should be able to begin from the repository root without access to the conversation that produced it.

---

## 1. Required outcome

Implement all five changes as one staged architecture migration:

1. **Separate lightweight session/thread shells from selected-thread detail.**
2. **Load persisted chat history in real database-backed pages.**
3. **Render the timeline with T3 Code's `LegendList` virtualization pattern.**
4. **Preserve stable row identity and update only changed timeline rows.**
5. **Keep expensive Markdown parsing and highlighting off the streaming hot path.**

The completed system must prove this flow:

```text
SQLite persisted history
  -> paged main-process query
  -> typed Electron IPC contract
  -> renderer thread-detail/history store
  -> stable timeline-entry and row projection
  -> LegendList virtualized rows
  -> measured scroll anchoring and minimap
```

Do not call the project complete if only the visible component is faster. Startup payload size, persistence reads, IPC transfer, store behavior, timeline rendering, and long-chat interaction all matter.

---

## 2. Safety and working-tree rules

This repository may already contain substantial uncommitted work.

Before editing:

```bash
git status --short
git branch --show-current
git log -1 --oneline
```

Rules:

- Preserve unrelated changes.
- Do not reset, clean, stash, rebase, or rewrite history.
- Use scoped edits and scoped diffs.
- Stop the running desktop dev instance before installing `LegendList` or changing Electron main/preload contracts.
- Do not run a production build unless the user explicitly requests it. Use focused tests and `npm run ui:typecheck` during implementation.
- Commit by phase if commits are requested; each phase should be independently reviewable.

The current interim timeline work must not be accidentally reverted:

- `AssistantTimeline.tsx` keeps the **Earlier messages** control in normal document flow.
- `useAssistantTimelineWindow.ts` currently uses smaller prepend batches and short per-chat window retention.
- `AssistantTimelineCheckpointRail.tsx` already avoids subtree mutation observation and repeated per-marker DOM queries.
- Live work timers update their own text instead of rerendering large subtrees once per second.

Some of that interim window code will intentionally be replaced when real pagination and `LegendList` land. Preserve the behavior and tests until the replacement is proven.

---

## 3. Reference implementations and verified baselines

### T3 Code

Official upstream:

```text
https://github.com/pingdotgg/t3code.git
```

Studied baseline:

```text
d114e277 — Prevent duplicate project workspace roots (#3829)
```

A local checkout may exist at `../playground/t3code`, but the plan must not depend on that path. Fetch or clone the official repository elsewhere if needed.

Primary T3 references:

- `apps/web/src/components/chat/MessagesTimeline.tsx`
  - `LegendList`
  - stable `renderItem`
  - `keyExtractor`
  - `getItemType`
  - `initialScrollAtEnd`
  - `maintainScrollAtEnd`
  - `maintainVisibleContentPosition`
  - minimap positions from list measurements rather than DOM scans
  - row-local/context state boundaries
- `apps/web/src/components/chat/MessagesTimeline.logic.ts`
  - `computeStableMessagesTimelineRows`
  - shallow per-row equivalence
  - turn folding and compact work rows
- `apps/web/src/components/chat/timelineScrollAnchoring.ts`
  - explicit follow-end, anchored-turn, and free-scroll behavior
- `packages/client-runtime/src/state/threadDetail.ts`
  - shell/detail separation
  - detail-specific atoms/selectors
  - stable empty collections
- `packages/client-runtime/src/state/threadRetention.ts`
  - five-minute idle retention for recently viewed thread state
- `packages/client-runtime/src/state/threadSnapshotHttp.ts`
  - detail loading separated from the lightweight subscription path
  - cached detail paints while fresh detail loads

Use the architecture and invariants. Do not blindly copy T3 application state, Effect services, HTTP transport, or unrelated mobile/server code into Zyra.

### DevScope

Studied local baseline:

```text
85f6b17 — docs: refresh startup settings state
```

Relevant files mirror many of Zyra's current assistant files under:

```text
src/main/assistant/
src/renderer/src/lib/assistant/
src/renderer/src/pages/assistant/
```

DevScope is useful for existing Zyra-compatible behavior and legacy shapes. Do not copy its old source-window slicing directly: it can select the wrong activity edge relative to recent messages. Preserve Zyra's canonical chronology and turn boundaries.

---

## 4. Current Zyra architecture and bottlenecks

### Persistence

Tables are created in:

```text
desktop/src/main/assistant/persistence-utils.ts
```

Relevant tables:

- `assistant_threads`
- `assistant_turns`
- `assistant_messages`
- `assistant_activities`
- `assistant_proposed_plans`
- `assistant_pending_approvals`
- `assistant_pending_user_inputs`

Messages, activities, and proposed plans now have optional `timeline_sequence` columns. Existing indexes are primarily `(thread_id, created_at, id)` in ascending order.

Full thread detail is currently read in:

```text
desktop/src/main/assistant/persistence-read.ts
```

`readThreadDetails(...)` reads all messages, activities, and plans for the thread.

### Main-process service and IPC

Current selected-session hydration:

```text
desktop/src/main/assistant/service.ts
desktop/src/main/assistant/persistence-snapshot.ts
desktop/src/main/ipc/handlers/assistant-handlers.ts
desktop/src/main/ipc/handlers.ts
desktop/src/preload/adapters/assistant-adapter.ts
desktop/src/shared/assistant/contracts/ipc.ts
desktop/src/shared/contracts/devscope-api.ts
```

`hydrateSession` currently returns an `AssistantSnapshot` containing complete detail for the selected thread. Electron structured-clones that snapshot across IPC.

### Renderer store

Current store and hydration cache:

```text
desktop/src/renderer/src/lib/assistant/assistant-store-core.ts
desktop/src/renderer/src/lib/assistant/session-hydration-cache.ts
desktop/src/renderer/src/lib/assistant/assistant-store-hooks.ts
desktop/src/renderer/src/lib/assistant/assistant-store-selection-helpers.ts
```

`AssistantThread.messages`, `.activities`, and `.proposedPlans` currently have ambiguous semantics: consumers generally assume they are complete arrays. Real pagination cannot safely replace them with partial arrays without adding explicit history metadata and migrating consumers.

### Timeline

Current timeline path:

```text
desktop/src/renderer/src/pages/assistant/AssistantConversationPane.tsx
desktop/src/renderer/src/pages/assistant/AssistantConversationTimelinePane.tsx
desktop/src/renderer/src/pages/assistant/AssistantTimeline.tsx
desktop/src/renderer/src/pages/assistant/useAssistantTimelineEntries.ts
desktop/src/renderer/src/pages/assistant/useAssistantTimelineWindow.ts
desktop/src/renderer/src/pages/assistant/useAssistantPageTimelineScroll.ts
desktop/src/renderer/src/pages/assistant/AssistantTimelineCheckpointRail.tsx
desktop/src/renderer/src/pages/assistant/assistant-timeline-helpers.ts
desktop/src/renderer/src/pages/assistant/assistant-turn-work.ts
```

The current renderer window reduces mounted rows, but the full thread has already been read, cloned over IPC, stored, filtered, merged, and sorted. It is not database pagination.

---

## 5. Target data model

Do not keep using one `AssistantThread` shape to mean both shell and complete detail.

### 5.1 Thread shell

Introduce an explicit lightweight shell type in `desktop/src/shared/assistant/contracts/read-model.ts`.

Suggested shape:

```ts
export interface AssistantThreadShell {
    id: string
    providerThreadId: string | null
    source: AssistantThreadSource
    parentThreadId: string | null
    providerParentThreadId: string | null
    subagentDepth: number | null
    agentNickname: string | null
    agentRole: string | null
    model: string
    cwd: string | null
    messageCount: number
    activityCount: number
    proposedPlanCount: number
    lastSeenCompletedTurnId: string | null
    runtimeMode: AssistantRuntimeMode
    interactionMode: AssistantInteractionMode
    state: AssistantThreadState
    lastError: string | null
    createdAt: string
    updatedAt: string
    latestTurn: AssistantLatestTurn | null
    hasPendingApprovals: boolean
    hasPendingUserInputs: boolean
    hasActivePlan: boolean
}
```

If adding count columns to `assistant_threads` would make event writes fragile, compute counts with indexed aggregate queries during shell loading first. Add persisted counts only after correctness tests exist.

Session/sidebar selectors must consume shells only. The bootstrap/getSnapshot path must not contain message text, activity payloads, or plan Markdown.

### 5.2 Selected-thread detail

Introduce a separate renderer-owned detail record:

```ts
export interface AssistantThreadDetail {
    threadId: string
    activePlan: AssistantActivePlan | null
    pendingApprovals: AssistantPendingApproval[]
    pendingUserInputs: AssistantPendingUserInput[]
    history: AssistantThreadHistoryState
}

export interface AssistantThreadHistoryState {
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    proposedPlans: AssistantProposedPlan[]
    oldestCursor: AssistantHistoryCursor | null
    hasOlder: boolean
    initialLoading: boolean
    loadingOlder: boolean
    loadOlderError: string | null
    fullyLoaded: boolean
}
```

The names must make partial data explicit. Never expose a paged collection through a selector named as though it is complete.

### 5.3 History cursor and page

Use an opaque, versioned cursor at the IPC boundary so storage ordering can evolve without renderer changes.

```ts
export type AssistantHistoryCursor = string

export interface AssistantGetHistoryPageInput {
    threadId: string
    before?: AssistantHistoryCursor | null
    turnLimit?: number
}

export interface AssistantHistoryPage {
    threadId: string
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    proposedPlans: AssistantProposedPlan[]
    pageInfo: {
        oldestCursor: AssistantHistoryCursor | null
        hasOlder: boolean
        turnCount: number
    }
}
```

Encode/decode cursors only in the main process. Include a cursor version and enough canonical ordering data to reject malformed/stale values cleanly.

---

## 6. Canonical ordering and page boundaries

This must be solved before pagination.

### 6.1 Define one total timeline order

Today the renderer comparator primarily uses `createdAt`, compares `timelineSequence` only for equal timestamps, and can return equality for different records. Pagination needs a total, shared order.

Create a shared ordering module, for example:

```text
desktop/src/shared/assistant/timeline-order.ts
```

Define a canonical key:

```ts
interface AssistantTimelineOrderKey {
    createdAt: string
    timelineSequence: number | null
    kindRank: number
    id: string
}
```

Requirements:

- The comparator never returns `0` for distinct records.
- SQL ordering and TypeScript ordering are identical.
- Legacy rows without sequence remain deterministic.
- Message/activity/plan tie order is explicit through `kindRank`.
- Existing normal histories do not visually reorder unexpectedly.

Add fixture tests with:

- equal timestamps,
- missing sequences,
- mixed record kinds,
- legacy null `turn_id`,
- repeated runtime updates retaining sequence.

Do not implement paging until these tests pass.

### 6.2 Page by user-turn boundaries

Use turns, not arbitrary record counts, as the user-facing page unit.

Recommended default:

```text
INITIAL_TURN_LIMIT = 20
OLDER_TURN_LIMIT = 15
```

The exact values may be tuned after profiling, but page boundaries must begin at a user message whenever one exists.

Main-process algorithm:

1. Query the newest N user messages before the cursor using the canonical descending order.
2. Use the oldest selected user message as the inclusive lower boundary.
3. Use the incoming cursor as the exclusive upper boundary for older pages.
4. Fetch messages, activities, and proposed plans in that key range using indexed queries.
5. Return each collection in canonical ascending order.
6. Set `hasOlder` with a cheap existence query, not by loading the remaining history.
7. For a legacy thread with no user message in range, return a bounded fallback record page and mark the final page correctly.
8. Include all records belonging to the selected boundary turns even when timestamps are tied.

Never split a user prompt from its work/final response merely to hit an exact record count.

### 6.3 Add indexes

Add indexes that support reverse cursor queries and turn joins. At minimum evaluate:

```sql
CREATE INDEX IF NOT EXISTS idx_assistant_messages_history
ON assistant_messages(thread_id, created_at DESC, timeline_sequence DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_activities_history
ON assistant_activities(thread_id, created_at DESC, timeline_sequence DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_plans_history
ON assistant_proposed_plans(thread_id, created_at DESC, timeline_sequence DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_turn
ON assistant_messages(thread_id, turn_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_assistant_activities_turn
ON assistant_activities(thread_id, turn_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_assistant_plans_turn
ON assistant_proposed_plans(thread_id, turn_id, created_at ASC, id ASC);
```

Confirm SQL.js query plans in a test fixture or diagnostic script. Do not assume an index is used merely because it exists.

---

## 7. Phase-by-phase implementation

Each phase has a gate. Do not begin a later phase while the previous phase's contract tests fail.

### Phase 0 — Baseline and performance harness

#### Work

1. Stop the running desktop dev process.
2. Record current focused test results.
3. Add a deterministic long-chat fixture generator with at least:
   - 2,000 user/assistant messages,
   - 4,000 activities,
   - tool outputs of varied sizes,
   - Markdown and code blocks,
   - equal-timestamp and legacy rows,
   - proposed plans,
   - attachments represented by metadata only.
4. Add development-only performance marks around:
   - bootstrap persistence read,
   - bootstrap IPC payload construction,
   - initial history page read,
   - IPC transfer completion,
   - timeline-entry derivation,
   - first timeline paint,
   - prepend settle.
5. Record payload byte estimates using `JSON.stringify(payload).length` in tests or diagnostics; do not log message text.

#### Gate

The harness must reproduce the current slow path and provide before/after numbers without exposing private chat content.

Suggested new files:

```text
desktop/scripts/fixtures/assistant-long-history-fixture.ts
desktop/scripts/test-assistant-history-performance.ts
```

Add a desktop package script only if it is stable and deterministic.

---

### Phase 1 — Lightweight bootstrap and shell/detail separation

#### Work

1. Add explicit shell/detail types.
2. Change persistence bootstrap reads so session/thread shells load without history bodies.
3. Keep running/waiting thread live state available, but do not hydrate full persisted history merely because the thread is active.
4. Replace `hydrateSession(sessionId)` with a detail bootstrap call scoped to a thread, for example:

```ts
getThreadDetailBootstrap({ threadId })
```

This call returns:

- active plan,
- pending approvals,
- pending user inputs,
- initial paged history,
- page metadata.

5. Change the renderer hydration cache from `Map<threadId, complete arrays>` to a bounded detail cache with:
   - five-minute idle TTL,
   - a maximum retained-thread count,
   - stable references for unchanged pages,
   - eviction that never discards the currently selected/running thread.
6. Make sidebar/session selectors depend only on shell fields.
7. Ensure selecting a session paints its shell immediately, then cached/initial detail independently.
8. Deduplicate concurrent detail requests per thread.
9. Ignore stale detail responses if the user switches threads before completion.

#### Files likely changed

```text
desktop/src/shared/assistant/contracts/read-model.ts
desktop/src/shared/assistant/contracts/ipc.ts
desktop/src/shared/contracts/devscope-api.ts
desktop/src/main/assistant/persistence-read.ts
desktop/src/main/assistant/persistence-snapshot.ts
desktop/src/main/assistant/service.ts
desktop/src/main/ipc/handlers/assistant-handlers.ts
desktop/src/main/ipc/handlers.ts
desktop/src/preload/adapters/assistant-adapter.ts
desktop/src/renderer/src/lib/assistant/assistant-store-core.ts
desktop/src/renderer/src/lib/assistant/session-hydration-cache.ts
desktop/src/renderer/src/lib/assistant/assistant-store-hooks.ts
desktop/src/renderer/src/lib/assistant/assistant-store-selection-types.ts
desktop/src/renderer/src/lib/assistant/assistant-store-selection-helpers.ts
```

#### Gate

- Bootstrap/getSnapshot payloads contain zero persisted message text and zero activity payloads.
- Sidebar behavior remains unchanged.
- Selecting a chat with cached detail paints cached content without waiting for IPC.
- Selecting an uncached chat shows an honest loading state, then the initial page.
- Running events still appear in the correct selected thread.

---

### Phase 2 — Real database-backed history pagination

#### Work

1. Add the canonical ordering module and indexes.
2. Add `getHistoryPage` persistence query and service method.
3. Add IPC channel, handler, preload adapter, and public type.
4. Store initial and older pages in `AssistantThreadHistoryState`.
5. Prepend older records with ID-based deduplication and canonical ordering.
6. Preserve object identity for records already in the store.
7. Track `hasOlder`, cursor, loading, and retryable errors per thread.
8. Deduplicate simultaneous `loadOlder` calls.
9. Cancel/ignore stale page responses after thread change.
10. Replace the interim renderer-only `useAssistantTimelineWindow` data semantics. It may remain temporarily only as a render fallback until `LegendList` lands, but it must no longer pretend to be the source of history availability.

#### Critical consumer migration

Search every use of:

```text
thread.messages
thread.activities
thread.proposedPlans
messageCount
```

Classify each consumer as:

- shell metadata,
- loaded visible history,
- complete-history operation.

Complete-history operations must move to persistence-backed commands or dedicated queries.

At minimum address:

##### Deletion and rollback

Current deletion planning uses in-memory `AssistantThread` history. That becomes unsafe with partial pages.

Move delete planning to the main process/persistence layer:

1. Resolve the target message and its turn from SQLite.
2. Query all messages, activities, plans, approvals, and inputs in the deletion window.
3. Perform one transaction for row deletion/update.
4. Emit exact removed IDs for any loaded records.
5. Update shell counts and latest metadata.
6. Do not require older records to be loaded in the renderer.

Files:

```text
desktop/src/main/assistant/service-history.ts
desktop/src/main/assistant/service-session-actions.ts
desktop/src/main/assistant/persistence-write.ts
desktop/src/main/assistant/session-mutation-utils.ts
```

##### Review workspace

Current Review derives from loaded thread arrays plus the persisted turn ledger. With pagination, unloaded turns must remain real and selectable.

Implement:

- paged Review turn list from `assistant_turns`,
- on-demand turn detail query for prompt, response, activities, attachments, and file changes,
- backend search across turn text/path metadata or an explicitly paged search endpoint,
- stable turn numbers from the persisted ledger,
- honest unavailable-history state only when rows are truly missing, not merely unloaded.

Files:

```text
desktop/src/renderer/src/pages/assistant/AssistantReviewLanding.tsx
desktop/src/renderer/src/pages/assistant/AssistantTurnReview.tsx
desktop/src/renderer/src/pages/assistant/assistant-diff-turns.ts
desktop/src/renderer/src/pages/assistant/useAssistantSessionTurnUsage.ts
```

##### Minimap

The minimap may represent only loaded user turns initially. It must visibly disclose older unloaded history through `hasOlder`; it must not imply that the first loaded marker is the start of the conversation.

Do not load the full thread just to populate the minimap.

#### Gate

- Initial selection reads only the configured newest turn page.
- Scrolling upward fetches exactly one older page.
- Prepending does not move the visible anchor by more than 2 CSS pixels after settle.
- Repeated page responses do not duplicate records.
- Delete and Review work for records not previously loaded in chat.
- A page error leaves existing chat content usable and exposes a retry control.
- `messageCount` remains the total persisted count, not the loaded count.

---

### Phase 3 — `LegendList` timeline virtualization

This phase includes the T3 rendering approach.

#### Dependency

After stopping the dev instance, add the version proven by the studied T3 baseline:

```bash
npm install --prefix desktop @legendapp/list@3.2.0
```

Use npm here because this package owns `desktop/package-lock.json`. Use the exact version first and upgrade only in a separate, tested change.

Expected changed files:

```text
desktop/package.json
desktop/package-lock.json
```

Use the repository's actual package manager/lockfile behavior. Do not create a second lockfile.

#### Component architecture

Create a focused virtual timeline owner rather than forcing virtualization into every existing helper. Suggested files:

```text
desktop/src/renderer/src/pages/assistant/AssistantVirtualTimeline.tsx
desktop/src/renderer/src/pages/assistant/assistant-virtual-timeline-rows.ts
desktop/src/renderer/src/pages/assistant/assistant-timeline-scroll-controller.ts
```

`AssistantVirtualTimeline` should own:

- `LegendList` ref,
- virtualized rows,
- top history loading trigger,
- initial scroll-at-end,
- follow-end mode,
- prepend anchoring,
- composer bottom inset,
- minimap position access,
- scroll-to-message/activity commands.

Recommended `LegendList` configuration, adapted from T3:

```tsx
<LegendList
    data={rows}
    keyExtractor={keyExtractor}
    getItemType={getItemType}
    renderItem={stableRenderItem}
    estimatedItemSize={90}
    initialScrollAtEnd
    maintainVisibleContentPosition={{ data: true, size: false }}
    maintainScrollAtEnd={{
        animated: false,
        on: { dataChange: true, itemLayout: true, layout: true }
    }}
/>
```

Tune APIs against `@legendapp/list@3.2.0`; do not assume a newer signature.

#### Required scroll modes

Model scroll behavior explicitly:

```ts
type TimelineScrollMode =
    | 'following-end'
    | 'anchoring-new-turn'
    | 'free-scrolling'
    | 'prepending-history'
```

Rules:

- New/selected chat starts at the end after real content measurement.
- User wheel/touch/keyboard navigation exits follow mode.
- Streaming follows only when the user was already at the end.
- Loading older history preserves the first visible stable row and offset.
- Expanding/collapsing work preserves an explicit row anchor.
- Clicking the minimap or “scroll to bottom” counts as manual navigation.
- Image/Markdown height changes must not pull a free-scrolling user to the bottom.

Replace the current multi-frame “latest lock” once equivalent `LegendList` behavior is proven. Do not leave two competing scroll controllers active.

#### Composer inset

Remove hard-coded assumptions such as fixed `178px` timeline padding.

Measure the bottom composer pane with one `ResizeObserver`, then pass:

```ts
contentInsetEndAdjustment: number
```

into the list and minimap. Pending-input panels, attachment shelves, and resized textareas must all update the inset.

#### Older history UI

- Trigger `loadOlder` near the virtual list start.
- Put loading/retry status in `ListHeaderComponent` as a normal row.
- Do not make it sticky over messages.
- Remove the old renderer-only “Earlier messages” count when the paged header fully replaces it.

#### Minimap

Follow T3's measurement-cache model:

- derive marker row indexes from stable virtual rows,
- use `positionAtIndex`/`sizeAtIndex` from list state,
- do not query every timeline DOM row,
- do not attach a subtree `MutationObserver`,
- update in-view marker attributes directly on scroll where React state is unnecessary,
- show loaded-window boundaries when older pages exist.

#### Gate

Using the long-chat fixture:

- DOM row count stays bounded while thousands of records exist in store.
- Scrolling through the entire loaded history remains responsive.
- No blank gaps persist after measurement settles.
- Prepend, expansion, image load, final Markdown swap, and composer resize preserve position.
- Minimap jumps to the correct virtual row.
- Scroll-to-activity can load required older pages or return an honest unavailable result.

---

### Phase 4 — Stable and incremental timeline rows

Virtualization works best when unchanged item references remain unchanged.

#### Work

1. Separate pure derivation from rendering:

```text
persisted records -> TimelineEntry[] -> TimelineDisplayRow[]
```

2. Add a structural-sharing cache keyed by row ID, based on T3's `computeStableMessagesTimelineRows`.
3. Reuse the previous row object when relevant fields and child record references are unchanged.
4. Give every row a stable `kind` for `getItemType`:

```text
message:user
message:assistant
turn-work-summary
activity
activity-group
plan
working
history-loader
```

5. Keep `renderItem` closure-free. Shared callbacks/state should come through narrowly scoped contexts or stable props.
6. Ensure timer, disclosure, attachment-resolution, and changed-file state are owned by leaf rows.
7. Keep live message updates incremental:
   - assistant delta replaces only the active message entry,
   - activity update replaces only its entry/group,
   - appending a record inserts it without resorting unrelated history,
   - prepending a page merges once and reuses existing references.
8. Replace repeated full-array scans with maintained indexes where justified:
   - message ID -> entry index,
   - activity ID -> entry index,
   - turn ID -> final assistant message ID,
   - user turn -> minimap row index.
9. Rebuild an index only when the relevant collection changes structurally, not on every token.

#### Correctness

Structural sharing must compare meaningful activity fields, including output/patch/status changes. Do not preserve an old row merely because its ID is unchanged.

#### Gate

- Updating the final streaming message preserves object identity for all unrelated rows.
- Updating one tool activity rerenders only its virtual item/group and any genuinely dependent summary.
- Per-second timers do not trigger parent timeline commits.
- Tests cover append, replace, prepend, delete, duplicate page, and equal-timestamp order.

---

### Phase 5 — Streaming Markdown off the hot path

#### Work

1. While an assistant message is streaming, render a cheap text surface:
   - preserve whitespace and readable wrapping,
   - avoid full `react-markdown`, `rehype-raw`, Mermaid, and syntax-highlighter work per token,
   - preserve the configured streaming/reveal mode.
2. When the message completes:
   - freeze the final plain text,
   - schedule completed Markdown parsing/rendering in `startTransition`,
   - keep the cheap surface visible until the completed renderer is ready,
   - swap once without a blank frame.
3. Memoize completed Markdown by a stable key such as:

```text
message.id + message.updatedAt + text length/hash + file path context
```

4. Lazy-load heavy code highlighting/Mermaid where practical.
5. Ensure LegendList receives the resulting row size change and preserves the correct mode:
   - follow end if already following,
   - preserve anchor if free-scrolling.
6. Keep copy text equal to the complete source response, not the staged visible substring.
7. Preserve internal link/file-path behavior and attachment rendering.

Likely files:

```text
desktop/src/renderer/src/pages/assistant/AssistantTimelineText.tsx
desktop/src/renderer/src/pages/assistant/AssistantTimelineRows.tsx
desktop/src/renderer/src/pages/assistant/useAssistantVisibleText.ts
desktop/src/renderer/src/components/ui/MarkdownRenderer.tsx
desktop/src/renderer/src/components/ui/markdown/
```

#### Gate

- Streaming a large fenced-code response does not run the full Markdown pipeline per token.
- Final Markdown appears once and retains links, code blocks, tables, copy behavior, and file navigation.
- The final swap does not jump a free-scrolling viewport.

---

## 8. Event and store invariants

These invariants must hold across all phases:

1. **Live events never wait for an older-history request.**
2. **Persisted page data and live events deduplicate by record ID.**
3. **A newer live record wins over stale page data for the same ID.**
4. **`timelineSequence` is preserved across same-ID updates.**
5. **A stale IPC response cannot replace the currently selected thread.**
6. **`messageCount` means total persisted messages.** Loaded count has a different field.
7. **Pending approvals and user inputs remain available even if their surrounding history page is unloaded.**
8. **The currently running turn remains mounted/available.**
9. **Deleting unloaded history is handled in the main process, not inferred from partial renderer arrays.**
10. **Review and search disclose unloaded/unavailable data honestly.**
11. **Legacy records without turn IDs or sequence values remain visible and deterministic.**
12. **No private message text is logged by performance instrumentation.**

---

## 9. Tests to add or extend

Existing focused tests:

```bash
bun run --cwd desktop test:activity-rail
bun run --cwd desktop test:assistant-diff
bun run --cwd desktop test:assistant-history
bun run --cwd desktop test:pi-assistant-lifecycle
npm run ui:typecheck
```

Extend or add tests for:

### Persistence

- initial newest-turn page,
- older page before cursor,
- no overlap/duplicates,
- equal timestamps and missing sequences,
- legacy null-turn records,
- `hasOlder` correctness,
- reverse index query behavior,
- delete plan for an unloaded turn,
- shell counts after deletion.

### IPC

- shell bootstrap excludes detail bodies,
- detail bootstrap returns initial page,
- history page validates cursor/thread ID,
- malformed cursor returns typed failure,
- response shape survives structured clone.

### Store

- cached detail paints immediately,
- stale response ignored after navigation,
- concurrent page loads deduplicated,
- live delta merged while page is in flight,
- page data cannot overwrite newer live data,
- retention and eviction,
- loaded count and total count remain distinct.

### Timeline/LegendList

- initial scroll at end,
- free-scroll does not snap during streaming,
- prepend anchor preserved,
- dynamic composer inset,
- work disclosure anchor,
- image/Markdown resize behavior,
- bounded mounted item count,
- minimap virtual index navigation,
- top loader is non-sticky and retryable.

### Stable rows

- unchanged IDs reuse exact object references,
- changed message/activity replaces only affected row,
- grouped activity updates propagate correctly,
- deletions remove exact rows,
- prepend retains existing references.

### Markdown

- streaming path does not mount heavy renderer,
- completed path mounts it once,
- final output parity for headings, tables, lists, code, links, and raw HTML policy,
- no scroll jump on final swap.

---

## 10. Manual smoke-test matrix

Use a disposable/local fixture chat, not private production data.

1. Launch cleanly after dependency install.
2. Open a short chat.
3. Open a 2,000-message chat.
4. Switch rapidly between three chats, then return to the long chat.
5. Scroll upward and load at least three pages.
6. Keep the viewport in old history while a new response streams.
7. Return to bottom and stream a long Markdown/code response.
8. Expand/collapse historical work near the middle.
9. Resize the composer and add/remove attachments.
10. Open an image whose dimensions arrive asynchronously.
11. Use the minimap at top, middle, and bottom.
12. Open Review for a loaded turn.
13. Open Review for an unloaded turn.
14. Delete a loaded user turn.
15. Exercise deletion through a persistence test for an unloaded turn.
16. Stop/interupt a running turn.
17. Restart the app and reopen the same long chat.
18. Verify pending approvals/user inputs remain visible.

For every step watch for:

- scroll jumps,
- duplicated messages/tools,
- missing final responses,
- stale chat content after switching,
- blank virtual rows,
- minimap drift,
- unexpected bottom snapping,
- incorrect total counts,
- Review claiming unloaded data is missing.

---

## 11. Performance acceptance criteria

Use before/after measurements from the same fixture and machine. Record raw numbers in the implementation PR/commit notes.

Hard structural criteria:

- Bootstrap shell payload contains no history bodies.
- Initial detail query is bounded by turn page size.
- Older page query is cursor-bounded and indexed.
- Timeline DOM item count remains bounded as loaded history grows.
- Streaming does not run full Markdown parsing per token.
- Rail position tracking does not scan all timeline DOM rows.
- Unchanged virtual row object references remain stable.

Behavior criteria:

- Prepend anchor settles within 2 CSS pixels.
- Free-scrolling users are not pulled to bottom by streaming or row resize.
- No duplicate IDs after overlapping live/page updates.
- Returning to a recently viewed chat uses retained detail while refreshing safely.

Performance target:

- On the synthetic long-chat fixture, initial chat-open time and worst-frame interaction cost must improve materially over the Phase 0 baseline. Treat less than a 2x improvement in initial long-chat detail work as a signal to profile before declaring success.

Do not invent success from a passing typecheck. Capture persistence, IPC, derivation, and first-paint measurements.

---

## 12. Rollout and rollback strategy

Use temporary development flags while migrating, for example:

```ts
const ASSISTANT_PAGED_HISTORY_ENABLED = true
const ASSISTANT_VIRTUAL_TIMELINE_ENABLED = true
```

Rules:

- Flags are migration scaffolding, not permanent settings.
- Keep the old renderer available until paged history plus virtual scrolling passes the smoke matrix.
- Do not run both scroll controllers on one surface.
- Remove old windowing code, old flags, and dead tests only after the new path is the default and proven.
- Database changes should be additive indexes/columns where possible.
- If cursor decoding fails, return a typed error and allow a fresh initial-page reload; never silently return the wrong page.

Recommended checkpoints:

1. `refactor(desktop): separate assistant thread shells and detail`
2. `feat(desktop): add cursor-paged assistant history`
3. `perf(desktop): virtualize assistant timeline with LegendList`
4. `perf(desktop): stabilize incremental timeline rows`
5. `perf(desktop): defer completed markdown rendering`
6. `test(desktop): add long-chat performance and anchoring coverage`

---

## 13. Explicit non-goals

Do not combine this work with:

- auth changes,
- model-provider changes,
- unrelated Inspector redesign,
- unrelated mobile work from T3,
- Git history rewriting,
- public release/build changes,
- database deletion or destructive migration,
- copying T3's Effect/HTTP architecture into Electron solely for similarity.

The goal is a correct Zyra-native implementation using the proven ideas.

---

## 14. Definition of done

This project is complete only when all statements are true:

- [ ] Desktop bootstrap uses lightweight session/thread shells.
- [ ] Selected-thread detail loads independently.
- [ ] Initial persisted history is bounded and cursor-paged.
- [ ] Older history loads from SQLite on demand.
- [ ] Pagination starts on stable user-turn boundaries.
- [ ] Delete/rollback works without complete renderer history.
- [ ] Review can list and open unloaded turns.
- [ ] Renderer state distinguishes total counts from loaded counts.
- [ ] Timeline uses `@legendapp/list` virtualization.
- [ ] Composer inset is measured, not hard-coded.
- [ ] Follow-end, free-scroll, prepend, disclosure, and resize anchors are tested.
- [ ] Minimap uses virtual-list measurements rather than DOM-wide scans.
- [ ] Unchanged rows retain object identity.
- [ ] Streaming uses the cheap text path.
- [ ] Completed Markdown renders once without a blank frame or scroll jump.
- [ ] Focused contracts and TypeScript pass.
- [ ] Long-chat performance measurements are recorded.
- [ ] Manual smoke matrix passes.
- [ ] Old windowing/scroll code and temporary flags are removed.
- [ ] No unrelated work was overwritten.

Suggested final commit message:

```text
perf(desktop): implement paged virtualized assistant history
```
