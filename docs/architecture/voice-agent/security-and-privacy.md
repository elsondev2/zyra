# Security and privacy

**Status: Draft threat model and policy.**
**Parent:** [Zyra Voice-Agent Architecture](README.md).
**Related:** [Agent-control security](../../security/agent-control.md).

## Security objective

Adding Voice to normal coding chat must not widen agent authority. Models propose; trusted code authorizes, records, and executes. Realtime receives less authority than the strong primary. Foreground route ownership grants response production only and never execution capability. Optional Phase Two relationship membership, Inbox ranking, strong consultation, thread filing, and focus visits likewise grant no authority.

## Trust zones

```mermaid
flowchart LR
    subgraph Untrusted[Untrusted or tainted]
        U[User and ambient audio]
        WEB[Web/file/tool content]
        RM[Realtime model output]
        WM[Worker/subagent output]
        R[Renderer]
    end

    subgraph Trusted[Trusted local control plane]
        AS[Agent server]
        TC[Task controller]
        PG[Permission gate]
        NS[Narration/redaction policy]
        CB[Desktop control broker]
        LS[Ledger stores]
    end

    subgraph External[External providers]
        RP[Realtime provider]
        AP[Agent provider]
    end

    U --> R
    R --> AS
    WEB --> TC
    RM --> TC
    WM --> TC
    AS --> TC
    TC <--> PG
    TC --> NS
    PG <--> CB
    TC <--> LS
    AS <--> RP
    AS <--> AP
```

Every arrow crossing into trusted code requires schema validation, identity checks, size limits, and policy enforcement.

## Capability hierarchy

| Role | Default capabilities | Explicitly absent |
|---|---|---|
| Realtime foreground | Bounded read, search, inspection, retrieval, task status, usage status, task proposal | Generic shell, writes, tests, Git mutation, deploy, publish, browser/computer action, credential access |
| Strong primary | Direct Chat response while holding the active route claim; ordinary scoped coding tools under task, sandbox, and approval policy | Authority outside granted roots/policy; canonical output while Voice owns the route |
| Subagent | Attenuated subset of primary capabilities with explicit scope | User-facing speech, approval claims, recursive delegation initially, broad control |
| Renderer | Typed IPC and presentation | Credentials, task authority, capability minting |
| Task controller | State transitions and routing | Direct platform side effects without a tool/permission seam |
| Permission gate/control broker | Scoped capability grants and execution mediation | Model-driven grant creation |

Capability checks occur at execution time. Prompt instructions are defense in depth, never authorization.

## Threats and controls

