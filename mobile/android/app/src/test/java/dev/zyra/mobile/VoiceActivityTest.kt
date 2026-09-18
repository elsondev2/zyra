package dev.zyra.mobile

import dev.zyra.mobile.voice.VoiceActivity
import org.junit.Assert.*
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class VoiceActivityTest {
    private fun pcm(vararg values: Int) = ByteBuffer.allocate(values.size * 2).order(ByteOrder.LITTLE_ENDIAN).apply {
        values.forEach { putShort(it.toShort()) }
    }.array()

    @Test fun `PCM uses Desktop noise floor and preserves stereo energy without cancellation`() {
        assertEquals(0f, VoiceActivity.pcmLevel(pcm(100, -100), 2, 48000, 1))
        assertEquals(1f, VoiceActivity.pcmLevel(pcm(32767, -32768), 2, 48000, 2))
        val half = VoiceActivity.pcmLevel(pcm(3277, -3277), 2, 48000, 2)
        assertTrue(half in .59f.. .60f)
        val float = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putFloat(.1f).putFloat(-.1f).array()
        assertEquals(half, VoiceActivity.pcmLevel(float, 4, 48000, 2), .001f)
        assertEquals(0f, VoiceActivity.pcmLevel(byteArrayOf(128.toByte()), 3, 24000, 1))
    }

    @Test fun `unsupported malformed or nonfinite audio cannot drive the orb`() {
        assertEquals(0f, VoiceActivity.pcmLevel(pcm(5000), 5, 24000, 1))
        assertEquals(0f, VoiceActivity.pcmLevel(byteArrayOf(1), 2, 24000, 1))
        assertEquals(0f, VoiceActivity.pcmLevel(pcm(5000), 2, 24000, 2))
        assertEquals(0f, VoiceActivity.pcmLevel(pcm(5000), 2, 0, 1))
        assertEquals(0f, VoiceActivity.pcmLevel(ByteArray(192002), 2, 24000, 1))
        val invalid = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putFloat(Float.NaN).array()
        assertEquals(0f, VoiceActivity.pcmLevel(invalid, 4, 24000, 1))
    }

    @Test fun `muting clears capture immediately while playback remains audible and stale levels expire`() {
        var clock = 0L; val activity = VoiceActivity { clock }; val capture = activity.begin()
        val audio = pcm(10000)
        capture.samples(audio, 2, 24000, 1); assertEquals(1f, activity.level())
        audio.fill(0); assertEquals(1f, activity.level()) // Only the level is retained.
        capture.mute(true); capture.samples(pcm(10000), 2, 24000, 1); assertEquals(0f, activity.level())
        capture.samples(pcm(10000), 2, 24000, 1, playback = true); assertEquals(1f, activity.level())
        clock = 251; assertEquals(0f, activity.level())
        capture.mute(false); assertEquals(0f, activity.level())
        capture.samples(pcm(10000), 2, 24000, 1); assertEquals(1f, activity.level())
    }

    @Test fun `closing or replacing a call rejects late microphone and playback callbacks`() {
        val activity = VoiceActivity { 0 }; val old = activity.begin()
        old.samples(pcm(10000), 2, 24000, 1)
        val fresh = activity.begin(); assertEquals(0f, activity.level())
        old.samples(pcm(10000), 2, 24000, 1, playback = true); assertEquals(0f, activity.level())
        fresh.samples(pcm(10000), 2, 24000, 1, playback = true); assertEquals(1f, activity.level())
        fresh.close(); fresh.samples(pcm(10000), 2, 24000, 1); assertEquals(0f, activity.level())
    }

    @Test fun `smoothing has faster attack than release and is independent of tick rate`() {
        val attack = VoiceActivity.smooth(0f, 1f, 50)
        val release = 1f - VoiceActivity.smooth(1f, 0f, 50)
        assertTrue(attack > release)
        assertTrue(attack in 0f..1f)
        val short = VoiceActivity.smooth(0f, 1f, 25)
        assertEquals(attack, VoiceActivity.smooth(short, 1f, 25), .00001f)
    }
}
