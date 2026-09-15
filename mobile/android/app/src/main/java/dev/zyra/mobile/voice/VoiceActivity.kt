package dev.zyra.mobile.voice

import kotlin.math.pow
import kotlin.math.sqrt

/** Call-local audio levels. No samples are retained or sent over the network.
 * The orb polls this independently of transcript state, only while visible. */
class VoiceActivity(private val now: () -> Long = { System.nanoTime() / 1_000_000 }) {
    @Volatile private var current: Capture? = null
    fun begin(): Capture = Capture(now).also { current?.close(); current = it }
    fun level(): Float = current?.level() ?: 0f

    class Capture internal constructor(private val now: () -> Long) {
        private var closed = false
        private var muted = false
        private var input = 0f
        private var output = 0f
        private var inputAt: Long? = null
        private var outputAt: Long? = null

        @Synchronized fun samples(data: ByteArray, format: Int, rate: Int, channels: Int, playback: Boolean = false) {
            if (closed || !playback && muted) return
            val value = pcmLevel(data, format, rate, channels)
            if (playback) { output = value; outputAt = now() }
            else { input = value; inputAt = now() }
        }
        @Synchronized fun mute(value: Boolean) { muted = value; input = 0f; inputAt = null }
        @Synchronized fun close() { closed = true; input = 0f; output = 0f; inputAt = null; outputAt = null }
        @Synchronized fun level(): Float {
            if (closed) return 0f
            val time = now()
            fun recent(at: Long?) = at != null && time - at in 0..250
            return maxOf(if (!muted && recent(inputAt)) input else 0f, if (recent(outputAt)) output else 0f)
        }
    }

    companion object {
        /** Desktop's noise floor, full scale and response curve on normalized PCM.
         * Supports Android PCM16, unsigned PCM8 and float playback. */
        fun pcmLevel(data: ByteArray, format: Int, rate: Int, channels: Int): Float {
            val width = when (format) { 2 -> 2; 3 -> 1; 4 -> 4; else -> return 0f }
            if (rate !in 8000..96000 || channels !in 1..2 || data.isEmpty() || data.size > 192_000 || data.size % (width * channels) != 0) return 0f
            var squared = 0.0
            var index = 0
            while (index < data.size) {
                val sample = when (width) {
                    1 -> ((data[index].toInt() and 255) - 128) / 128.0
                    2 -> ((data[index].toInt() and 255) or (data[index + 1].toInt() shl 8)).toShort().toDouble() / 32768.0
                    else -> Float.fromBits((data[index].toInt() and 255) or ((data[index + 1].toInt() and 255) shl 8) or
                        ((data[index + 2].toInt() and 255) shl 16) or (data[index + 3].toInt() shl 24)).toDouble()
                }
                if (!sample.isFinite()) return 0f
                squared += sample.coerceIn(-1.0, 1.0).let { it * it }
                index += width
            }
            val rms = sqrt(squared / (data.size / width))
            return ((rms - .012) / (.2 - .012)).coerceAtLeast(0.0).pow(.68).coerceIn(0.0, 1.0).toFloat()
        }
        /** Desktop attack/release weights adjusted from 60 Hz to our bounded tick. */
        fun smooth(previous: Float, next: Float, elapsedMs: Long): Float {
            val weight = if (next > previous) .16 else .055
            return (previous + (next - previous) * (1 - (1 - weight).pow(elapsedMs.coerceIn(0, 250) * .06))).toFloat()
        }
    }
}