| Threat | Required control |
|---|---|
| Spoken prompt injection | Treat audio as user input, preserve speaker/turn identity, and require explicit approvals for protected actions. Ambient speech cannot grant authority. |
| Prompt injection in files or web pages | Mark tool results tainted, keep instructions separate, restrict foreground tools to reads, and require primary/controller validation before action. |
| Foreground attempts a write through a read tool | Purpose-built tool implementation has no mutation primitive; controller rejects unsupported operation classes. |
| Worker claims the user approved something | Approval records come only from the permission gate; output scanner flags approval claims. |
| Collaboration mode bypasses approval | Permission policy is evaluated independently and cannot read autonomy level as a grant. |
| Stale approval reused after task changes | Lease binds task, authorized attempt, context/permission epochs, capability, action hash, target/scope/preconditions, expiry, and action count; material change invalidates it. |
| Duplicate/replayed side effect | Idempotency key, durable intent/receipt, and provider reconciliation before retry. |
| Stale context causes constraint violation | Required context version and owner acknowledgement gate completion and affected mutation. |
| Context poisoning across tasks | Scope every revision; propagate only through explicit task ancestry; no lateral child propagation. |
| Subagent addresses the user or injects narration | Children have no narration channel; output is untrusted evidence; scheduler accepts controller events only. |
| Secret read aloud | Redaction and speech eligibility gate precede explicit-speech calls; sensitive detail remains visual/private. |
| Raw logs leak into conversation | Logs stay in private task records; Chat receives only redacted structured activity and bounded summaries. Activity rows never become assistant prose, model context, or TTS. |
| Renderer forges task/approval events | Main/server authenticates clients and validates actor authority; the general renderer cannot append controller events or invoke lease issuance, and only the broker-owned challenge callback creates a receipt. |
| Competing Chat and Voice owners | Foreground route activation is server-controlled, transactionally unique, and epoch-bound; UI state alone cannot grant response ownership. |
| Event stream replay or gap | Unique event IDs, monotonic sequence, watermarks, gap detection, and fresh snapshot recovery. |
| Realtime or strong-provider event from an old foreground route | Route ID, monotonic route epoch, owner claim, session generation, and provider item identity reject stale callbacks and canonical commits. |
| Voice session drains allowance while idle | Visible connected state, optional idle timeout, separate usage meter, and seamless close/resume. |
| Audio spoofing or replay | Do not use voice identity as authentication; protected actions still require normal approval controls. |
| Malicious attachment | MIME/size validation, safe storage, no renderer path authority, and provider/tool sandboxing. |
| Symlink/path escape | Existing project-root and symlink-aware workspace guards apply to primary and children. |
| Runaway child fleet | Default zero children, bounded depth/concurrency/budget, cancellation tree, and explicit exceptional reason. |
| Crash repeats consequential work | Reconcile receipts; unknown outcome blocks automatic replay; expired grants remain expired. |
| Provider protocol changes | Startup capability probe and versioned schema validation fail closed. |
| Phase Two cross-thread context leakage | Home and every work thread retain distinct conversations; every read requires a non-bearer ContextRetrievalAuthorization plus access receipt binding requester, purpose, allowed sources/data classes, policy/context revisions, redaction, limits, and expiry. |
| Worker fabricates a need for user attention | Context requests are untrusted proposals; coordinator retrieval and attention policy validate source task/thread, required answer, priority, and dedupe identity. |
| Hidden consultation mutates state | Consultation adapter exposes no mutation/protected tools; budget crossing returns promotion-required evidence, and work launches only from explicit substantial intent or accepted Ask. |
| Focus visit transfers task authority | Focus and route changes alter response scope only; leases, locks, approvals, operations, and attempts remain bound to their source task/attempt. |
| Stale focus/session writes into another thread | Relationship focus-lease revision/owner/generation, per-conversation route epoch, immutable provider-thread/session binding, provider item identity, and target hydration receipt all validate. |
| Home receipt leaks private thread detail or bypasses route ownership | Receipt policy allows only redacted verified controller activity and source references; it cannot become assistant prose/TTS without a separate active route-bound delivery. |
| Relationship profile silently merges history | Profile switching changes projections only; canonical messages are never copied, merged, or rewritten. |

## Prompt-injection boundaries

The system separates four channels:

1. **Policy** — trusted system/project instructions and controller rules.
2. **User intent** — canonical user turns, including spoken turns.
3. **Reference data** — resume packets, files, web results, artifacts, and worker reports.
4. **Execution authority** — tool implementations, sandbox, permission gate, and capability leases.

Reference data never becomes policy merely because it contains instruction-like text. A resume packet is injected as bounded reference context and labels quoted user text and untrusted findings.

## Phase Two relationship boundaries

A stable user-space ID identifies one OS-user-owned local Zyra store and is independent from prompt profiles and provider accounts. Revisioned RelationshipConversationBinding records are the canonical membership source. An AssistantRelationship is an index and focus aggregate, not an authorization domain. Folder membership implies no context access. A work thread receives only objective/task context and records selected through an exact ContextRetrievalAuthorization. Every access has a redacted audit receipt. A model-proposed relation between threads is untrusted until controller policy explicitly allows source IDs and purpose.

