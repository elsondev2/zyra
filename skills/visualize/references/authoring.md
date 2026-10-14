# Saved visualization authoring

Use the `visualization` tool when the visual should be reusable. The app renders the saved source; do not build a separate server, inject scripts, or modify the viewer.

## The working loop

1. `list` searches resources in the current workspace. Use `threadOnly: true` for the current conversation.
2. `read` retrieves the requested `version` source and revision metadata. Inspect `selectedVersion.source` before editing. For a large source, `sourceFile` identifies the immutable version file for ordinary paged file reads.
3. `create` saves a new resource with `kind`, `title`, `summary`, and `source`. For 3D, use the typed `scene` object instead of an escaped JSON source string.
4. `revise` appends a version. Supply `baseVersion` for the version you are building on, and `expectedVersion` for the current resource head. These can differ when branching from an older version. Include a short `changeNote` explaining the actual change.
5. `embed` with the real returned `id` and an explicit `version` gives the reference line to emit in the reply, outside fences.

A conflict means another edit advanced the head. Read again and reconcile before retrying. Do not overwrite another agent's work or guess a version number. Invalid source does not replace the last good version.

## Readable source

- Two-space indentation, one logical element/property per line, descriptive IDs.
- HTML visuals should put styles first, then the main graphic, then optional details. Keep data labels and units visible.
- Keep CSS rules multiline. Do not minify source or repeat invisible SVG elements.
- SVG coordinates must be numbers. Never write values such as `cx="forty"` or `rx="sixty"`.
- Mermaid source is ordinary diagram text, not HTML. Prefer meaningful node IDs and concise labels.
- Scene source is JSON, not JavaScript. Group related objects using a named group and `parentId`.
- Saved version files are immutable records. Use `revise`, not file editing, to change them.

Example HTML source, supplied as the tool's `source` value:

```html
<style>
  .comparison {
    display: grid;
    grid-template-columns: 80px minmax(0, 1fr) 32px;
    gap: 12px;
    align-items: center;
  }

  .track {
    height: 20px;
    background: var(--viz-track);
  }

  .fill {
    height: 100%;
    background: var(--viz-series-1);
  }
</style>

<p>Illustrative demand, 0–100 units</p>
<div class="comparison" role="img" aria-label="Illustrative demand: Sample A, 60 units.">
  <span>Sample A</span>
  <div class="track">
    <div class="fill" style="width: 60%;"></div>
  </div>
  <span>60</span>
</div>
```

## 3D scene contract

`kind: "scene3d"` uses this JSON structure. Pass the object below as `scene` directly, or its JSON text as `source`. Do not provide both:

```json
{
  "schemaVersion": 1,
  "camera": {
    "position": [6, 4, 8],
    "target": [0, 0.7, 0]
  },
  "grid": true,
  "objects": [
    {
      "id": "cube",
      "name": "Purple cube",
      "type": "box",
      "position": [-2, 0.5, 0],
      "size": [1, 1, 1],
      "color": "#a58aff"
    },
    {
      "id": "sphere",
      "name": "Teal sphere",
      "type": "sphere",
      "position": [0, 0.6, 0],
      "radius": 0.6,
      "color": "#39cbb3"
    },
    {
      "id": "pyramid",
      "name": "Amber pyramid",
      "type": "pyramid",
      "position": [2, 0, 0],
      "size": [1, 1.4, 1],
      "color": "#ffc75b"
    }
  ]
}
```

Supported objects are `box`, `sphere`, `pyramid`, `cylinder`, `torus`, and `group`. Optional fields are `name`, `position`, `rotation`, `scale`, `color`, `opacity`, `parentId`, `size`, `radius`, and `height`. Rotation uses radians; vectors have exactly three finite numbers. Colors use `#RGB` or `#RRGGBB`. Parents must identify groups, and the graph must be acyclic. Keep scenes small; the maximum is 128 objects. The viewer supplies orbit, pan, zoom, picking, and camera reset. There is no animation script, physics engine, remote model import, or network access.

Use primitives to explain an object or relationship. Do not describe this renderer as a CAD editor, a physically accurate simulation, or a complete game engine.
