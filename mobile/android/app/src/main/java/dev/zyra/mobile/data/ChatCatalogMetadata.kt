package dev.zyra.mobile.data

object ChatCatalogMetadata {
    /** Late metadata may update known rows, but cannot restore an old page,
     * change its cursor, or overwrite newer titles/presence from live catalog. */
    fun merge(page: ChatPage, metadata: List<Chat>, pending: Boolean = false): ChatPage {
        val values = metadata.associateBy { it.key }
        return page.copy(chats = page.chats.map { chat ->
            values[chat.key]?.takeIf { chat.modifiedAt.isNotBlank() && it.modifiedAt == chat.modifiedAt }?.let {
                chat.copy(hasChanges = it.hasChanges ?: chat.hasChanges.takeIf { pending },
                    hasWork = it.hasWork ?: chat.hasWork.takeIf { pending })
            } ?: chat
        })
    }
}
