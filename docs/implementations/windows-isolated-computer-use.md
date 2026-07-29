# Zyra Windows Isolated Computer Use Implementation

Status: architecture and phased implementation specification

## 1. Product outcome

Zyra agents can operate selected Windows applications while the user continues working elsewhere whenever the target application supports isolated background input. Full arbitrary desktop control runs in a separate agent desktop or explicit takeover mode.

The user can say:

> Open the spreadsheet application, update the project sheet, and leave it open for me to inspect.

Zyra chooses the safest available execution tier, shows a live rendered surface and virtual cursor, and never silently takes the user’s physical mouse or keyboard.

## 2. Core rule

Windows has one foreground application, one physical pointer, and one keyboard input stream per interactive desktop. `SendInput` writes into that shared input stream. Therefore it is forbidden in background mode.

Zyra exposes three explicit modes:

1. **Background target mode** — application-specific target input; no foreground activation or physical cursor movement.
2. **Agent desktop mode** — application runs in a separate interactive Windows environment with its own cursor and focus.
3. **Takeover mode** — user explicitly lends the current desktop and real input to the agent for a bounded period.

## 3. User experience

### 3.1 Background target mode

The application remains in its own window while the user works elsewhere.

Zyra’s live view shows:

- current window frame;
- agent cursor;
- owning agent;
- current action;
- target application;
- background compatibility state;
- Pause, Inspect, Take Over, and Stop.

A background action that would require foreground input pauses instead of stealing focus.

### 3.2 Agent desktop mode

Zyra launches or connects to a separate environment:

- a supported secondary Windows session;
- Windows Sandbox;
- a Hyper-V or other approved VM;
- a remote Windows worker;
- a future Zyra-owned isolated desktop host.

The environment has an independent input queue and cursor. Zyra streams its display into the desktop UI. The user can watch without switching sessions and can request takeover through the stream.

### 3.3 Takeover mode

Takeover is visibly different:

- an always-visible border and status banner;
- a countdown and expiry;
- physical input ownership notice;
- mouse movement or Emergency Stop immediately cancels agent input;
- no background claim is made.

## 4. Agent Surface abstraction

Create a common `AgentVisualSurface` interface shared conceptually with Browser and Chrome:

```text
listTargets()
attach(target, principal, grant)
observe({ includeFrame })
move(x, y)
click(x, y, button, count)
drag(from, to, duration)
scroll(x, y, delta)
type(targetOrPoint, text)
key(key, modifiers)
wait(condition)
pause(reason)
release()
```

Every observation includes:

- opaque surface and target identity;
- monotonically increasing revision;
- frame dimensions and scale;
- bounded rendered frame reference;
- target health;
- optional secondary safety metadata;
- redaction labels.

The virtual cursor uses the same coordinates as the action transport.

## 5. Execution tiers

### Tier 1 — Chromium and Electron applications

Use app-specific CDP attachment where safely available.

Capabilities:

- background rendered screenshots;
- target-local pointer and keyboard input;
- no Windows focus change;
- reliable coordinate mapping;
- cursor mirror;
- page/document revision invalidation.

This tier covers many developer tools and desktop applications built with Chromium or Electron.

### Tier 2 — UI Automation background actions

Use Microsoft UI Automation patterns that target a specific element without global input:

- `InvokePattern`;
- `ValuePattern`;
- `SelectionItemPattern`;
- `TogglePattern`;
- `ExpandCollapsePattern`;
- `ScrollPattern`;
- bounded focus only when it remains inside the target and does not activate the foreground desktop.

The screenshot remains the model’s primary visual input. UI Automation is a targeted action adapter and safety check.

Do not fall back from a failed semantic type action to global `SendInput`. A failed background action returns `BACKGROUND_INPUT_UNSUPPORTED` and offers agent desktop or takeover mode.

### Tier 3 — application adapters

Optional adapters can provide safe target-local actions for specific products, such as a documented automation interface. They must preserve the visual action record and must never receive credentials or broad filesystem access implicitly.

Adapters are capability plugins, not hidden unrestricted automation.

