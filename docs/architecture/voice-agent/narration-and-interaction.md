# Narration and interaction

**Status: Draft specification.**
**Parent:** [Zyra Voice-Agent Architecture](README.md).

## One conversational identity

The user interacts with one Zyra identity. Worker names, provider names, strong consultations, and internal routing do not become competing speakers. The active foreground route chooses one response owner: the strong primary in Chat or the realtime foreground in Voice. Realtime remains the sole spoken narrator. In optional Phase Two, that identity can move among Zyra Home and scoped work-thread conversations through one relationship-wide focus lease while every message retains its source conversation.

Background agents produce structured events and private evidence. In Chat, the strong role can answer directly and expose bounded execution activity while it owns the route. In Voice, the narration scheduler decides when verified task facts should enter conversation or speech, and Realtime phrases approved facts naturally.

```mermaid
flowchart LR
    U[User] --> R{Active foreground route}
    R -->|Chat| S[Strong direct response]
    R -->|Voice| F[Realtime response]

    W[Primary/subagent events] --> C[Task controller validation]
    C --> P[Narration policy]
    P -->|silent| D[Private records]
    P -->|visual| V[Structured timeline activity]
    P -->|speakable in Voice| Q[Narration queue]
    Q --> F

    S --> G[Conversation gateway]
    F --> G
    G --> O[One Zyra timeline]
    F --> A[One Zyra voice]
```

## Speech eligibility

| Content | Main conversation | TTS | Task details |
|---|---:|---:|---:|
| Natural answer to the user | Yes | Yes in audio mode | Optional |
| Useful task start acknowledgment | Yes | Optional | Yes |
| Material progress or changed ETA | Optional | Coalesced | Yes |
| Meaningful user decision | Yes | Yes when safe | Yes |
| Permission approval | Yes | Yes when safe and sufficiently specific | Yes |
| Blocker or failure | Yes | Yes | Yes |
| Verified completion and remaining gaps | Yes | Yes | Yes |
| Tool/command lifecycle | Structured row in Chat | No | Yes, redacted |
| Raw tool arguments, command output, and logs | No | No | Yes, bounded/redacted |
| Source code or diff body | Diff/artifact viewer only | No | Yes |
| Tests executing normally | Usually no | No | Yes |
| Internal worker discussion/reasoning | No | No | Private record only |
| Unverified child claim | No | No | Yes, marked unverified |

## Narration pipeline

```mermaid
flowchart TD
    E[Validated domain event] --> S{Significant to user?}
    S -- no --> X[Persist and render in details]
    S -- yes --> R[Redact and extract safe facts]
    R --> V{Facts verified?}
    V -- no --> X
    V -- yes --> K[Assign kind, priority, dedupe key, expiry]
    K --> C{Conversation state}
    C -- user speaking --> Q[Queue without interruption]
    C -- foreground speaking --> Q
    C -- idle --> P{Speech policy}
    P -- silent --> X
    P -- next response --> Q
    P -- when idle --> T[Send explicit speech request]
    P -- interrupt when safe --> T
    Q --> M[Coalesce newer related events]
    M --> T
    T --> F[Foreground phrases approved facts]
```

The scheduler is deterministic. The active foreground model may improve phrasing but cannot decide that a private event deserves user-facing narration. Only the realtime owner can produce speech.

## Priorities and timing

| Kind | Default priority | Default speech behavior |
|---|---|---|
| Start acknowledgment | Normal | Next response or immediate when idle |
| Routine progress | Low | Visual; combine with later update |
| Material progress | Normal | Speak when idle if the user requested updates |
| Decision required | High | Ask after the current user/assistant turn |
| Approval required | High | Ask after the current turn; never bury |
| Blocker | High | Speak when idle |
| Failure | High | Speak when idle with a useful next option |
| Completion | High | Speak after verification |
| Safety-critical revocation | Urgent | Interrupt when safe |

Normal progress MUST NOT interrupt the user. The scheduler SHOULD combine related updates by task and dedupe key. A newer state supersedes an unsaid older state, such as replacing “tests are running” with “tests passed.”

Conservative debounce defaults to evaluate:

- routine progress: wait up to 15 seconds for coalescing;
- repeated same-kind update: suppress unless facts changed;
- completion/failure/blocker: no artificial delay after the current speech turn;
- expired progress: never replay after reconnect.

## Delivery and canonical-message contract

