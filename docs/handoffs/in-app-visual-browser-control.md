# In-App Visual Browser Control Handoff

## Result

Implemented a vision-first, background-safe control loop for Zyra’s retained in-app Browser.

Delivered:

- bounded rendered JPEG frames returned to Pi as image content;
- 1:1 screenshot pixels and Browser CSS viewport coordinates;
- coordinate move, click, double-click, drag, and positioned scroll actions;
- visible cyan agent cursor driven by the exact broker action coordinates;
- target-local CDP input that does not move the Windows pointer;
- monotonic observation protection against concurrent stale-frame rewind;
- bounded trusted tab title, URL, origin, and opaque identity for natural tab selection;
- root and child on-demand Browser discovery;
- trusted `open_tab` creation of an exact blank sandboxed tab;
- root-only Inspector reveal and child-only background creation;
- selected-thread matching and nonce-bound renderer acknowledgement;
- first-use grant requests through Control Center or the exact Browser tab toolbar;
- automatic cleanup of child active grants and pending requests;
- corrected local-thread identity propagation for delegated desktop control;
- deterministic visual contracts and an isolated Electron Word Grid smoke harness.

## Live proof

The smoke harness launched an owned Electron Browser window with `showInactive()` and a separate click-through cursor overlay. No user-owned Zyra or Electron process was stopped.

The agent loop:

1. observed a rendered Word Grid screenshot;
2. received viewport `886 × 618`;
3. selected coordinates from the image;
4. clicked `A`, `G`, `E`, `N`, `T`, and `Enter` across fresh revisions 1 through 8;
5. observed the final rendered result: `Solved — visual Browser control works.`

After normalization, the returned JPEG was exactly `886 × 618`, proving image pixels map directly to cursor/action coordinates.

The owned smoke process and loopback descriptor were removed after the run.

## Verification

Passed:

- `bun desktop/scripts/test-zyra-browser-visual-control.ts`
- `npm run test:agent-control`
- `npm run test:agent-platform-integration`
- `npm run test:subagents-workflows`
- desktop TypeScript
- privacy check
- diff check
- isolated Electron visual smoke

## Temporary live-thread test relay

For the current development demonstration, `src/agent-control/temporary-browser-relay.mjs` provides an explicitly armed, loopback-only bearer relay into the active Pi worker’s existing `controlBridgeClient`. It is restricted to in-app Browser operations and still requires normal user-approved grants.

The stable client is:

```powershell
npm run browser:live -- list
npm run browser:live -- request <target-id> https://www.google.com
npm run browser:live -- wait-grant <target-id>
npm run browser:live -- observe <grant-id> <target-id>
```

Operation policy lives separately in `src/agent-control/temporary-browser-relay-policy.mjs` and is loaded from its current source bytes for every request. Policy fixes therefore apply without restarting the app, relay, thread, or grant. The visual-control contract proves two policy revisions through one live relay process.

This relay is test scaffolding, not a release transport. It starts only when explicitly armed by `ZYRA_ENABLE_TEMP_BROWSER_RELAY=1` or the one-shot temp enable file, stores a random token only in a local temp descriptor, never prints that token through the client, and removes its descriptor when the worker closes. Remove the relay, client, npm script, and enable marker after the live demonstration.

## Remaining product work

- executable per-action confirmation for irreversible external side effects;
- trusted user-interaction auto-pause and Take Over/Resume controls;
- richer live action history and ownership labels;
- Chrome background visual implementation from `docs/implementations/chrome-visual-browser-use.md`;
- Windows isolated surfaces from `docs/implementations/windows-isolated-computer-use.md`.

The broader integration branch still contains unrelated release blockers identified in the prior inspection. This handoff establishes the in-app visual Browser slice; it does not declare the entire agent platform ready for `master`.
