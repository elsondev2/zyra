package dev.zyra.mobile.dictation

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import dev.zyra.mobile.voice.VoicePcm
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.pow
import kotlin.math.sqrt

/** Foreground-only, two-minute mono capture. Raw audio never touches phone storage. */
class AndroidDictationRecorder : DictationRecorder {
    private val stopped = AtomicBoolean(false)
    override fun stop() { stopped.set(true) }
    @SuppressLint("MissingPermission") // The composer checks RECORD_AUDIO for this chat before starting.
    override suspend fun record(level: (Int, Float) -> Unit): ByteArray {
        var produced: ByteArray? = null
        try { return withContext(Dispatchers.IO) {
        val rate = 44100
        val minimum = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        check(minimum > 0) { "This microphone cannot record speech right now." }
        currentCoroutineContext().ensureActive()
        check(!stopped.get()) { "Recording was cancelled." }
        val device = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            .setAudioFormat(AudioFormat.Builder().setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
            .setBufferSizeInBytes(maxOf(minimum * 2, 9600)).build()
        val chunks = mutableListOf<ByteArray>()
        val input = ByteArray(4800); val converter = VoicePcm(); var size = 0; var lastLevel = 0
        try {
            check(device.state == AudioRecord.STATE_INITIALIZED) { "The microphone could not start." }
            currentCoroutineContext().ensureActive()
            if (!stopped.get()) device.startRecording()
            val started = android.os.SystemClock.elapsedRealtime(); var lastRead = started
            while (!stopped.get() && size < 5760000 && android.os.SystemClock.elapsedRealtime() - started < 120000) {
                currentCoroutineContext().ensureActive()
                val count = device.read(input, 0, input.size, AudioRecord.READ_NON_BLOCKING)
                check(count >= 0) { "The microphone disconnected. Try recording again." }
                if (count == 0) { check(android.os.SystemClock.elapsedRealtime() - lastRead < 5000) { "The microphone is not supplying audio. Try again." }; delay(10); continue }
                lastRead = android.os.SystemClock.elapsedRealtime()
                val source = input.copyOf(count - count % 2)
                val converted = try { converter.convert(source, rate, 1) } finally { source.fill(0) }
                val chunk = if (converted.size <= 5760000 - size) converted else converted.copyOf(5760000 - size).also { converted.fill(0) }
                chunks.add(chunk); size += chunk.size
                if (size - lastLevel >= 2400) {
                    var square = 0.0
                    for (i in chunk.indices step 2) { val sample = ((chunk[i].toInt() and 255) or (chunk[i + 1].toInt() shl 8)).toShort().toDouble() / 32768; square += sample * sample }
                    val rms = sqrt(square / maxOf(1, chunk.size / 2))
                    // Preserve quiet speech, then use a gentle curve so spoken peaks read clearly instead of flattening.
                    val visualLevel = ((rms - .006) / (.14 - .006)).coerceAtLeast(0.0).pow(.48).coerceIn(0.0, 1.0).toFloat()
                    level(size / 48, visualLevel); lastLevel = size
                }
            }
            currentCoroutineContext().ensureActive()
            VoicePcm.wav(chunks).also { produced = it }
        } finally {
            runCatching { device.stop() }; device.release(); input.fill(0); chunks.forEach { it.fill(0) }
        }
        } } finally { if (!currentCoroutineContext().isActive) produced?.fill(0) }
    }
}
