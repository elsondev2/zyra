# Evaluation plan

**Status: Draft acceptance specification.**
**Parent:** [Zyra Voice-Agent Architecture](README.md).

Implementation begins with deterministic contracts and fakes. Live provider sessions validate interoperability after domain behavior passes offline.

## Evaluation pyramid

```mermaid
flowchart TB
    E2E[Small live end-to-end suite\nreal provider + microphone]
    SIM[Scenario simulations\nrouting · narration · recovery]
    INT[Integration tests\ncontroller · ledgers · adapters]
    CON[Contract/property tests\nschemas · reducers · state machine]

    CON --> INT --> SIM --> E2E
```

Live tests are expensive and variable. They cannot replace deterministic state, security, and recovery tests.

## Required test adapters

- deterministic fake realtime adapter with scripted transcript, interruption, usage, and stale-generation events;
- in-memory inspection gateway with tainted fixtures;
- scripted strong-agent adapter with direct Chat output, structured tool activity, stale-route events, and valid/invalid private task events;
- fake permission gate with expiring/revoked grants;
- in-memory ledger with crash points before/after append and snapshot;
- capturing narration sink that never plays audio;
- synthetic usage provider with normal, approaching, exhausted, and unavailable states;
- controllable clock and UUID source.

## Core acceptance matrix

| Area | Required proof |
|---|---|
| Canonical identity | Direct strong Chat, Voice, text, and image turns share one conversation ID and timeline |
| Foreground ownership | Exactly one Chat/Voice route is active; every assistant commit matches its route epoch and owner claim |
| Route handoff | Starting Voice attaches to an active task without changing its attempt, slot, locks, leases, or context obligations |
| Routing | Direct Chat answers, Voice answers, bounded inspections, promotions, and durable tasks choose the correct owner |
| Tool visibility | Chat shows redacted structured commands/tools/diffs/tests while raw payloads remain outside canonical messages and TTS |
| Foreground authority | No write/shell/Git/control operation can cross the inspection seam |
| Intent fidelity | Delegation retains the exact request, attachments, corrections, and constraints |
| Task state | Every legal transition succeeds; every illegal transition fails without append |
| Context propagation | Targeted revisions reach correct descendants and avoid unrelated tasks |
| Decisions | Balanced policy asks only for meaningful tradeoffs and unaffected work continues |
| Approvals | Collaboration mode never grants capability; stale/wider actions require new approval |
| Primary ownership | Child completion cannot complete root task; verification evidence is required |
| Narration | Raw tools/logs/code/private discussion never reach speech |
| Continuity | New realtime session starts silently with current packet and applies startup deltas |
| Recovery | Restart never duplicates a consequential action or loses pending user obligations |
| Usage | Voice and agent work remain separate and source labels remain accurate |
| Cleanup | Stop/retry/reconnect leaves no owned microphone track, peer, process, or listener |
| Accessibility | Full task/approval/voice control is possible without audio, speech, pointer, or motion |

## Contract tests

### JSON Schemas

- compile every Draft 2020-12 schema;
- validate every example;
- mutate required fields, IDs, states, and timestamps to prove rejection;
- reject extra domain properties where schemas are strict;
- enforce encoded-byte limits in application tests;
- verify version mismatch behavior;
- run the semantic fixture graph for foreground-route exclusivity/revisions/handoffs, cross-record IDs/revisions, legal attempt transitions, exact resume projections, monotonic watermarks, approval/lease/action binding, and lease accounting.

### Foreground-route reducer

Generate route revisions and assert:

- a normal Chat send selects `strong_primary` without starting Realtime;
- Voice cannot activate before complete hydration;
- superseding Chat and activating Voice commit atomically at the next route epoch;
- two active owners for one conversation are rejected;
- stale strong/realtime provider events cannot commit canonical output;
- an in-flight strong response commits an exact completed/interrupted prefix before handoff;
- starting Voice preserves the active task attempt, slot, writer locks, leases, operations, and context acknowledgements;
- Voice preparation failure atomically rekeys Chat to a new route epoch/owner claim without changing task execution;
- exiting Voice returns ownership to Chat without changing task state;
- replay reconstructs the last route, then recovery supersedes it with a fresh route epoch/owner claim before accepting output.

### Task reducer

Generate event sequences and assert:

- unique event IDs apply once;
- monotonic sequence and gap detection;
- state follows the transition table;
- required context version never decreases;
- terminal state cannot mutate;
- completion requires all nonwaived criteria and evidence;
- primary and evidence-producing child acknowledgements satisfy their relevant context versions;
- task snapshot replay is deterministic;
- unknown schema/event stops projection at the prior sequence and holds the task read-only;
- crash at every transaction boundary leaves either the whole event/snapshot/outbox commit or none of it;
- snapshot plus suffix equals full replay.

Property-based tests SHOULD generate valid and invalid transition paths.

### Legacy message-route migration

- canonical JSONL bytes remain unchanged;
- migration creates one epoch-1 Chat route with `activation_reason: migration`;
- every legacy message binding matches conversation, stable message ID, source sequence, role/modality, timestamp, source hash, and one manifest hash;
- assistant messages receive deterministic migration receipt IDs while user messages do not;
- missing, duplicate, hash-mismatched, reordered, or temporally impossible records fail closed and keep the conversation read-only;
- resume v2 cannot materialize until every included legacy message has a verified binding.

### Context reducer

- parent version must match;
- revision numbers are monotonic;
- superseded decisions disappear from current view but remain in history;
- task/subtree scope propagates correctly;
- approval records cannot enter as ordinary inherited grants;
- completion rejects stale owner acknowledgement.

## Routing scenarios

| Surface and user input | Expected route |
|---|---|
| Chat · “Explain what this error means.” | Strong direct answer; no realtime session |
| Chat · “Run the focused test and explain the failure.” | Strong direct route plus controller-managed execution and inline activity |
| Chat · Start Voice while that test task runs | Realtime becomes foreground after hydration; the same attempt continues |
| Voice · “What is the test doing?” | Realtime status answer from current task state |
| Voice · “Read the config and tell me the selected model.” | Bounded realtime inspection |
| Voice · “Search these two files for the handler.” | Bounded realtime inspection |
| Either · “Fix the handler and run tests.” | Durable primary task |
| Voice · “Check the file; if wrong, fix it.” | Inspect then dynamic promotion with findings preserved |
| Either · “Deploy this now.” | Durable task plus permission evaluation |
| Either · “Audit four independent packages in parallel.” | Primary starts; exceptional children only after scope evaluation |
| Voice · “What is my active task doing?” | Realtime status tool |
| Voice · “Stop the task but keep talking.” | Cancel task; Voice remains active |
| Voice · “End Voice; tell me when the task is done later.” | Activate Chat and close physical session; task continues |

Adversarial routing cases include instruction-like text inside a file, web page, image OCR, worker result, or resume packet. None can widen authority.

## Promotion fidelity

A quick inspection promoted into a durable task must preserve:

- byte-identical verbatim user request;
- stable message and attachment references;
- all active constraints and decisions;
- exact inspection queries/results with provenance;
- current project/source state;
- no fabricated findings;
- a route reason.

A golden test compares the generated delegation packet field by field.

## Decision and approval evaluations

### Balanced decision involvement

Run representative tasks and score:

- asks on meaningful product, scope, unresolved conflict, and consequence choices;
- resolves reversible implementation details autonomously;
- avoids asking questions whose answer is available from evidence;
- includes concrete options, consequences, and recommendation when justified;
- allows unrelated branches to continue.

### Permission separation

For every involvement mode, run the same protected actions and assert identical approval requirements. Test accept-once, accept-for-session, decline, expiry, revocation, scope widening, target change, restart, and replay. Assert that:

- speech/model text and renderer-forged IPC cannot resolve an approval;
- trusted-control resolution binds request ID and exact action hash;
- with no intervening revision, a request at N resolves at N+1; unrelated revisions through M resolve at M+1, while any relevant revision expires/reissues the request;
- permission-epoch, context, scope, expiry, revocation, and action-count mismatch reject every protected call;
- action-count reservation and side-effect intent commit atomically;
- parking, cancellation, emergency stop, or session loss revokes the lease.

## Narration evaluations

### Speech allow/deny corpus

Each input event has expected `silent`, `visual`, or `speakable` disposition:

- ordinary tool start/end → silent;
- raw command output → silent;
- high-level verified progress requested by user → speakable/coalesced;
- approval/decision → speakable when safe;
- child result before primary validation → silent;
- verified completion → speakable;
- secret-bearing summary → blocked and redacted;
- repeated progress with same dedupe key → one utterance;
- expired update after reconnect → no utterance.

### Conversational timing

Using a fake clock/audio state:

