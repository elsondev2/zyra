package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class WorkSegmentsTest {
    private fun tool(id: String, name: String, intent: String? = null) = TimelineItem("tool:$id", "tool", "$name\nresult", "tool",
        raw = org.json.JSONObject().put("toolName", name).put("actionBatchIntent", intent).toString())
    @Test fun `mixed actions separated by invisible call envelopes form one run`() {
        val first = tool("one", "bash", "Inspect the project")
        val second = tool("two", "read")
        val envelope = TimelineItem("call", "assistant", "", toolNames = listOf("read"))
        val group = ChatRailRow.Work("work", listOf(first, envelope, second), false, true,
            listOf(WorkActions.project(first), WorkActions.project(second)))
        val segments = workSegments(group)
        assertEquals(1, segments.size)
        val actions = (segments.single() as WorkSegment.Actions).actions
        assertEquals(2, actions.size)
        assertEquals("Inspect the project", workSegmentTitle(actions))
    }
    @Test fun `narration and pending questions remain visible boundaries`() {
        val first = tool("one", "bash")
        val second = tool("two", "read")
        val note = TimelineItem("note", "assistant", "Now checking the result.")
        val question = TimelineItem("question", "system", "", "user_input_requested", pending = true)
        val group = ChatRailRow.Work("work", listOf(first, note, second, question), true, false,
            listOf(WorkActions.project(first), WorkActions.project(second)))
        assertEquals(listOf("actions", "note", "actions", "question"), workSegments(group).map {
            if (it is WorkSegment.Content) it.item.id else "actions"
        })
    }
    @Test fun `latest declared intent wins and live action is fallback`() {
        val first = WorkActions.project(tool("one", "bash", "Check input"))
        val last = WorkActions.project(tool("two", "read", "Verify output"))
        assertEquals("Verify output", workSegmentTitle(listOf(first, last)))
        assertEquals(first.title, workSegmentTitle(listOf(first.copy(batch = null, item = first.item.copy(pending = true)), last.copy(batch = null))))
    }
    @Test fun `hidden reasoning and composer questions do not split consecutive actions`() {
        val first = tool("one", "bash")
        val second = tool("two", "read")
        val thought = TimelineItem("thought", "assistant", "", reasoning = "Checking possibilities")
        val question = TimelineItem("question", "system", "Answer needed", "user_input_requested", pending = true)
        val group = ChatRailRow.Work("work", listOf(first, thought, question, second), true, false,
            listOf(WorkActions.project(first), WorkActions.project(second)))
        val hidden = workSegments(group, showThoughtProcesses = false, showQuestions = false)
        assertEquals(1, hidden.size)
        assertEquals(2, (hidden.single() as WorkSegment.Actions).actions.size)
        assertEquals(4, workSegments(group).size)
    }
}
