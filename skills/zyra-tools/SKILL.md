---
name: zyra-tools
description: Use Zyra's browser, paired Chrome and Windows computer tools, including the Pi tool adapter. Apply when a task needs real interaction or UI verification through these tools.
---

# Zyra Tools

Use the tools actually exposed in this session. Zyra and Codex can have their own browser/computer tools; Pi's installed adapter calls Zyra's Desktop drivers directly while keeping Pi's model and conversation.

## Discover only when needed

In Pi, `zyra_tools_status` checks the configured Desktop connection. `browser_use` with `action: load` activates `browser_tabs`, `browser_access`, `browser_observe`, `browser_act`, `browser_perform` and `browser_session`. `zyra_tool_search` with a Windows/computer query activates the computer tools. These sets unload after each Pi turn, and grants are revoked at turn end, cancellation or disconnect.

Use `browser_tabs` to discover the requested in-app browser or paired Chrome target. Reuse its intended tab; do not substitute surfaces silently. Request the necessary exact-target grant with `browser_access`, then use its returned observation. For Windows applications, prefer `computer_use_app` for the requested app and only the capabilities needed. Ground subsequent actions in the latest observation revision.

Keep the user's current foreground/visibility restrictions. Native computer actions may focus the app. Under a hidden-only restriction use a permitted hidden browser/app fixture rather than native focusing. Do not launch, restart or close the user's app just to recover a missing connection.

## Availability and evidence

The configured Zyra server must support `tools.status`, `tools.open`, `tools.control` and `tools.close`; its Desktop control host must be connected. Chrome additionally needs the paired extension. Pi's `/zyra-tools` command reports the connection. An older running Zyra server needs activation before the new gateway is available; Pi `/reload` loads newly installed extensions and skills.

The gateway retains existing Desktop permission and approval rules. A Pi session has a separate tool-verification chat for grants; it does not inherit another chat's grants or send its coding conversation to a Zyra model. Approval requests belong to that tool-verification chat in Desktop. Do not bypass unavailable access using raw local relay credentials or another surface.

Return actual observations/screenshots as evidence. If a driver, tab, model or permission is unavailable, retain that check as pending and report the precise requirement. A disconnected tool call cannot be counted as successful verification.
