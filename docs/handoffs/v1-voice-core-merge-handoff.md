# V1 Voice core merge handoff (Mike)

**Branch:** `feat/v1-voice-core`

**Worktree:** `C:\Users\elson\my_coding_play\zyra\.zyra-worktrees\v1-voice-core`

**Shared baseline:** `f51e33e` (`work/overnight-baseline-20260809`)
**Scope:** Product Phase One foundations only; no Assistant UI/browser integration.

## Outcome

This branch establishes the provider-neutral, persistence-backed authority core needed before production Voice can attach to canonical Chat:

- append-only `ForegroundRoute` records with one active Chat/Voice response owner per conversation;
- monotonic route epochs, non-authorizing owner claims, CAS transitions, and stale-claim rejection;
- dedicated `controller.sqlite` file ownership, route/scope-binding tables, operation revisions, atomic file replacement, and reopen tests;
- immutable provider-thread-to-canonical-conversation binding;
- a conversation gateway for exactly-once canonical message operations and receipts;
- a handoff quiescence barrier that blocks route changes while message commits are intended/dispatched;
- provider-neutral realtime, continuity/hydration, capability, canonical-message, and primary-agent contracts;
- deterministic realtime, continuity, canonical-ledger, and strong-primary fakes;
- Chat → Voice, Voice → replacement Voice, Voice → Chat, preparation failure, unexpected transport close, and restart/reopen behavior;
- canonical final transcript commits with deterministic message IDs and duplicate replay handling;
- separation of direct strong Chat output from private strong task execution under Voice;
- an experimental Codex V3 adapter behind the realtime seam;
- installed-Codex schema probing, V3 `initialItems`, silent `appendText`, explicit `appendSpeech`, and client-managed handoff support;
- the complete normative Voice architecture/ADR/schema package brought onto the current application baseline without importing the documentation worktree's old app snapshot.

## Canonical sources and projections

| Concern | Implemented authority/source | Current integration state |
|---|---|---|
| Foreground response ownership | `ForegroundRoute` revisions in dedicated controller SQLite | Implemented and tested; not opened by `AssistantService` yet |
| Provider-thread scope | Controller provider-thread/scope-binding tables | Implemented and immutable |
| Canonical message intent/receipt | Controller operation revisions plus `ConversationGateway` | Implemented against a deterministic canonical writer; production Pi JSONL writer still required |
| Realtime transport | `RealtimeForegroundAdapter` | Fake and Codex V3 adapters implemented |
| Resume context | Bounded hashed hydration seed/delta DTOs | Fake deterministic source implemented; production continuity reducer still required |
| Strong direct/private lanes | `PrimaryAgentAdapter` contract | Deterministic fake implemented; existing Pi/Codex runtime has not been moved behind it |
| Renderer timeline | Existing canonical Assistant projection | Deliberately untouched |

The Desktop Assistant SQLite database remains a rebuildable UI projection. This branch does not treat it as controller or message authority.

## Important invariants covered

1. Epoch 1 is Chat; Voice activates only as a new epoch after hydration.
2. Every route has exactly one active revision followed by at most one terminal revision.
3. Predecessor termination and successor activation commit in one SQL transaction with equal boundary timestamps.
4. Chat claims belong to `strong_primary`; Voice claims belong to `realtime_foreground` and exact physical session generation.
5. Route changes preserve attached task IDs and mutate no task/attempt/slot/lock/lease authority.
6. Strong assistant output cannot commit while Voice owns the route.
7. Realtime output cannot commit after its route or session generation is superseded.
8. Provider threads cannot be rebound to another canonical conversation.
9. Canonical message IDs and idempotency keys cannot alias different immutable payloads.
10. An in-flight canonical commit blocks foreground handoff until receipted, cancelled, failed, or marked unknown.
11. A post-write lost response reconciles by operation ID and commits exactly once.
12. Failed Voice preparation and unexpected current-session closure install a fresh Chat claim when the output lane is quiescent.
13. Capability reports fail closed when expired, future-dated, unsupported, or missing valid evidence.

## Codex compatibility finding

The installed `codex-cli 0.146.0` generated schema contains the V3 initial-item and WebRTC transport contracts plus realtime started/transcript notifications. The generated flat `thread/realtime/transcript/*` notifications do **not** contain stable provider item IDs.

The Codex adapter therefore reports transcript identity as `unknown` unless the host supplies a separately proven WebRTC data-channel identity bridge. The production capability gate keeps canonical Codex Voice disabled until that bridge is wired and tested. This is intentional fail-closed behavior, not a fake claim of readiness.

## Files most relevant to integration

### Shared contracts