The default `ask_if_ambiguous` policy launches work automatically only for explicit substantial-work intent; discussion, ideas, and unclear ownership remain conversational. Proactive behavior is limited to quiet projections plus actionable attention/verified outcomes at natural pauses, and never starts Voice or moves focus. A focus visit requires explicit acceptance or user command before any target retrieval, hydration, or provider allocation; the offer reads projected item metadata only. One relationship-wide focus lease binds active/parked/retired lifecycle, optional owner attachment, heartbeat/expiry, focus generation, route, and a provider scope binding required only for active Voice/null for Chat or parked/retired. Detached/parked state preserves logical focus but accepts no relationship input/output until a fresh generation is claimed. Organization removal consumes parked focus into terminal `retired`; it cannot reactivate. Multi-client takeover requires current-owner yield, trusted UI confirmation under policy, or reconciled expiry/disconnect. One CAS transition quiesces/terminalizes the old attachment/session before activating the new generation and returns explicit winner/loser receipts; stale generations cannot input, output, speak, visit, or return. Acceptance permits target conversation/response focus only. Speech may resolve ordinary context questions and product decisions; it cannot resolve trusted approval. Deferral cannot be interpreted as consent, cancellation, or permission.

Every target receives a new immutable provider-thread/session binding for one canonical conversation. A lower transport may host it only when callbacks identify and isolate the new binding; otherwise Zyra prepares another session or reconnects. Provider thread IDs never rebind. Stale source and target identities are quarantined.

Strong consultations remain inspectable through private records and usage while staying out of the user timeline by default. “Mostly invisible” means presentation restraint, not missing audit evidence. Consultations/coordinator turns/thread starts reserve relationship budget atomically before dispatch; budget availability never grants execution authority.

Routine completion is informational and cannot inflate Needs you. Every attention answer validates current item/source/context/focus revisions before steering. Source deletion/redaction/withdrawal terminalizes open attention as non-actionable `source_unavailable`, safely closes any visit, and retains only a non-opening provenance tombstone; stale answers reject. A Home activity receipt is not a canonical assistant message. Active Home deletion is rejected; reset requires trusted non-speech confirmation after active/preparing Voice returns to fresh quiescent Chat and physical Realtime closes, then CAS-installs a generation-bound writer fence that blocks new Home turns/output/visits/takeovers/profile/activity-projection writes, drains pre-fence operation/receipt/NarrationDelivery streams exactly with uncertain speech nonreplayable as `outcome_unknown`, holds post-fence source receipts generation-unassigned, and revalidates fence/heads/watermarks before generation/receipt assignment. Recovery resumes or safely aborts the same fence without copying messages. Reset confirmation discloses archive/search visibility and retention; old-Home erasure is a separate trusted post-activation content cascade, so reset never claims deletion.

Standalone-task promotion never changes `conversation_id` or transfers leases. The original attempt is parked while the exact target conversation is created/receipted; one controller activation transaction then binds the thread, cancels the original with the existing reason, creates the successor using existing `supersedes_task_id`, appends the separate Phase Two TaskContinuation, and proves release before successor authority. Unknown-outcome operations block promotion.

## Permission versus decision

A decision chooses an outcome. A trusted approval resolution authorizes issuance of a separate capability lease. They have separate schemas, UI, persistence, and event types.

```mermaid
flowchart TD
    R[Proposed next step] --> D{Meaningful product/scope tradeoff?}
    D -- yes --> DR[Decision request]
    D -- no --> A{Protected capability or consequence?}
    DR --> A
    A -- yes --> AR[Approval request]
    A -- no --> E[Execute under existing policy]
    AR -->|trusted UI accepts exact request| L[Scoped capability lease]
    L --> G[Permission gate revalidation]
    G --> E
    AR -->|declined or expired| S[Safe alternative or stop]
```

A selected decision option can still require approval. An approval cannot decide an ambiguous product tradeoff on the user’s behalf.

## Approval requirements

An approval request MUST show:

- the exact action in understandable language;
- target, bounded scope, and exact observable preconditions;
- relevant irreversible or external consequences;
- which task requested it;
- duration/action count;
- available choices;
- what happens after decline.

