package dev.zyra.mobile.voice

import dev.zyra.mobile.data.TimelineItem
import org.json.JSONObject

data class VoiceTranscript(val id: String, val role: String, val text: String, val complete: Boolean = false,
    val providerId: String? = null, val canonicalId: String? = null, val delivery: String? = null, val placeholder: Boolean = false,
    val transcriptSource: String? = null, val startedAt: Long = System.currentTimeMillis())

/** Ephemeral presentation only. PC history is the source of saved messages.
 * Normalized transcript events come from the same adapter used by Desktop. */
class VoicePresentation(private val wallTime: () -> Long = { System.currentTimeMillis() }) {
    private val rows = LinkedHashMap<String, VoiceTranscript>()
    private val suppressed = LinkedHashSet<String>()
    // Keep the capability after reconciliation removes a saved row: late
    // physical mirrors must not reopen a completed logical utterance.
    private val turnSpeakers = mutableSetOf<String>()
    val entries get() = rows.values.toList()

    fun typed(id: String, text: String) { put(VoiceTranscript("typed:$id", "user", text, complete = true, providerId = "typed:$id", delivery = "sending", startedAt = rows["typed:$id"]?.startedAt ?: wallTime())) }
    fun delivery(id: String, state: String) { rows["typed:$id"]?.let { put(it.copy(delivery = state)) } }
    fun speech(providerId: String, state: String) {
        val id = "provider:user:$providerId"
        val previous = rows[id]
        if (previous?.complete == true && previous.delivery !in inputStates) return
        put(VoiceTranscript(id, "user", previous?.text ?: "Voice message", complete = state == "unavailable", providerId = providerId, delivery = state, placeholder = previous?.placeholder ?: true, startedAt = previous?.startedAt ?: wallTime()))
    }
    fun event(event: JSONObject) {
        val type = event.optString("type")
        if (type == "transcript.suppressed") {
            val id = "provider:${event.optString("role")}:${event.optString("providerItemId")}";
            rows.remove(id); suppressed.add(id)
            while (suppressed.size > 256) suppressed.remove(suppressed.first())
            return
        }
        if (type !in setOf("transcript.delta", "transcript.done", "composer.response.delta", "composer.response.done")) return
        val composer = type.startsWith("composer.")
        val providerId = if (composer) null else event.optString("providerItemId").takeIf { it.isNotBlank() }
        val identity = if (composer) event.optString("turnId") else providerId ?: return
        if (identity.isBlank() || identity.length > 512) return
        val role = if (composer) "assistant" else event.optString("role")
        if (role !in setOf("user", "assistant")) return
        val source = event.optString("transcriptSource").takeIf { it == "turn" || it == "chunk" }
        if (source == "chunk" && role in turnSpeakers) return
        // Logical turn IDs replace physical chunks without resetting the time
        // the first words appeared. Wall time is independent of recovery timers.
        val chunkStartedAt = if (source == "turn") rows.values.firstOrNull {
            it.role == role && it.transcriptSource == "chunk" && !it.complete
        }?.startedAt else null
        if (source == "turn") {
            turnSpeakers.add(role)
            rows.entries.removeAll { (_, row) -> row.role == role && row.transcriptSource == "chunk" && !row.complete }
        }
        val provisional = if (source == "chunk") rows.values.lastOrNull { it.role == role && it.transcriptSource == "chunk" && !it.complete } else null
        val id = provisional?.id ?: if (composer) "composer:$identity" else "provider:$role:$identity"
        if (id in suppressed) return
        val previous = rows[id]
        val done = type.endsWith(".done")
        if (!done && previous?.complete == true && previous.delivery != "unavailable") return
        val text = if (done) event.optString("text").ifBlank { if (composer) event.optString("error", "The Voice response ended without text.") else "" }
            else append(previous?.text?.takeUnless { previous.placeholder }.orEmpty(), event.optString("delta"))
        val canonical = event.optString("canonicalMessageId").takeIf(String::isNotBlank) ?: previous?.canonicalId
        if (done && source == null) rows.entries.removeAll { (_, row) -> row.id != id && row.role == role && row.transcriptSource == "chunk" && !row.complete }
        put(VoiceTranscript(id, role, text, done, provisional?.providerId ?: providerId, canonical, if (event.has("error")) "failed" else null, transcriptSource = source ?: previous?.transcriptSource, startedAt = previous?.startedAt ?: provisional?.startedAt ?: chunkStartedAt ?: wallTime()))
    }
    fun reconcile(canonical: List<TimelineItem>) {
        val keys = VoiceTimeline.identities(canonical)
        rows.entries.removeAll { (_, row) -> VoiceTimeline.isCommitted(row, keys) }
    }
    fun interrupted() { rows.replaceAll { _, row -> when { row.delivery == "sending" -> row.copy(delivery = "uncertain"); !row.complete -> row.copy(complete = true, delivery = "interrupted"); else -> row } } }
    private fun put(row: VoiceTranscript) {
        require(row.text.length <= 128 * 1024 && (rows.containsKey(row.id) || rows.size < 120) &&
            rows.values.sumOf { if (it.id == row.id) 0 else it.text.length } + row.text.length <= 400000) { "The Voice transcript is waiting for this PC to catch up. Reconnect before continuing." }
        rows[row.id] = row
    }
    companion object {
        private val inputStates = setOf("listening", "transcribing", "recovering", "unavailable")
        private fun append(current: String, value: String): String {
            val delta = if (current.isEmpty()) value.trimStart() else value
            if (current.isEmpty() || delta.startsWith(current)) return delta
            if (current.endsWith(delta)) return current
            for (size in minOf(current.length, delta.length) downTo 1) if (current.regionMatches(current.length - size, delta, 0, size)) return current + delta.substring(size)
            return current + delta
        }
    }
}

object VoiceTimeline {
    fun item(entry: VoiceTranscript) = TimelineItem("voice:" + entry.id, entry.role, entry.text, if (entry.complete) "message" else "stream",
        raw = JSONObject().put("timestamp", entry.startedAt).toString())

    data class Identity(val role: String, val canonical: String?, val provider: String?)
    fun identities(items: List<TimelineItem>): Set<Identity> = items.mapNotNull { item ->
        if (item.role !in setOf("user", "assistant")) return@mapNotNull null
        val raw = if (item.raw.contains("zyraCanonicalMessage")) runCatching { JSONObject(item.raw) }.getOrNull() else null
        val message = raw?.optJSONObject("message") ?: raw
        val metadata = message?.optJSONObject("zyraCanonicalMessage")
        Identity(item.role, metadata?.optString("canonicalMessageId")?.takeIf(String::isNotBlank)
            ?: item.id.removePrefix("message:").takeIf { item.id.startsWith("message:") }, metadata?.optString("providerItemId")?.takeIf(String::isNotBlank))
    }.toSet()
    fun isCommitted(row: VoiceTranscript, keys: Set<Identity>) = keys.any { it.role == row.role &&
        ((row.canonicalId != null && row.canonicalId == it.canonical) || (row.providerId != null && row.providerId == it.provider)) }
    fun pending(canonical: List<TimelineItem>, entries: List<VoiceTranscript>): List<VoiceTranscript> {
        val keys = identities(canonical)
        return entries.filter { it.text.isNotBlank() && !isCommitted(it, keys) }
    }
}
