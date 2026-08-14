# Product phases and interaction profiles

**Status: Draft product sequencing contract.**
**Parent:** [Zyra Voice-Agent Architecture](README.md).

This package separates two independently usable product phases from schema, provider, database, and implementation-milestone versions.

## Phase One / V1 — conversation-scoped

Phase One is the architecture’s required first release:

- a user opens or creates one canonical conversation;
- typed and image turns route directly to the strong agent;
- an explicit Start Voice action attaches Realtime to that same conversation;
- active tasks survive Chat/Voice handoffs;
- deterministic task authority, approvals, narration, and continuity operate within the conversation;
- existing thread lists, folders, Desktop, and TUI remain recognizable.

Its interaction profile identifier is `conversation_scoped`. A pure Phase One installation uses that implicit default and needs no Phase Two profile record. Milestone 9 later introduces the revisioned user-space InteractionProfilePreference; selecting V1 can use that record without creating an AssistantRelationship. Phase One must pass all existing release gates before Phase Two implementation begins. It remains supported after Phase Two ships.

## Phase Two / V2 — relationship-first

Phase Two adds an optional persistent-assistant posture:

- Zyra Home becomes the default direct entry point;
- casual discussion can remain unstructured;
- substantial work launches or resumes conversation-first work threads;
- simple tasks remain lightweight and may continue through a safely linked successor inside a thread when they grow;
- active work, attention, and outcomes remain visible through a compact strip and hybrid Inbox;
- Zyra can offer voice-led, same-canvas focus visits into work and restore the prior conversation afterward;
- the strong coordinator resolves worker context requests from trusted records before asking the user.

Its interaction profile identifier is `relationship_first`. The preference becomes active only after compatible relationship bootstrap and route/focus transition commit. The complete behavior is defined in [Phase Two — relationship-first interaction](relationship-first-interaction.md).

The separate [adaptive-coaching direction](future-adaptive-coaching.md) is research beyond these two product commitments. It is not a hidden Phase Three dependency and cannot delay or weaken V1/V2 independence.

## Coexistence

| Capability | `conversation_scoped` | `relationship_first` |
|---|---:|---:|
| Canonical conversations and existing threads | Yes | Yes |
| Direct strong Chat | Yes | Yes |
| Explicit Start Voice | Yes | Yes |
| Deterministic tasks and approvals | Yes | Yes |
| Zyra Home default entry | No; after V2 rollback its Home remains an ordinary selectable conversation | Yes |
| Relationship work-thread launch from Home | No; ordinary conversations/tasks remain available | Yes |
| Hybrid relationship Inbox and active strip | No requirement | Yes |
| Cross-conversation focus visits | No | Yes |
| Retrieval-first worker escalation | Task-local | Relationship-aware and scoped |
| Phase One rollback | Current profile | Always available |

Both profiles read the same canonical messages, task records, approvals, and artifacts. A server implementing the Phase Two schemas retains relationship/work-thread metadata; its V1 presentation ignores relationship orchestration and exposes underlying Home/thread conversations plus normalized pending-source activities. Profile switching changes interaction projection and routing policy only.

## Sequencing rule

The numbered milestones in [Implementation roadmap](roadmap.md) are engineering stages. Product Phase One contains milestones 0–8. Product Phase Two begins with milestone 9 and cannot weaken or bypass a Phase One gate.

“V1” and “V2” in product discussion must be qualified as **interaction profiles**. Machine-readable contracts continue to carry their own explicit schema versions.

## Profile rollback versus binary downgrade

**Profile rollback** selects `conversation_scoped` while retaining the same V2-capable server/runtime that implements this contract. This is the guaranteed V1 fallback discussed here.

**Binary/schema downgrade** installs an older executable that may not understand Phase Two controller records. It is not equivalent to choosing V1 and cannot write the newer store. An older client may attach to that V2-capable server only through a compatible protocol; the server sends ordinary conversations/tasks and known generic pending activities rather than raw unknown Phase Two events. An incompatible client receives `upgrade_required` or a read-only export path. Executable downgrade requires a separately proven schema-compatible reader/migration and never silently skips unknown records.

## Rollback rule

Selecting the V1 profile on that same compatible runtime:

- stops new relationship-level focus visits and proactive attention offers;
- at a quiescent turn boundary, safely finishes/aborts any visit, preserves the selected source conversation, parks relationship focus, and keeps a valid Chat route; Voice requires an explicit safe same-conversation conversion or falls back to fresh Chat;
- returns surfaces to selectable canonical conversations only after that transition receipt commits;
- leaves Zyra Home visible as an ordinary selectable conversation while the server still enforces Home reset/deletion safeguards;
- preserves folders, underlying Home/thread conversations, tasks, controller activity receipts, decisions, approvals, artifacts, and running work;
- projects every unresolved kickoff question, decision, approval, blocker/failure action, and review through a V1-compatible affordance supplied by the V2-capable server; kickoff cards carry exact request/action revision so stale or ambiguous replies resolve nothing else;
- grants or revokes no authority;
- deletes and rewrites no canonical message.
