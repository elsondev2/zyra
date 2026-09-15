# Zyra Mobile

Native Android development lives in `android/`. The account-free LAN host gateway lives in `gateway/`, connecting to Zyra's canonical agent server. Work stays on the PC.

**Status: implementation and validation in progress. This is not a production-ready release.** See [feature coverage](FEATURES.md) and [architecture](ARCHITECTURE.md).

## Host development

For the integrated host, open **Settings → Connections → Zyra on your phone** in Zyra Desktop and choose **Pair phone**. The private network and a workspace for new chats are prepared automatically. Android opens a welcome, scan and confirm flow. Existing, archived and future project chats are included by default; use the project-access icon beside each paired device to customize its visibility. The settings button beside Pair phone opens network settings.

For CLI development, use Node 22.19 or newer, install the gateway dependencies with `npm ci --prefix mobile/gateway`, and keep the matching Zyra agent server running. Start explicit LAN access:

```sh
node mobile/gateway/src/cli.mjs --host <your-LAN-IP> --project <shared-folder> --pair
```

Repeat `--project` for additional folders. Pairing expires after two minutes and works once. The phone pins the host's certificate; device tokens are hashed on the host and sealed with Android Keystore on the phone. No provider credential is sent to Android.

The network listener is opt-in and binds one chosen address. A machine must be awake and reachable. Android disconnects do not stop server-owned work. A future relay can implement the same versioned transport without changing canonical chat ownership.

## Resource and transfer policy

- Keep approvals, questions and live text small; Pi's accumulated message is stripped from text delta frames.
- Limit mobile request frames to 256 KiB, history pages to 60 entries and inline output to 32 KiB.
- Fetch larger output in 48 KiB chunks, on demand; use a 16 MiB expiring host body cache.
- Slow terminal receivers request fresh screen snapshots; text is batched briefly and control requests retain reserved capacity. Sustained overflow closes the connection for a bounded resynchronization.
- Image history transfers references first. Opening an image downloads verified 48 KiB chunks; interrupted transfers resume from durable offsets. Photos can be optimized before upload.
- Images are limited to 20 MiB each, 12 per message and 40 MiB total. Pending host uploads reserve at most 128 MiB and expire after 24 hours; the decoded host image cache is 32 MiB. Android keeps at most 64 MiB of downloaded images, separately from durable unsent attachments.
- Bulk image chunks are paced at about 2 MiB/s per phone within bounded request slots; they do not consume the ordinary interaction quota.
- Bound concurrent requests, paired devices and unauthenticated handshake time.
- On resource-constrained PCs, Android builds use one worker and a capped heap; no persistent Gradle daemon or emulator is required for native screenshot previews.

## Validation

```sh
npm run test:mobile-host
node scripts/test-zyra-agent-server.mjs
```

Android unit tests and compilation are separate gates. Physical phone testing is deferred until feasible local checks have completed. See feature coverage for the latest packaged review checkpoint; newer source changes remain separate until a new APK is verified. Native Layoutlib previews exercise actual components with synthetic data and cover narrow layouts and enlarged text; they do not replace camera, keyboard, gesture or network tests on a phone.

## Native development

Use JDK 17 and Android SDK platform 36. Set JAVA_HOME and ANDROID_HOME to installed runtimes, then run from mobile/android:

```sh
./gradlew :app:testDebugUnitTest :terminal:testDebugUnitTest :app:assembleDebug --no-daemon
```

On Windows use gradlew.bat. The wrapper pins Gradle 8.13 and verifies its distribution checksum. Debug APK output is app/build/outputs/apk/debug/app-debug.apk. Build intermediates, SDK paths and gateway development state are ignored by Git. Release signing is not configured with personal credentials.

With Desktop dependencies installed, run the real PTY smoke test from the repository root:

```sh
node mobile/gateway/test/terminal-host-smoke.mjs
```

This test creates and closes its own temporary shell, uses the existing Electron/node-pty ABI and does not open an application window.

Desktop design assets are generated from the installed Desktop sources:

```sh
node mobile/scripts/sync-desktop-design.mjs
node mobile/scripts/sync-desktop-file-icons.mjs
```

Pass `--check` to either command to verify parity without writing assets. File artwork is bundled for offline browsing and decoded into a bounded native bitmap cache. Text previews use lexical syntax colors and retain the original text; unknown formats remain plain text. These are previews and a small UTF-8 editor, not a mobile language server.