In the reference profile, a **trusted approval control** is owned by the main-process/control broker, not by model output, worker events, or a general renderer IPC method. Desktop uses a main-owned native or equivalently isolated confirmation surface; TUI uses an authenticated attached client challenge with one-use server nonce. Untrusted surfaces may display a pending request but cannot call capability issuance directly.

The reference profile does not treat speech or model-generated text as authorization. A spoken response MAY navigate to or discuss the pending request, but only a trusted approval control can submit `{approval_request_id, record_revision, action_hash, decision}` before `expires_at` and produce a one-use `challenge_receipt_id` recorded with `authorization_channel: trusted_control`. The broker consumes each challenge nonce once; restart or redisplay rotates it, while the stable request/action hash remains visible. This prevents ambient, replayed, misrecognized, or synthesized speech and stale UI submissions from minting authority. All protected actions, including low-risk ones, require an equivalent keyboard-accessible trusted control; deployments can study stronger authenticated voice-confirmation protocols as a future extension, not silently weaken this baseline.

Approval scope/preconditions contain user-understandable, nonsecret values. A sensitive internal target is represented by a gate-keyed non-bearer digest in the hashed preconditions and resolved only inside the gate; raw control identifiers never enter model or renderer contracts.

Acceptance creates a separate durable capability lease. Lease material remains in the trusted controller/permission gate and is never exposed as a model bearer token or renderer secret. Before every protected tool call, the gate atomically checks request resolution, lease status, task and authorized attempt, exact action hash and scope, current relevant context, current permission epoch, expiry/revocation, and action count. It increments `actions_used` with the operation receipt. Parking, cancelling, terminal task state, emergency stop, context mismatch, or provider-session loss revokes the lease.

## Desktop and browser control

Chat and production Voice reuse the existing `AgentControlBroker` path:

- control remains in Electron main;
- the foreground has no direct control capability;
- a primary receives only a revocable, attenuated lease;
- current observation revision and target scope are checked for each action;
- TUI/realtime attachment does not imply desktop authority;
- emergency stop revokes grants and aborts queued control.

Voice convenience does not create an ambient remote-desktop channel.

## Data classification

| Class | Examples | Conversation/TTS policy |
|---|---|---|
| Public | Public docs, repository source intended for publication | May be summarized with provenance |
| User-visible private | User messages, chosen file excerpts, task outcomes | Main conversation when relevant; TTS after policy check |
| Task-private | Raw logs, full child transcripts, detailed tool results | Task details only; no TTS by default |
| Secret | Tokens, keys, credentials, auth files, password fields | Never model context, narration, logs, or artifacts |
| Sensitive control | Pairing codes, grant tokens, internal target IDs | Trusted process only; never renderer/model contracts |

## Storage, encryption, migration, and retention

### Canonical stores

The reference implementation uses clear ownership rather than treating every SQLite file as a cache:

- existing canonical conversation JSONL remains the source of user/assistant message truth;
- a per-user `controller.sqlite` is canonical for foreground-route revisions, append-only controller events, context revisions, tasks, execution attempts, operation intents, completion candidates, decisions, approval requests, capability leases, narration items/deliveries, idempotency receipts, and side-effect outbox entries;
- optional Phase Two user-space, relationship/conversation-binding, work-thread, focus-lease, attention-item, focus-visit, consultation, retrieval-authorization/access-receipt, context-escalation, relationship-budget/reservation, and relationship-activity-receipt records live in the same controller authority; Inbox and active-work state remain derived;
- private provider/worker records remain under existing ignored task-run storage and are referenced by stable IDs;
- Desktop search/timeline SQLite remains a disposable projection and never mints authority;
- resume packets are replaceable encrypted cache blobs derived from the canonical stores.

`controller.sqlite` uses foreign keys, WAL, transaction boundaries, and durable synchronization for authority/side-effect records. Domain events and resolved requests are immutable; projections/snapshots are replaceable. A transaction appends the event, updates its reduced snapshot, updates relevant source watermarks, and writes any outbox intent atomically.

