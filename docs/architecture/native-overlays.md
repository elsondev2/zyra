# Native app overlays

## Ownership

Browser pages belong to `BrowserViewManager` as retained native WebContentsViews. App menus and dialogs belong to the original shell React tree. `NativeOverlayPortal` renders that React content into a trusted same-origin child document above the native page.

Main arms a short-lived, one-use window name for the exact trusted owner main frame. `window.open` creates its associated WebContents; main adopts that supplied object instead of creating an unrelated renderer. Overlay callbacks continue to invoke the original owner's preload. Electron copies the owner's WebPreferences for an initial `about:blank` document, including its preload preference; that initial document does not execute the application preload. Runtime checks verify no child `devscope`, `require` or `process` globals, Node integration disabled, sandbox and context isolation enabled. Child navigation, nested windows and webviews are blocked, and child senders are never registered as trusted IPC owners. The guest's browsing session is not transferred to the overlay. See Electron's [same-origin window contract](https://www.electronjs.org/docs/latest/api/window-open).

## Interactive and passive surfaces

Interactive menus and modals share one lazy transparent WebContentsView per owner. Native layer order keeps app dialogs above browser and recording controls. Portal leases keep the surface visible through nested menus and exit animations; ordered visibility commands reject stale updates.

Passive tooltips and hover previews use a separate lazy owned transparent BrowserWindow with mouse input ignored and focus disabled. Its screen bounds follow the owner's content area. Passive UI must not consume page input or dismiss the trigger merely by appearing. A passive portal never requests or restores keyboard focus.

The same host contract applies to main and detached utility windows. Moving a browser tab preserves the guest and changes its owner; overlay documents remain with their own window. Closing, reloading or destroying an owner disposes its owned surfaces, listeners and pending preparation.

## Renderer contracts

Body portals route through the shared host. Explicit in-document portal containers retain their local destination. Inline overlays that depend on an existing containing block use `AnchoredNativeOverlay`; bounded geometry observation follows their anchor and finite ancestor motion without permanent polling.

The child document receives the owner's theme attributes, stylesheets, fonts and base URL. Style membership/order and theme values synchronize independently. Managed fonts share already-loaded FontFace objects with the child's FontFaceSet, including later replacement and removal; no extra font reads or encoding are required. React state, context and event callbacks stay in one tree; no duplicated menu store or render-state IPC is required.

Outside-pointer and keyboard listeners attach to current owner/overlay documents and follow late-created documents. Containment includes logical anchors and avoids realm-specific `instanceof Node` checks. Focus restoration uses the focused document and a live trigger; changing focus between related surfaces does not count as leaving the app.

Preparation is bounded and cancellable. A native-capable desktop must not silently render failed overlay UI underneath the page. Exceptional startup failure uses an owner-attached native Retry/Close recovery path. Browser-only previews with no native bridge retain ordinary DOM portals.

## Removed path and preservation

Menu display no longer uses page capture grants, temporary display-media streams, fallback screenshots, broad DOM occlusion scanning, or per-button media preparation. Explicit screenshots, inactive-tab previews, recording, native guest persistence, permissions, annotation and transfer authority remain separate features.

Plain alpha composition works across native surfaces. CSS backdrop-filter cannot be assumed to sample another WebContents; surfaces need sufficient theme-aware fill for readable content rather than recapturing the browser.

## Validation

Run the narrow targets in [fast validation](../development/fast-validation.md): `test:native-overlay`, `test:native-overlay-renderer`, `test:native-overlay-callers`, and `test:browser-webview-presentation`. Browser slot geometry, transfer and recording targets cover their preserved boundaries. A real Windows pointer check is required for passive click-through; injecting directly into a WebContents does not prove OS hit testing. Static screenshots alone do not establish the absence of a single-frame flash.
