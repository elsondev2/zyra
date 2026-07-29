# Zyra Documentation

This directory separates current user/developer guidance from architecture records, implementation plans, handoffs, research, and historical agent briefs.

## Current guidance

- [Subagents and workflows](guides/subagents-workflows.md)
- [Model support](guides/model-support.md)
- [Agent-control security and operations](security/agent-control.md)
- [Parallel agent build runbook](runbooks/parallel-agent-build.md)

## Architecture

- [Agent server](architecture/agent-server.md)
- [Agent surfaces](architecture/agent-surface.md)
- [Assistant browser](architecture/assistant-browser.md)
- [Assistant resources](architecture/assistant-resources.md)

## Implementation records

- [Browser and computer use](implementations/browser-computer-use.md)
- [Chrome visual browser use](implementations/chrome-visual-browser-use.md)
- [Subagents and workflows](implementations/subagents-workflows.md)
- [Windows isolated computer use](implementations/windows-isolated-computer-use.md)

## Handoffs

Active and completed transfer notes live in [`handoffs/`](handoffs/). They preserve implementation evidence and should state when a limitation remains.

## Plans and research

- [`plans/`](plans/) contains scoped forward-looking design plans.
- [`research/`](research/) contains investigations and comparison artifacts.

## Agent documentation

- [`agent-prompts/`](agent-prompts/) contains reusable internal builder/integrator instructions.
- [`agent-prompts/archive/`](agent-prompts/archive/) contains historical one-off briefs. Archived briefs are context only and are not current repository instructions.

## Conventions

- Keep current how-to material in `guides/`.
- Keep source-of-truth security policy in `security/`.
- Move completed one-off execution briefs to an `archive/` directory instead of leaving them at repository root.
- Do not commit generated build output, local sessions, private exports, or credentials as documentation.
