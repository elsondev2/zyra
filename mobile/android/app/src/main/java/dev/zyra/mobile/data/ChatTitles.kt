package dev.zyra.mobile.data

object ChatTitles {
    fun initial(current: String, prompt: String): String {
        if (current !in listOf("", "New chat", "Untitled chat")) return current
        return MessageAttachments.parse(prompt).body.lineSequence().firstOrNull().orEmpty().trim().take(80).ifBlank { current }
    }
    fun current(pages: Map<String, ChatPage>, machineId: String?, chatId: String, fallback: String): String =
        pages[machineId]?.chats?.firstOrNull { it.id == chatId && it.machineId == machineId }?.title
            ?.takeUnless { it.isBlank() || it == "New chat" || it == "Untitled chat" } ?: fallback
}