A [`NarrationDelivery`](schemas/narration-delivery.schema.json) is an append-only state chain whose `previous_status` must match the preceding revision; terminal delivery states never reopen. It binds one narration item to one deterministic canonical assistant message ID, the Voice route/epoch/owner claim active during delivery, one physical session generation, and provider speech/item identities.

```mermaid
stateDiagram-v2
    [*] --> prepared: persist intent and deterministic message ID
    prepared --> speech_requested: provider request accepted
    speech_requested --> speaking: first transcript/audio event
    speaking --> completed: final transcript committed once
    speaking --> interrupted: heard/partial transcript committed once
    speech_requested --> failed: visual fallback committed
    speaking --> failed: visual fallback committed
    speech_requested --> outcome_unknown: crash or lost receipt
    speaking --> outcome_unknown: crash or lost receipt
    prepared --> suppressed: expired or superseded

    completed --> [*]
    interrupted --> [*]
    failed --> [*]
    outcome_unknown --> [*]
    suppressed --> [*]
```

Rules:

1. The scheduler derives `canonical_message_id` deterministically from `narration_id`, binds the current Voice route/epoch/owner claim (retained as historical provenance after handoff), and persists `prepared` before provider submission.
2. Streaming text remains provisional presentation state.
3. Final or interrupted realtime transcript commits idempotently through the conversation gateway using that message ID. A direct strong Chat response uses the same gateway and owner-claim checks but does not masquerade as a narration delivery.
4. Provider item ID, speech request ID, physical session generation, and measured playback duration attach to the delivery record.
5. The narration watermark advances only after a terminal delivery has either a canonical message commit receipt or an explicit `suppressed/not_applicable` result.
6. If the process loses certainty after speech was requested, recovery records `outcome_unknown`, does not replay speech automatically, and surfaces delivery uncertainty visually.
7. A newer deduplicating narration can supersede only a delivery that has not requested speech.
8. Ordinary strong Chat and realtime Voice responses use the same provider-item-to-canonical-message idempotency rule, bind to the current route epoch, and reject stale-owner events even when no task narration item exists.

## Explicit speech contract

Only a validated [`NarrationItem`](schemas/narration-item.schema.json) with `contains_sensitive_detail: false` and at least one approved `speakable_fact` can request app-injected speech. The adapter uses its provider’s explicit-speech route when available. If unavailable:

1. commit the redacted `visual_summary` once through the conversation gateway using the deterministic narration message ID;
2. mark audio delivery as unavailable/failed;
3. do not fake playback state;
4. do not convert the event into a synthetic user message;
5. advance the narration watermark only after the commit receipt;
6. continue the task and preserve the delivery record for inspection.

## Background update sequence

```mermaid
sequenceDiagram
    autonumber
    participant P as Primary agent
    participant C as Task controller
    participant N as Narration scheduler
    participant F as Foreground agent
    actor U as User

    P-->>C: Structured progress: focused tests passed
    C->>C: Validate source and task version
    C-->>N: Narration candidate
    N->>N: Coalesce and wait for conversational idle
    N-->>F: Speakable facts only
    F-->>U: "The focused tests passed. I’m checking the full flow now."
```

The primary does not author the final spoken turn. Its suggested summary is evidence and phrasing input.

## Interruption and barge-in

Voice interactions MUST support user interruption:

1. stop local playback promptly;
2. record how much audio was actually presented when the provider supports playback tracking;
3. preserve the partial assistant transcript with interruption metadata;
4. prioritize the new user utterance;
5. cancel obsolete queued narration items;
6. steer the targeted active task when the new utterance changes its constraints;
7. keep unrelated task work running when safe.

```mermaid
sequenceDiagram
    actor U as User
    participant A as Audio client
    participant F as Foreground
    participant C as Task controller

    F-->>A: Speaking a progress update
    U->>A: Interrupts with a correction
    A->>A: Stop playback immediately
    A->>F: Interruption + new audio
    F->>C: Targeted context revision
    C-->>F: Revision committed and routed
    F-->>U: Brief acknowledgment of the correction
```

A transcript must reflect what was spoken or interrupted, rather than silently replacing an interrupted answer with its unplayed tail.

## Phase One Chat home and Voice entry

The ordinary canonical timeline and composer are the home surface. They present two real actions at the point of intent:

- **Send** commits the typed/image user message under the active Chat route and invokes the strong agent directly.
- **Start Voice** prepares a realtime session, hydrates it from the same conversation and active tasks, then atomically activates the Voice route. Starting Voice is a control action, not a synthetic user message, and produces no greeting.

