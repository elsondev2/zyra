package dev.zyra.mobile.data

fun chatVisibleInFilter(chat: Chat, filter: String): Boolean = chat.archived == (filter == "archived") &&
    (filter != "attention" || chat.attention != null) && (filter != "working" || chat.working) &&
    (filter != "changes" || chat.hasChanges == true) && (filter != "no-changes" || chat.hasChanges == false) &&
    (filter != "no-work" || chat.hasWork == false)

/** Keep the canonical recency order within each section. */
fun chatInboxSections(chats: List<Chat>): List<Pair<String, List<Chat>>> = listOf(
    "Needs you" to chats.filter { it.attention != null },
    "Working" to chats.filter { it.attention == null && it.working },
    "Recent" to chats.filter { it.attention == null && !it.working }
).filter { it.second.isNotEmpty() }

