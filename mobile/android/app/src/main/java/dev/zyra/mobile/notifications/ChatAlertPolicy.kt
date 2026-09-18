package dev.zyra.mobile.notifications

import dev.zyra.mobile.data.Chat

/** One receipt per state transition, shared across reconnects and service restarts. */
class ChatAlertPolicy(private val seen: MutableMap<String, String>, private val startedAt: Long) {
    fun observe(chat: Chat, visibleKey: String?): String? {
        val token = "${chat.lastTurnId}:${chat.lastTurnState}:${chat.lastTurnCompletedAt}:${chat.attention.orEmpty()}"
        val old = seen.put(chat.key, token)
        while (seen.size > 1024) seen.remove(seen.keys.first())
        if (old == token || chat.key == visibleKey || chat.archived) return null
        if (chat.attention != null) return if (chat.attention.contains("approval", true)) "Approval needed" else "Your response is needed"
        if (chat.working) return null
        // Resolving a request must not repeat the completion alert for the same turn.
        if (old?.substringBeforeLast(":") == token.substringBeforeLast(":")) return null
        val recent = runCatching { java.time.Instant.parse(chat.lastTurnCompletedAt).toEpochMilli() >= startedAt }.getOrDefault(false)
        if (old == null && !recent) return null
        return when (chat.lastTurnState) { "completed" -> "Response ready"; "error", "failed" -> "Chat needs attention"; else -> null }
    }
}