- `desktop/src/shared/assistant/contracts/foreground-route.ts`
- `desktop/src/shared/assistant/contracts/canonical-message.ts`
- `desktop/src/shared/assistant/contracts/provider-capabilities.ts`
- `desktop/src/shared/assistant/contracts/realtime-foreground.ts`
- `desktop/src/shared/assistant/contracts/primary-agent.ts`

### Controller and gateway

- `desktop/src/main/assistant/foreground/foreground-route-reducer.ts`
- `desktop/src/main/assistant/foreground/foreground-controller-store.ts`
- `desktop/src/main/assistant/foreground/foreground-controller-persistence.ts`
- `desktop/src/main/assistant/foreground/foreground-route-controller.ts`
- `desktop/src/main/assistant/foreground/canonical-message-operation-reducer.ts`
- `desktop/src/main/assistant/foreground/conversation-gateway.ts`

### Realtime and continuity

- `desktop/src/main/assistant/voice/canonical-voice-session-controller.ts`
- `desktop/src/main/assistant/voice/canonical-voice-transcript-committer.ts`
- `desktop/src/main/assistant/voice/realtime-hydration.ts`
- `desktop/src/main/assistant/voice/codex-realtime-foreground-adapter.ts`
- `desktop/src/main/assistant/voice/codex-realtime-capability-probe.ts`
- `desktop/src/main/assistant/voice/codex-realtime-capabilities.ts`

### Fakes and evidence

- `desktop/src/main/assistant/voice/fake-realtime-foreground-adapter.ts`
- `desktop/src/main/assistant/voice/fake-realtime-continuity-source.ts`
- `desktop/src/main/assistant/foreground/fake-canonical-message-writer.ts`
- `desktop/src/main/assistant/foreground/fake-primary-agent-adapter.ts`
- `desktop/scripts/test-assistant-voice-core.ts`

## Deliberately untouched collision areas

To remain parallel-safe with Jake's browser-productization branch, this branch does not change:

- `desktop/src/main/index.ts`
- browser assistant bridge or DevScope relay files
- preload browser relay files
- renderer `browser-*` libraries
- Assistant route/store/selection files
- `desktop/vite.browser.config.ts`
- `desktop/electron.vite.config.ts`

## Required integration work

The following remains for a later sequential integration branch:

1. Open `ForegroundControllerPersistence.defaultPath(app.getPath('userData'))` in the server/main authority owner and close it cleanly.
2. Migrate/hash-bind existing canonical messages to an epoch-1 migration Chat route without rewriting JSONL.
3. Implement the production canonical Pi JSONL `CanonicalMessageWriter` with durable operation lookup.
4. Put existing strong direct Chat and server-owned private task execution behind `PrimaryAgentAdapter`.
5. Build the production continuity materializer from canonical messages, route heads, active task records, pending decisions/approvals, safety state, and watermarks.
6. Wire the WebRTC data-channel turn/item ID bridge into the Codex adapter and rerun capability probing.
7. Attach Start/Stop Voice to the existing canonical composer and timeline without a parallel transcript store.
8. Route typed/image input under active Voice according to the production multimodal policy.
9. Connect task promotion, bounded inspection, selective narration, approvals, and full restart reconciliation.
10. Add production Desktop/browser/TUI E2E coverage after Jake's typed browser transport lands.

Do not enable canonical Codex Voice merely because V3 signaling works; transcript identity, production writer, and continuity integration are still hard gates.

## Verification

Passed on this branch:

- `npm run test:voice-agent-contracts`
  - 20 schemas
  - 28 examples
  - 7 task events
  - 5 attempt-event records
  - 125 rejection cases
- `bun run --cwd desktop test:assistant-voice-core`
- `bun run --cwd desktop test:assistant-realtime-voice`
- `bun run --cwd desktop test:assistant-voice-transcription`
- `bun run --cwd desktop typecheck`
- installed Codex schema probe: `codex-cli 0.146.0`, required V3/WebRTC schema markers present, transcript identity bridge intentionally false
- `git diff --check`

`npm run check` reaches the repository privacy check and fails on the shared baseline's existing private path in `scripts/restart-zyra-dev-session.ps1:15`. This branch does not modify that file. The focused Voice suites and full Desktop typecheck pass.

## Merge procedure

Both agent branches should descend from `f51e33e`. Merge them into a separate integration branch; do not move `master` directly.

Recommended order:

1. merge `feat/v1-voice-core`;
2. merge/rebase Jake's browser-productization branch;
3. resolve only shared package/docs index conflicts;
4. run both branches' focused suites;
5. implement server/UI integration as a third change after reviewing both handoffs.

No production feature flag is enabled by this branch, so merging the foundation should preserve current Voice Lab and browser behavior.
