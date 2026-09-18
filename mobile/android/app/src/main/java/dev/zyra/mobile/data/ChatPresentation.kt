package dev.zyra.mobile.data

fun chatVisibleInFilter(chat: Chat, filter: String): Boolean = chat.archived == (filter == "archived") &&
    (filter != "attention" || chat.attention != null) && (filter != "working" || chat.working) &&
    (filter != "changes" || chat.hasChanges == true) && (filter != "no-changes" || chat.hasChanges == false) &&
    (filter != "no-work" || chat.hasWork == false)

/** Keep the canonical recency order within each section. */
fun chatInboxSections(chats: List<Chat>): List<Pair<String, List<Chat>>> = chatInboxSections(chats, emptyMap())

fun chatInboxSections(chats: List<Chat>, settlements: Map<String, String>): List<Pair<String, List<Chat>>> = listOf(
    "Needs you" to chats.filter { it.attention != null },
    "Working" to chats.filter { it.attention == null && it.working },
    "Recent" to chats.filter { it.attention == null && !it.working && !ChatSettlement.isSettled(it, settlements) },
    "Settled" to chats.filter { ChatSettlement.isSettled(it, settlements) }
).filter { it.second.isNotEmpty() }


/** Only the canonical active turn start is a clock; catalog recency is not. */
fun chatWorkingDuration(chat: Chat, now: Long = System.currentTimeMillis()): String? {
    if (!chat.working) return null
    val started = runCatching { java.time.Instant.parse(chat.activeTurnStartedAt).toEpochMilli() }.getOrNull() ?: return null
    val seconds = ((now - started).coerceAtLeast(0) / 1000)
    return when {
        seconds < 60 -> "${seconds}s"
        seconds < 3600 -> "${seconds / 60}m ${seconds % 60}s"
        else -> "${seconds / 3600}h ${(seconds % 3600) / 60}m"
    }
}
