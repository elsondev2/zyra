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
  - persists only safe HTTP(S) page URLs, bounded safe favicon references, titles, active-tab selection, and an optional two-tab split.
- `desktop/src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx`
  - owns Browser controls, internal tabs, project server suggestions, and rendered states.
- `desktop/src/renderer/src/pages/assistant/AssistantBrowserWebview.tsx`
  - owns one live Chromium guest and projects its navigation events into tab metadata.

The guest page never receives Zyra’s preload or `window.devscope` bridge.

## Lifecycle

Browser is lazy-loaded after the user selects its Inspector tile. Once opened, the Browser workspace stays mounted while Review, Explorer, or Terminal is selected.

Each internal browser tab also keeps its `<webview>` mounted. Inactive guests are hidden and made non-interactive rather than destroyed, preserving Chromium history, form state, scroll position, and application state during ordinary tab switches. Browser-only side-by-side mode gives two retained guests independent half-width viewports; it does not clone, reparent, or recreate either guest.

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

Each trusted Browser guest registers as an on-demand `zyra-browser` control target. The Browser remains usable without an agent; authority is created only after a root or child principal requests a bounded grant and the user approves it in Control Center or from the exact tab’s Browser toolbar.

Fresh chats receive only the small `browser_use` loader. `browser_use({ action: "load" })` activates `browser_tabs`, `browser_access`, `browser_observe`, `browser_perform`, and `browser_session` for that Pi session; the legacy `browser_control` definition stays registered only as an inactive compatibility path. Unloading removes the full Browser schemas again while preserving the loader.

`browser_tabs.open` lets an agent create a blank sandboxed tab without navigation or input authority. Main sends a nonce-bound request only to the selected thread’s renderer and waits until that exact tab registers as a trusted guest. A root agent may reveal it in the Inspector. Child agents may create background tabs but cannot reveal or take over Zyra’s interface. The agent must then request a separately scoped grant through `browser_access` before it can navigate, observe, or interact.

Root agents can also operate on retained tabs without creating replacements:

- `reveal_tab` makes an already registered target the primary visible Browser tab;
- `set_tab_layout` selects one primary target or an explicit primary/secondary side-by-side pair;
- `resize_inspector` expands or contracts the visible Inspector within the same responsive layout bounds and reports the accepted width through workspace state;
- `refresh_tab` uses the target's bounded `navigate` grant; model-driven history traversal remains disabled until its destination origin can be proven before navigation;
- `close_tab` and `open_external` require a target-bound `tab.manage` grant with an explicit HTTP(S) origin;
- closing a tab immediately revokes its tab-management grant and descendants.

The renderer publishes a bounded Inspector/Browser workspace snapshot through trusted IPC. `list_targets` therefore reports whether Inspector is open, its accepted width, its active/open workspaces, all retained Browser tabs and sites, and the primary/secondary visible tab IDs. Renderer metadata cannot create a target or bind a target ID to a different tab; main reconciles by trusted tab identity and owner thread. Metadata without a matching registered guest is explicitly marked untrusted and carries no authoritative origin.

Every integrated Browser target is bound to the chat thread that owned its renderer workspace when the guest registered. Root and child discovery, workspace visibility, reveal/layout commands, and grant requests are filtered to that owner thread. A child cannot enumerate or request another thread's Browser tab.

Close, refresh, and external-browser commands use a two-phase surface request. Main may cancel before the renderer atomically claims the request; after a successful claim the command is committed and main waits for its exact request ID to complete. Concurrent commands for one tab cannot resolve each other's promises.

A principal may hold independent grants for several Browser targets in the same turn. Each target keeps its own action queue, monotonic observation revisions, viewport, cursor, audit trail, and remaining-action budget, allowing work on different tabs to proceed independently while preserving one owner per individual surface.

The staged visual loop is:

1. capture a bounded visual, structural, or combined observation;
2. bind it to one exact target, grant, monotonic revision, viewport, and stage intent;
3. reserve enough remaining grant budget for 1–64 bounded steps plus the checkpoint;
4. execute the target-local stage continuously for at most 12 seconds;
5. dispatch multi-point `stroke` input as one press, acknowledged point sequence, and guaranteed release;
6. publish cursor truth on a dedicated coalesced channel at up to roughly 30 FPS, with no CSS prediction;
7. stop at a clean action boundary if purposeful user divergence is detected on that exact target;
8. capture one higher-revision checkpoint for the model to inspect before the next stage.

Visual-only checkpoints avoid rebuilding the accessibility tree after every canvas stroke. Structure and combined modes remain available for semantic controls and safety checks. Supported in-app actions include move, click, double click, drag, multi-point stroke, scroll, bounded typing, keys, select, navigation, and waits. Revealing a Browser tab never focuses its guest or steals the user's keyboard. Target-local key input requires an agent-established click or observed-element focus, and that proof is cleared on navigation, grant replacement/revocation, or turn shutdown.

Native guest `input-event` records feed a rolling per-target interaction arbiter. Agent CDP dispatch is suppressed only for the exact dispatch call. One accidental input, passive pointer motion, or matching collaboration inside the stage’s declared activity/region causes a fresh checkpoint without pausing. Repeated target-local interaction outside that intent pauses at the next safe boundary. Activity in another Browser tab has a different target ID and cannot pause, cancel, or otherwise interrupt the agent’s tab. Audit records may include actor, category, target, bounded coordinates, stage, and time, but never raw typed content.

A paused result explains its target-local evidence and offers **Continue with your changes**, **Replan from here**, and **I’m taking over**. Resume captures a fresh observation, invalidates the old continuation, and requires a new stage; it never blindly replays uncertain remaining input.

Browser targets expose bounded trusted title, URL, origin, and opaque tab identity so an agent can resolve natural directions such as “the Word Grid tab.” They do not expose cookies, storage, request headers, credentials, or page source.

A desktop child agent with delegated Browser capability starts with `browser_use` but no authority. It can load the bounded tools, discover its owner thread’s in-app tabs, and create a pending request. User approval binds a grant to that child principal. Completion, cancellation, disconnection, rejection, and Emergency Stop remove active and pending authority.

Coordinate actions run against hidden retained guests and do not activate the Browser Inspector or move the system cursor. Opening Browser shows the live page and current agent cursor. The user can revoke the tab grant or stop all control from the Browser toolbar.

## Remaining Browser Work

- executable per-action approval for irreversible external side effects;
- richer visible Take Over/Resume controls beyond the structured chat choices;
- richer agent ownership labels and action history in the Browser toolbar;
- persisted Chromium back/forward history after the outer Browser workspace is closed;
- automatic server discovery from terminal output or filesystem watchers;
- freeform viewport sizing and device emulation.

Chrome background visual use is specified separately in `docs/implementations/chrome-visual-browser-use.md`. Windows isolation is specified in `docs/implementations/windows-isolated-computer-use.md`.
