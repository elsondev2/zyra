# Zyra Android

Native Kotlin / Jetpack Compose client. Development is in progress; see the parent mobile feature matrix before considering this release-ready.

Use JDK 17 and Android SDK 36. The Gradle build is limited to two workers and a 1.5 GiB Java heap, runs without a persistent daemon and reuses dependencies. Run `gradlew.bat :app:testDebugUnitTest :app:assembleDebug` on Windows or `./gradlew` with the same tasks elsewhere.

The application connects to an explicitly paired Zyra host. Provider credentials and execution remain on that host. Cleartext networking and Android backups of app data are disabled. No Zyra account, cloud relay, analytics SDK or push vendor is required for LAN access.
