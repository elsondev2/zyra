# Zyra desktop app icons

`zyra-flat-approved-source.png` is the approved flat app-icon master. It uses the supplied cyan Zyra mark on a deep-blue rounded square with transparent corners. It has no glow, gradient, outline, halo, pale field, border, or development badge.

`zyra-dev-source.png` and `zyra-prod-source.png` preserve the original downloaded artwork unchanged. They remain excluded from packaged apps.

All development, production, light-shell, and dark-shell runtime filenames now render the same approved core artwork. Dev/prod identity remains in application metadata, names, and filenames rather than a visual badge. The generator creates optical 16px, 24px, and 32px frames so the mark remains readable in title bars, taskbars, Alt+Tab, installers, and file associations. Larger PNG, ICO, ICNS, and Linux assets retain the same flat two-colour appearance.

`desktop/src/main/index.ts` still selects the appropriate dev/prod filename and operating-system theme variant. Production packaging uses `desktop/resources/icon.png`, `desktop/resources/icon.ico`, and `desktop/resources/icon.icns`; development fallback assets are `icon-dev.png` and `icon-dev.ico`.

Regenerate all derived assets from `desktop/`:

```bash
npm run brand:assets
npm run test:branding
```
