# Zyra Release Workflow

Zyra is pre-1.0. Release versions still describe meaningful product and compatibility boundaries.

## Lockstep version policy

The CLI/runtime and Desktop ship as one Zyra product version. These four values must always match exactly:

- `package.json` and the root entry in `package-lock.json`;
- `desktop/package.json` and the root entry in `desktop/package-lock.json`.

For v0.6.0 they are all `0.6.0`. The internal Desktop package is `zyra-desktop`; the visible product remains **Zyra** and the stable application identifier remains `app.zyra.desktop`. Desktop and the local Browser surface both report the Desktop package version injected by the two Vite builds.

Do not independently bump the CLI/runtime or Desktop. Run the release contract after every version change:

```bash
bun run --cwd desktop test:release-infra
node desktop/scripts/release/preflight.mjs --mode=contract --expected-version=0.6.0
```

## Version rule

Within the `0.x.x` era:

- **Patch release** (`0.6.0 -> 0.6.1`): fixes and small product polish without a storage, workflow, or compatibility boundary.
- **New pre-1.0 line** (`0.6.x -> 0.7.0`): new visible workflows, release/install behavior, or meaningful runtime behavior.
- **Plan first**: auth changes, destructive file/Git behavior, session or memory format changes, public prompt/profile architecture changes, or anything that can lose context or break existing chats.

Prereleases use `-alpha.N` or `-beta.N`. Semantic core numbers sort first; for an equal core, stable sorts above beta and beta above alpha. A beta install never follows an alpha feed; stable installs only follow stable releases. Differential updates resolve the previous blockmap from the exact tag for the currently installed version.

## Desktop compatibility baseline

v0.6.0 deliberately pins:

- Electron `43.4.0` (Chromium 150, Node 24.18.1);
- electron-builder `26.15.3`;
- node-pty `1.1.0`.

