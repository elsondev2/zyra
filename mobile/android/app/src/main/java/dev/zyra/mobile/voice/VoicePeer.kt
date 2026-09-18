package dev.zyra.mobile.voice

/** Call-scoped media transport. Implementations must stop capture synchronously
 * on close; callbacks may arrive late and are guarded by the controller epoch. */
interface VoicePeer : AutoCloseable {
    suspend fun offer(): String
    suspend fun answer(sdp: String)
    fun send(message: String): Boolean
    fun mute(muted: Boolean)
    fun speaker(enabled: Boolean): Boolean
    fun output(id: Int): Boolean = false
    override fun close()
}

interface VoicePeerListener {
    fun outputs(value: VoiceAudioOutputs) {}
    /** Recording-thread callback. Implementations must copy only bounded data and return promptly. */
    fun samples(data: ByteArray, format: Int, rate: Int, channels: Int) {}
    /** Playback-thread callback with the same bounded, non-retaining contract. */
    fun playbackSamples(data: ByteArray, format: Int, rate: Int, channels: Int) {}
    fun connected(connected: Boolean)
    fun channel(open: Boolean)
    fun outputReady()
    fun message(text: String)
    fun failed(message: String)
}