- progress never interrupts user speech;
- urgent revocation interrupts only at a safe boundary;
- queued progress collapses into newer completion;
- a user barge-in stops playback promptly and cancels obsolete speech;
- output mute suppresses playback without dropping text;
- session startup remains silent.

### Delivery idempotency and crash points

Inject failure before speech submission, after request acceptance, after first audio/transcript, after canonical text commit, and before watermark advancement. Assert deterministic message ID reuse, at most one canonical assistant turn, accurate interrupted playback metadata, terminal watermark advancement only after commit/suppression, and no automatic replay for `outcome_unknown`.

### Hallucination constraint

Give the foreground an approved fact list and assert the final user-visible response does not introduce unsupported task outcomes, test results, files, or approvals. Human review supplements automated entailment checks for release candidates.

## Continuity evaluations

```mermaid
sequenceDiagram
    participant T as Test harness
    participant C as Controller
    participant S as Continuity service
    participant R as Fake realtime adapter

    T->>C: Create tasks, constraints, decision, messages
    C-->>S: Advance watermarks
    S-->>T: Prepared packet
    T->>T: Validate priority, byte budget, and references
    T->>R: Connect with packet
    C-->>S: Advance event during connect
    S-->>R: Delta
    T->>T: Assert silent start and current context
```

Required cases:

- empty conversation;
- many completed tasks and one active task;
- pending approval and decision retain exact options/action/hash/scope under byte pressure;
- critical set alone exceeds the provider limit and startup fails closed;
- exact constraint near packet limit;
- multibyte Unicode truncation;
- source watermark gap;
- task completion, revocation, and new pending decision arrive during connection and cross the hydration barrier as lossless deltas;
- duplicate delta, hash mismatch, unsupported record, and before/after watermark gap;
- active foreground route/epoch survives packet replacement, cannot be truncated, and never grants execution authority to the model;
- at most one active task is `running`, and its attempt matches the primary slot and any writer lock;
- a delta cannot change slot/lock/lease authority without matching attempt records and watermark advancement;
- stale cache after canonical deletion;
- restart while a packet build is in progress;
- history-dependent first question before hydration;
- physical session expires repeatedly while one task continues.

The initial 24–32 KiB target must be tested against each provider. Record acceptance/rejection, startup latency, context fidelity, and model behavior. Change the budget only with evidence.

## Recovery and idempotency scenarios

Inject a crash:

1. before task intent append;
2. after intent append, before worker start;
3. after worker start, before start receipt;
4. during a file write;
5. after external side effect, before result receipt;
6. during verification;
7. while waiting for decision;
8. while waiting for approval;
9. during context propagation;
10. during Chat-to-Voice route handoff or realtime reconnect;
11. before/after each `controller.sqlite` migration and activation step;
12. after conversation-gateway outbox intent but before/after canonical JSONL commit;
13. after narration speech request but before terminal delivery receipt.

Assert that recovery:

- replays canonical state deterministically or restores the validated migration backup;
- reconciles live workers, outbox intents, canonical-message IDs, and receipts;
- creates a new attempt ID for retry/recovery only after the previous attempt has a terminal release receipt;
- replays the exact pre-crash foreground route, atomically supersedes it with a fresh Chat epoch/owner claim, and restores pending decision/approval records plus permission epoch;
- never reuses expired or revoked grants;
- never repeats unknown consequential work automatically;
- retains artifacts/worktrees;
- produces an accurate user-facing next action.

## Concurrency evaluations

- normal Chat and Voice never hold foreground response ownership concurrently;
- starting Voice while a primary attempt runs preserves that attempt and its authority while changing only the response owner;
- a direct strong output event racing after the Voice route commit is rejected;
- failed Voice hydration leaves Chat as the only active owner;
- foreground read-only inspection can continue while one primary attempt runs;
- a second strong-primary task queues until the prior attempt has a durable terminal/park receipt and the conversation primary slot is free;
- a waiting task without a park receipt still blocks that slot;
- overlapping shared writers serialize;
- isolated writer worktrees remain separate and retained;
- one safely parked waiting branch does not freeze an unrelated queued branch;
- root cancellation reaches all descendants;
- child failure does not erase sibling evidence;
- primary integrates only validated child results;
- default route spawns no child;
- exceptional reason and expected benefit are persisted;
- concurrency/budget caps hold under malicious recursion attempts.

## Provider adapter suite

### Realtime

