package dev.zyra.mobile

import android.app.Application
import dev.zyra.mobile.lifecycle.SessionStore
import dev.zyra.mobile.ui.MobileSession
import dev.zyra.mobile.voice.VoiceServiceConnection

class ZyraApplication : Application() {
    val sessions = SessionStore { MobileSession(this) }
    val voiceService by lazy { VoiceServiceConnection(this) }
}
