# V1 canonical Voice merge handoff (Mike)

**Branch:** `feat/v1-voice-core`

**Worktree:** `C:\Users\elson\my_coding_play\zyra\.zyra-worktrees\v1-voice-core`

**Shared baseline:** `f51e33e` (`work/overnight-baseline-20260809`)

## Outcome

This branch now integrates Product Phase One Voice into the normal Desktop Assistant conversation instead of leaving it as a standalone core or Voice Lab prototype.

In an eligible root Assistant conversation, the title bar exposes **Start Voice**. Starting it:

1. binds or resumes the selected canonical Pi conversation;
2. loads legacy or current Pi JSONL history into the Assistant projection;
3. hydrates bounded recent history, approvals, pending decisions, task references, route state, and watermarks into Codex Realtime V3;
4. atomically hands foreground response ownership from Chat to the physical Voice session;
5. commits completed user and assistant Voice turns exactly once into the same canonical Pi JSONL;
6. projects those durable turns into the existing Assistant timeline;
7. returns foreground ownership to a fresh Chat claim on Stop, navigation, provider failure, transcript failure, or restart.

New empty threads and imported legacy threads use the same path. A first spoken user turn in a brand-new Pi session is forced durable before a response receipt is returned.

The old isolated Voice Lab remains available through the compatibility path used when no canonical `conversationId` is supplied.

## User-facing behavior

- Start/Retry/End Voice control in the existing Assistant header.
- Compact in-conversation Voice dock with connection state, microphone mute, current transcript status, typed input, and Stop.
- Spoken and typed Voice turns appear in the normal Assistant timeline and survive reload/restart through Pi JSONL; typed input uses a private read-only turn whose result returns through Realtime speech rather than taking foreground authority.
- Existing Chat sending is rejected while Voice owns foreground response authority.
- Voice start is rejected for subagent threads or while a strong foreground turn is active.
- Thread/session changes, new-chat actions, disconnect, archive/delete paths, and renderer teardown stop Voice cleanly.
- Durable coding/system work and images intentionally return to Chat in this release; the realtime foreground has no write, shell, approval, or task-execution authority.
- The browser bridge reports Voice as unavailable until browser productization supplies its own media/identity transport.

## Canonical sources and projections

| Concern | Authority/source | Integration |
|---|---|---|
| Foreground response ownership | Append-only routes in `controller.sqlite` | Opened and closed by `AssistantService`; legacy routes migrate to epoch-1 Chat |
| Provider-thread scope | Controller provider-thread/scope-binding tables | Immutable binding enforced |
| Canonical messages | Server-owned Pi `SessionManager` JSONL | Production append/find writer with authoritative receipts and immediate first-user durability |
| Exactly-once delivery | Controller operation revisions + `ConversationGateway` | Idempotent append, lost-response lookup, restart reconciliation, and handoff quiescence |
| Realtime transport | `CodexRealtimeForegroundAdapter` | Realtime V3/WebRTC with bounded initial history and client-managed handoffs |
| Transcript identity | Renderer WebRTC data channel | Stable turn/item IDs forwarded through verified IPC; identity-less terminal turns fail closed |
| Resume continuity | `AssistantRealtimeContinuitySource` | Bounded canonical history plus approvals, pending inputs, tasks, route/context watermarks |
| Desktop timeline | Existing Assistant event/projector/persistence path | Rebuildable projection of authoritative Pi receipts |

Desktop Assistant SQLite remains a UI projection. `controller.sqlite` owns routing/operation state, and Pi JSONL owns canonical conversation messages.

## Important invariants

1. Epoch 1 is Chat; Voice activates only in a new epoch after continuity hydration.
2. Chat authorizes `strong_primary`; Voice authorizes only the exact `realtime_foreground` physical session generation.
3. Strong direct Chat output cannot start or commit while Voice owns the foreground.
4. Stale realtime sessions and stale provider item events cannot commit.
5. Provider threads cannot be rebound to another canonical conversation.
6. Canonical operation/message/idempotency identities cannot alias different payloads.
7. Route handoff waits for intended/dispatched canonical commits to quiesce.
8. Post-write lost responses reconcile by operation ID; restart cancels undispatched intent and records receipt-less dispatched work as unknown.
9. Provider termination and concurrent Stop/navigation cleanup share one serialized recovery path.
10. Capability, evidence, transcript identity, event size, sender ownership, Desktop authority, and selected-conversation checks all fail closed.

## Main integration files

### Service, authority, and canonical writer

- `desktop/src/main/assistant/service.ts`
- `desktop/src/main/assistant/foreground/foreground-controller-persistence.ts`
- `desktop/src/main/assistant/foreground/foreground-route-controller.ts`
- `desktop/src/main/assistant/foreground/conversation-gateway.ts`
- `desktop/src/main/assistant/foreground/pi-canonical-message-writer.ts`
- `src/agent-server/canonical-message-ledger.mjs`
- `src/agent-server/server.mjs`
- `src/agent-server/catalog.mjs`
- `src/zyra-ui-bridge.mjs`

### Realtime and continuity

- `desktop/src/main/assistant/voice/canonical-voice-session-controller.ts`
- `desktop/src/main/assistant/voice/canonical-voice-transcript-committer.ts`
- `desktop/src/main/assistant/voice/assistant-realtime-continuity-source.ts`
- `desktop/src/main/assistant/voice/codex-realtime-foreground-adapter.ts`
- `desktop/src/main/assistant/voice/codex-realtime-capability-probe.ts`

### IPC and renderer

- `desktop/src/shared/assistant/contracts/realtime-voice.ts`
- `desktop/src/shared/assistant/contracts/ipc.ts`
- `desktop/src/main/ipc/handlers/assistant-handlers.ts`
- `desktop/src/preload/adapters/assistant-adapter.ts`
- `desktop/src/renderer/src/pages/assistant/useInstructorVoiceSession.ts`
- `desktop/src/renderer/src/pages/assistant/AssistantConversationHeader.tsx`
- `desktop/src/renderer/src/pages/assistant/AssistantConversationPane.tsx`
- `desktop/src/renderer/src/pages/assistant/AssistantCanonicalVoiceDock.tsx`

## Verification

Passed after production integration:

- `npm run test:voice-core`
  - 20 schemas, 28 examples, 7 task events, 5 attempt-event records, and 125 rejection cases
  - canonical Pi ledger durability/reopen/conflict checks
  - canonical Voice authority, idempotency, restart reconciliation, adapter, and transcript identity checks
- `node scripts/test-zyra-agent-server.mjs`
  - verified Desktop authority, canonical append/find, busy-turn rejection, and existing server flow
- `bun run --cwd desktop test:assistant-realtime-voice`
- `bun run --cwd desktop test:assistant-voice-transcription`
- `bun run --cwd desktop typecheck`
- `bun run --cwd desktop build`
- `git diff --check`

The production build succeeds. A live microphone exchange still requires interactive user permission and an installed Codex account, so it is not represented as an automated test.

## Merge notes

This integration necessarily touches Assistant service/UI, IPC/preload, and browser fallback adapters that the earlier core-only handoff had reserved. Jake's browser-productization branch must therefore be merged on a separate integration branch with semantic conflict resolution rather than a blind merge.

Recommended order:

1. merge this branch at its final commit into the integration branch;
2. merge/rebase Jake's browser branch;
3. preserve this branch's Desktop canonical Voice authority and Jake's browser transport/productization behavior;
4. keep `desktop/src/main/index.ts` ownership from the browser lane unless a reviewed Voice dependency requires otherwise;
5. rerun the focused Voice and browser suites plus the Desktop build;
6. advance `master` only after that integration branch is reviewed.
