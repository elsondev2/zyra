# Assistant Browser Architecture

Zyra’s Assistant Browser is an Inspector workspace for the selected chat project. It completes the local development loop alongside Explorer and Terminal.

## Ownership

The browser keeps presentation and authority separate:

- `desktop/src/main/ipc/handlers/browser-preview-handlers.ts`
  - owns one exact opaque persistent Chromium partition for the local Zyra Browser profile;
  - configures guest permissions, downloads, and user agent policy;
  - clears that profile only through an explicit typed user action;
  - validates URLs opened in the operating system browser.
- `desktop/src/main/index.ts`
  - gates every `<webview>` attachment;
  - forces sandboxing, context isolation, Node isolation, and web security;
  - rejects unapproved partitions, preloads, source schemes, redirects, and popups.
- `desktop/src/preload/adapters/projects-adapter.ts`
  - exposes only typed browser configuration and external-open operations.
- `desktop/src/renderer/src/pages/assistant/assistant-browser-workspace-state.ts`
  - owns bounded per-chat browser-tab metadata and URL normalization;
  - persists only safe HTTP(S) page URLs, bounded safe favicon references, titles, and active-tab selection.
- `desktop/src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx`
  - owns Browser controls, internal tabs, project server suggestions, and rendered states.
- `desktop/src/renderer/src/pages/assistant/AssistantBrowserWebview.tsx`
  - owns one live Chromium guest and projects its navigation events into tab metadata.

The guest page never receives Zyra’s preload or `window.devscope` bridge.

## Lifecycle

Browser is lazy-loaded after the user selects its Inspector tile. Once opened, the Browser workspace stays mounted while Review, Explorer, or Terminal is selected.

Each internal browser tab also keeps its `<webview>` mounted. Inactive guests are hidden and made non-interactive rather than destroyed, preserving Chromium history, form state, scroll position, and application state during ordinary tab switches.

Closing the outer Browser workspace destroys the live guests. Safe current URLs, reported favicons, and tab selection remain in bounded per-chat local persistence and reload when Browser is opened again. Chromium cookies, local storage, IndexedDB, cache storage, service workers, and HTTP authentication live in one Zyra-wide persistent partition, so ordinary site logins survive Browser, thread, chat-session, project, and app restarts.

## Navigation

The address field accepts:

- explicit `http://` and `https://` URLs;
- loopback targets such as `localhost:5173` using HTTP;
- public schemeless hostnames using HTTPS;
- plain text as a web search.

Local file, JavaScript, data, browser-internal, and custom protocols are rejected in both renderer normalization and the main-process guest gate.

Back, Forward, Reload/Stop, New Tab, Close Tab, and Open External operate on the active guest. Main-frame navigation owns loading state, so subframes and late background requests cannot restart the settled refresh indicator. Chromium title, favicon, history, completion, and main-frame failure events update the active tab contract.

## Local Development Servers

The blank Browser view calls the existing `getProjectProcesses(projectPath)` source and presents only ports tied to processes associated with the selected project. It deliberately ignores the detector’s machine-wide `activePorts` fallback so unrelated local services are not presented as project servers.

External process changes require **Refresh local servers**. Terminal output is not yet a second server-discovery source.

## Local Profile And Data Control

The integrated Browser uses one global local profile. The partition identifier is derived in the main process from a fixed versioned profile key; renderer workspace, thread, session, and project identifiers cannot choose or widen the credential partition. Browser tab metadata remains per chat, while website authentication state is shared across Zyra.

The profile is stored under Electron’s local `userData` directory and is not copied into chat history, Resources, prompts, or website-card metadata requests. The Browser toolbar identifies the local profile and provides a two-step **Clear local browsing data** action. Clearing removes site storage, cookies, cache, and HTTP authentication, then reloads mounted Browser guests.

Legacy chat-scoped partitions are neither copied into the global profile nor deleted automatically. Users sign in once in the new profile; any cleanup of legacy partition directories must be a separate explicit destructive operation.

## Security Defaults

Browser guests use:

- one exact `persist:zyra-browser-<opaque digest>` global local partition;
- `sandbox: true`;
- `contextIsolation: true`;
- `nodeIntegration: false` in the page, subframes, and workers;
- `webSecurity: true`;
- no guest preload;
- denied site permissions and device permissions;
- denied downloads;
- denied guest-created windows, with safe HTTP(S) popups opened externally;
- HTTP(S)-only current-page navigation and redirects.

These values are forced during `will-attach-webview`; the renderer-provided attribute string is not treated as the security boundary.

## Current Scope

The first milestone intentionally excludes:

- device emulation and freeform viewport sizing;
- element picking and component metadata;
- screenshots and recordings;
- agent-driven click, type, inspect, or evaluate tools;
- persisted Chromium back/forward history after the outer Browser workspace is closed;
- automatic server discovery from terminal output or filesystem watchers.

Those features should build on the existing global local partition, guest owner, and tab identity rather than creating another browser runtime.
