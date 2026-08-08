# Jake — V1 Local Browser Merge Handoff

Date: 2026-08-09
Status: **Implementation complete on the feature branch; packaged-build and live packaged-Chrome verification remain approval-gated.**

## Git Coordinates

- Shared baseline: `f51e33e88c8dafb2b409fa4a9efc2b5dcbc4af7c`
- Branch: `feat/v1-local-browser`
- Worktree used: `.zyra-worktrees/v1-local-browser`
- Implementation commits, oldest first:
  1. `8331e9e` — `feat: ship same-device browser runtime`
  2. `1ff0fc3` — `refactor: isolate browser runtime lifecycle`
  3. `ec64772` — `refactor: split browser transport responsibilities`
- The final documentation/typecheck commit follows those three commits on the branch.

## Scope Delivered

This branch implements the same-device V1 browser milestone. Zyra Desktop remains the execution host and serves Chrome at:

```text
http://127.0.0.1:47821/
```

### Production browser host

- Starts in development and packaged-style runtime rather than only under `is.dev`.
- Serves the existing built renderer from `out/renderer` in production.
- Proxies renderer assets to Vite behind the same stable origin during development.
- Keeps HMR connected directly to the development renderer port.
- Uses a dedicated `BrowserClientRuntime` supervisor so browser startup failure cannot prevent the Desktop window from starting.
- Stops the static host, private bridge, event subscriptions, descriptor, and relay together.

### Security boundary

- Both public local-client and private bridge listeners bind to `127.0.0.1`.
- The stable host validates Host, port, Origin, and Fetch Metadata before proxying.
- Cross-site browser requests are rejected.
- State-changing requests retain the custom Zyra client header requirement.
- The per-process bridge capability stays inside Desktop/Vite proxy code and is never shipped in browser JavaScript.
- Existing prototype-traversal and owned-preload-method checks remain in place.
- Electron guest IDs, raw IPC, updater controls, and native window controls remain unavailable to Chrome.

### Live Desktop events

A separate supervised SSE channel now carries:

- Agent Control state;
- Agent Control cursor truth;
- Git clone progress;
- preview-terminal output/state;
- Python preview output/state.

The event path includes:

- preload readiness handshaking so early browser actions wait rather than being dropped;
- one shared renderer-side connection for all subscribers;
- process stream IDs plus monotonic sequences;
- client deduplication after replay/reconnect;
- a time-, count-, and byte-bounded replay journal;
- cursor/state coalescing so high-frequency control events cannot evict all terminal/Git recovery data;
- heartbeat and backpressure disconnect/recovery behavior.

Agent Control request methods such as state reads, approval, rejection, revocation, Emergency Stop, Chrome pairing, audit clearing, and window selection now use the live relay. Electron-guest binding and Browser-surface methods remain gated.

### Files, media, and attachments

Chrome cannot load Electron’s `zyra://` scheme. This branch projects local media URLs to a protected same-origin endpoint that:

- resolves the same local paths as Desktop;
- provides explicit image/audio/video MIME types;
- supports HTTP byte ranges for audio/video seeking;
- uses `nosniff`, no-store caching, and a sandbox CSP;
- rejects missing files and invalid ranges safely.

Markdown images, file-preview images, audio, video, and persisted Assistant attachments use this projection in Chrome while Electron retains the native `zyra://` path. Existing browser uploads continue through Desktop-owned attachment staging.

### Browser-facing product state

- Browser Control Settings now exposes the stable local URL.
- Desktop gets a real **Open** action for the local client.
- Chrome shows a compact connected state.
- Integrated Electron Browser profile controls are replaced by an explicit Desktop-only notice in Chrome instead of presenting dead controls.
- The Electron `<webview>` Browser workspace remains explicitly unavailable in Chrome.

## Architecture and Test Files

Primary new modules:

- `desktop/src/main/browser-client-runtime.ts`
- `desktop/src/main/browser-client-host.ts`
- `desktop/src/main/browser-devscope-event-stream.ts`
- `desktop/src/main/browser-file-content.ts`
- `desktop/src/main/local-file-content.ts`
- `desktop/src/renderer/src/lib/browser-file-url.ts`
- `desktop/tsconfig.browser-runtime.json`
- `docs/architecture/local-browser-client.md`

