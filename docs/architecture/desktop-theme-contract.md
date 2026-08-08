# Desktop theme contract

Zyra Desktop has one runtime theme contract for the app shell and specialized renderers.

## Source of truth

- Theme catalog: `desktop/src/renderer/src/lib/settings-theme-catalog.ts`
- Accessible semantic resolver: `desktop/src/renderer/src/lib/settings-theme-semantics.ts`
- Runtime application: `desktop/src/renderer/src/lib/settings.tsx`
- CSS surface aliases: `desktop/src/renderer/src/styles/theme-tokens.css`
- Legacy utility compatibility: `desktop/tailwind.config.js`

`applyTheme()` resolves the selected catalog theme and accent before writing variables to both `<html>` and `<body>`. It also synchronizes `light`/`dark`, `color-scheme`, RGB channels, semantic status colors, and the `zyra:theme-change` event.

## Shell surfaces

The app title bar and chat sidebar both use `--surface-chrome`. Settings uses one corresponding `--settings-chrome` value for its title bar and sidebar. Content, cards, floating panels, and controls retain separate semantic surfaces so hierarchy does not depend on a fixed dark palette.

## Accessibility guarantees

`npm run test:themes` checks all 46 themes against all 16 accent choices. It enforces:

- primary and supporting text contrast,
- readable interactive accents and accent foregrounds,
- adaptive success, warning, danger, and info colors,
- visible borders and card separation,
- text hierarchy ordering,
- shared title-bar/sidebar surface ownership.

Tailwind color families are compatibility aliases over semantic accent and status RGB channels. Existing opacity utilities therefore remain usable without locking components to pale dark-theme-only shades.

## Specialized renderers

Monaco editors and diffs, xterm terminals, inline syntax diffs, PatchDiffViewer, Mermaid, CSV previews, and Browser annotation read the active semantic variables. Renderers that cache derived output subscribe to `zyra:theme-change` or include the active theme in their cache key.

Media controls are the intentional exception: `media-white` and `media-black` are fixed because they sit over arbitrary image/video content rather than the app canvas.

## Verification

Run from `desktop/`:

```bash
npm run test:themes
npm run test:settings
```

A passing contract proves palette math and source wiring. A physical cross-theme click-through is still required for final release confidence, especially for embedded Browser content, OS-native controls, Monaco, terminal ANSI output, and media previews.
