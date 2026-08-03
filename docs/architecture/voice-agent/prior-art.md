# Prior art and contribution boundary

**Status: Research record.**
**Parent:** [Zyra Voice-Agent Architecture](README.md).
**Sources reviewed:** 2026-08-02.

## Responsible claim

The individual patterns in this architecture are established: realtime voice agents, model handoffs, manager/supervisor agents, specialist workers, durable checkpoints, approvals, context filtering, and background coding tasks all have public prior art.

This review did not find a public source documenting the complete Zyra combination as one open reference architecture:

- normal direct strong-agent Chat with explicit transition into realtime Voice;
- one exclusive foreground route and persistent Zyra identity;
- a deterministic controller outside model memory;
- bounded realtime inspection;
- one strong coding/execution agent;
- exceptional background subagents;
- selective central narration;
- canonical multimodal chat/task ledgers;
- prepared silent continuity across expiring physical sessions;
- separate user-involvement and permission policy.

That finding is not proof of global uniqueness. Zyra should describe its contribution as an integrated open reference design and implementation, not as a world first.

## Pattern comparison

| System/source | Publicly demonstrates | Relationship to Zyra |
|---|---|---|
| OpenAI Agents orchestration | Handoffs versus manager-owned “agents as tools”; recommendation to start with one agent | Supports one stable user-facing manager and restrained specialization |
| OpenAI Realtime Agents SDK | Long-lived realtime sessions, tools, approvals, handoffs, interruptions, usage, history | Demonstrates capable voice agents; generic API behavior is separate from Codex subscription realtime |
| OpenAI Codex App Server | Threads, turns, items, streaming, approvals, experimental thread realtime and app integration | Closest public protocol foundation for the Codex adapter and durable coding work |
| ChatGPT/Codex Desktop Voice pricing docs | Duplex GPT-Live/strong-task model and separate Voice/task usage | Closest deployed product shape; public internals remain limited |
| LiveKit supervisor pattern | Long-lived conversational supervisor with focused typed tasks and result validation | Strong precedent for a sole conversational manager and bounded specialists |
| LiveKit handoffs/context | Active-agent transfer, explicit history transfer, truncation/summarization strategies | Demonstrates context engineering; Zyra keeps central voice ownership instead of worker takeover |
| Microsoft Agent Framework | Handoff versus agent-as-tool ownership, approvals, and durable checkpointed agents/workflows | Supports explicit ownership, durable user waits, recovery, and permission-aware orchestration |
| Temporal and LangGraph | Deterministic workflow replay; thread checkpoints, interruption, and fault recovery | Prior art for durable state outside model memory and projection/replay patterns |
| ElevenLabs agent transfer | Voice conversation transfer, transcript preservation, transfer rules | Demonstrates voice-specialist handoffs; transferred agents may become the active speaker |
| Vapi Squads/handoff | Multi-assistant calls, context filters, variable extraction, spoken handoff messages | Demonstrates practical context and speech policy controls for voice orchestration |
| Existing Zyra fleet/workflows | Event sourcing, scoped children, cancellation, worktrees, budgets, approvals | Supplies the local execution foundation this specification extends |

## OpenAI Agents: manager ownership and handoffs

OpenAI’s orchestration guide distinguishes:

- **handoffs**, where a specialist takes ownership of the next user response;
- **agents as tools**, where a manager retains responsibility for the final answer.

It recommends adding specialists only when capability, policy, prompt clarity, or trace legibility materially improve. Zyra uses manager-style ownership inside Voice so Realtime remains narrator, while ordinary Chat assigns the strong role direct foreground ownership.

