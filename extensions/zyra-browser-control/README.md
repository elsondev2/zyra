# Zyra Browser

Chat beside your current Chrome tab using the same Chat renderer, conversation history, composer, approvals and appearance as Zyra Desktop.

## Use

1. Install Zyra Browser and open Zyra Desktop. The extension connects automatically; no pairing code or port is needed.
2. Click the extension icon to open Chat in Chrome's side panel. Start a new chat or open an existing conversation from **Chats**.
3. **This tab** uses the selected website. Choose **This browser** to share the browser's website tabs for this connection. Use the stop button to release access.
4. From a Desktop chat, ask the agent to use your named Chrome browser. The browser tool discovers its tabs and requests access through the normal chat permission flow. Browser names can be changed in the extension settings.

Chrome privileged pages, extension store pages and incognito tabs are excluded. Tab access follows that exact tab across ordinary websites; previous page references expire on navigation. The older console's site-specific Read/Control mode remains available. Critical actions still use Desktop approvals.

Pause or disconnect from either surface. Closing a sidebar releases the individual tabs it owns. Browser-wide sharing lasts for the current connection. Worker restarts never restore input grants. Desktop clears disconnected browser status after the heartbeat grace period.

After the first pointer action, the cursor stays at its last position between Actions and while the agent waits. The controlled tab's favicon carries a matching cursor badge, including in background tabs. Navigation restores the indicator in the new document. Release removes both indicators and restores the website's latest favicon. If the worker or debugger disappears without cleanup, an unrenewed five-second page lease removes them. Sites that block favicon image access get a cursor-only badge; page favicon restrictions may prevent the tab-strip badge from displaying.

## Architecture

- `pairing.ts`: automatic loopback discovery, per-profile identity and rotating in-memory session tokens. Legacy code pairing remains available for older apps.
- `service-worker.ts`: panel lifecycle, reconnection, explicit pause, cancellation and local media proxy.
- `app-controller.ts`: desktop broker identities, metadata-only discovery and exact-tab observations/actions.
- `browser-scope.ts`: explicit browser-wide access and new-tab lifecycle.
- `extension/control.ts`: Chrome debugger input, exact-tab and legacy site scopes, stale-reference invalidation.
- `extension/cursor.ts`, `cursor-page.ts`, `cursor-favicon.ts`: session-owned pointer renewal, bounded orphan cleanup and reversible favicon composition.
- `desktop/src/renderer/src/extension-main.tsx`: the actual Desktop React app, with a compact header and temporary chat drawer.

Only the extension's exact identity is trusted by the Desktop host. All executable UI code is bundled locally. A connection grants no control by itself: the desktop broker retains permissions, action budgets and revision checks. No credentials or Chrome profiles belong in the package.

## Development and release

```sh
npm ci --prefix extensions/zyra-browser-control
npm --prefix extensions/zyra-browser-control run test:cursor
npm --prefix extensions/zyra-browser-control run test:cursor-page
npm --prefix extensions/zyra-browser-control run typecheck:cursor
npm --prefix extensions/zyra-browser-control run typecheck
npm --prefix extensions/zyra-browser-control test
npm --prefix extensions/zyra-browser-control run package
```

The full build and isolated cursor-page tests require the desktop dependencies. `test:cursor` runs deterministic lifecycle and logo checks without building. `test:cursor-page` uses hidden, temporary Electron pages, not the user's Chrome profile, to test favicon restoration and cursor lifetime. The full test command rebuilds only the controls and preserves an existing Chat bundle.

Chrome toolbar and extension-management icons are resized from `desktop/resources/icon.png`. After changing that logo, run `python extensions/zyra-browser-control/scripts/generate-icons.py` from the repository root with Pillow installed. Commit the generated PNGs and `scripts/icon-source.json` together.

`dist/unpacked` is the unpacked extension and `dist/zyra-browser-control.zip` is the deterministic store archive. Packaging rejects a missing Chat entry.

For local development, load `dist/unpacked` from `chrome://extensions`. The manifest uses the Chrome Web Store public key, producing the same identity as the store package: `bjigiapjhbnobifggaopjhipndjmbaof`. The packager omits the key from the upload ZIP because Chrome Web Store signs the package itself. Desktop's exact trusted origin and install link are defined in `desktop/src/shared/chrome-extension-identity.ts`.

The store listing must pass review before its install link becomes available. Ship a compatible Desktop build with this identity before public distribution. The previous development identity is accepted only by unpackaged Desktop builds.

Privacy policy: https://gist.github.com/justelson/118dd731f22fe82bab88b3dcf3aaa80c
