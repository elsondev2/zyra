# Desktop theme contract

Zyra Desktop has one runtime theme contract for the app shell and specialized renderers.

## Source of truth

- Shared light/dark theme IDs and validators: `desktop/src/shared/preferences/theme-contract.ts`
- Theme definitions and catalog projections: `desktop/src/renderer/src/lib/settings-theme-catalog.ts`
- Accessible semantic resolver: `desktop/src/renderer/src/lib/settings-theme-semantics.ts`
- Runtime application: `desktop/src/renderer/src/lib/settings.tsx`
- CSS surface aliases: `desktop/src/renderer/src/styles/theme-tokens.css`
- Legacy utility compatibility: `desktop/tailwind.config.js`

Appearance mode and palette identity are separate. Main owns `appearanceLightTheme` and `appearanceDarkTheme`; each renderer resolves System mode from its local OS color scheme and applies the corresponding half. `theme` and `appearanceResolvedMode` are renderer-derived. `applyTheme()` resolves that catalog palette and accent before writing variables to both `<html>` and `<body>`. It also synchronizes `light`/`dark`, `color-scheme`, RGB channels, semantic status colors, and the `zyra:theme-changed` event.

Settings and onboarding share one compact selector. It shows the light or dark catalog that matches the currently resolved appearance and projects every Zyra color token into each dropdown row. Switching mode exposes the other catalog; System switches between the saved halves automatically. Menus portal beyond clipped scroll regions, use a short frame, and center the active option when opened.

## Palette provenance

T3Code's MIT-licensed parser and palette-preview architecture were inspected as design references. The separate `t3-themes` community registry does not publish a repository-wide license, so Zyra imports none of its JSON or preview assets. Every catalog entry in Zyra is an independently authored, token-complete semantic adaptation maintained under this repository's Apache-2.0 license.

## Shell surfaces

The app title bar and chat sidebar both use `--surface-chrome`. Settings uses one corresponding `--settings-chrome` value for its title bar and sidebar. Content, cards, floating panels, and controls retain separate semantic surfaces so hierarchy does not depend on a fixed dark palette.

## Accessibility guarantees

`npm run test:themes` checks all 72 themes (27 light and 45 dark) against all 16 accent choices. It enforces:

- primary and supporting text contrast,
- readable interactive accents and accent foregrounds,
- adaptive success, warning, danger, and info colors,
- visible borders and card separation,
- text hierarchy ordering,
- shared title-bar/sidebar surface ownership.

Tailwind color families are compatibility aliases over semantic accent and status RGB channels. Existing opacity utilities therefore remain usable without locking components to pale dark-theme-only shades.

## Specialized renderers

Monaco editors and diffs, xterm terminals, inline syntax diffs, PatchDiffViewer, Mermaid, CSV previews, and Browser annotation read the active semantic variables. Renderers that cache derived output subscribe to `zyra:theme-changed` or include the active theme and resolved appearance in their cache key.

Media controls are the intentional exception: `media-white` and `media-black` are fixed because they sit over arbitrary image/video content rather than the app canvas.

## Verification

Run from `desktop/`:

```bash
npm run test:themes
npm run test:settings
```

A passing contract proves palette math and source wiring. A physical cross-theme click-through is still required for final release confidence, especially for embedded Browser content, OS-native controls, Monaco, terminal ANSI output, and media previews.
