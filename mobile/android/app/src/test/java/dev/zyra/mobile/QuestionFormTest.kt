package dev.zyra.mobile

import dev.zyra.mobile.data.QuestionForm
import org.junit.Assert.*
import org.junit.Test

class QuestionFormTest {
    private val raw = """{"questions":[{"id":"choice","type":"single_select","question":"Choose a direction","options":[{"label":"First","recommended":true},{"label":"Second"}]},{"id":"notes","type":"text","question":"Anything else?","required":false}]}"""
    @Test fun `recommendations require an explicit choice`() {
        val questions = QuestionForm.questions(raw)
        assertFalse(QuestionForm.valid(questions, "{}"))
        assertTrue(QuestionForm.values("{}", "choice").isEmpty())
    }
    @Test fun `serialized answers restore by question id and preserve multiline text`() {
        val questions = QuestionForm.questions(raw)
        var saved = QuestionForm.change("{}", "choice", listOf("Second"))
        saved = QuestionForm.change(saved, "notes", listOf("First line\nSecond line"))
        assertTrue(QuestionForm.valid(questions, saved))
        val response = QuestionForm.response(questions, saved)
        assertEquals("Second", response.getString("choice"))
        assertEquals("First line\nSecond line", response.getString("notes"))
        assertTrue(QuestionForm.values(saved, "another-request").isEmpty())
    }
    @Test fun `multi select stays array and optional unanswered fields stay empty`() {
        val questions = QuestionForm.questions("""{"questions":[{"id":"list","type":"multi_select","question":"Pick","options":["A","B"]},{"id":"optional","type":"text","required":false}]}""")
        val response = QuestionForm.response(questions, QuestionForm.change("{}", "list", listOf("A", "B")))
        assertEquals(listOf("A", "B"), (0 until response.getJSONArray("list").length()).map { response.getJSONArray("list").getString(it) })
        assertEquals("", response.getString("optional"))
    }
    @Test fun `malformed or empty questions cannot be submitted`() {
        assertFalse(QuestionForm.valid(QuestionForm.questions("invalid"), "{}"))
        assertThrows(IllegalArgumentException::class.java) { QuestionForm.response(QuestionForm.questions(raw), "{}") }
    }
}
