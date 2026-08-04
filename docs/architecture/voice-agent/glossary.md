# Glossary

**Status: Draft canonical terminology.**
**Parent:** [Zyra Voice-Agent Architecture](README.md).

Use these terms consistently in architecture, code, events, and UI.

| Term | Definition |
|---|---|
| **Canonical conversation** | The stable Zyra/Pi chat identity and JSONL history shared by Desktop, TUI, direct strong Chat, speech, text, and images. |
| **Chat surface** | The normal canonical conversation timeline and composer. Sends route directly to the strong primary without requiring Realtime. |
| **Foreground route** | Canonical controller record assigning one conversation route epoch to Chat/strong or Voice/realtime response ownership. |
| **Foreground owner claim** | Non-authorizing route-bound proof required for assistant output; it grants response production, not execution capability. |
| **Physical realtime session** | One bounded provider transport connection, such as a WebRTC session. It can expire without ending the canonical conversation. |
| **Logical Zyra identity** | The persistent user-facing identity shared across Chat/Voice route changes and physical sessions. |
| **Product interaction profile** | User-selectable product posture. `conversation_scoped` is Phase One/V1; `relationship_first` is optional Phase Two/V2. These labels are independent from schema/protocol versions. |
| **User space** | Stable identity for one OS-user-owned local Zyra data store/installation. It is distinct from prompt `/profile` overlays, provider accounts, projects, models, and product interaction profiles. |
| **Assistant relationship** | Phase Two aggregate unique to one user space, grouping Zyra Home, conversation bindings, work-thread/folder references, interaction preferences, attention projections, Home generation, and the current relationship focus lease. It is neither a merged message ledger nor an authority source. |
| **Relationship conversation binding** | Append-only canonical membership record linking one relationship to one canonical conversation as Home, work thread, or ordinary reference. Membership grants no retrieval authority. |
| **Zyra Home** | Distinguished Phase Two canonical conversation that acts as the default relationship entry point and projects compact provenance-linked controller activity receipts. Active Home resets through a new generation rather than direct deletion. |
| **Relationship focus lease** | Server-authoritative Phase Two active/parked/retired focus snapshot with at most one owner attachment, current canonical conversation/thread/task, route, optional Voice provider binding, and monotonic generation. Parked has no owner; retired is terminal. It grants no execution capability. |
| **Focus visit** | Accepted, purpose-bound, modality-preserving transition under the relationship focus lease into a work thread and back. Chat carries no realtime binding; Voice preserves target isolation, return anchor, independent return/acknowledgement deadlines, and safe Chat/degraded-Voice fallback. |
| **Return anchor** | Noncanonical saved source conversation watermark, presentation position, and concise conversational cue used to restore a surface after a focus visit. |
| **Realtime foreground agent** | The capable conversational model that owns responses only in Voice, performs bounded inspection, requests promotion, and narrates approved facts. |
| **Inspection gateway** | Dedicated read/search/inspection/status operations with no generic mutation capability. |
| **Promotion** | Conversion of a direct or quick-inspection request into a durable task while preserving exact intent, findings, and context. |
| **Work thread** | Phase Two conversation-first container for one substantial chunk/set of work, with its own canonical conversation, origin, optional folder, activity, decisions, artifacts, results, and zero tasks only while preparing; background execution requires a thread-bound task. It is distinct from a provider thread or private worker session. |
| **Kickoff request** | Revisioned Phase Two pre-task record naming the exact brief fields/question still needed for a preparing work thread; V1 can render it as a generic pending question in that thread conversation. |
| **Task** | Durable user intent with state, criteria, context version, decisions, approvals, artifacts, and execution attempts. |
| **Task continuation** | Phase Two immutable lineage record linking a safely released/cancelled standalone task to one new thread-bound successor using existing `supersedes_task_id`, without changing Phase One task schemas or conversation identity. |
| **Execution attempt** | One period in which a primary lineage owns the conversation’s strong-primary slot. Park, completion, failure, cancellation, or interruption terminates it; resume/recovery creates a new attempt ID. |
| **Task controller** | Deterministic code that owns routing, state transitions, context versions, policy, cancellation, idempotency, and completion validation. |
| **Strong primary agent** | The direct response owner in Chat and normal execution owner for durable work. It integrates work and provides verification evidence. |
| **Strong consultation** | Phase Two bounded, read-only, mostly invisible one-shot reasoning call used by Voice when deeper reasoning is useful but durable work is not yet required. |
| **Strong coordinator** | Phase Two logical strong-agent lane that classifies substantial work, creates/resumes work threads, decomposes tasks, performs provenance-bearing context retrieval, and integrates escalation. It grants no authority beyond controller policy. |
| **Context escalation** | Structured worker request for missing information that the strong coordinator first resolves from authorized trusted context, then turns into user attention only when necessary. |
| **Completion candidate** | Immutable primary submission containing criterion evidence, artifacts, tests, context acknowledgements, cleanup, assumptions, fallbacks, gaps, and suggested summaries for controller verification. |
| **Subagent** | An exceptional, scoped child worker returning untrusted evidence to the primary. It never addresses the user. |
| **One-writer policy** | Preference for the primary as integration owner, with overlapping shared write scopes serialized or isolated. |
| **Conversation ledger** | Canonical user-visible message history. In Zyra this remains the Pi session JSONL. |
| **Task ledger** | Canonical append-only task/orchestration records in the agent-server controller store from which task state is reduced. It reuses/migrates existing fleet authority rather than competing with it. |
| **Private agent record** | Worker transcript, raw tools/logs, checkpoints, and artifacts kept outside canonical assistant messages; redacted structured activity can project into Chat. |
| **Projection** | Rebuildable view derived from canonical records, such as Desktop SQLite, renderer state, or a task card. |
| **Context revision** | Immutable, monotonic set of scoped constraints, corrections, decisions, preferences, focus, or attachment changes. |
| **Required context version** | Highest relevant context revision an owner must acknowledge before affected work or completion. |
| **Delegation packet** | Immutable start contract for a primary attempt, including the verbatim request, selected context, policy, and return contract. |
| **Child context envelope** | Narrow delegation packet for one subagent objective and scope. |
| **Decision request** | Structured request for user judgment among materially different valid outcomes. It grants no capability. |
| **Attention item** | Phase Two non-authorizing, source-revision-bound coordination record for a decision, approval, blocker, kickoff gap, review, or actionable failure that requires user input. Routine completion is not Needs you attention. |
| **Hybrid Inbox** | Phase Two projection over canonical records with Needs you, Active, and Completed views; Needs you owns the notification count. |
| **Active-work strip** | Compact Home/composer-adjacent projection showing verified state for running or attention-requiring work threads and standalone tasks; thread tasks roll up into one row. |
| **Relationship receipt** | Deterministic compact controller activity projected into Home and linked to source thread/visit evidence. It is not a canonical assistant message; natural text/speech requires normal route-bound delivery. |
| **Realtime scope binding** | Immutable Phase Two tuple binding one canonical conversation to one provider thread, physical session generation, and focus generation. Provider thread IDs never rebind across conversations. |
| **Context retrieval authorization** | Non-bearer controller record limiting one worker/coordinator retrieval by principal, purpose, allowed sources/data classes, policy/context revisions, redaction/size limits, expiry, and use budget. |
| **Relationship budget** | Revisioned Phase Two concurrency/usage policy plus atomic reservations for consultations, coordinator work, and thread attempts. It reports no authority and never substitutes for provider usage truth. |
| **Approval request** | Structured request for exact action/capability authority. Trusted resolution can issue a separate lease; the request itself grants nothing and does not choose product intent. |
| **Involvement mode** | Preference for when agents should involve the user in decisions: Mostly autonomous, Balanced, Highly collaborative, or Tightly controlled. |
| **Balanced** | Default involvement policy: agents resolve routine evidence-backed choices and ask about meaningful tradeoffs, scope, conflicts, and consequences. |
| **Capability lease** | Revocable, scoped, expiring, action-counted authority bound to task, authorized attempt, context version, action hash, and permission epoch. |
| **Narration candidate** | Validated task fact offered to narration policy before redaction, scheduling, and speech eligibility. |
| **Narration item** | Safe, typed visual/speech instruction produced by the narration scheduler. |
| **Narration delivery** | Crash-recoverable binding among a narration item, active Voice route claim, provider speech/item IDs, one deterministic canonical message ID, playback state, and terminal watermark. |
| **Central narrator** | Realtime as the only spoken narrator while Voice is active; background workers never speak directly. |
| **Selective speech** | Policy that speaks conclusions, useful progress, blockers, decisions, approvals, failures, and completion while suppressing mechanics. |
| **Continuity service** | Deterministic reducer that materializes bounded resume context from canonical ledgers. It is not a model or source of truth. |
| **Resume packet** | Prepared, bounded snapshot of current focus, active tasks, constraints, decisions, pending user items, recent turns, and retrieval references. |
| **Resume delta** | Ordered, typed, hash-checked, nontruncated record set from a known packet watermark to newer canonical/safety state. |
| **Watermark** | Monotonic source position proving which conversation/task/agent records a projection includes. |
| **Silent hydration** | Supplying and acknowledging resume packet/deltas before response generation without creating a user message or prompting an unsolicited greeting. |
| **Retrieval reference** | Stable pointer to omitted canonical detail that the foreground can inspect on demand. |
| **Idempotency key** | Stable operation identity used to prevent duplicate side effects across retries and recovery. |
| **Intent/receipt pair** | Durable pre-execution record/outbox entry and post-execution proof for a side effect or canonical message commit. |
| **Permission epoch** | Monotonic safety generation; emergency stop or policy reset invalidates leases from older epochs. |
| **Primary-slot lease** | Controller ownership record proving which attempt, if any, may run the conversation’s strong primary. |
| **Unknown outcome** | Operation state where execution may have occurred but no reliable receipt exists; consequential retry is blocked. |
| **Provider adapter** | Concrete implementation translating provider protocols to Zyra domain contracts. |
| **Capability report** | Versioned runtime evidence describing what an adapter/provider supports now. |
| **Voice usage** | Provider allowance/cost associated with the physical realtime conversation. |
| **Agent-work usage** | Provider allowance/cost associated with primary and subagent model work. |
| **Task details** | Inspectable UI for tools, logs, artifacts, worker provenance, usage, and verification evidence. |
| **Main conversation** | User-visible Chat timeline containing canonical turns plus optional collapsible structured execution activity; raw execution payloads remain private. |
