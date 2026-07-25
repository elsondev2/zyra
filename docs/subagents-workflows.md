# Subagents and Workflows

Zyra can delegate bounded work to persistent child agents and run saved orchestration programs while the root chat stays responsive.

## Quick start

Inside a Zyra chat:

```text
/agent code-reviewer Review the changes under src/auth
/subtask Trace why this test is flaky
/agents
/workflow review-changes
/workflows
```

Normal conversation can also delegate through the root-only `agent` and `workflow` tools. A typed mention such as `@agent-code-reviewer` names an agent definition. It coexists with file mentions, for example:

```text
Compare @src/auth/session.mjs with @agent-code-reviewer
```

The root session remains responsible for the answer shown to the user. Child output is treated as untrusted evidence and arrives with run/attempt provenance.

## Agent definitions

Definitions are Markdown files with frontmatter and an instruction body:

```markdown
---
version: 1
name: dependency-auditor
description: Audit a bounded dependency change
role: reviewer
model: terra
effort: high
tools: ["read", "grep", "find", "ls"]
permissionMode: read-only
background: true
isolation: shared
maxTurns: 10
---

Inspect only the delegated scope. Return evidence-backed findings.
```

Precedence, highest first:

1. session overrides
2. `<project>/.zyra/agents/`
3. `~/.zyra/agents/`
4. `<zyra-install>/agents/`

Project definitions are discovered but do not run until the project is trusted. Invalid definitions remain visible in `/agents doctor` with errors.

Built-ins:

- `code-reviewer`
- `bug-analyzer`

### Claude agent import

Import is manual and two-step. Preview performs model/tool translation, duplicate checks, skill-link checks, prompt-risk checks, and normal Zyra validation without copying files:

```text
/agents import claude
```

After reviewing the report, explicitly confirm selected definitions:

```text
/agents import claude confirm dependency-auditor user
/agents import claude confirm all project
```

Claude model names are semantic hints, not equivalents: Opus maps toward Sol, Sonnet toward Terra, and Haiku toward Luna with Codex fallbacks. Unsupported tools, broken skills, duplicate names, and unsafe broad access block import.

## Agent controls

`/agents` opens the terminal manager. Use arrow keys and Enter to inspect; `s` prepares steering, `x` stops, and `r` retries. The fixed dock sits above the editor while active/recent work exists; Down from an empty editor focuses it and Escape returns to the editor.

Direct controls are also available:

```text
/agent send <run-id> Add this constraint
/agent status <run-id>
/agent wait <run-id>
/agent stop <run-id>
/agent retry <run-id>
/agent resume <run-id> Continue from the retained transcript
```

Each child has an independent persistent Pi JSONL session. `/subtask` branches the current root session tree before launching the child. Child transcripts are paged on demand and are not copied wholesale into the root context.

## Isolation and capabilities

Child authority can only narrow relative to the root:

- Browser, paired Chrome, Windows control, computer use, recursive agent/workflow control, and unknown tools are denied.
- Child agents do not receive Pi's unrestricted shell because it cannot enforce declared read/write scopes. Read, search, edit, and write tools receive path preflight guards, including symlink-aware project-boundary checks.
- Writer agents require explicit `writeScope` entries.
- Shared writers use overlapping-scope serialization.
- `worktree` isolation creates a retained Git worktree. Zyra reports the path and changed files; it never auto-merges or deletes the worktree.
- Merge, deploy, publish, capability elevation, destructive Git, and comparable irreversible actions remain root/user approval boundaries.

Child text is scanned for parent-presentation instructions, approval claims, protocol-shaped role markers, and common secret forms. Direct results are byte-bounded; full evidence stays in the transcript/artifact references.

## Model routing

The fleet is Codex-only and only considers `openai-codex/*` entries. Selectors:

- `sol` — orchestration, difficult synthesis, high-risk review
- `terra` — implementation, debugging, review, verification
- `luna` — fast search/extraction when live transport support exists
- `inherit` — inherit the root model if it is an eligible Codex model