Primary modified integration points:

- `desktop/src/main/index.ts`
- `desktop/src/main/assistant/browser-assistant-bridge.ts`
- `desktop/src/main/browser-devscope-relay.ts`
- `desktop/src/preload/browser-devscope-relay.ts`
- `desktop/src/renderer/src/lib/browser-devscope-live-adapter.ts`
- `desktop/src/shared/browser-assistant-bridge.ts`
- `desktop/scripts/maint/browser-assistant-bridge-proxy.ts`
- `desktop/vite.browser.config.ts`
- `desktop/electron.vite.config.ts`

Focused tests added:

- `desktop/scripts/test-browser-client-host.ts`
- `desktop/scripts/test-browser-devscope-live-adapter.ts`

Existing browser bridge coverage was extended in:

- `desktop/scripts/test-browser-assistant-bridge.ts`

## Validation Evidence

Passed from the feature worktree:

```text
bun run --cwd desktop typecheck:browser-runtime
bun desktop/scripts/test-browser-client-host.ts
bun desktop/scripts/test-browser-assistant-bridge.ts
bun desktop/scripts/test-browser-devscope-live-adapter.ts
bun desktop/scripts/test-settings-contract.ts
bun desktop/scripts/test-assistant-chat-routing.ts
bun desktop/scripts/test-assistant-client-local-selection.ts
bun desktop/scripts/test-assistant-new-chat-surface.ts
node desktop/scripts/maint/check-loc.mjs
bun -e "await import('./desktop/vite.browser.config.ts'); await import('./desktop/electron.vite.config.ts')"
git diff --check
```

The focused TypeScript program includes the main entry, preload entry, browser runtime/transport imports, browser adapters, file URL projection, and Browser Control Settings. It passes without relying on the known broad typecheck gate.

No production build, installer packaging, broad repository typecheck, or deployment was run. Those remain explicitly approval-gated. The new Settings row and packaged static renderer have not been visually verified in a freshly packaged binary.

## Intentional Limits

- Same device and loopback only. No LAN binding, Tailscale pairing, public HTTPS, or remote credentials.
- Desktop must remain running.
- Generic DevScope actions still execute through the trusted Desktop renderer/preload adapter. Canonical Assistant actions call `AssistantService` directly.
- The current Assistant selection lease supports one browser-controlled selection surface. True simultaneous, independent Desktop/multiple-browser selection remains future server-contract work.
- Electron updates, window controls, integrated `<webview>` Browser guests, guest recordings, and Browser-surface requests remain Desktop-only.
- Realtime conversation voice remains outside this branch and belongs to Mike’s foreground-route/voice architecture.
- Browser/client UI settings continue to use their own browser-origin storage unless explicitly server-owned elsewhere.

## Voice-Branch Coordination

This branch did **not** modify:

- canonical foreground-route authority;
- conversation commit semantics;
- Chat/Voice handoff;
- realtime adapters;
- voice reducers/controllers;
- conversation timeline voice projection.

The browser runtime preserves the pre-existing narrow transcription injections in `desktop/src/main/index.ts` and `BrowserClientRuntime`. If Mike replaces those functions or contracts, adapt the two dependency fields during integration. Do not reintroduce a second transcript store or route authority.

## Recommended Merge Procedure

1. Merge Mike’s canonical voice branch into the integration branch first, because its foreground/conversation contracts are authoritative.
2. Merge or rebase `feat/v1-local-browser` onto that result.
3. Resolve `desktop/src/main/index.ts` by preserving:
   - Mike’s voice/controller initialization;
   - Jake’s isolated `BrowserClientRuntime` construction, start logging, and shutdown calls.
4. If voice IPC types changed, update only the narrow transcription dependencies passed into `BrowserClientRuntime` and the existing Assistant browser adapter boundary.
5. Preserve Jake’s browser-only modules rather than moving their implementations back into `main/index.ts` or `browser-assistant-bridge.ts`.
6. Run the focused validation list above.
7. With approval, run a packaged build and verify Chrome against `http://127.0.0.1:47821/` before release.

Likely conflict files are `desktop/src/main/index.ts`, `desktop/package.json`, and any voice-related Assistant IPC types Mike changes. The browser host, event-stream, file-content, URL-projection, and focused-test modules should merge independently.