Electron officially supports its latest three stable major lines. On 2026-08-14 the [official schedule](https://releases.electronjs.org/schedule) and [stable release list](https://releases.electronjs.org/releases/stable) showed supported lines 41, 42, and 43, so Electron 33 was unsupported and Electron 43 was the current stable line. The exact pin prevents an unreviewed Chromium/Node ABI jump during release builds.

`node-pty` uses Node-API bindings and ships x64 Windows plus universal macOS prebuild families; Linux compiles its Node-API binding during dependency install. A forced `@electron/rebuild` is deliberately disabled: it needlessly rebuilds an ABI-stable binding, and node-pty 1.1.0's packaged winpty gyp step is incompatible with that forced path. Postinstall verifies either the reviewed platform prebuild or Linux source build, the module stays outside ASAR, and a smoke test loads/spawns it under Electron itself on every native runner:

```bash
npm --prefix desktop run native:prepare
npm --prefix desktop run test:native-abi
```

## Packaged runtime contract

An installed app cannot depend on a neighboring source checkout. Every package build stages the root production runtime at:

```text
process.resourcesPath/zyra-runtime
```

The staged contract contains:

- `src/` (including agent-server, agent-control, memory, TUI, and workflow runtime code);
- `bin/` for the package-declared CLI entrypoint;
- `prompts/`;
- built-in `agents/` definitions discovered by the fleet loader;
- built-in `workflows/` definitions discovered by the workflow loader;
- optional built-in `commands/` and `themes/` when present;
- root `package.json`, `package-lock.json`, and production `node_modules/` installed from that lock;
- `zyra-runtime-manifest.json`, with sorted source paths, sizes, and SHA-256 hashes.

Stage and validate it with:

```bash
npm --prefix desktop run runtime:stage
npm --prefix desktop run runtime:validate
npm --prefix desktop run test:packaged-runtime
```

`resolveZyraRoot()` checks `process.resourcesPath/zyra-runtime` first. Development retains the existing loaded-worktree-first behavior after that packaged check.

## Native package matrix

All artifacts include version, OS, and architecture in noncolliding names.

| Platform | Target | Release assets | Updater metadata |
| --- | --- | --- | --- |
| Windows x64 | NSIS, assisted install | `Zyra-0.6.0-windows-x64-setup.exe` and `.blockmap` | `latest.yml` |
| macOS universal | DMG and ZIP | `Zyra-0.6.0-macos-universal.dmg`, `.zip`, and ZIP `.blockmap` | `latest-mac.yml` |
| Linux x64 | AppImage and deb | `Zyra-0.6.0-linux-x64.AppImage` and `.deb` (the AppImage carries its blockmap internally) | `latest-linux.yml` |

Windows retains the assisted NSIS flow, changeable install directory, icons, and Explorer shell integration in `desktop/build/installer.nsh`. The self-contained `win-x64` .NET computer-use sidecar is built and included only on Windows. The browser-control extension is built and packaged on every OS.

Before artifact collection, every packaged app is reopened to validate its runtime manifest/dependencies, extension, platform-scoped sidecar, and node-pty native binding. Asset collection is allowlist-based and rejects missing, duplicate, empty, unexpected, or metadata-inconsistent files.

macOS uses the generated ICNS family, universal architecture, hardened runtime, explicit signing entitlements, Developer Tools category, and a microphone usage description. Linux uses the generated PNG size family and Development category. File associations resolve `resources/icon` so electron-builder selects ICO or ICNS correctly by platform.

Native commands must run on their matching host:

```bash
npm --prefix desktop run build:win
npm --prefix desktop run build:mac
npm --prefix desktop run build:linux
```

For an unpacked native smoke build:

```bash
npm --prefix desktop run build:unpack
```

## Local updater feed

Validate the pure platform/channel selection logic:

```bash
npm --prefix desktop run test:updater-release-feed
```

Inspect a published GitHub feed for a specific installed target:

```bash
npm --prefix desktop run update:test-feed -- --platform windows --arch x64 --current-version 0.5.0
npm --prefix desktop run update:test-feed -- --platform macos --arch arm64 --current-version 0.5.0
npm --prefix desktop run update:test-feed -- --platform linux --arch x64 --current-version 0.5.0
```

Serve already-built local assets without publishing:

```bash
npm --prefix desktop run update:serve-feed -- --platform windows --dir dist/releases/v0.6.0/windows/upload
```

Set `ZYRA_DESKTOP_UPDATE_FEED_URL` to the printed loopback URL when launching an older packaged build. The server validates the platform metadata and complete artifact set before listening.

## CI and release workflows

`.github/workflows/desktop-ci.yml` runs focused release, updater, branding, runtime, type, extension, and node-pty checks on native Windows, macOS, and Linux runners.

`.github/workflows/desktop-release.yml` supports:

- `workflow_dispatch`: unsigned native rehearsal builds from `master`; it uploads the complete assembled workflow artifact and places the same validated files in the private `v<version>` GitHub draft;
- `v*` tag pushes: signed/notarized publication candidates that refresh and validate the existing draft before publication.

The tag path requires all of the following before any public release exists:

1. the tag is exactly `v<lockstep package version>`;
2. tag commit, `HEAD`, and `origin/master` are identical;
3. focused checks and the privacy check pass;
4. signing/notarization secrets pass preflight;
5. all native matrix jobs finish and upload their isolated artifacts;
6. updater metadata and every expected platform artifact validate after assembly;
7. Windows Authenticode and macOS codesign/Gatekeeper/notarization markers validate;
8. sorted `SHA256SUMS` validates all release files, including Linux artifacts;
9. a GitHub **draft** is created, names/sizes are re-read, and its assets are downloaded again for metadata/checksum validation;
10. only then is that existing draft published.

Matrix jobs have read-only repository permissions and cannot race publication. The final publication job alone receives `contents: write`. Releases use `master`, never `main`.

## Signing and notarization gates

The repository contains no signing credentials. Configure these GitHub Actions secrets without committing their values:

### Windows

- `ZYRA_WINDOWS_CERTIFICATE` — PFX supplied in a `CSC_LINK`-compatible form (for example base64/data URI).
- `ZYRA_WINDOWS_CERTIFICATE_PASSWORD` — PFX password.

### macOS

- `ZYRA_MACOS_CERTIFICATE` — Developer ID Application certificate supplied in a `CSC_LINK`-compatible form.
- `ZYRA_MACOS_CERTIFICATE_PASSWORD` — certificate password.
- `ZYRA_MACOS_NOTARIZATION_API_KEY` — raw App Store Connect API `.p8` contents.
- `ZYRA_MACOS_NOTARIZATION_KEY_ID` — App Store Connect key ID.
- `ZYRA_MACOS_NOTARIZATION_ISSUER_ID` — App Store Connect issuer UUID.

A stable tag fails in preflight if any value is absent. The workflow never substitutes ad-hoc or fake signatures. Windows verifies the produced installer with Authenticode. macOS verifies the app with `codesign`, Gatekeeper, and the stapled notarization ticket. Unsigned artifacts are permitted only in a manual rehearsal and remain unpublished in both the workflow artifact store and a GitHub draft, so the updater cannot see them.

## Release checks

Before committing a release-infrastructure change:

```bash
npm run check
npm run privacy-check
node bin/zyra.mjs --version
npm --prefix desktop run typecheck
npm --prefix desktop run typecheck:browser-runtime
npm --prefix desktop run test:release-infra
npm --prefix desktop run test:branding
npm --prefix desktop run runtime:stage
npm --prefix desktop run runtime:validate
npm --prefix desktop run test:packaged-runtime
npm --prefix desktop run test:native-abi
git diff --check
```

Run only the native package command available on the current OS. Cross-platform package evidence comes from the native CI/release matrix.

## Licensing

Zyra is licensed under Apache License 2.0. The repository `LICENSE`, root package metadata, Desktop package metadata, staged runtime manifest, About settings, and release validation must all report `Apache-2.0` consistently.