Routes use current live availability/auth/support state and record every considered candidate. Previous-generation fallbacks include GPT-5.5, GPT-5.4, GPT-5.4 mini, and GPT-5.3 Codex Spark. Fallbacks are visible in run details. Escalation is bounded and requires a recorded quality/capability reason such as repeated schema failure or verifier rejection.

## Workflow definitions

Workflow files live in:

1. temporary one-run definitions
2. `<project>/.zyra/workflows/`
3. `~/.zyra/workflows/`
4. `<zyra-install>/workflows/`

The first release includes `review-changes`.

A definition exports metadata and a default result:

```javascript
export const meta = {
  version: 1,
  name: "review-module",
  description: "Review and verify a bounded module",
  phases: ["review", "verify"],
  budgets: {
    maxCalls: 8,
    maxRequests: 10,
    maxTokens: 300000,
    maxCostUsd: 3,
    maxConcurrency: 3,
  },
};

const reviews = await phase("review", () =>
  parallel([
    () => agent("Review correctness", { model: "terra", tools: ["read", "grep"] }),
    () => agent("Review tests", { model: "terra", tools: ["read", "grep"] }),
  ], { concurrency: 2 }),
);

export default await phase("verify", () =>
  agent(`Verify these findings: ${JSON.stringify(reviews)}`, { model: "sol" }),
);
```

The workflow API is deliberately small:

- `agent(prompt, options)`
- `parallel(tasks, { concurrency })`
- `pipeline(items, worker, { concurrency })`
- `phase(name, work)`
- JSON-safe arguments and intermediate values

## Sandbox and approval policy

Workflow JavaScript runs in a forked QuickJS/WASM worker. It has no Node globals, filesystem, shell, process environment, credentials, imports, dynamic evaluation, wall-clock/random APIs, or network APIs. The host only services explicit `phase` and `agent` messages and bounds each JSON response.

Built-in and personal definitions are trusted definitions. Untrusted project workflows and temporary/generated workflows require explicit one-run approval. Approval does not grant extra child capabilities.

Budgets enforce calls, requests, tokens, cost, and workflow-wide concurrency. Large projected runs show warnings. Stable completed calls are fingerprinted from script revision, arguments, prompt, model policy, tools, capabilities, isolation, write scope, and schema; unchanged calls can be reused during retry/resume.

## Workflow controls

```text
/workflow review-changes
/workflows
```

The manager supports drill-in, pause/resume, stop, restart, and save. Workflow phases/calls, child links, usage, cache hits, failures, and final result are persisted. Incomplete work is reconciled as interrupted/recovering after restart; it is not silently claimed as successful or blindly replayed.

## Persistence

Canonical fleet data is event sourced under:

```text
<project>/.zyra/agent-runs/<root-session-id>/
  fleet.events.jsonl
  fleet.snapshot.json
  agents/<agent-run-id>.json
  child-sessions/*.jsonl
  workflows/<workflow-run-id>/
    script.mjs
    events.jsonl
    snapshot.json
    cache/*.json
```

Writes use append-only JSONL plus atomic temp-file replacement for snapshots/records. A truncated final JSONL record is ignored with a recovery warning. Desktop keeps a queryable SQLite projection in separate fleet tables; existing assistant session/message rows are not rewritten.

## Desktop

The desktop bridge forwards bounded canonical fleet snapshots over the existing duplex worker. Main-process projection and typed IPC remain authoritative; the renderer does not run a second controller.

Open **Inspector → Agents** to view:

- Agents and Workflows tabs
- status, goal, model, usage, elapsed time, capabilities, fallback reason, isolation, worktree, result/error
- pause/stop/retry/resume/restart/save controls
- paged child transcripts
- workflow phase/call progress and cache counts

## Verification

Focused checks:

```bash
npm run test:subagents-workflows
npm --prefix desktop run typecheck
npm run privacy-check
```

The focused suite covers routing, capability attenuation, output scanning, event replay/truncated logs, concurrency, cancellation/disposal, context forks, transcript paging, QuickJS isolation, approval, cache fingerprints, budgets, TUI projection/focus, bridge/IPC, SQLite projection, and Inspector rendering.
