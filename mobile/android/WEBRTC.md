# Native audio dependency

Android uses `io.github.webrtc-sdk:android-prefixed-stripped:144.7559.15` from Maven Central. Its Java namespace is `livekit.org.webrtc`. This precompiled variant excludes software video codecs; Zyra creates only an audio track and event channel.

- Publisher: https://github.com/webrtc-sdk/android
- Release: https://github.com/webrtc-sdk/android/releases/tag/v144.7559.15
- AAR SHA-256: `1d2a34b03ef504edd7bedb09d8a8c65c01123b2fe37b96f9c3ad1bccd5e3b447`
- Release notices: `app/src/main/assets/licenses/webrtc-NOTICES.md` and `webrtc-SDK-LICENSE.txt`, copied from that release's `Licenses/WEBRTC.md` and `LICENSE`.

The AAR contains armeabi-v7a, arm64-v8a, x86 and x86_64 libraries. Their actual ELF load-segment alignments pass `node mobile/scripts/verify-native-libraries.mjs <extracted-jni-directory>` (16 KiB for 64-bit ABIs, 4 KiB for 32-bit). Repeat that check on the packaged APK's extracted native libraries. APK ZIP alignment, release shrinking/JNI preservation and physical operation remain separate checks.

The upstream AAR does not include consumer shrinker rules. The app explicitly retains the shadowed WebRTC namespace for native JNI callbacks. No WebRTC source compilation or emulator is required for development here.
