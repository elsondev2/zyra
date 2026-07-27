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

## Remaining product work

- executable per-action confirmation for irreversible external side effects;
- trusted user-interaction auto-pause and Take Over/Resume controls;
- richer live action history and ownership labels;
- Chrome background visual implementation from `docs/zyra-chrome-visual-browser-use-implementation.md`;
- Windows isolated surfaces from `docs/zyra-windows-isolated-computer-use-implementation.md`.

The broader integration branch still contains unrelated release blockers identified in the prior inspection. This handoff establishes the in-app visual Browser slice; it does not declare the entire agent platform ready for `master`.
