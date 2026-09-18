package dev.zyra.mobile

import dev.zyra.mobile.voice.*
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.Base64

class VoiceRecoveryRunnerTest {
    private fun input(): VoiceInputRecovery {
        var time = 0L
        return VoiceInputRecovery { time }.apply {
            provider(JSONObject().put("type", "input_audio_buffer.speech_started").put("item_id", "spoken"))
            repeat(200) { samples(ByteArray(480), 2, 24000, 1) }
            provider(JSONObject().put("type", "input_audio_buffer.speech_stopped").put("item_id", "spoken"))
            time = 2000
        }
    }
    @Test fun `recovery uploads paced chunks and returns one canonical provider completion`() = runBlocking {
        val input = input(); val result = CompletableDeferred<JSONObject>(); val bytes = java.io.ByteArrayOutputStream(); val states = mutableListOf<String>()
        var total = 0
        val runner = VoiceRecoveryRunner(input, "adapter", { method, params ->
            assertEquals("adapter", params.getString("adapterSessionId"))
            when (method) {
                "voice.recovery.begin" -> { total = params.getInt("bytes"); JSONObject() }
                "voice.recovery.chunk" -> {
                    assertEquals(bytes.size(), params.getInt("offset")); val chunk = Base64.getDecoder().decode(params.getString("data")); assertTrue(chunk.size <= 49152); bytes.write(chunk); JSONObject().put("offset", bytes.size())
                }
                "voice.recovery.finish" -> JSONObject().put("providerItemId", "spoken").put("text", "Recovered words")
                else -> error("Unexpected request: $method")
            }
        }, { _, state -> states.add(state) }, { result.complete(it) })
        val job = launch { runner.run() }
        try {
            val event = withTimeout(3000) { result.await() }
            assertEquals("zyra.input_audio_transcription.completed", event.getString("type")); assertEquals("Recovered words", event.getString("transcript"))
            assertEquals(total, bytes.size()); assertEquals("RIFF", bytes.toByteArray().copyOfRange(0, 4).toString(Charsets.US_ASCII)); assertEquals(listOf("recovering"), states)
            assertFalse(input.provider(JSONObject().put("type", "turn.done").put("turn_id", "spoken").put("role", "user").put("transcript", "Late words")))
        } finally { input.close(); job.cancelAndJoin() }
    }
    @Test fun `normal completion during upload cancels the transfer and does not publish recovered text`() = runBlocking {
        val input = input(); val started = CompletableDeferred<Unit>(); val cancelled = CompletableDeferred<Unit>(); var recovered = false
        val runner = VoiceRecoveryRunner(input, "adapter", { method, _ ->
            when (method) {
                "voice.recovery.begin" -> JSONObject()
                "voice.recovery.chunk" -> { started.complete(Unit); awaitCancellation() }
                "voice.recovery.cancel" -> { cancelled.complete(Unit); JSONObject() }
                else -> error("Transcription must not start")
            }
        }, { _, _ -> }, { recovered = true })
        val job = launch { runner.run() }
        try {
            withTimeout(3000) { started.await() }
            input.provider(JSONObject().put("type", "conversation.item.input_audio_transcription.completed").put("item_id", "spoken").put("transcript", "Original wins"))
            withTimeout(3000) { cancelled.await() }
            assertFalse(recovered); assertTrue(job.isActive)
        } finally { input.close(); job.cancelAndJoin() }
    }
    @Test fun `failed recovery is visible and leaves the ongoing call runner usable`() = runBlocking {
        val input = input(); val unavailable = CompletableDeferred<Unit>()
        val runner = VoiceRecoveryRunner(input, "adapter", { method, _ -> if (method.endsWith("cancel")) JSONObject() else error("offline") },
            { _, state -> if (state == "unavailable") unavailable.complete(Unit) }, { error("No transcript may be fabricated") })
        val job = launch { runner.run() }
        try { withTimeout(3000) { unavailable.await() }; assertTrue(job.isActive) }
        finally { input.close(); job.cancelAndJoin() }
    }
}