While Voice is active, speech and any typed/image input submitted from the Voice surface belong to the realtime foreground. **Return to Chat** ends/detaches media and activates a strong Chat route; the next ordinary send goes directly to the strong agent. The initial release has no hidden automatic foreground router and no per-message model selector.

If a task is running, Start Voice attaches to its current state without cancelling or restarting it. Compact structured activity can continue updating in the same timeline while Realtime handles conversation and selective narration.

## Phase Two relationship interaction

The optional `relationship_first` profile makes Zyra Home the direct entry surface while preserving Phase One as a selectable profile. Home shows recent direct conversation plus compact provenance-linked controller activity receipts. Those receipts are not assistant messages or implicit TTS/model context. It does not copy full work-thread transcripts.

### Active work and Inbox

A verified compact strip above the composer shows running or attention-requiring work threads and standalone tasks; tasks inside one thread roll up into that thread row. `Needs you` contains only actionable input/review, outranks routine work, and owns the notification count. Routine verified completion enters Completed directly. The hybrid Inbox projects all three views from canonical source records. Collapsing a projection never clears the underlying attention item.

### Conversation-first thread

A thread opens as a scoped Zyra conversation. Title, folder, projected status, origin, and a compact task/objective summary support the conversation without turning it into a dashboard. Selecting a task anchors the thread timeline at that task; it does not create another chat. Detailed tools, files, tests, artifacts, and worker provenance remain deliberate secondary disclosures.

### Same-canvas focus visit

At a natural pause Zyra may ask, “Can we step into that thread for a decision and then come back?” Acceptance preserves the current modality. Chat/Desktop/TUI entry remains Chat, creates no realtime binding, and keeps valid Chat route heads while the relationship focus changes. Entry from already-active Voice prepares a new immutable target provider-thread/session binding before atomically changing focus/routes. The available composer/canvas remain mounted; the orb/microphone remain mounted only for active Voice. Provider transport may be replaced behind the Voice surface when isolation requires it. Other clients mirror or request explicit takeover; they never move automatically.

The target discussion continues until the attention item’s required answer is satisfied and the context revision is committed. Zyra starts source hydration and worker acknowledgement in parallel. It states what was delegated, identifies acknowledgement as complete or pending, and restores the exact source position/cue by an independent return deadline—using safe Chat/degraded Voice if source Voice is not ready—and leaves one compact resolved/deferred Home activity receipt. Late acknowledgement updates the source asynchronously; timeout/rejection creates a new blocker rather than trapping or automatically returning the user.

A declined visit safely holds work and remains in Needs you. It does not repeat during the same conversational segment. “Later,” “use your recommendation,” “stop,” and “open it now” remain distinct intents.

### Natural-pause policy

Visual state updates immediately. Voice offers actionable kickoff questions, decisions, blockers, reviews, and failures—and may mention informational verified outcomes—after the current exchange reaches a safe boundary. It does not interrupt user speech, an unresolved foreground question, or another focus visit. Ordinary conversation returns after one visit. Explicit Inbox review may continue item by item with a visible queue position.

## Multimodal message semantics

Speech, typed text, and images share one message pipeline:

- each user message gets a stable client message ID and the accepting foreground route/epoch;
- an ordinary Chat send routes to the strong primary; starting Voice routes subsequent Voice-surface input to Realtime after hydration;
- attachments are stored once and referenced from the canonical message;
- the same permission and task-routing policy applies regardless of modality;
- image interpretation uses a provider route that actually supports image input;
- provider fallback does not create a second conversation;
- primary results are direct response candidates only under an active Chat claim; under Voice they become validated task events and narration items;
- only the conversation gateway commits the resulting user-facing assistant message to the canonical timeline.

A Chat image turn MAY go directly through the strong multimodal route. A realtime adapter that cannot accept images MAY route a Voice image-bearing turn through the primary/ordinary multimodal agent and then return a safe result to Realtime. The UI MUST disclose the fallback in activity details without presenting a second assistant identity.

## Transcript contract

- Partial user and assistant text appears immediately when available.
- Final provider item/turn identity determines idempotent completion.
- Canonical storage contains final messages and explicit interruption state.
- Duplicate deltas from reconnect/replay do not create duplicate messages.
- Transcript arrival does not move unrelated controls or steal manual scroll position.
- Long transcripts preserve newest content, allow manual review, and indicate hidden overflow without destructive ellipsis.

These are presentation requirements derived from the current Voice Lab findings; surface-specific animation remains owned by Desktop.

## Conversation and task presentation

