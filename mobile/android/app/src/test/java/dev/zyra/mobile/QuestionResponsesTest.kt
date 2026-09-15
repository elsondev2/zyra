package dev.zyra.mobile
import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class QuestionResponsesTest {
    @Test fun `legacy labels and numbered fallback match canonical continuation`() {
        val requested = TimelineItem("q", "system", "", raw = """{"type":"user_input_requested","questions":[{"id":"a","label":"Color","prompt":"Which color?"},{"id":"b","prompt":"Which layout?"}]}""")
        val user = TimelineItem("a", "user", "Here are my answers:\n\n- Color: Paper\n- Question 2: Compact")
        assertEquals(listOf(QuestionAnswer("Which color?", "Paper"), QuestionAnswer("Which layout?", "Compact")), QuestionResponses.project(listOf(requested, user))["a"])
    }
    private val call = TimelineItem("call", "assistant", "", raw = """{"message":{"content":[{"type":"toolCall","name":"request_user_input","arguments":{"questions":[{"id":"q1","header":"Theme","question":"Which theme?"},{"id":"q2","header":"Style","question":"Which style?"}]}}]}}""")
    @Test fun `canonical multiline continuation becomes compact structured answers`() {
        val user = TimelineItem("answer", "user", "Here are my answers:\n\n- Theme: Paper\nwith soft borders\n- Style: Compact")
        val answers = QuestionResponses.project(listOf(call,user)).getValue("answer")
        assertEquals(2,answers.size); assertEquals("Which theme?", answers[0].question)
        assertEquals("Paper\nwith soft borders",answers[0].answer); assertEquals("Compact",answers[1].answer)
    }
    @Test fun `unrelated user message clears question association`() {
        assertTrue(QuestionResponses.project(listOf(call,TimelineItem("other","user","Continue"),TimelineItem("answer","user","Here are my answers:\n\n- Theme: Paper\n- Style: Compact"))).isEmpty())
    }
    @Test fun `partial or mismatched answers retain original message renderer`() {
        assertTrue(QuestionResponses.project(listOf(call,TimelineItem("answer","user","Here are my answers:\n\n- Theme: Paper"))).isEmpty())
    }
    @Test fun `pending question stays within preceding work block`() {
        val prompt=TimelineItem("u","user","Help")
        val answer=TimelineItem("a","assistant","Choose a theme first.")
        val question=TimelineItem("q","system","Answer needed","user_input_requested","""{"type":"user_input_requested","questions":[{"id":"q","question":"Which?"}]}""",true)
        val rows=TimelineWork().rows(SessionView(items=listOf(prompt,answer,question)))
        assertTrue(rows.filterIsInstance<ChatRailRow.Work>().single().entries.contains(question))
        assertFalse(rows.filterIsInstance<ChatRailRow.Message>().any { it.item.id == "q" })
        assertEquals("a",rows.last().id)
    }
    @Test fun `live resolution and canonical user turn render one structured answer bubble`() {
        val requested = org.json.JSONObject("""{"type":"user_input_requested","requestId":"request-one","questions":[{"id":"theme","header":"Theme","question":"Which theme?","type":"text"}]}""")
        fun apply(view: SessionView, sequence: Long, event: org.json.JSONObject) = TimelineReducer.apply(view, org.json.JSONObject().put("sequence", sequence).put("event", event))
        var view = apply(SessionView(id = "chat-one"), 1, requested)
        assertTrue(view.items.single().pending)
        view = apply(view, 2, org.json.JSONObject("""{"type":"user_input_resolved","requestId":"request-one","answers":{"theme":"Paper\nwith soft borders"}}"""))
        val text = "Here are my answers:\n\n- Theme: Paper\n- with soft borders"
        val event = org.json.JSONObject().put("type", "message_end").put("message", org.json.JSONObject().put("id", "answer-one").put("role", "user")
            .put("content", org.json.JSONArray().put(org.json.JSONObject().put("type", "text").put("text", text))))
        view = apply(view, 3, event)
        view = apply(view, 4, event)
        assertFalse(view.items.any { it.pending && it.kind == "user_input_requested" })
        val user = view.items.single { it.role == "user" }
        assertEquals(listOf(QuestionAnswer("Which theme?", "Paper\nwith soft borders")), QuestionResponses.project(view.items)[user.id])
    }
}
