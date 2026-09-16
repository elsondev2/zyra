package dev.zyra.mobile.voice

import kotlinx.coroutines.CompletableDeferred
import org.json.JSONObject
import java.util.ArrayDeque

data class VoiceRecoveryCandidate(val providerId: String, val chunks: List<ByteArray>?, val cancelled: CompletableDeferred<Unit>) {
    fun erase() { chunks?.forEach { it.fill(0) } }
}

/** Call-local PCM only. Audio callbacks write directly into this synchronized
 * bounded buffer; no 10 ms audio messages are enqueued on the UI dispatcher. */
class VoiceInputRecovery(private val now: () -> Long = { System.nanoTime() / 1000000 }) {
    private class Capture(val id: String, val chunks: MutableList<ByteArray> = mutableListOf(), var bytes: Int = 0,
        var stopped: Long? = null, var failed: Boolean = false, var inFlight: Boolean = false,
        val cancelled: CompletableDeferred<Unit> = CompletableDeferred())
    private val pcm = VoicePcm()
    private val rolling = ArrayDeque<ByteArray>()
    private val captures = LinkedHashMap<String, Capture>()
    private val completed = LinkedHashMap<String, Boolean>()
    private val lost = ArrayDeque<String>()
    private var active: String? = null
    private var closed = false
    private var paused = false
    private var available = true
    private var rollingBytes = 0
    val retainedBytes: Int @Synchronized get() = rollingBytes + captures.values.sumOf { it.bytes }

    @Synchronized fun available(value: Boolean) { available = value; if (!value) clearAudio() }
    @Synchronized fun samples(data: ByteArray, format: Int, rate: Int, channels: Int) {
        if (closed || paused || !available) return
        if (format != 2) { clearAudio(); return } // Android ENCODING_PCM_16BIT
        val converted = try { pcm.convert(data, rate, channels) } catch (_: IllegalArgumentException) { clearAudio(); return }
        if (converted.isEmpty()) return
        captures[active]?.let { capture ->
            if (!capture.failed && !capture.inFlight) {
                if (capture.bytes + converted.size > MAX_BYTES || captures.values.sumOf { it.bytes } + converted.size > MAX_BYTES) {
                    erase(capture); capture.failed = true
                } else { capture.chunks.add(converted.copyOf()); capture.bytes += converted.size }
            }
        }
        rolling.add(converted); rollingBytes += converted.size
        while (rollingBytes > PREROLL_BYTES && rolling.isNotEmpty()) {
            val first = rolling.removeFirst(); rollingBytes -= first.size
            val keep = PREROLL_BYTES - rollingBytes
            if (keep > 0) { rolling.addFirst(first.copyOfRange(first.size - keep, first.size)); rollingBytes += keep }
            first.fill(0)
        }
    }
    /** False means a late provider replay follows an already recovered message. */
    @Synchronized fun provider(event: JSONObject): Boolean {
        val id = providerId(event) ?: return true
        val type = event.optString("type")
        val user = userTranscript(event)
        if (user && completed[id] == true) return false
        if (user && completedText(event).isNotBlank() && isCompletion(type)) { resolve(id, false); return true }
        if (closed) return true
        if (type == "input_audio_buffer.speech_started" && id !in completed && id !in captures) {
            captures[active]?.let { if (it.stopped == null) it.stopped = now() }
            if (captures.size >= 8) { val previous = captures.values.first(); previous.cancelled.complete(Unit); erase(previous); captures.remove(previous.id); lost.add(previous.id); while (lost.size > 8) lost.removeFirst() }
            val copy = if (paused || !available || captures.values.sumOf { it.bytes } + rollingBytes > MAX_BYTES) mutableListOf() else rolling.map { it.copyOf() }.toMutableList()
            captures[id] = Capture(id, copy, copy.sumOf(ByteArray::size), failed = paused || !available)
            active = id
        } else if (type == "input_audio_buffer.speech_stopped") {
            captures[id]?.let { if (it.stopped == null) it.stopped = now() }
            if (active == id) active = null
        }
        return true
    }
    @Synchronized fun fromPc(event: JSONObject) {
        if (event.optString("type") == "transcript.done" && event.optString("role") == "user" && event.optString("text").isNotBlank())
            event.optString("providerItemId").takeIf(String::isNotBlank)?.let { resolve(it, completed[it] == true) }
    }
    @Synchronized fun takeReady(): VoiceRecoveryCandidate? {
        if (closed) return null
        if (lost.isNotEmpty()) return VoiceRecoveryCandidate(lost.removeFirst(), null, CompletableDeferred())
        val capture = captures.values.firstOrNull { !it.inFlight && it.stopped?.let { stopped -> now() - stopped >= 1500 } == true } ?: return null
        capture.inFlight = true
        val chunks = if (!capture.failed && capture.bytes >= 12000) capture.chunks.toList() else null
        if (chunks == null) erase(capture) else { capture.chunks.clear(); capture.bytes = 0 }
        return VoiceRecoveryCandidate(capture.id, chunks, capture.cancelled)
    }
    @Synchronized fun recovered(id: String, text: String): JSONObject? {
        if (closed || id !in captures || text.isBlank()) return null
        resolve(id, true)
        return JSONObject().put("type", "zyra.input_audio_transcription.completed").put("item_id", id).put("role", "user").put("transcript", text)
    }
    @Synchronized fun failed(id: String) { resolve(id, false) }
    @Synchronized fun pause(value: Boolean) {
        paused = value
        if (value) { captures.values.forEach { it.cancelled.complete(Unit); erase(it); lost.add(it.id) }; captures.clear(); clearAudio(); while (lost.size > 8) lost.removeFirst() }
    }
    @Synchronized fun close() { closed = true; captures.values.forEach { it.cancelled.complete(Unit); erase(it) }; captures.clear(); lost.clear(); clearAudio() }
    private fun resolve(id: String, recovered: Boolean) {
        captures.remove(id)?.let { it.cancelled.complete(Unit); erase(it) }
        if (active == id) active = null
        completed[id] = recovered; while (completed.size > 256) completed.remove(completed.keys.first())
    }
    private fun erase(capture: Capture) { capture.chunks.forEach { it.fill(0) }; capture.chunks.clear(); capture.bytes = 0 }
    private fun clearAudio() { rolling.forEach { it.fill(0) }; rolling.clear(); rollingBytes = 0; pcm.reset(); captures.values.forEach { erase(it); it.failed = true }; active = null }
    companion object {
        const val MAX_BYTES = 120 * 24000 * 2
        const val PREROLL_BYTES = 650 * 48
        fun providerId(event: JSONObject) = listOf(event.optString("item_id"), event.optString("turn_id"), event.optJSONObject("turn")?.optString("id").orEmpty(), event.optJSONObject("item")?.optString("id").orEmpty()).firstOrNull { it.isNotBlank() && it.length <= 512 }
        fun userTranscript(event: JSONObject): Boolean {
            val type = event.optString("type")
            val role = event.optJSONObject("turn")?.optString("role")?.takeIf(String::isNotBlank) ?: event.optJSONObject("item")?.optString("role")?.takeIf(String::isNotBlank) ?: event.optString("role")
            return type.contains("input_audio_transcription") || type == "input_transcript.added" || role == "user" && (type.startsWith("turn.") || type.contains("transcript"))
        }
        private fun isCompletion(type: String) = type == "turn.done" || type.endsWith(".completed") || type.endsWith(".done")
        private fun completedText(event: JSONObject) = event.optJSONObject("turn")?.optString("transcript")?.takeIf(String::isNotBlank) ?: event.optString("transcript").ifBlank { event.optString("text") }
    }
}
