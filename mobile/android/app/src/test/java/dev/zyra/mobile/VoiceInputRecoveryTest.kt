package dev.zyra.mobile

import dev.zyra.mobile.voice.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class VoiceInputRecoveryTest {
    private fun boundary(id: String, state: String) = JSONObject().put("type", "input_audio_buffer.speech_$state").put("item_id", id)
    private fun done(id: String, text: String) = JSONObject().put("type", "conversation.item.input_audio_transcription.completed").put("item_id", id).put("transcript", text)
    private fun pcm(frames: Int = 480, channels: Int = 1): ByteArray = ByteBuffer.allocate(frames * channels * 2).order(ByteOrder.LITTLE_ENDIAN).also { data -> repeat(frames) { data.putShort(if (channels == 1) 1000 else 2000); if (channels == 2) data.putShort(0) } }.array()

    @Test fun `streaming stereo resampling produces the exact WAV accepted by Desktop`() {
        val converter = VoicePcm()
        val chunks = (0 until 200).map { converter.convert(pcm(channels = 2), 48000, 2) }
        val fixture = javaClass.classLoader!!.getResourceAsStream("recovered-voice.wav")!!.use { it.readBytes() }
        assertArrayEquals(fixture, VoicePcm.wav(chunks))
        // Fractional 44.1 kHz sample boundaries carry between callbacks.
        val fractional = VoicePcm()
        assertEquals(48000, (0 until 100).sumOf { fractional.convert(pcm(441), 44100, 1).size })
        assertThrows(IllegalArgumentException::class.java) { fractional.convert(ByteArray(3), 44100, 1) }
    }
    @Test fun `only missing completed speech is recovered after grace with bounded preroll`() {
        var time = 0L; val input = VoiceInputRecovery { time }
        repeat(100) { input.samples(pcm(), 2, 48000, 1) }
        assertEquals(VoiceInputRecovery.PREROLL_BYTES, input.retainedBytes)
        input.provider(boundary("a", "started")); repeat(40) { input.samples(pcm(), 2, 48000, 1) }
        input.provider(boundary("a", "stopped"))
        time = 1499; assertNull(input.takeReady()); time = 1500
        val candidate = input.takeReady()!!
        assertEquals((650 + 400) * 48 + 44, VoicePcm.wav(candidate.chunks!!).size)
        assertNull(input.takeReady())
        assertEquals("Recovered", input.recovered("a", "Recovered")!!.getString("transcript"))
        assertTrue(candidate.cancelled.isCompleted)
        assertFalse(input.provider(done("a", "Late original")))
        candidate.erase(); assertTrue(candidate.chunks!!.all { bytes -> bytes.all { it == 0.toByte() } })
        input.close(); assertEquals(0, input.retainedBytes)
    }
    @Test fun `normal and canonical completions cancel recovery while blank completions do not`() {
        var time = 0L; val input = VoiceInputRecovery { time }
        input.provider(boundary("a", "started")); repeat(30) { input.samples(pcm(), 2, 48000, 1) }; input.provider(boundary("a", "stopped"))
        input.provider(done("a", "")); time = 1500
        val candidate = input.takeReady()!!
        assertTrue(input.provider(done("a", "Original"))); assertTrue(candidate.cancelled.isCompleted)
        assertNull(input.recovered("a", "Late recovery")); candidate.erase()
        input.provider(boundary("b", "started")); input.fromPc(JSONObject().put("type", "transcript.done").put("role", "user").put("providerItemId", "b").put("text", "Saved"))
        input.provider(boundary("b", "stopped")); time += 2000; assertNull(input.takeReady()); input.close()
    }
    @Test fun `mute close unavailable capture and excessive speech never leak a partial recording`() {
        var time = 0L; val input = VoiceInputRecovery { time }
        input.provider(boundary("a", "started")); repeat(30) { input.samples(pcm(), 2, 48000, 1) }
        input.pause(true); assertEquals(0, input.retainedBytes)
        input.samples(pcm(), 2, 48000, 1); assertEquals(0, input.retainedBytes)
        assertNull(input.takeReady()!!.chunks)
        input.pause(false); input.provider(boundary("b", "started"))
        repeat(12010) { input.samples(pcm(), 2, 48000, 1) }
        assertTrue(input.retainedBytes <= VoiceInputRecovery.MAX_BYTES + VoiceInputRecovery.PREROLL_BYTES)
        input.provider(boundary("b", "stopped")); time = 1600; assertNull(input.takeReady()!!.chunks)
        input.close(); input.samples(pcm(), 2, 48000, 1); assertEquals(0, input.retainedBytes)
    }
    @Test fun `placeholder and partial transcript states do not contaminate real text`() {
        val presentation = VoicePresentation()
        fun delta(text: String) = JSONObject().put("type", "transcript.delta").put("role", "user").put("providerItemId", "a").put("delta", text)
        presentation.speech("a", "listening"); presentation.event(delta("Hello"))
        assertEquals("Hello", presentation.entries.single().text)
        presentation.speech("a", "recovering"); presentation.speech("a", "unavailable")
        assertEquals("Hello", presentation.entries.single().text)
        presentation.event(delta(" there")); assertEquals("Hello there", presentation.entries.single().text)
    }
}
