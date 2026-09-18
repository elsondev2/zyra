package dev.zyra.mobile.voice

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.roundToInt

/** Streaming area resampler: averages stereo channels and source samples into
 * 24 kHz mono PCM16. Fractional buckets carry across recording callbacks. */
class VoicePcm {
    private var rate = 0
    private var filled = 0
    private var weighted = 0.0
    fun reset() { rate = 0; filled = 0; weighted = 0.0 }
    fun convert(data: ByteArray, sampleRate: Int, channels: Int): ByteArray {
        require(sampleRate in 8000..96000 && channels in 1..2 && data.size <= 16384 && data.size % (channels * 2) == 0)
        if (rate != sampleRate) { reset(); rate = sampleRate }
        val frames = data.size / (channels * 2)
        val output = ByteBuffer.allocate(((filled + frames * 24000) / rate) * 2).order(ByteOrder.LITTLE_ENDIAN)
        var offset = 0
        repeat(frames) {
            var sample = 0
            repeat(channels) { sample += ((data[offset].toInt() and 255) or (data[offset + 1].toInt() shl 8)).toShort().toInt(); offset += 2 }
            var weight = 24000
            while (weight > 0) {
                val amount = minOf(weight, rate - filled)
                weighted += sample.toDouble() / channels * amount
                filled += amount; weight -= amount
                if (filled == rate) { output.putShort((weighted / rate).roundToInt().coerceIn(-32768, 32767).toShort()); filled = 0; weighted = 0.0 }
            }
        }
        return output.array()
    }
    companion object {
        fun wav(chunks: List<ByteArray>): ByteArray {
            val size = chunks.sumOf(ByteArray::size)
            val buffer = ByteBuffer.allocate(size + 44).order(ByteOrder.LITTLE_ENDIAN)
            buffer.put("RIFF".toByteArray()).putInt(size + 36).put("WAVEfmt ".toByteArray()).putInt(16)
                .putShort(1).putShort(1).putInt(24000).putInt(48000).putShort(2).putShort(16)
                .put("data".toByteArray()).putInt(size)
            chunks.forEach(buffer::put)
            return buffer.array()
        }
    }
}