Source: OpenAI, [Orchestration and handoffs](https://developers.openai.com/api/docs/guides/agents/orchestration), accessed 2026-08-02.

## OpenAI Realtime Agents

The OpenAI Agents SDK realtime guide documents long-lived sessions that process text/audio incrementally, stream output, execute tools, handle approvals and interruptions, perform realtime handoffs, retain local history, and expose usage events.

This proves that a realtime model can be an active agent rather than a passive speech layer. Its generic API function tools and image messages cannot be assumed in subscription-backed Codex thread realtime.

Sources:

- OpenAI, [Realtime agents guide](https://openai.github.io/openai-agents-python/realtime/guide/), accessed 2026-08-02.
- OpenAI, [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations), accessed 2026-08-02.

## Codex App Server and Desktop Voice

The open-source Codex App Server is a public protocol for rich clients. It exposes durable thread/turn/item primitives and documents experimental thread realtime methods, startup context, client-managed handoffs, explicit speech append, and ordinary coding turns.

OpenAI’s ChatGPT Voice documentation says the Desktop feature can start separate threads for longer tasks, inspect active threads, send follow-up instructions, and bring progress, blockers, and results back to the voice conversation. It follows the permissions of the tasks it directs. OpenAI’s pricing documentation states that Desktop Voice uses a duplex model: GPT-Live manages conversation while GPT-5.6 Terra starts and coordinates tasks. Voice and task usage are metered separately.

Together, these are the closest public/deployed precedent for a voice foreground coordinating coding work. Zyra adds a public deterministic task/context/narration specification, provider seams, explicit continuity projection, restrained subagent policy, and integration with its canonical local chat.

Sources:

- OpenAI, [ChatGPT Voice](https://developers.openai.com/codex/features/voice), accessed 2026-08-02.
- OpenAI, [Codex App Server](https://developers.openai.com/codex/app-server), accessed 2026-08-02.
- OpenAI, [Codex App Server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md), accessed 2026-08-02.
- OpenAI, [Codex pricing](https://developers.openai.com/codex/pricing), accessed 2026-08-02.
- OpenAI, [Codex open-source components](https://developers.openai.com/codex/open-source), accessed 2026-08-02.

## LiveKit supervisor and handoffs

LiveKit documents a supervisor pattern where one long-lived agent remains in control, invokes focused `AgentTask` specialists, validates their typed results, and continues the conversation. It advises a single agent with tools when sufficient and focused tasks when separate reasoning loops add value.

LiveKit also documents active-agent handoffs and explicit context preservation. Prior history is opt-in; applications can copy, truncate, or summarize context.

Zyra adopts the single conversational supervisor principle and typed specialist results. It uses deterministic ledger projection for continuity and keeps coding workers out of the speech role.

Sources:

- LiveKit, [Supervisor pattern](https://docs.livekit.io/agents/logic/supervisor-pattern/), accessed 2026-08-02.
- LiveKit, [Agents and handoffs](https://docs.livekit.io/agents/logic/agents-handoffs/), accessed 2026-08-02.

## Microsoft Agent Framework

Microsoft’s handoff orchestration documentation contrasts full ownership transfer with agent-as-tool behavior where a primary keeps responsibility. It also describes human approval events and durable checkpoint restoration for workflows waiting on user input or tool approval.

Zyra uses primary ownership for execution and an independent foreground narrator. Its controller persists decisions and approvals as different record types.

Sources:

- Microsoft, [Agent Framework handoff orchestration](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/handoff), accessed 2026-08-02.
- Microsoft, [Agents orchestration — Multi-agent Reference Architecture](https://microsoft.github.io/multi-agent-reference-architecture/docs/context-engineering/Agents-Orchestration.html), accessed 2026-08-02.

## ElevenLabs agent transfer

ElevenLabs documents a `transfer_to_agent` system tool for voice workflows. It preserves the conversation transcript across agent changes and supports transfer conditions, optional spoken transfer messages, and nested specialists.

This is clear prior art for voice-driven specialization. Its ownership model changes the active agent; Zyra keeps one foreground voice while workers return evidence privately.

Source: ElevenLabs, [Agent transfer](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/agent-transfer), accessed 2026-08-02.

## Vapi Squads and handoff context

Vapi Squads split a call among focused assistants and support handoff destinations, context-engineering plans, variable extraction, rejection plans, and phase-specific spoken messages. Its docs recommend keeping squad size small and defining precise transfer conditions.

Zyra shares the small-fleet and context-minimization principles. Zyra’s task workers do not take over the voice session, and context is projected from canonical local ledgers.

Sources:

- Vapi, [Introduction to Squads](https://docs.vapi.ai/squads), accessed 2026-08-02.
- Vapi, [Handoff tool](https://docs.vapi.ai/squads/handoff), accessed 2026-08-02.

## Durable execution and checkpointing

Microsoft’s Durable Task extension persists agent sessions, checkpoints agent/workflow steps, resumes after failure, and avoids re-executing completed agent calls. Temporal documents durable workflow executions recovered through deterministic event-history replay. LangGraph documents thread-scoped checkpoints for continuity, human interruption, and fault recovery, with persistent storage required across restarts.

These systems are prior art for keeping long-running authority outside model memory. Zyra’s contribution is applying those principles to a local voice/coding experience with its specific task, context, narration, and permission contracts.

Sources:

- Microsoft, [Durable Task extension for Microsoft Agent Framework](https://learn.microsoft.com/en-us/azure/durable-task/sdks/durable-agents-microsoft-agent-framework), accessed 2026-08-02.
- Temporal, [Workflow Execution overview](https://docs.temporal.io/workflow-execution), accessed 2026-08-02.
- LangChain, [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence), accessed 2026-08-02.

## Where Zyra can contribute

### 1. A complete open contract

The useful publication unit includes role boundaries, state machines, event schemas, context propagation, narration policy, security, usage, recovery, and evals together. Many public examples stop at a handoff demo.

### 2. Coding-agent-specific voice policy

Coding work produces unusually noisy and sensitive output: commands, diffs, test logs, file contents, approvals, and long background tasks. Selective narration and private task details address this directly.

### 3. Deterministic continuity without another model

A prepared materialized view preserves current tasks, exact constraints, pending user obligations, recent verbatim turns, and retrieval references across physical realtime sessions. It avoids waking the strong worker or introducing a third summarizer merely to reconnect.

### 4. Restrained model topology

The foreground has meaningful bounded capability. One primary normally executes. Children require exceptional justification. This is easier to reason about, evaluate, and afford than an eager agent swarm.

### 5. Permission/involvement separation

Collaboration preferences control when the system asks for judgment. Permission gates independently control authority. Encoding the distinction in schemas and tests makes a common safety principle implementable.

### 6. Provider-neutral design informed by a real adapter

The public core can support multiple providers while the experimental Codex adapter demonstrates the difficult subscription-backed case. Capability discovery prevents generic API features from leaking into unsupported assumptions.

## Claims Zyra should avoid

- “The first voice coding agent.”
- “The first realtime supervisor.”
- “The first multi-agent voice system.”
- “The first voice agent with background tasks.”
- “Unlimited voice means unlimited coding work.”
- “Codex thread realtime supports every generic Realtime API feature.”
- “The architecture guarantees autonomous correctness.”
- “A model summary is a source of truth.”

## Suggested project description

> Zyra Voice is an open reference architecture for a persistent coding assistant with normal direct strong-agent Chat and optional realtime Voice: one canonical conversation, explicit foreground ownership, a deterministic task controller, selective spoken narration, and resumable task context across sessions.

## Research limits

This review used discoverable public documentation and existing Zyra source. Absence from the reviewed sources does not prove absence from private, unpublished, newly released, or differently described systems. The comparison should be refreshed before major announcements.
