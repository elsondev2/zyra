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

First-run onboarding can guide login. Manual login also works:

```powershell
zyra login
```

Useful account commands:

```powershell
zyra auth
zyra account
zyra codexusage
zyra logout
```

Do not copy another person's auth file between machines. Let each user log in so the tokens belong to their own account.

## Common Commands

```powershell
zyra
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
zyra sessions
zyra continue
zyra resume
zyra doctor
zyra --update
```

Inside chat:

- `@file` attaches project files to the prompt.
- `/start` scans the current repo and gives a plain starting point.
- `/new` starts a fresh chat.
- `/session` shows project/session/model info.
- `/compact [notes]` compacts the active model context; Pi also handles auto-compaction when context gets too full.
- `/profile` switches profile overlays: `auto`, `default`, `learner`, `builder`, or a local `.zyra/profiles/<name>.md` profile.
- `/memory` toggles local memory logging for the current chat.
- `/web` opens web tool selection: all, none, search only, or fetch only.
- `/websearch` toggles search results. `/webfetch` toggles URL page fetching.
- `/interrupt` opens a picker for what Enter does while Zyra is already working; `/interrupt steer|queue` sets it directly. `/interupt` works too.
- During an active run, Enter follows `/interrupt`: `steer` sends after the next tool-call boundary, `queue` sends after the active turn finishes. Alt+Enter always queues a follow-up, Alt+Up restores queued messages, and Escape stops the run while restoring queued messages.
- `/consolidate` cleans up Zyra's local memory after meaningful sessions.
- `/themes`, `/thinking`, and `/models` adjust runtime behavior.
- `/reload` restarts Zyra from disk and resumes the chat.
- `/reload --soft` reloads commands, themes, prompt, and memory only.

## Project Shape

- `src/` is the terminal app: input, status line, slash commands, file mentions, session handling, and Pi SDK wiring.
- `prompts/` contains the public system prompt, inspect prompt, and built-in profile overlays.
- `AGENTS.md` keeps project rules that should survive across chats.
- `commands/` is where repeated workflows can become slash commands.
- `.zyra/commands/<name>.md` is the project-local command path.
- `.zyra/profiles/<name>.md` is the local private profile overlay path.

Commands should earn their place. The tool should grow from real use, not from pretending every workflow is known in advance.

## Public Readiness Check

Run:

```bash
npm run privacy-check
```

This scans tracked public files for private/person-specific prompt terms that should stay local.
