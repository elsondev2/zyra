package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class TimelineWorkTest {
    private val user = TimelineItem("user", "user", "Fix the layout")
    private val tool = TimelineItem("tool:build", "tool", "bash\nBUILD SUCCESSFUL", "tool")
    private val answer = TimelineItem("answer", "assistant", "The layout is fixed.")
    private val call = TimelineItem("call", "assistant", "", toolNames = listOf("bash"),
        raw = """{"message":{"role":"assistant","content":[{"type":"toolCall","id":"build","name":"bash","arguments":{"command":"npm run build"}}]}}""")
    @Test fun `image only final reply stays outside the work disclosure`() {
        val image = TimelineItem("image", "assistant", "", raw = """{"message":{"content":[{"type":"image","mediaRef":{"sha256":"image"}}]}}""")
        val rows = TimelineWork().rows(SessionView(items = listOf(user, call, tool, image)))
        assertEquals(image, (rows.last() as ChatRailRow.Message).item)
        assertTrue(rows.filterIsInstance<ChatRailRow.Work>().single().finalVisible)
    }
    @Test fun `partial older history retains its orphan tool output`() {
        val rows = TimelineWork().rows(SessionView(items = listOf(tool, answer)))
        assertEquals(tool, rows.filterIsInstance<ChatRailRow.Work>().single().actions.single().item)
        assertEquals(answer, (rows.last() as ChatRailRow.Message).item)
    }
    @Test fun `loading the earlier user boundary preserves the visible work key`() {
        val projector = TimelineWork()
        val partial = projector.rows(SessionView(items = listOf(tool, answer))).filterIsInstance<ChatRailRow.Work>().single()
        val full = projector.rows(SessionView(items = listOf(user, call, tool, answer))).filterIsInstance<ChatRailRow.Work>().single()
        assertEquals(partial.id, full.id)
    }
    @Test fun `a late tool result cannot hide the completed answer`() {
        val rows = TimelineWork().rows(SessionView(items = listOf(user, answer, tool)))
        assertEquals(answer, rows.filterIsInstance<ChatRailRow.Message>().last().item)
        assertTrue(rows.filterIsInstance<ChatRailRow.Work>().single().finalVisible)
        assertEquals(answer, (rows.last() as ChatRailRow.Message).item)
    }
    @Test fun `work uses command intent while final answer remains a separate bubble`() {
        val rows = TimelineWork().rows(SessionView(items = listOf(user, call, tool, answer)))
        assertEquals(listOf("user", "work:user", "answer"), rows.map { it.id })
        val work = rows[1] as ChatRailRow.Work
        assertEquals("Building project", work.actions.single().title)
        assertEquals("BUILD SUCCESSFUL", work.actions.single().output)
        assertTrue(work.finalVisible); assertFalse(work.running)
    }
    @Test fun `reasoning belongs to work and does not repeat final response`() {
        val rows = TimelineWork().rows(SessionView(items = listOf(user, answer.copy(reasoning = "Checking the layout."))))
        val work = rows.filterIsInstance<ChatRailRow.Work>().single()
        assertEquals("", work.entries.single().text)
        assertEquals("Checking the layout.", work.entries.single().reasoning)
        assertEquals("", (rows.last() as ChatRailRow.Message).item.reasoning)
        assertEquals(answer.text, (rows.last() as ChatRailRow.Message).item.text)
    }
    @Test fun `pending approval remains actionable outside the disclosure`() {
        val approval = TimelineItem("approval", "system", "Approve command", "approval_requested", pending = true)
        val rows = TimelineWork().rows(SessionView(items = listOf(user, call, tool.copy(pending = true), approval), running = true))
        assertTrue(rows.filterIsInstance<ChatRailRow.Work>().single().running)
        assertEquals(approval, (rows.last() as ChatRailRow.Message).item)
    }
    @Test fun `voice turns and repeated plain replies keep separate identities`() {
        val messages = listOf(user.copy(id = "message:voice_user_one"), answer.copy(id = "message:voice_assistant_one"), answer.copy(id = "message:voice_assistant_two"))
        assertEquals(messages, TimelineWork().rows(SessionView(items = messages)).filterIsInstance<ChatRailRow.Message>().map { it.item })
    }
    @Test fun `only latest user turn stays working and work identity survives completion`() {
        val projector = TimelineWork()
        val first = projector.rows(SessionView(items = listOf(user, call, tool), running = true)).filterIsInstance<ChatRailRow.Work>().single()
        val finished = projector.rows(SessionView(items = listOf(user, call, tool, answer, user.copy(id = "next"), tool.copy(id = "tool:next")), running = true))
        val groups = finished.filterIsInstance<ChatRailRow.Work>()
        assertEquals(first.id, groups.first().id); assertFalse(groups.first().running); assertTrue(groups.last().running)
    }
    @Test fun `declared action batch is metadata and never a command card`() {
        val marker = TimelineItem("marker", "assistant", "", toolNames = listOf("begin_action_batch"), raw = """{"message":{"content":[{"type":"toolCall","id":"batch","name":"begin_action_batch","arguments":{"title":"Verify the layout"}}]}}""")
        val rows = TimelineWork().rows(SessionView(items = listOf(user, marker, TimelineItem("tool:batch", "tool", "begin_action_batch", "tool"), call, tool, answer)))
        val actions = rows.filterIsInstance<ChatRailRow.Work>().single().actions
        assertEquals(1, actions.size); assertEquals("Verify the layout", actions.single().batch)
    }
}
