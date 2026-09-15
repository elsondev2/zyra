package dev.zyra.mobile.voice

import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayDeque

data class VoiceBinding(val adapter: String, val realtime: String, val generation: Long) {
    fun matches(event: JSONObject) = event.optString("adapterSessionId") == adapter &&
        event.optString("realtimeSessionId") == realtime && event.optLong("realtimeSessionGeneration") == generation
    companion object {
        fun parse(value: JSONObject): VoiceBinding {
            val binding = VoiceBinding(value.getString("adapterSessionId"), value.getString("realtimeSessionId"), value.getLong("realtimeSessionGeneration"))
            require(binding.adapter.isNotBlank() && binding.realtime.isNotBlank() && binding.generation > 0) { "The PC returned an invalid Voice connection." }
            return binding
        }
    }
}

/** Same canonical transcript allowlist and context command rules as Desktop's
 * useInstructorVoiceSession / assistant-realtime-client-commands. Audio never
 * crosses this queue. All methods are confined to the controller dispatcher. */
class VoiceProtocol {
    var binding: VoiceBinding? = null
    var responseActive = false
        private set
    private val commands = ArrayDeque<JSONObject>()
    private val sent = LinkedHashSet<String>()
    private val events = ArrayDeque<String>()
    private var bytes = 0
    val hasEvents get() = events.isNotEmpty()

    fun provider(event: JSONObject) {
        val type = event.optString("type")
        val role = event.optJSONObject("turn")?.optString("role")?.takeIf(String::isNotEmpty)
            ?: event.optJSONObject("item")?.optString("role")?.takeIf(String::isNotEmpty) ?: event.optString("role")
        if (type in setOf("input_audio_buffer.speech_started", "response.created", "output_transcript.added") || type == "turn.created" && role == "assistant") responseActive = true
        if (type in setOf("response.done", "output_audio.done") || type == "turn.done" && role == "assistant") responseActive = false
        if (!isTranscript(type)) return
        val encoded = event.toString()
        val size = encoded.toByteArray(Charsets.UTF_8).size
        require(size <= 60 * 1024 && events.size < 256 && bytes + size <= 512 * 1024) { "Voice cannot keep up with this connection. Reconnect before continuing." }
        events.add(encoded); bytes += size
    }

    fun nextBatch(): JSONArray {
        val result = JSONArray()
        var batchBytes = 2
        while (events.isNotEmpty() && result.length() < 32) {
            val size = events.first.toByteArray(Charsets.UTF_8).size
            if (batchBytes + size + 1 > 64 * 1024) break
            result.put(JSONObject(events.removeFirst())); bytes -= size; batchBytes += size + 1
        }
        return result
    }

    fun command(event: JSONObject) {
        if (event.optString("type") != "client.command") return
        validateCommand(event)
        val id = event.getString("commandId")
        if (id in sent || commands.any { it.optString("commandId") == id }) return
        require(commands.size < 64) { "Too many pending Voice instructions. Reconnect before continuing." }
        commands.add(JSONObject(event.toString()))
    }

    fun flush(send: (String) -> Boolean) {
        val owner = binding ?: return
        val iterator = commands.iterator()
        while (iterator.hasNext()) {
            val command = iterator.next()
            if (!owner.matches(command)) { iterator.remove(); continue }
            val messages = command.getJSONArray("messages")
            val values = (0 until messages.length()).map { messages.getJSONObject(it) }
            if (responseActive && values.any { it.optString("type") == "session.context.append" }) continue
            // Partial delivery is terminal. Never replay a partially sent command.
            for (message in values) check(send(message.toString())) { "The Voice event channel could not send an instruction." }
            sent.add(command.getString("commandId")); iterator.remove()
            if (values.any { it.optString("channel") == "speakable" }) responseActive = true
            while (sent.size > 256) sent.remove(sent.first())
        }
    }

    companion object {
        fun isTranscript(type: String) = type in setOf("delegation.created", "turn.created", "turn.delta", "turn.done", "input_transcript.added", "output_transcript.added", "conversation.item.created") ||
            listOf(".transcript.delta", ".transcript.done", ".audio_transcript.delta", ".audio_transcript.done", ".input_audio_transcription.delta", ".input_audio_transcription.completed").any(type::endsWith)
        private val identifier = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$")
        fun validateCommand(event: JSONObject) {
            require(identifier.matches(event.optString("commandId"))) { "Invalid Voice instruction identity." }
            require(!event.has("canonicalMessageId") || identifier.matches(event.optString("canonicalMessageId")))
            require(event.optLong("realtimeSessionGeneration") > 0)
            val messages = event.getJSONArray("messages")
            require(messages.length() in 1..32)
            for (index in 0 until messages.length()) {
                val message = messages.getJSONObject(index)
                if (message.optString("type") == "session.close") continue
                require(message.optString("type") == "session.context.append" && message.optString("channel") in setOf("speakable", "commentary"))
                val content = message.getJSONArray("content")
                require(content.length() == 1)
                val item = content.getJSONObject(0)
                require(item.optString("type") == "input_text" && item.getString("text").toByteArray(Charsets.UTF_8).size in 1..500)
            }
        }
    }
}
