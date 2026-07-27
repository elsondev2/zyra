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

## Visual Agent Control

Each trusted Browser guest registers as an on-demand `zyra-browser` control target. The Browser remains usable without an agent; authority is created only after a root or child principal requests a bounded grant and the user approves it in Control Center.

The visual loop is:

1. capture a bounded rendered JPEG from the guest;
2. return it to the model as an image content block;
3. bind it to a monotonic observation revision and viewport;
4. validate a coordinate or element action against that revision and grant;
5. publish the exact coordinates as `ControlCursorState`;
6. animate the cyan agent cursor above the retained webview;
7. dispatch target-local CDP input without moving the Windows pointer;
8. capture a fresh higher revision before the next action.

Supported in-app actions include move, click, double click, drag, scroll, bounded typing, keys, select, navigation, and waits. DOM and accessibility metadata support safety checks and optional targeting; the rendered frame remains the agent’s primary visual input.

Browser targets expose bounded trusted title, URL, origin, and opaque tab identity so an agent can resolve natural directions such as “the Word Grid tab.” They do not expose cookies, storage, request headers, credentials, or page source.

A desktop child agent has `browser_control` registered without authority. It can discover in-app tabs and create a pending request at any point in its run. User approval binds a grant to that child principal. Completion, cancellation, disconnection, rejection, and Emergency Stop remove active and pending authority.

Coordinate actions run against hidden retained guests and do not activate the Browser Inspector or move the system cursor. Opening Browser shows the live page and current agent cursor. The user can revoke the tab grant or stop all control from the Browser toolbar.

## Remaining Browser Work

- executable per-action approval for irreversible external side effects;
- trusted user-interaction auto-pause and explicit Take Over/Resume controls;
- richer agent ownership labels and action history in the Browser toolbar;
- persisted Chromium back/forward history after the outer Browser workspace is closed;
- automatic server discovery from terminal output or filesystem watchers;
- freeform viewport sizing and device emulation.

Chrome background visual use is specified separately in `docs/zyra-chrome-visual-browser-use-implementation.md`. Windows isolation is specified in `docs/zyra-windows-isolated-computer-use-implementation.md`.
