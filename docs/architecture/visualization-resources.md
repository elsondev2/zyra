# Saved visualization resources

Visualizations have an identity and immutable revisions in addition to their original chat message. HTML/SVG visuals, Mermaid diagrams and declarative 3D scenes share the same resource model.

## Ownership and persistence

The agent's `visualization` tool uses the saved Project home as the stable storage root and the canonical session ID as the owner. A standalone or projectless session falls back to its workspace. Desktop derives the same Project home and maps local thread aliases to canonical IDs. Explicit references can resolve older CLI artifacts in associated workspaces, with reads and revisions authorized at the actual destination. Ordinary lists do not enumerate those secondary folders. Neither tool arguments nor renderer requests can choose an arbitrary filesystem root.

Resources live under `<resource-root>/.zyra/visualizations/<uuid>/`, where resource-root is the saved Project home or standalone workspace. The directory contains `resource.json` and readable `v1.html`, `v2.mmd` or `v3.json` snapshots, depending on the resource's immutable kind. JSON scene source is formatted with two-space indentation before saving. Version files are records, not an editing API; use the tool to append a revision.

Writes use exclusive source-file creation, a project writer lock, durable temporary manifests and atomic manifest replacement. Revisions identify their parent and require an observed current head to prevent lost concurrent edits. Branching from an older version changes the parent, not older snapshots. Crashed locks recover only with a sufficiently old, proven dead owner. Unsafe symlink/hardlink destinations, corrupted records, modified source snapshots and exceeded bounds fail closed. Reads check that the bounded source files still match their committed revisions. Defaults limit one source to 64 KiB, one resource to 128 revisions, one workspace to 500 resources, and workspace manifests to 16 MiB.

The permission gate authorizes the trusted resource destination from the executor. Read/list/embed and create/revise use separate read/write handling. Read-only roots and explicit resource ceilings remain enforced even in full-access mode. Rendering never grants filesystem or app control.

## Messages and old history

New embeds use an explicit version:

```html
<visualization-ref id="12345678-1234-4123-8123-123456789abc" version="1" />
```

The UUID above is illustrative. Agents emit the actual ID/version returned by the tool, outside fences. Completed references resolve through the owning chat's main-process service. A missing resource or version produces an error and a Retry action; it does not silently substitute the latest version. Old replies remain pinned when a resource advances. The terminal shows a readable saved-version fallback instead of raw reference markup.

Completed legacy inline HTML blocks and actual Mermaid fences are imported with canonical thread, message and source-offset provenance. Fenced HTML examples are not artifacts. Provenance makes repeated imports and reopening idempotent; original messages are not rewritten. Completed live messages save without requiring the inspector to be opened.

Inspector indexing reads persisted full message bodies, not the virtual timeline's currently rendered rows or truncated review snippets. Work is bounded per request. Where older canonical pages remain, Continue indexing older visuals imports one bounded history page on explicit intent. Unsafe legacy source is skipped with a count in the toolbar's info tip; unrelated resources remain available. Imports never write inside a read-only storage folder. A saved Project's writable home can retain a visualization of an associated read-only source folder without modifying that folder. Original inline rendering remains available independently of import.

## Inspector hierarchy

The existing Resources workspace includes a Visualizations filter. Its header places the This thread / This project scope selector beside search, with a keyboard-accessible info tip for availability, storage restrictions and history indexing. Retry and explicit older-history indexing use compact header actions instead of permanent status rows. Explicit embeds can appear in a thread's library without cloning the source resource. Library tiles are static and do not start WebGL contexts.

Selecting a visualization keeps a single-entry-per-resource navigator beside a full-surface Preview / Code / Versions viewer. A compact revision dropdown sits in the title actions beside the icon-only close control. Expand, copy source and comparison are tab tools, not separate form rows. Code has line numbers, escaped theme-adaptive syntax tokens, source export and comparison against any other saved revision. Versions are selectable rows with dates, notes and parent relationships. An explicit pin or selected older revision remains stable when the latest head changes. Use in chat attaches that exact ID/version as agent context. Copy embed also pins the selected version. Docked and detached inspector context requests use an app-owned event channel; arbitrary executable source is never attached as an app action.

Expand opens a dedicated workspace with its visualization navigator and full viewer, without replacing the underlying resource library. The 3D canvas has orbit, pan, zoom, geometry picking, keyboard controls and camera reset. Zoom, keyboard motion and reset use short finite camera animations, respect reduced motion and cancel cleanly on direct drag or disposal. HTML still uses the existing opaque sanitized iframe, and Mermaid retains its strict renderer. The shared Desktop/browser bridge supports resource reads; Android does not yet have a native saved-resource viewer.

## 3D boundary and lifecycle

Scene source is a small validated JSON schema, not executable JavaScript. Agents can supply a typed `scene` object directly rather than double-escaping a JSON string; persisted source is formatted for reading. Allowed primitives are box, sphere, pyramid, cylinder and torus, plus groups. Object IDs, parent graphs, numeric transforms, geometry dimensions, opacity and colors are validated before rendering. Arbitrary models, textures, scripts, remote requests, physics and animation are not supported.

OGL is already a product dependency and loads on demand. The renderer draws after changes and input, with animation frames only during requested camera movement, not an indefinite frame loop. It observes the containing surface for responsive sizing, caps device pixel ratio, releases geometry/program resources and the old canvas on replacement or closure, and provides an error state when WebGL is unavailable or lost. Camera state is retained across source revisions; Reset applies the authored camera. The inspector preview unmounts while its expanded canvas is open.

## Preview continuity

The main chat markdown wrapper keeps artifact children mounted when streaming settles. Saved reference loads depend on pinned identity, not unrelated prompt updates. Inspector metadata refreshes retain an already-loaded source when its resource head is unchanged. Completing a new turn therefore does not clear and rebuild its canvas.

Saved inline visuals reserve a 320px preview surface during creation, loading and display; the dedicated viewer fills its available area. HTML content-fit height changes and preview readiness use short app-owned transitions. Mermaid has a finite reveal. Reduced motion disables those transitions. Iframe isolation and authored-color behavior remain unchanged.

## Checks and activation

- `npm run test:visualization-resources`: persisted reopen, imports, pins, branches, conflicts, permission gating, source validation, bounded/corrupt records, crash recovery and unsafe path cases.
- `npm --prefix desktop run test:visualization-resources`: main library ingestion/scope tests, resource UI tests, 3D lifecycle contracts and isolated offscreen Electron interactions with actual production components and app CSP. Includes version/source selection, geometry picking, finite zoom animation, changed 3D pixels, retained canvas/iframe contexts across settling and new prompts, metadata-only inspector refresh, saved preview isolation, a persistent expanded navigator and a 320px inspector. `test-scene3d-camera-motion.ts` separately verifies interpolation, accumulated wheel intent, shortest reset paths, cancellation, idle settling and reduced motion.
- Existing `test:visualizations` targets cover parser/terminal/skill distribution and the original sandbox, fonts, palette, exports and streaming states.

Fixtures use synthetic data and temporary profiles. They do not prove that an already-installed app/server has loaded these changes, nor a physical GPU's behavior. No production build, installation or restart is implicit. The updated renderer and agent runtime must both be active before new resource tools and dedicated views are available.