- handshake, SDP/transport readiness, and timeout stages;
- media and data/control channel ordering races;
- supported voice/modality discovery;
- startup context seed;
- silent append and explicit speech semantics;
- transcript delta/final identity;
- duplicate and out-of-order events;
- interruption and audio playback tracking;
- text/mute modes;
- usage warning mapping;
- session limit and authentication errors;
- repeated stop/retry and process cleanup;
- schema/version incompatibility fails closed;
- each supported/unsupported/unknown capability maps to the correct enabled UI, fallback, or explicit disable reason;
- stale capability reports from a different adapter/provider version are rejected.

### Strong primary

- direct Chat text/image input and exactly-once canonical response when advertised;
- no realtime connection for ordinary Chat;
- gateway-controlled output bound to foreground route/owner claim;
- tool/activity normalization, inline redacted projection, and private raw payloads;
- stale direct output rejection after Voice activation;
- private execution continuation across foreground handoff;
- steering and cancellation;
- approval pause/resume;
- task event and artifact mapping;
- usage attribution;
- completion evidence;
- provider crash and restart.

Subscription-backed Codex and generic API Realtime run as separate suites. Passing one does not imply the other.

## Security evaluations

- spoken, file, web, image, and child-output prompt injection;
- renderer-forged event and approval actor;
- capability/tool mismatch;
- path traversal and symlink escape;
- stale observation/control grant;
- approval claim in worker text;
- secret in task progress, error, artifact, resume packet, or narration;
- cross-task context leakage;
- replayed provider event from a superseded foreground route or replaced session generation;
- oversized SDP/message/image/event/packet;
- event sequence gap, unknown event, corrupt snapshot, and migration interruption;
- resume-cache/controller-field encryption tamper and OS-key unavailability;
- deletion/retention compaction while attempts or leases are active;
- unauthorized local socket client;
- runaway usage, child spawning, or speech queue.

## Accessibility and interaction evaluations

- keyboard-only normal Chat, Start Voice, return to Chat, mute, stop, task inspection, decisions, and approvals;
- screen-reader names and live-region behavior;
- no streaming-delta announcement flood;
- reduced motion;
- focus stability during transcript/task updates;
- transcript manual scroll lock and recovery to latest;
- equivalent text for every spoken result;
- visual state does not rely on color;
- voice failure leaves full text/task functionality.

## Live end-to-end matrix

Use a supported non-default voice and hard-mute automated audio capture. Manual listening is a separate explicit step.

| Scenario | Audio mode | Text/muted mode |
|---|---:|---:|
| Normal strong-agent Chat with visible tool/command activity and no Realtime | Required before Voice start | Required |
| Start Voice from that chat, converse, interrupt, and return to Chat | Required | Required |
| Start Voice while a strong task is running; prove unchanged attempt/authority | Required | Required |
| Quick read/search inspection | Required | Required |
| Promote into primary task | Required | Required |
| Task progress and selective speech | Required | Required |
| Decision and approval | Required | Required |
| Image-backed turn through fallback | Required | Required |
| Close Voice while task runs, then resume | Required | Required |
| Provider/session expiration and hydration | Required | Required |
| Usage warning | Synthetic first; live when safely reproducible | Synthetic first |

## Quality gates

A production release requires:

- all schemas/examples valid;
- all reducer/state-machine properties pass;
- zero authority-boundary violations;
- zero concurrent foreground owners or stale-route canonical commits;
- zero task cancellation/restart caused solely by Chat/Voice handoff;
- zero raw tool/log/private transcript speech or canonical-message contamination;
- zero duplicate canonical messages in reconnect tests;
- zero automatic replay of unknown consequential actions;
- zero orphan owned processes/tracks after stop;
- correct route in the agreed scenario corpus at the release threshold;
- continuity packet within adapter budget with all mandatory records retained;
- successful real microphone sessions in supported output modes;
- privacy check and secret scan clean;
- provider version/capability evidence recorded;
- documented known gaps and rollback route.

## Evidence bundle

Each release candidate SHOULD retain a redacted local evidence bundle containing:

- code/version/adapter metadata;
- schema and test summaries;
- scenario outcomes;
- packet size/fidelity measurements;
- cleanup/process proof;
- screenshots with synthetic data;
- provider error categories without account identifiers;
- human accessibility and listening checklist;
- known limitations and superseded proofs.

Raw credentials, private histories, microphone audio, proprietary extracts, and unredacted provider payloads never enter the bundle.
