# Agent surface architecture

Zyra keeps the terminal and desktop chat experiences intentionally different while sharing one semantic middle layer.

The proposed [voice-agent architecture](voice-agent/README.md) follows this rule for task lifecycle, narration, pending decisions/approvals, continuity health, and split usage. Optional Phase Two applies it to relationship focus, work-thread status, attention items, Inbox classification, active-work summaries, visit lifecycle, and Home controller activity receipts. Provider-neutral semantics belong in shared contracts; speech timing, transcript motion, same-canvas transitions, and thread-detail presentation remain surface responsibilities.

## Flow

```text
Pi SDK tool event
  -> src/agent-surface.mjs
  -> versioned AgentSurfaceDescriptor
     -> TUI adapter -> terminal components
     -> src/zyra-ui-bridge.mjs -> desktop runtime adapter -> activity store -> React timeline
```

## Middle-layer responsibility

The descriptor owns stable facts only:

- tool kind (`command`, `file-change`, `file-read`, `search`, `tool`)
- lifecycle (`running`, `completed`, `failed`, `stopped`)
- source phase (`start`, `update`, `end`) when the provider exposes it
- provider tool identity
- primary command, query, or path
- paths
- provider-neutral summary

It must not own ANSI colors, CSS classes, spacing, animation, disclosure state, component names, or desktop-only interactions.

## Surface responsibility

Each surface remains free to present the same descriptor appropriately:

- The TUI chooses terminal-width wrapping, ANSI theme tokens, compact tool blocks, and keyboard behavior.
- Desktop chooses React composition, animation, rich diffs, copy/delete actions, and responsive layout.

Matching semantics are required. Matching pixels are not. In Phase Two, Desktop and TUI must agree on the focus-lease owner/generation, focused conversation, visit state, attention/source revisions, thread/task source, and activity receipt; Desktop may animate a stable canvas while TUI swaps a scoped transcript beneath a stable footer/composer.

## Adapter rule

Provider-specific payloads are normalized once before rendering. A renderer may fall back to legacy payload fields for persisted history, but new Pi events should carry `surface` with contract version `1`.

A tool start is also a presentation boundary. Desktop broadcasts and projects `phase: start` immediately instead of coalescing it with a fast same-ID completion. This preserves Pi's `tool_execution_start` behavior while later updates remain bounded and coalesced.

When adding a provider or a new tool category:

1. Extend `src/agent-surface.mjs`.
2. Keep `desktop/src/shared/assistant/contracts/agent-surface.ts` compatible with the protocol shape.
3. Add cases to `scripts/test-agent-surface-contract.mjs`.
4. Verify TUI rendering and desktop lifecycle projection.

## Current boundary

The first migrated vertical slice is tool/activity normalization. Message streaming, turn lifecycle, compaction, and retry events still use their existing adapters; they should move behind this boundary incrementally rather than through a broad renderer rewrite.

File-change patch reconciliation remains a specialized domain contract because it carries authoritative/provisional diff state. The agent-surface descriptor classifies that work as `file-change`; `src/file-change-lifecycle.mjs` and the desktop file-change contract continue to own patch details.

Read-result line ranges are derived in `desktop/src/shared/assistant/read-activity.ts`. The authoritative Read output stays in the activity payload; desktop presents at most 50 lines while retaining exact copy data and explicit partial-file line metadata.
