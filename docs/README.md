# Zyra Documentation

This directory separates current user/developer guidance from architecture records, implementation plans, handoffs, research, and historical agent briefs.

Status words used below:

- **Current** — maintained guidance or source-of-truth documentation.
- **Draft** — forward-looking work that is not an implemented contract.
- **Historical** — retained implementation evidence or research, not current instructions.
- **Superseded** — preserved context replaced by a newer path or implementation.

## Current guidance

- [Repository map](repository-map.md) — **Current.** Ownership and cleanup policy for every top-level Zyra surface.
- [Subagents and workflows](guides/subagents-workflows.md) — **Current.** User/developer guide for fleet and workflow behavior.
- [Model support](guides/model-support.md) — **Current.** Supported providers/models and deferred compatibility work.
- [Agent-control security and operations](security/agent-control.md) — **Current.** Authority, approval, transport, and incident boundaries.
- [Parallel agent build runbook](runbooks/parallel-agent-build.md) — **Current.** Procedure still consumed by the autonomous coordinator scripts.

## Architecture

- [Agent server](architecture/agent-server.md) — **Current.** Shared server authority, persistence, and client flow.
- [Canonical chat integrity](architecture/canonical-chat-integrity.md) — **Current.** Cross-client identity, indexed history, metadata, recovery, and migration safety.
- [Agent surfaces](architecture/agent-surface.md) — **Current.** Desktop/TUI semantic projection boundaries.
- [Assistant browser](architecture/assistant-browser.md) — **Current.** Integrated Electron Browser ownership and visual-control architecture.
- [Local browser client](architecture/local-browser-client.md) — **Current.** Same-device Chrome runtime, transport, security, and capability boundary.
- [Assistant resources](architecture/assistant-resources.md) — **Current.** Resource indexing and presentation ownership.
- [Desktop theme contract](architecture/desktop-theme-contract.md) — **Current.** Shared shell surfaces, accessible palette resolution, specialized renderers, and validation.
- [Voice-agent architecture](architecture/voice-agent/README.md) — **Draft.** Normative Phase One Chat/Voice authority, provider, continuity, and delivery contracts, plus optional Phase Two sequencing.

## Implementation records

- [Browser and computer use](implementations/browser-computer-use.md) — **Historical.** Build plan and acceptance record for the control subsystem.
- [Chrome visual browser use](implementations/chrome-visual-browser-use.md) — **Historical.** Chrome implementation contract retained for design evidence.
- [Subagents and workflows](implementations/subagents-workflows.md) — **Historical.** Original fleet/workflow implementation plan.
- [Windows isolated computer use](implementations/windows-isolated-computer-use.md) — **Historical.** Windows sidecar implementation record.

## Handoffs

- [V1 local browser client](handoffs/2026-08-09-jake-v1-local-browser.md) — **Current.** Jake’s same-device browser branch merge and validation record.
- [Agent-platform integration](handoffs/agent-platform-integration.md) — **Historical.** Integration checkpoint merged into the main line.
- [Browser/computer use](handoffs/browser-computer-use.md) — **Historical.** Builder transfer record.
- [Chat performance](handoffs/chat-performance.md) — **Historical.** End-to-end performance implementation handoff.
- [Desktop root migration](handoffs/desktop-root-migration.md) — **Superseded.** Pre-migration instructions; the active application now lives under `desktop/`.
- [File-change streaming specification](handoffs/file-change-streaming-spec.html) — **Historical.** Agent execution contract and acceptance evidence.
- [In-app visual browser control](handoffs/in-app-visual-browser-control.md) — **Historical.** Visual browser implementation handoff.
- [Subagents/workflows](handoffs/subagents-workflows.md) — **Historical.** Builder completion record.
- [V1 Voice core merge handoff](handoffs/v1-voice-core-merge-handoff.md) — **Current.** Mike's merge boundary, evidence, and remaining production integration gates.

## Plans

- [File-change streaming](plans/file-change-streaming.html) — **Historical.** Research and implementation rationale paired with the archived handoff.
- [Ultra orchestration](plans/ultra-orchestration.html) — **Draft.** Forward-looking orchestration exploration, not current runtime policy.

## Research

- [Codex capability research](research/codex-capability.html) — **Historical.** Capability comparison and adoption research.
- [Codex-inspired UI map](research/codex-inspired-ui-map.md) — **Historical.** UI comparison and evidence map.
- [DevScope chat-history rail](research/devscope-chat-history-rail.html) — **Historical.** Rail behavior comparison report.

## Internal agent documentation

- [Agent-platform integrator](agent-prompts/agent-platform-integrator.md) — **Current.** Internal coordinator input referenced by automation scripts.
- [Browser/computer-use builder](agent-prompts/browser-computer-use-builder.md) — **Current.** Internal builder input referenced by automation scripts.
- [Subagents/workflows builder](agent-prompts/subagents-workflows-builder.md) — **Current.** Internal builder input referenced by automation scripts.
- [Archived chat-app end-to-end goal](agent-prompts/archive/chat-app-end-to-end-goal.md) — **Historical.** Recovered one-off root brief; several paths predate `desktop/`.

## Conventions

- Keep maintained how-to material in `guides/` and source-of-truth security policy in `security/`.
- Keep architecture separate from implementation evidence and forward plans.
- Move completed one-off execution briefs to an `archive/` directory instead of leaving them at repository root.
- Do not commit generated build output, local sessions, private exports, or credentials as documentation.
