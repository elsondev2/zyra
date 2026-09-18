package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class ActiveWorkTest {
    @Test fun `narration after a tool remains work until the turn completes`() {
        val projection = TimelineWork()
        val user = TimelineItem("prompt", "user", "Check the change")
        val tool = TimelineItem("tool:one", "tool", "read\nsource", "tool")
        val narration = TimelineItem("narration", "assistant", "I found the cause. Checking the fix next.")
        val active = SessionView(id = "chat", running = true, items = listOf(user, tool, narration))
        val first = projection.rows(active).filterIsInstance<ChatRailRow.Work>().single()
        assertTrue(first.running)
        assertFalse(first.finalVisible)
        assertTrue(first.entries.any { it.id == narration.id })
        assertFalse(projection.rows(active).filterIsInstance<ChatRailRow.Message>().any { it.item.id == narration.id })
        val next = TimelineItem("tool:two", "tool", "bash\nChecking", "tool", pending = true)
        val working = projection.rows(active.copy(items = active.items + next)).filterIsInstance<ChatRailRow.Work>().single()
        assertEquals(first.id, working.id)
        assertFalse(working.finalVisible)
        val answer = TimelineItem("answer", "assistant", "The fix is verified.")
        val done = projection.rows(active.copy(running = false, items = active.items + next.copy(pending = false) + answer))
        val settled = done.filterIsInstance<ChatRailRow.Work>().single()
        assertEquals(first.id, settled.id)
        assertFalse(settled.running)
        assertTrue(settled.finalVisible)
        assertTrue(done.filterIsInstance<ChatRailRow.Message>().any { it.item.id == answer.id })
    }
}
