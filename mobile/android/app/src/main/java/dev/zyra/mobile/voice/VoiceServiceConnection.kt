package dev.zyra.mobile.voice

import android.content.Intent
import dev.zyra.mobile.ZyraApplication
import dev.zyra.mobile.lifecycle.SessionStore
import dev.zyra.mobile.ui.MobileSession
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout

/** In-process service handoff. No session identifiers, credentials or transcript
 * are put in an Intent. A service restart cannot resume microphone capture. */
class VoiceServiceConnection(private val app: ZyraApplication) {
    private var lease: SessionStore.Lease<MobileSession>? = null
    private var ready = CompletableDeferred<Unit>()
    private var attached = false
    val session get() = lease?.value
    fun start(owner: MobileSession) {
        check(lease == null) { "Voice is still ending. Try again in a moment." }
        val acquired = app.sessions.acquire()
        check(acquired.value === owner)
        lease = acquired; ready = CompletableDeferred()
        try { app.startForegroundService(Intent(app, VoiceCallService::class.java)) }
        catch (e: Exception) { lease = null; acquired.close(); throw IllegalStateException("Android could not start Voice. Keep Zyra open and try again.", e) }
    }
    suspend fun awaitReady() { withTimeout(8000) { ready.await() } }
    fun attached() { attached = true }
    fun connected() { ready.complete(Unit) }
    fun failed(message: String) { ready.completeExceptionally(IllegalStateException(message)); session?.voice?.stop(message) }
    fun finished(owner: MobileSession) {
        if (session !== owner) return
        app.stopService(Intent(app, VoiceCallService::class.java))
        if (!attached) release()
    }
    fun destroyed(owner: MobileSession?) {
        if (session !== owner) return
        attached = false
        owner?.voice?.stop()
        if (owner?.voice?.state?.value?.inCall != true) release()
    }
    private fun release() {
        val finished = lease; lease = null; finished?.close()
    }
}