Conversation JSONL and the controller database cannot share one filesystem transaction. The controller therefore writes an outbox intent with a deterministic canonical message ID, the conversation gateway appends and durably flushes that ID idempotently, and the controller records the commit receipt. Recovery retries the ID, never a new message. External side effects use the same durable-intent/receipt pattern and classify missing receipts as `outcome_unknown` rather than assuming failure.

Phase Two Home/work-thread creation uses a parallel conversation-creation intent/receipt protocol. Controller metadata, relationship binding, tasks/promotion lineage, and Home activity receipt remain inactive until the gateway durably creates the exact intended canonical ID/header and returns its hash/path receipt; the activation transaction then appends the deterministic epoch-1 Chat route with those records. Before controller activation, the receipted header is non-listable/non-attachable `pending_activation` and has no input-accepting route. Recovery reconciles the same intent after either-side crash. Conflicting/nonempty orphans are quarantined; only a proven empty unreferenced session created by the failed intent can be removed. Worker dispatch begins only after controller activation.

### At-rest protection

No access token, provider credential, microphone audio, WebRTC credential, or bearer capability token is stored in these records. Capability leases are authority references enforced inside the trusted permission gate, not transferable secrets.

The reference profile still protects sensitive local state:

- owner-only filesystem ACLs are mandatory for all canonical/private stores;
- resume packet blobs are authenticated-encrypted with a random data key wrapped by DPAPI, Keychain, or libsecret-compatible OS storage;
- sensitive controller payload fields such as exact approval scope and protected outbox operation payloads MUST use the same envelope encryption unless the whole controller database uses a supported authenticated encrypted-SQLite build;
- encryption metadata includes algorithm/version/key ID; plaintext keys never enter logs, renderer IPC, model context, or repository files;
- cache or field decryption failure fails closed and offers explicit recovery/deletion instead of starting with partial safety state.

Full-disk encryption remains recommended but is not treated as a substitute for application controls. Existing unencrypted conversation history must be disclosed accurately; this proposal does not claim it is already migrated or encrypted.

### Schema migration and recovery

`controller.sqlite` records storage schema version and minimum compatible reader version. Migrations follow `backup → integrity check → transactional expand/copy → schema and row validation → atomic activation`. The previous database is retained until the new store passes replay, foreign-key, and checksum checks. A reader that encounters an unsupported version or unknown event preserves bytes, stops projection before that record, and opens the affected conversation/task read-only.

Canonical-message route migration does not rewrite historical JSONL. It creates one initial `migration` Chat route plus per-message hash/sequence bindings and deterministic assistant migration receipts under one manifest hash. Any missing, duplicate, hash-mismatched, or temporally impossible source record leaves the conversation read-only and Voice disabled until repaired; migration never fabricates provider provenance.

Selecting the V1 interaction profile retains the same V2-capable runtime that implements this contract and is not an executable downgrade. An older compatible client receives server-normalized conversations/tasks/pending activities; an incompatible client is upgrade-required or read-only. Executable downgrade never writes through a newer schema. Crash recovery replays from the last committed sequence, validates outbox receipts and active lease/slot invariants, revokes orphaned authority, and regenerates projections/resume caches. Migration tests include interruption at every durable step and restoration from the backup.

### Reference retention defaults

User deletion and stricter configured policy always win. Initial defaults are:

| Record | Default |
|---|---|
| Canonical messages and context decisions | Follow the conversation retention setting |
| Active tasks/attempts and pending requests | Retain while active or pending |
| Terminal task-private logs and narration delivery diagnostics | 30 days, then compact/delete noncanonical detail |
| Approval/lease audit metadata and side-effect receipts | 90 days, without credentials or bearer material |
| Resume cache | Replace on every newer packet; delete after 7 disconnected days or with the conversation |
| Raw microphone/provider audio | Never retained unless a separate explicit recording feature/policy is enabled |
| Screenshots/control artifacts | Existing bounded artifact policy, with visible deletion controls |
| Phase Two attention/focus/activity-receipt metadata | Follow source retention; terminalize open attention/visits first, then retain only minimal non-opening source-unavailable/provenance tombstones required by audit policy |
| Phase Two retrieval access receipts and budget reservations | Follow controller audit/usage policy without retaining copied source content or provider secrets |

