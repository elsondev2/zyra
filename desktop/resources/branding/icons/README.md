# Zyra desktop app icons

- `zyra-dev*.png` is the cyan/blue development identity.
- `zyra-prod*.png` is the white/neutral production identity.
- `-light` variants are tuned for a light operating-system shell.
- `-dark` variants are tuned for a dark operating-system shell.
- Unsuffixed files are balanced fallback masters.
- Derived icons tightly crop the selected source mark into a rounded tile so it remains recognizable in taskbar and title-bar sizes.
- Size-specific contrast and sharpening preserve the source's soft cyan/gray or neutral treatment without turning the mark into a heavy reconstruction.
- `*-source.png` files preserve the original downloaded artwork and are excluded from packaged apps. The development source defines the shared crop geometry; the production source keeps a deliberate neutral counterpart.

`desktop/src/main/index.ts` selects the dev/prod family and light/dark runtime window variant. Production packaging continues to use `desktop/resources/icon.png` and `desktop/resources/icon.ico`; development fallback assets are `icon-dev.png` and `icon-dev.ico`.

Regenerate all derived assets from `desktop/`:

```bash
npm run brand:assets
npm run test:branding
```
