# Windows file icons and context menus

Zyra's Windows file icons use the installed `material-icon-theme` artwork. They are independent of the application, shortcut and context-menu logo.

- `desktop/scripts/maint/generate-windows-file-icons.cjs` rasterizes local SVGs with an isolated, hidden Electron renderer. It produces transparent ICO frames at 16, 24, 32, 48, 64, 128 and 256 pixels.
- `desktop/resources/file-icons/` contains the checked-in icons, MIT license and source hash manifest. Regenerate after changing the theme or supported extensions with `npm --prefix desktop run icons:windows`.
- `desktop/scripts/release/windows-file-icons-before-pack.cjs` supplies each Windows packager instance with one `Zyra.File.<extension>` ProgID per extension. It does not mutate the shared multi-platform configuration. NSIS copies the ICOs into the installed `resources` directory, outside ASAR.
- The generated `desktop/build/windows-file-icons.nsh` registers the extension icon fallback used when Windows has no explicit default-app choice. Uninstall removes only icon values that still point to this installation.
- `desktop/build/installer.nsh` keeps older shared ProgIDs usable with generic Material category icons. A shared class cannot distinguish extensions when Windows explicitly selects that class. Choosing the newly registered Zyra handler through Windows activates the per-extension class. Never rewrite protected `UserChoice` or `UserChoiceLatest` hashes.

Windows associations are extension-based. Filename-specific in-app icons, such as the separate `README.md` icon, do not apply in Explorer. Finder and Linux association defaults remain unchanged.

The Zyra context-menu verb uses normal placement and the label `Open with Zyra`. Installation explicitly deletes the old `Position=Top` value so upgrades repair existing menus. Obsolete entries belonging to a different application are not removed by the installer without user direction.

## Verification

Run `npm --prefix desktop run test:file-icon-system`. The native-icon test verifies mappings, unique ProgIDs, source hashes, ICO frame dimensions, missing-asset failure, platform isolation, generated installer registrations and normal context-menu placement.

For installed verification, query or extract icons through `SHGetFileInfo` and inspect representative code, Markdown and lockfiles. Registry values alone do not prove which icon Windows resolves. Preserve other applications' explicit choices, back up changed registry keys, and notify the shell with `SHChangeNotify(SHCNE_ASSOCCHANGED)`. Do not kill Explorer or clear the user's default-app selections. Installer compilation and a fresh install/upgrade/uninstall remain release checks.