V2 disablement is presentation/routing rollback and deletes nothing. Trusted non-speech removal of relationship organization terminalizes bindings/budgets/projections while retaining canonical conversations/tasks as V1 data. Deleting contained content is a separate trusted-control ordered per-source cascade with explicit scope and resumable receipts; relationship membership is never blanket deletion consent.

Compaction preserves canonical messages, task terminal outcome, decisions, approval outcome, artifact metadata, and audit hashes while removing raw logs/content according to policy. Deletion first CAS-terminalizes dependent attention/visits/receipts, then tombstones references transactionally, revokes active leases, cancels active attempts, removes encrypted derivatives, and reports any external artifact it could not delete.

## Logging

Logs MUST redact:

- access/refresh tokens, API keys, cookies, SDP credentials, authorization headers;
- raw microphone audio;
- full private file contents and worker transcripts;
- typed sensitive values;
- provider payload fields not explicitly allowlisted.

Use IDs, event types, byte counts, durations, status, and redacted error codes for operational diagnosis. A debug mode cannot silently weaken secret filtering.

## Transport security

- Local client/server communication uses the authenticated per-user named pipe or Unix socket defined by the agent-server architecture.
- Raw LAN listeners remain disabled by default.
- WebRTC signaling and provider connections use provider-supported authenticated TLS paths.
- Session tokens stay in trusted main/server processes.
- Renderer IPC validates sender, schema, ownership, and generation.
- Experimental WebSocket listeners MUST NOT be enabled as an accidental network service.

## Provider and subscription boundaries

The Codex adapter uses the user’s supported Codex/ChatGPT authentication path. It must not copy tokens into prompts, URLs, logs, repository files, or child processes beyond the provider client’s normal credential mechanism.

Generic API-key Realtime is a different adapter and billing path. Documentation and UI must not imply that subscription access grants arbitrary API capabilities.

## Open-source publication safety

Contributions MUST NOT include:

- local auth files, tokens, session histories, private `.zyra` state, or screenshots containing personal data;
- copied/minified proprietary Desktop application code;
- private endpoint credentials or impersonation of first-party client identities;
- raw provider payload captures containing user/account identifiers;
- claims that experimental behavior is a stable provider guarantee.

Acceptable evidence includes public documentation, open-source provider code, generated public protocol schemas when redistribution permits, synthetic fixtures, and clean-room interoperability tests with sensitive fields removed.

## Security tests

Minimum adversarial coverage appears in [Evaluation plan](evaluation.md) and includes:

- prompt injection through speech, files, web results, and child output;
- approval forgery and stale-grant replay;
- context-version race during mutation/completion;
- foreground-route and session-generation replay;
- side-effect timeout with unknown outcome;
- secret and private-log narration attempts;
- child direct-speech attempts;
- symlink/path escape;
- disconnect/restart during approval and control action;
- usage-drain and runaway-delegation limits;
- cross-thread retrieval injection, stale/conflicting context, and unauthorized related-thread links;
- focus-generation/session replay during entry and return;
- Home receipt duplication or private-detail leakage;
- hidden consultation mutation/promotion bypass;
- profile-switch, linked-successor promotion, Home reset writer-fence bypass/late operation, deletion, and bootstrap races;
- multi-client focus-lease takeover and provider-thread rebinding attempts;
- relationship budget reservation race/unknown-usage exhaustion;
- deferral misread as decision, cancellation, or approval;
- source deletion racing a stale attention answer or leaving an orphan Needs-you card.

## Incident posture

An emergency stop cancels/revokes active control and worker capability leases while preserving the canonical audit trail. The user receives a concise safe status. Recovery requires fresh capability evaluation and approval; it never restores revoked authority from a resume packet.
