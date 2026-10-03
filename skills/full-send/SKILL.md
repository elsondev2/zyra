---
name: full-send
description: Own an implementation or repair through meaningful verification and its authorized finish. Use for full send, finish this, end-to-end implementation, or requests to carry work without repeated user coordination.
---

# Full Send

Turn the assigned outcome into a verified result the user can review quickly. Carry routine execution, helper recovery and checks yourself. Preserve accepted product decisions and the user's operating limits.

## Establish the finish without a questionnaire

Infer the desired result, acceptance criteria, preservation constraints, allowed environment and finish point from the request and current instructions. Keep a brief private checkpoint so refreshes, compaction and helper failures do not lose the remaining work. Use `scripts/task-state.mjs` for substantial tasks; these records are maintained by the agent, not by the user.

Default finish is a locally verified change. An authorized PR request includes its routine filing and bounded CI/review repair. Merge, publish, deploy, billing, auth changes or destructive actions require the applicable explicit authorization. Full Send does not grant them by itself. Preserve unrelated dirty work.

## Own the execution

- Reproduce the reported scenario before choosing a fix. Inspect the source and actual data path. Retain the user's accepted layout, controls, permissions and fallback behavior.
- Prefer the narrowest meaningful verification loop. Re-run the original scenario after the repair; avoid tests that merely restate the patch. Real UI/CLI checks matter when the request describes observable behavior.
- Check the tools actually exposed in this harness. For UI work, use its available browser/computer tools and the requested surface. In Pi, use the installed Zyra tools when connected; read the `zyra-tools` skill when interaction is needed. Do not assume that tools in another harness are available here.
- Use an isolated profile and seeded reproduction when permitted. Keep tests hidden when the user requires that. Native app control may focus a window; do not use it under a no-foreground constraint. Exercise a permitted hidden fixture instead. Never restart or close the user's app against their instructions.
- When a check fails, trace that failure and repair the cause. Continue through another available authorized route before handing the work back. An unavailable UI/provider gate stays pending; a passing mock cannot close it.
- Delegate only when authorized by the user or applicable instructions. When using helpers, assign bounded roles and constraints, resolve models from current availability, and integrate/verify their results yourself. Own failed children, retries and dependencies; do not make the user choose another model or watch each helper.

## Carry the authorized next stages

For PR work, use the available filing workflow's scope and exact-head checks. Do not stack competing PR recipes, require unrelated release uploads, or include private artifacts. Monitor the authorized head through CI and relevant review repair with a bounded retry/budget limit. After any new commit, verify the new head. Reach the requested finish, or retain the concrete remaining approval/gate in the checkpoint.

Ask only for a decision that materially affects product direction, authority or a real blocker. Use the harness question tool when available and keep the task resumable after its answer. Preserve user notification preferences. In Pi, `full_send_notify` provides an explicit outcome/input alert; use it for a real decision or verified result, not each progress update.

## Close with proof

Before saying done, review every acceptance criterion, child outcome and required gate. Record what actually ran, its result, the artifact/revision used and genuine limitations. If a gate is pending, state it clearly and checkpoint it. A model run ending, child returning, or workflow completing is insufficient evidence of task completion.

Give the user a short handoff: outcome, credible evidence, a direct review path and any activation step. Name the exact revision where relevant. Avoid making them read the entire transcript, assemble the environment, or say continue to reach an already authorized next step.

For substantial work, `node <skill-path>/scripts/task-state.mjs init --title "..." --criterion "..."` creates a private task record and prints its ID. `checkpoint <id> --verified <1-based criterion number> --evidence "..."` records proof. `--pending "..."` retains a gate; `--clear-pending` clears it only after resolution. `finish <id> --summary "..."` refuses completion while criteria or gates remain pending. `show <id>` restores the task after interruption. Commands operate in the current project; use `--project <path>` for another project.
