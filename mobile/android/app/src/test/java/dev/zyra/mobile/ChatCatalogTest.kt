package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class ChatCatalogTest {
    private fun chat(machine: String, time: String) = Chat("same-id", "Conversation", "/project", "detached", null, false, machine, time)
    @Test fun mergesAllMachinesWithoutCollapsingSameLocalChatId() {
        val pages = mapOf("a" to ChatPage(listOf(chat("a", "2026-09-12"))), "b" to ChatPage(listOf(chat("b", "2026-09-14"))))
        assertEquals(listOf("b", "a"), ChatCatalog.merge(pages, null, "").map { it.machineId })
        assertEquals(listOf("a"), ChatCatalog.merge(pages, "a", "").map { it.machineId })
        assertTrue(ChatCatalog.merge(pages, null, "new query").isEmpty())
    }
}
