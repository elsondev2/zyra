package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class ChatCatalogPagingTest {
    @Test fun emptyFilteredPagesKeepPagingWhenTheHostCursorAdvances() {
        val first = ChatCatalogPaging.cursor(mapOf("pc" to ChatPage(nextCursor = "page2")), null, "")
        val next = ChatCatalogPaging.cursor(mapOf("pc" to ChatPage(nextCursor = "page3")), null, "")
        assertNotNull(first)
        assertNotEquals(first, next)
        assertNull(ChatCatalogPaging.cursor(mapOf("pc" to ChatPage()), null, ""))
    }
    @Test fun queryAndMachineScopesExcludeUnrelatedPagination() {
        val pages = linkedMapOf("a" to ChatPage(nextCursor = "a2"), "b" to ChatPage(nextCursor = "b2", query = "find"))
        assertEquals(ChatCatalogPaging.cursor(mapOf("a" to pages.getValue("a")), null, ""), ChatCatalogPaging.cursor(pages, "a", ""))
        assertNull(ChatCatalogPaging.cursor(pages, "b", ""))
        assertNotNull(ChatCatalogPaging.cursor(pages, "b", "find"))
    }
    @Test fun aggregateCursorIsStableAcrossMachineMapOrdering() {
        val a = "a" to ChatPage(nextCursor = "x:|y")
        val b = "b" to ChatPage(nextCursor = "z")
        assertEquals(ChatCatalogPaging.cursor(linkedMapOf(a, b), null, ""), ChatCatalogPaging.cursor(linkedMapOf(b, a), null, ""))
    }
}
