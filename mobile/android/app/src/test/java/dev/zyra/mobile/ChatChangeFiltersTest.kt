package dev.zyra.mobile
import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test
class ChatChangeFiltersTest {
    private fun chat(changes: Boolean?, work: Boolean?) = Chat("chat", "Chat", "project", "idle", null, false, hasChanges = changes, hasWork = work)
    @Test fun `unknown data never pretends there are no changes`() {
        assertFalse(chatVisibleInFilter(chat(null, null), "no-changes"))
        assertFalse(chatVisibleInFilter(chat(null, null), "no-work"))
        assertFalse(chatVisibleInFilter(chat(null, null), "changes"))
    }
    @Test fun `change and work filters use independent canonical summaries`() {
        assertTrue(chatVisibleInFilter(chat(true, true), "changes"))
        assertTrue(chatVisibleInFilter(chat(false, true), "no-changes"))
        assertFalse(chatVisibleInFilter(chat(false, true), "no-work"))
        assertTrue(chatVisibleInFilter(chat(false, false), "no-work"))
        assertFalse(chatVisibleInFilter(chat(true, true).copy(archived = true), "changes"))
    }
}