### Tier 4 — separate agent desktop

Use for arbitrary applications requiring real foreground input.

The agent desktop provides:

- separate Windows logon/session or virtual machine boundary;
- independent pointer and keyboard;
- bounded display stream;
- explicit file and clipboard exchange;
- controlled network policy;
- process and application allowlists;
- snapshot/reset lifecycle;
- no access to the user desktop’s credential managers or secure desktop.

## 6. Why Windows virtual desktops are insufficient

Ordinary Windows virtual desktops organize windows but share the same interactive session, physical pointer, foreground rules, and keyboard stream. They do not provide the isolation required for concurrent human and agent input.

They may improve organization but cannot be the security or concurrency boundary.

## 7. Window capture

Replace the current `PrintWindow` implementation with Windows Graphics Capture behind the existing opaque capture provider.

Requirements:

- capture only the selected window or isolated desktop display;
- preserve device scale and client-area geometry;
- detect minimized, occluded, closed, protected, or black-frame states;
- resize and compress before model delivery;
- keep a bounded in-memory frame ring;
- exclude frame bytes from audit logs and chat metadata;
- clear frames on release and Emergency Stop.

The user-visible live view and model frame must come from the same revision.

## 8. Cursor model

### Background cursor

A virtual cursor is rendered in Zyra’s live view. For compatible apps, an optional click-through overlay may be placed over the target window without receiving user input.

The displayed coordinate is exactly the target-local action coordinate.

### Agent desktop cursor

The isolated environment has its own real cursor. Zyra mirrors that cursor in the stream.

### Takeover cursor

The Windows pointer is used only after explicit takeover. Global input hooks detect trusted user movement and cancel the agent immediately.

## 9. Application launch and selection

The user may:

- name an already-open application;
- select a discovered window;
- ask Zyra to launch an application.

Background launch uses no-activate window behavior where supported. If the application insists on foreground activation, Zyra either moves it to the agent desktop or asks for takeover.

Target identity binds:

- process ID and start time;
- executable path hash and signer information where available;
- top-level window handle generation;
- application user model ID where available;
- integrity level;
- Windows session and desktop identity.

Every action revalidates identity.

## 10. Dynamic agent attachment

Every desktop-connected agent may request a Windows target on demand, but Windows remains stricter than the in-app Browser.

A child can create a pending request containing:

- target application or launch request;
- requested mode;
- capabilities;
- duration;
- action budget;
- file and clipboard exchange scope.

The root user approves the exact request. Children cannot enumerate blocked applications, approve themselves, widen scope, change mode, redelegate, or retain authority after completion.

## 11. Concurrency

- One principal owns one window or agent desktop input channel.
- Multiple background-compatible apps may run concurrently.
- One global takeover may exist per user desktop.
- Agent desktops have independent queues and may run concurrently within CPU, memory, and policy budgets.
- Shared files use the same workspace and worktree conflict rules as code agents.

## 12. User interaction and collision handling

For background mode:

- the user interacting with another application has no effect;
- trusted interaction with the controlled target pauses that target’s agent;
- moving or resizing the target invalidates coordinate revision;
- changing display scale invalidates coordinate revision;
- a modal owned by the target becomes a new bounded target or pauses.

For takeover mode:

- any physical pointer movement or key press cancels queued input;
- the user always wins input ownership;
- resumption requires explicit action.

## 13. Security boundaries

Always blocked:

- UAC and secure desktop;
- logon and lock screens;
- password managers;
- browser password and payment UI;
- wallet and payment applications;
- Windows security and policy tools;
- higher-integrity processes;
- other user sessions without an explicit isolated agent-desktop contract;
- credential fields and OTP entry;
- hidden destructive action bypasses.

The sidecar never elevates itself. It never clicks UAC. It never stores typed text, observations, screenshots, or secrets in audit logs.

## 14. Side-effect approval

Like Chrome, general permission is separate from irreversible action approval.

The broker pauses before:

- sending or publishing;
- purchases;
- account/security changes;
- deletion;
- file uploads;
- sensitive submission;
- installation;
- legal acceptance;
- external clipboard/file transfer into an agent desktop.

