# Glossary

**Status: Draft canonical terminology.**
**Parent:** [Zyra Voice-Agent Architecture](README.md).

Use these terms consistently in architecture, code, events, and UI.

| Term | Definition |
|---|---|
| **Canonical conversation** | The stable Zyra/Pi chat identity and JSONL history shared by Desktop, TUI, speech, text, and images. |
| **Physical realtime session** | One bounded provider transport connection, such as a WebRTC session. It can expire without ending the canonical conversation. |
| **Logical foreground identity** | The persistent user-facing Zyra role reconstructed across physical sessions. |
| **Realtime foreground agent** | The capable conversational model that answers, clarifies, performs bounded inspection, requests promotion, and narrates approved facts. |
| **Inspection gateway** | Dedicated read/search/inspection/status operations with no generic mutation capability. |
| **Promotion** | Conversion of a direct or quick-inspection request into a durable task while preserving exact intent, findings, and context. |
| **Task** | Durable user intent with state, criteria, context version, decisions, approvals, artifacts, and execution attempts. |
| **Execution attempt** | One period in which a primary lineage owns the conversation’s strong-primary slot. Park, completion, failure, cancellation, or interruption terminates it; resume/recovery creates a new attempt ID. |
| **Task controller** | Deterministic code that owns routing, state transitions, context versions, policy, cancellation, idempotency, and completion validation. |
| **Strong primary agent** | The normal execution owner for a durable task. It integrates work and provides verification evidence. |
| **Completion candidate** | Immutable primary submission containing criterion evidence, artifacts, tests, context acknowledgements, cleanup, assumptions, fallbacks, gaps, and suggested summaries for controller verification. |
| **Subagent** | An exceptional, scoped child worker returning untrusted evidence to the primary. It never addresses the user. |
| **One-writer policy** | Preference for the primary as integration owner, with overlapping shared write scopes serialized or isolated. |
| **Conversation ledger** | Canonical user-visible message history. In Zyra this remains the Pi session JSONL. |
| **Task ledger** | Canonical append-only task/orchestration records in the agent-server controller store from which task state is reduced. It reuses/migrates existing fleet authority rather than competing with it. |
| **Private agent record** | Worker transcript, detailed tools/logs, checkpoints, and artifacts kept outside the main conversation. |
| **Projection** | Rebuildable view derived from canonical records, such as Desktop SQLite, renderer state, or a task card. |
| **Context revision** | Immutable, monotonic set of scoped constraints, corrections, decisions, preferences, focus, or attachment changes. |
| **Required context version** | Highest relevant context revision an owner must acknowledge before affected work or completion. |
| **Delegation packet** | Immutable start contract for a primary attempt, including the verbatim request, selected context, policy, and return contract. |
| **Child context envelope** | Narrow delegation packet for one subagent objective and scope. |
| **Decision request** | Structured request for user judgment among materially different valid outcomes. It grants no capability. |
| **Approval request** | Structured request for exact action/capability authority. Trusted resolution can issue a separate lease; the request itself grants nothing and does not choose product intent. |
| **Involvement mode** | Preference for when agents should involve the user in decisions: Mostly autonomous, Balanced, Highly collaborative, or Tightly controlled. |
| **Balanced** | Default involvement policy: agents resolve routine evidence-backed choices and ask about meaningful tradeoffs, scope, conflicts, and consequences. |
| **Capability lease** | Revocable, scoped, expiring, action-counted authority bound to task, authorized attempt, context version, action hash, and permission epoch. |
| **Narration candidate** | Validated task fact offered to narration policy before redaction, scheduling, and speech eligibility. |
| **Narration item** | Safe, typed visual/speech instruction produced by the narration scheduler. |
| **Narration delivery** | Crash-recoverable binding among a narration item, provider speech/item IDs, one deterministic canonical message ID, playback state, and terminal watermark. |
| **Central narrator** | The foreground agent as the only user-facing voice; workers never speak directly. |
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
| **Main conversation** | User-visible message timeline containing user turns and Zyra’s natural conclusions/questions, without raw execution noise. |
