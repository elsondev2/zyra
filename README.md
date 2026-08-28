# Zyra

Zyra is a local coding assistant CLI built on top of the Pi SDK.

It runs in the project folder you open it from, saves chats locally, can read and edit files, can run checks, and uses prompt/profile overlays so the experience can feel like a small workshop without hardcoding a specific person or private context.

## Why

Zyra is for real work in real code:

- notice what feels off
- inspect the actual files
- explain the next useful layer
- make the smallest serious fix
- verify the result
- explain the diff clearly

Not a course. Not a generic chatbot shell. A local workshop you can keep coming back to.

## Prompt And Profile Model

Zyra separates public tool behavior from optional local context:

- `prompts/zyra_system_prompt.md` is the public core system prompt: Zyra's voice, coding loop, safety habits, and verification style.
- `prompts/profiles/default.md` is the public default profile.
- `prompts/profiles/learner.md` adds beginner-safe learning support.
- `prompts/profiles/builder.md` adds direct product/build/debug behavior.
- `.zyra/profiles/<name>.md` can hold local private profile overlays. `.zyra/` is ignored by Git.
- `.zyra/memory/` is local memory. It should not be committed or treated as public product identity.

The public repo should not include private relationship context, raw exports, local datasets, or person-specific prompt assumptions.

Product analytics is optional and disabled by default. When configured, it sends only allowlisted coarse outcomes under a random installation ID. Prompts, responses, files, paths, URLs, Browser history, account identity, terminal content, and raw errors are excluded. See [Product analytics](docs/architecture/product-analytics.md) and [setup](docs/guides/product-analytics-setup.md).

## Run It Locally

```powershell
.\zyra.ps1
```

## Install Or Update

Fresh Windows install from PowerShell:

```powershell
irm https://raw.githubusercontent.com/justelson/zyra/master/install.ps1 | iex
```

Fresh Windows install from Command Prompt:

```cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/justelson/zyra/master/install.ps1 | iex"
```

That installs Zyra into:

```txt
%LOCALAPPDATA%\Zyra
```

and adds the `zyra` command to the user PATH.

From a local clone:

```powershell
.\install.ps1
```

or:

```cmd
install.cmd
```

On macOS/Linux:

```bash
bash install.sh
```

## Auth Setup

Zyra uses Pi auth under the hood, so ChatGPT/Codex credentials stay in the Pi auth file:

```txt
~/.pi/agent/auth.json
```

First-run onboarding lets you choose either authentication method. Manual setup works too:

```powershell
zyra login subscription
zyra login api
```

`subscription` opens the ChatGPT/Codex browser login. `api` asks for the key in a masked terminal prompt, verifies it with OpenAI, and only then saves it through Pi auth storage. API usage has separate OpenAI API billing and does not consume the ChatGPT subscription allowance.

`OPENAI_API_KEY` is also supported. Environment credentials remain active until the variable is removed from the environment, even after `zyra logout api` removes a stored key.

Useful authentication commands:

```powershell
zyra auth
zyra logout subscription
zyra logout api
zyra codexusage
```

Inside an active Zyra chat, `/auth` shows both connections and the active method. Use `/auth api` or `/auth subscription` to switch immediately. `/login api` rotates the stored API key, while `/auth api setup` does the same explicitly.

Never paste an API key into the chat editor or pass it as a command argument. Use the secure prompt from `zyra login api`, `/login api`, or `/auth api setup`. Do not copy another person's auth file between machines.

## Common Commands

```powershell
zyra
zyra --version
zyra onboarding
zyra inspect
zyra ask "Explain this error simply"
zyra -p "Explain this error simply"
zyra --project "C:\path\to\repo"
zyra --profile learner
zyra --web
zyra --no-websearch
zyra --no-webfetch
zyra --interrupt steer
zyra --interrupt queue
zyra --mode fast
zyra --mode normal
zyra threads
zyra sessions # legacy alias
zyra continue
zyra resume
zyra doctor
zyra --update
```

Inside chat:

- `@file` attaches project files to the prompt. `@agent-<name>` names a reusable child agent and can appear beside file mentions.
- `/start` scans the current repo and gives a plain starting point.
- `/new` starts a fresh chat.
- `/session` shows project/session/model info.
- `/compact [notes]` compacts the active model context; Pi also handles auto-compaction when context gets too full.
- `/profile` switches profile overlays: `auto`, `default`, `learner`, `builder`, or a local `.zyra/profiles/<name>.md` profile.
- `/memory` toggles local memory logging for the current chat.
- `/web` opens web tool selection: all, none, search only, or fetch only.
- `/websearch` toggles search results. `/webfetch` toggles URL page fetching.
- `/interrupt` opens a picker for what Enter does while Zyra is already working; `/interrupt steer|queue` sets it directly. `/interupt` works too.
- `/mode normal|fast|cheap|auto` sets the Codex service tier for this session. `fast` uses priority service and can cost more.
- During an active run, Enter follows `/interrupt`: `steer` sends after the next tool-call boundary, `queue` sends after the active turn finishes. Alt+Enter always queues a follow-up, Alt+Up restores queued messages, and Escape stops the run while restoring queued messages.
- `/agent <name> <task>` delegates bounded work to a persistent background child; `/subtask <task>` forks the current chat context into a child.
- `/agents` opens the fleet manager; `/agents doctor` validates definitions and `/agents import claude` previews manual Claude-agent migration.
- `/workflow <name> [json args]` starts a sandboxed saved workflow; `/workflows` opens its manager.
- `/consolidate` cleans up Zyra's local memory after meaningful sessions.
- `/themes`, `/thinking`, and `/models` adjust runtime behavior.
- `/reload` restarts Zyra from disk and resumes the chat.
- `/reload --soft` reloads commands, themes, prompt, and memory only.
- `/skill:<name> <task>` explicitly runs a discovered local Agent Skill. Typing `/` in Desktop opens a project-aware picker above the composer while retaining Desktop's `/yolo`, `/safe`, and `/include` commands.

The complete agent/workflow guide, safety boundaries, definition formats, persistence layout, and desktop controls are in [docs/guides/subagents-workflows.md](docs/guides/subagents-workflows.md). Current provider compatibility and deferred model work are tracked in [docs/guides/model-support.md](docs/guides/model-support.md).

## Open Voice-Agent Architecture

Zyra’s proposed conversation architecture is documented as an open, provider-aware reference design. Product Phase One routes normal Chat directly to the strong coding agent and lets an explicit Start Voice action attach a capable realtime foreground to the same conversation and active work. Deterministic task control, exceptional subagents, selective speech, canonical multimodal context, and silent resume remain shared across both surfaces.

Optional Product Phase Two is specified as a separate relationship-first profile implemented only after Phase One passes. It adds a permanent Zyra Home entry point, conversation-first background work threads, a hybrid Inbox and active-work strip, retrieval-first worker escalation, mostly invisible strong consultation, and voice-led same-canvas focus visits. Any runtime implementing Phase Two must keep Phase One selectable and expose every Phase Two canonical conversation without data rewriting.

Start with the [Voice-Agent Architecture](docs/architecture/voice-agent/README.md), [Product phases](docs/architecture/voice-agent/product-phases.md), [Phase Two relationship-first interaction](docs/architecture/voice-agent/relationship-first-interaction.md), and the noncommitting [adaptive-coaching future direction](docs/architecture/voice-agent/future-adaptive-coaching.md). The package includes Mermaid diagrams, ADRs, machine-readable Phase One JSON Schemas, synthetic examples, security and usage boundaries, prior-art research, evaluation plans, and a two-product-phase implementation roadmap. Its status is **draft specification; implementation pending**.

## Project Shape

- `src/` is the terminal app: input, status line, slash commands, file mentions, session handling, and Pi SDK wiring.
- `prompts/` contains the public system prompt, inspect prompt, and built-in profile overlays.
- `agents/` and `workflows/` contain public built-in specialist and workflow definitions; personal/project definitions live under ignored `.zyra/` locations.
- `src/agents/` owns event-sourced fleet authority, child Pi sessions, routing, isolation, and output safety. `src/workflows/` owns validation, QuickJS execution, scheduling, caching, approvals, and budgets.
- `AGENTS.md` keeps project rules that should survive across chats.
- `commands/` is where repeated workflows can become slash commands.
- `~/.zyra/commands/<name>.md` is the personal command path available across projects.
- `.zyra/commands/<name>.md` is the project-local command path.
- Skills follow Pi's local Agent Skills locations: `~/.pi/agent/skills`, `~/.agents/skills`, trusted project `.pi/skills`, and trusted ancestor `.agents/skills`. Zyra also keeps `skills/`, `~/.zyra/skills`, and project `.zyra/skills` for compatibility. Settings > Skills can opt into compatible Codex, Claude Code, or explicitly selected folders and resolve name collisions. Project scope still wins over personal scope.
- `.zyra/profiles/<name>.md` is the local private profile overlay path.

Commands should earn their place. The tool should grow from real use, not from pretending every workflow is known in advance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development, privacy, documentation, and pull-request expectations. Voice-architecture proposals also have a [focused contribution guide](docs/architecture/voice-agent/CONTRIBUTING.md).

## License

Zyra is open source under the [Apache License 2.0](LICENSE). Contributions submitted to this repository are licensed under the same terms unless explicitly stated otherwise.