The user sees the current frame, target, cursor, intended action, and consequence before approving.

## 15. Sidecar protocol

Retain the authenticated current-user named pipe, but replace line parsing with a framed protocol that preserves coalesced messages.

Recommended framing:

```text
uint32 little-endian payload length
bounded UTF-8 JSON payload
```

Requirements:

- exact parent-process validation in addition to current-user/session checks;
- per-launch secret over inherited protected transport;
- request IDs and cancellation IDs;
- bounded concurrent requests;
- serial action queue per target;
- independent capture stream backpressure;
- deterministic disconnect cleanup;
- no shell invocation;
- Release-signed binary for distribution.

## 16. Background action policy

A driver declares support per action:

```text
background-safe
requires-agent-desktop
requires-takeover
blocked
```

The broker evaluates this before execution. There is no automatic fallback from background-safe to takeover.

Examples:

- UIA button invoke: background-safe;
- UIA value set on a verified non-sensitive field: background-safe;
- arbitrary physical drag in a native canvas: requires-agent-desktop or takeover;
- UAC interaction: blocked;
- native file picker: usually agent-desktop or takeover;
- Chromium canvas input through CDP: background-safe.

## 17. Recovery and persistence

Persist only durable, non-secret state:

- target summary;
- owning principal;
- requested mode;
- grant summary;
- latest revision number;
- lifecycle and audit outcomes.

Do not automatically resume physical input after restart. Background targets require revalidation; agent desktops may reconnect to a paused session after explicit recovery.

## 18. Implementation phases

### Phase A — common visual surface

- shared frame, cursor, coordinate, ownership, and revision contracts;
- live view;
- Pause, Take Over, Stop;
- stale geometry invalidation;
- per-target queues.

### Phase B — safe background applications

- Chromium/Electron CDP adapter;
- Windows Graphics Capture;
- UI Automation safe pattern adapter;
- no global input fallback;
- trusted-user-interaction pause.

### Phase C — launch and application lifecycle

- bounded application discovery;
- no-activate launch attempts;
- target identity and signer checks;
- modal and child-window lifecycle;
- crash and restart handling.

### Phase D — agent desktop prototype

- choose supported isolation host;
- independent display/input channel;
- resource budgets;
- file/clipboard gates;
- snapshot and reset;
- live streaming into Zyra.

### Phase E — explicit takeover

- global ownership banner;
- emergency shortcut;
- physical input detection;
- strict expiry;
- no unattended elevation;
- manual smoke matrix.

## 19. Verification matrix

Automated:

- selected-window identity revalidation;
- higher-integrity denial;
- blocked application denial;
- screenshot/frame bounds;
- coordinate scale conversion;
- stale geometry rejection;
- background actions never call `SendInput`;
- failed UIA typing does not fall back globally;
- coalesced sidecar requests are preserved;
- cancellation stops queues;
- agent completion removes grants and frames;
- audit redaction;
- one-owner target locking.

Live owned-process tests:

- WinForms/WPF background button and non-sensitive field;
- Chromium/Electron app in background while user types elsewhere;
- resize/move/scale invalidation;
- modal handling;
- user interaction auto-pause;
- agent desktop independent mouse and keyboard;
- Emergency Stop in every mode;
- no owned test process survives cleanup.

## 20. Acceptance criteria

Windows computer use is complete when:

- background-compatible applications can be used without foreground activation;
- the user can continue using the physical mouse and keyboard;
- rendered frames and cursor actions share exact coordinates and revisions;
- unsupported actions pause instead of stealing focus;
- arbitrary applications can run in an isolated agent desktop;
- takeover is explicit, visible, bounded, and immediately interruptible;
- dynamic root and child attachment remains user-approved;
- sensitive applications and secure desktop remain unreachable;
- completion and Emergency Stop remove every input, capture, grant, and process authority.

## 21. Primary references

- Windows `SendInput`: <https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput>
- Windows Graphics Capture: <https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture>
- Microsoft UI Automation: <https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/ui-automation>
