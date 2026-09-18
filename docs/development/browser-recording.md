# Browser recording and presentation

The browser page is an owned Electron `WebContentsView`. Its DOM slot reports actual geometry throughout finite ancestor transitions, then stops sampling. Changing panels or opening the inspector must preserve the native page and its navigation state.

## App overlays above a live page

App menus and dialogs render through a shared React portal into a trusted transparent native overlay. The browser guest keeps its original native visibility, viewport and identity while app UI opens and closes. There is no menu video capture, replacement snapshot, preview grant, or native/video handoff. Explicit screenshots and inactive-tab hover images remain bounded capture features.

Interactive overlays use an adopted `WebContentsView` above page/recorder views. Passive previews use an owned, non-focusable transparent window that ignores mouse input. Both retain the original React tree and original owner's API authority; the initial overlay documents expose no app API and block further navigation. Shared portal leases retain native visibility until exit animations unmount. Keyboard, outside-click and focus handling account for both owner and overlay documents. See [native overlay ownership](../architecture/native-overlays.md).

## Capture and controls

`browser-recording-capture.ts` grants one short-lived display capture request to the recorder's exact main frame. Chromium supplies the selected tab's native video frames directly to `MediaRecorder`; there is no JPEG/base64 frame relay or canvas copy. VP8 is preferred to reduce encoding cost. A stable audio destination mixes optional microphone and tab or Windows system audio. A silent source preserves the timeline before audio is enabled.

Record Browser opens a `ready` setup state with Start, microphone/audio choices and Dismiss. Preparing or changing these choices creates no capture grant, media stream, encoder, permission request or recording timer. Device enumeration only reveals already-available devices. Explicit Start applies the selected inputs before starting the encoded timeline; duplicate Start commands share one operation. A prepared target closing or moving to another renderer dismisses setup, because capture authority belongs to its current owner.

The recording store waits for real video and encoder data before reporting Recording. Startup, device access, stopping and saving are bounded. Stop releases capture tracks before disk I/O. Failed saves retain a downloadable copy; starting a new recording cannot silently discard it.

Before disk saving or fallback download, `browser-recording-webm.ts` finalizes Chromium MediaRecorder WebM metadata. It writes a finite Segment and finite Cluster headers, duration, and a keyframe Cues/SeekHead index using Segment-relative offsets, without re-encoding or changing any video/audio packet. Duration respects TimestampScale and the recorded pause-aware elapsed time. Parsing skips encoded payloads and allocates the final output once. It only supports the known Chromium SimpleBlock layout; foreign/truncated layouts, inputs above 128 MiB, scans above 250,000 elements, or more than 20,000 keyframes retain the original bytes for recovery and may still lack duration or seeking metadata. No FFmpeg or media-processing dependency ships with this path.

`AssistantBrowserRecordingHost` mounts once per application renderer. It survives workspace navigation and forwards store state and user actions to the native recording overlay. The overlay is a small separate view above the page, with a narrow preload that only accepts recording commands, state reads and bounded size changes. It has no general application API, page permissions or external navigation. Controls do not appear in the encoded video or consume page layout space.

The native toolbar measures its content rather than occupying a fixed wide rectangle. Options expand and collapse the surface with bounded width/height motion; reduced motion settles immediately. Ordinary duration updates change text only. Native bounds, stacking and visibility change only when needed. Menus use custom device/source rows, preserve focus across timer updates, and close when focus returns to the page. Closed-tab and failed-overlay recovery stays reachable in the application.

## Ownership and transfers

The renderer that started recording owns the encoder until it finishes. Moving the guest does not transfer the encoder or grant another renderer permission to control it. The overlay follows the native page's presentation and sends commands to that original recorder.

Moving a main-window tab or a tab whose original window remains open can preserve recording. Moving the last tab out of its detached recorder window requires Stop and save first, because that operation would destroy the original renderer. The guard runs before provisional windows, native transfer or persisted tab changes.

## Validation

Start with the named targets in [fast validation](fast-validation.md):

- `test:browser-slot-geometry`: ancestor motion, interrupted transitions, settled work and cleanup.
- `test:native-overlay`: native adoption, owner/frame boundaries, stacking, retained browser identity and cleanup.
- `test:native-overlay-renderer` and `test:native-overlay-callers`: shared state, document synchronization, focus, cancellation, recovery and actual caller behavior.
- `test:browser-webview-presentation`: native continuity through overlay cycles without media or snapshot replacement.
- `test:browser-recording`: ready setup, explicit Start, selected inputs, lifecycle, late/denied audio, exact frame ownership, detached-window transfer guards and synthetic WebM metadata/offset preservation.
- `test:browser-recording-native`: actual moving video, generated tab audio, silent lead-in, short recordings, finite duration and near-end seeking in isolated Electron. Optional `-- --verify-container` uses developer-local ffprobe/ffmpeg to compare every encoded packet and fully decode the finalized synthetic clip. Container errors and diagnostics introduced by finalization fail this check; any codec diagnostic already present in the original Chromium recording is reported separately.
- `test:browser-recording-host`: React store/API/device integration, theme changes and recovery.
- `test:browser-recording-overlay-document`: custom menus, keyboard interaction, narrow layouts and saved/error controls.
- `test:browser-recording-overlay`: real native layering, page continuity, command boundaries, transfers and cleanup.

The native fixture uses generated media and does not open the microphone or system loopback. Hardware microphone and system-audio capture require separate device checks. These controls are available in Windows development builds; this work does not represent a packaged release.