The main timeline remains a normal coding-chat surface. In Chat it MAY interleave compact, collapsible execution rows for tool calls, commands, file changes, diffs, tests, and artifacts. These rows are projections over task/private records rather than canonical assistant messages. Raw arguments and output stay behind deliberate expansion and redaction. Voice can show the same activity visually without reading it aloud:

```mermaid
flowchart LR
    E[One canonical event stream] --> M[Main conversation projection]
    E --> T[Task details projection]
    E --> A[Accessible live announcements]

    M --> M1[User messages]
    M --> M2[Zyra conclusions]
    M --> M3[Questions and approvals]
    M --> M4[Structured execution activity]

    T --> T1[Full redacted tools and logs]
    T --> T2[Artifacts and tests]
    T --> T3[Worker provenance]
```

A user can inspect exact permitted commands, diffs, bounded logs, artifacts, child runs, and usage inline or in task details. Closing or collapsing activity does not alter task state or model context.

In Phase Two, Home displays only thread-launch, attention, failure, and verified-outcome activity receipts by default. The active-work strip and Inbox are projections over source thread/task records. Opening an item enters the source conversation at the meaningful event. Returning restores Home and never duplicates the detailed thread transcript. A natural spoken/text announcement is separately delivered through the current route-bound narrator.

## Interaction and output modes

- **Chat:** the normal conversation surface. Typed/image sends go directly to the strong owner; no realtime session is required. Structured execution activity is visible and the strong answer commits as canonical text.
- **Voice · audio:** Realtime owns responses; approved narration plays as speech and renders as text.
- **Voice · text:** Realtime remains the owner while responses render without local audio playback. A provider MAY still require an audio-capable transport; the adapter reports that implementation detail.
- **Voice · muted:** the session can remain connected while local playback is suppressed. The UI MUST distinguish muted output from provider text-only capability.

Changing voice after a provider has emitted audio may require a new physical session. Logical conversation identity remains unchanged.

## Silent activation

A newly connected or resumed Voice session starts without a greeting. Resume context is reference data. Chat remains authoritative during initial Voice preparation; ownership changes only after hydration. Zyra then waits for the user unless a pending approval, decision, blocker, or urgent safety event already qualifies for narration.

“Catching up” is used only when:

- hydration is materially stale;
- the user asks a history-dependent question before current context arrives;
- answering immediately would risk contradiction.

## Accessibility

Voice mode remains fully operable without hearing, speech, pointer input, or animation:

- every spoken response has a synchronized text equivalent;
- microphone, mute, start/stop, settings, task details, and “latest” controls are keyboard accessible;
- status changes use concise live regions and do not repeatedly announce streaming deltas;
- reduced-motion settings disable nonessential motion without hiding state;
- color is never the only status signal;
- focus remains stable when transcripts and task updates arrive;
- images require accessible labels or user-supplied context where possible;
- user speech is never required for approvals or decisions;
- errors identify a recovery action rather than relying on sound alone.

## Privacy in speech

The scheduler blocks TTS for secrets, credentials, hidden file contents, sensitive paths, private child transcripts, and unredacted approval arguments. A visual approval can show more detail behind an intentional disclosure control while speech uses a safe summary.

Headphones and physical environment are outside software control, so “speakable” means safe under the configured policy, not universally private.

## User controls

Users MUST be able to:

- use normal Chat without starting Realtime or granting microphone access;
- start Voice from the current chat and attach it to active work;
- return to Chat without cancelling tasks;
- end the physical voice session without cancelling tasks;
- mute output and microphone independently;
- stop a task explicitly;
- pause or resume a task;
- inspect why work was delegated;
- view pending decisions and approvals;
- change involvement mode independently from permission mode;
- disable automatic progress narration;
- review what Zyra believes is currently active;
- choose Phase One `conversation_scoped` or optional Phase Two `relationship_first` without rewriting history;
- inspect and collapse the Phase Two active-work strip;
- accept, defer, snooze, or stop a Phase Two attention item;
- enter and return from a Chat focus visit through keyboard/pointer/TUI without starting Realtime, or through already-active Voice with explicit acceptance;
- open a task in its parent thread and continue a substantial standalone task through a visible, safely linked successor without rewriting identity;
- disable proactive attention offers while retaining the hybrid Inbox;
- open Reset Home from Voice but confirm it only in trusted non-speech UI after Return to Chat and physical media closure;
- use the V2-capable server’s V1 projection to see and act on every unresolved kickoff question, decision, approval, blocker/failure action, or review when V2 is disabled.
