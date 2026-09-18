# Termux native terminal libraries

The terminal-emulator and terminal-view sources and resources are from Termux v0.118.3, distributed through the project's documented JitPack channel. Termux identifies these terminal libraries as Apache 2.0 exceptions to its repository's GPLv3 license. The Apache license is included alongside this notice.

- Project and license exceptions: https://github.com/termux/termux-app/blob/v0.118.3/LICENSE.md
- Distribution documentation: https://github.com/termux/termux-app/wiki/Termux-Libraries
- Emulator sources: https://jitpack.io/com/github/termux/termux-app/terminal-emulator/v0.118.3/terminal-emulator-v0.118.3-sources.jar
- Emulator source SHA-256: 670104ced8a0741c7325bedac388d354f6dff15b5eeeb0e401885fca557aaff2
- View sources: https://jitpack.io/com/github/termux/termux-app/terminal-view/v0.118.3/terminal-view-v0.118.3-sources.jar
- View source SHA-256: aca9dc1582f159a7b364a46f0aae3620df074ce51806840452c1c7de6a280e7d

Local changes: TerminalSession is replaced by a remote transport adapter. It never starts a phone process or loads Termux JNI. The original session source is retained here for review. Clipboard escape sequences cannot read or alter the phone clipboard; explicit copy and paste actions remain available. Emulator and view source attribution is retained. Resource files come from the matching terminal-view AAR.
