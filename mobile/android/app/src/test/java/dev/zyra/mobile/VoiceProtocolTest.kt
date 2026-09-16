package dev.zyra.mobile

import dev.zyra.mobile.voice.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class VoiceProtocolTest {
    private fun event(type: String) = JSONObject().put("type", type)
    private fun command(id: String, generation: Int = 1, channel: String = "commentary") = JSONObject()
        .put("type", "client.command").put("commandId", id).put("adapterSessionId", "adapter").put("realtimeSessionId", "realtime").put("realtimeSessionGeneration", generation)
        .put("messages", JSONArray().put(JSONObject().put("type", "session.context.append").put("channel", channel).put("content", JSONArray().put(JSONObject().put("type", "input_text").put("text", "hello")))))

    @Test fun `audio and unrelated provider events never enter canonical history`() {
        val queue = VoiceProtocol()
        listOf("response.audio.delta", "input_audio_buffer.speech_started", "session.updated").forEach { queue.provider(event(it)) }
        assertFalse(queue.hasEvents)
        listOf("turn.done", "conversation.item.created", "response.audio_transcript.done", "conversation.item.input_audio_transcription.completed", "delegation.created").forEach { queue.provider(event(it)) }
        assertEquals(5, queue.nextBatch().length())
    }
    @Test fun `UTF8 batches stay ordered under byte and count ceilings`() {
        val queue = VoiceProtocol()
        repeat(70) { queue.provider(event("turn.delta").put("index", it).put("delta", "世".repeat(850))) }
        var index = 0
        while (queue.hasEvents) {
            val batch = queue.nextBatch()
            assertTrue(batch.length() <= 32); assertTrue(batch.toString().toByteArray().size <= 64 * 1024)
            repeat(batch.length()) { assertEquals(index++, batch.getJSONObject(it).getInt("index")) }
        }
        assertEquals(70, index)
    }
    @Test fun `overflow is explicit instead of dropping transcript events`() {
        val queue = VoiceProtocol()
        repeat(256) { queue.provider(event("turn.done")) }
        assertThrows(IllegalArgumentException::class.java) { queue.provider(event("turn.done")) }
        assertEquals(32, queue.nextBatch().length())
    }
    @Test fun `commands wait for binding and response idle and are applied once`() {
        val queue = VoiceProtocol()
        val sent = mutableListOf<String>()
        queue.command(command("first")); queue.command(command("first")); queue.command(command("stale", 2))
        queue.flush { sent.add(it) }; assertTrue(sent.isEmpty())
        queue.binding = VoiceBinding("adapter", "realtime", 1)
        queue.provider(event("response.created")); queue.flush { sent.add(it) }; assertTrue(sent.isEmpty())
        queue.provider(event("response.done")); queue.flush { sent.add(it) }; assertEquals(1, sent.size)
        queue.command(command("first")); queue.flush { sent.add(it) }; assertEquals(1, sent.size)
        queue.command(command("speech", channel = "speakable")); queue.command(command("after"))
        queue.flush { sent.add(it) }; assertEquals(2, sent.size)
        queue.provider(event("turn.done").put("role", "assistant")); queue.flush { sent.add(it) }; assertEquals(3, sent.size)
    }
    @Test fun `commands reject unexpected actions oversized UTF8 and partial channel delivery`() {
        val queue = VoiceProtocol(); queue.binding = VoiceBinding("adapter", "realtime", 1)
        val invalid = command("invalid"); invalid.getJSONArray("messages").getJSONObject(0).put("type", "session.update")
        assertThrows(IllegalArgumentException::class.java) { queue.command(invalid) }
        val large = command("large"); large.getJSONArray("messages").getJSONObject(0).getJSONArray("content").getJSONObject(0).put("text", "世".repeat(167))
        assertThrows(IllegalArgumentException::class.java) { queue.command(large) }
        queue.command(command("valid"))
        assertThrows(IllegalStateException::class.java) { queue.flush { false } }
    }
}
