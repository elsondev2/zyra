package dev.zyra.mobile.data

data class ChatPage(val chats: List<Chat> = emptyList(), val nextCursor: String? = null, val query: String = "")
object ChatCatalog {
    fun merge(pages: Map<String, ChatPage>, machine: String?, query: String): List<Chat> = pages
        .filter { (id, page) -> (machine == null || id == machine) && page.query == query }
        .values.flatMap { it.chats }.distinctBy { it.key }
        .sortedWith(compareByDescending<Chat> { it.modifiedAt }.thenBy { it.key })
}
