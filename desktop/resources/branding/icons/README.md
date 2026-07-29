# Zyra desktop app icons

- `zyra-dev*.png` is the cyan/blue development identity.
- `zyra-prod*.png` is the white/neutral production identity.
- `-light` variants are tuned for a light operating-system shell.
- `-dark` variants are tuned for a dark operating-system shell.
- Unsuffixed files are balanced fallback masters.
- Derived icons use a solid rounded tile, a defined outer boundary, and a high-contrast mark. They intentionally contain no source-image glow or gradient.
- `*-source.png` files preserve the original downloaded artwork and are excluded from packaged apps. The neutral source supplies the shared mark geometry; palette and boundary treatment are generated in code.

`desktop/src/main/index.ts` selects the dev/prod family and light/dark runtime window variant. Production packaging continues to use `desktop/resources/icon.png` and `desktop/resources/icon.ico`; development fallback assets are `icon-dev.png` and `icon-dev.ico`.

Regenerate all derived assets from `desktop/`:

```bash
npm run brand:assets
npm run test:branding
```
