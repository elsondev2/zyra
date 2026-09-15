package dev.zyra.mobile.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class VoicePreviewState(val phase: String = "idle", val error: String? = null)

/** Local Desktop samples. Never opens a provider call or microphone. Main-thread only. */
class VoicePreviewPlayer(private val context: Context) {
    private val mutable = MutableStateFlow(VoicePreviewState())
    val state = mutable.asStateFlow()
    private val audio = context.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attributes)
        .setOnAudioFocusChangeListener({ change -> if (change < 0) stop() }, Handler(Looper.getMainLooper())).build()
    private var player: MediaPlayer? = null
    private var ownsFocus = false
    fun toggle(id: String) {
        if (player != null) { stop(); return }
        try {
            check(audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Audio is busy. Try the sample again in a moment." }
            ownsFocus = true
            val current = MediaPlayer().also { player = it }
            mutable.value = VoicePreviewState("loading")
            current.setAudioAttributes(attributes)
            context.assets.openFd("voice-previews/${VoiceChoice.resolve(id).id}.ogg").use { current.setDataSource(it.fileDescriptor, it.startOffset, it.length) }
            current.setOnPreparedListener { if (player === it) { it.start(); mutable.value = VoicePreviewState("playing") } }
            current.setOnCompletionListener { if (player === it) stop() }
            current.setOnErrorListener { value, _, _ -> if (player === value) fail("Could not play this sample. Try again."); true }
            current.prepareAsync()
        } catch (error: Exception) { fail(error.message ?: "Could not play this sample.") }
    }
    private fun fail(message: String) { stop(); mutable.value = VoicePreviewState(error = message) }
    fun stop() {
        val previous = player; player = null
        previous?.setOnPreparedListener(null); previous?.setOnCompletionListener(null); previous?.setOnErrorListener(null)
        previous?.release()
        if (ownsFocus) { audio.abandonAudioFocusRequest(focus); ownsFocus = false }
        mutable.value = VoicePreviewState()
    }
}
