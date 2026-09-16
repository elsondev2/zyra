package dev.zyra.mobile

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import com.mohamedrejeb.richeditor.model.RichTextState
import dev.zyra.mobile.data.MarkdownEditing
import org.junit.Assert.*
import org.junit.Test

class RichMarkdownEditingTest {
    @Test fun `link color is themed before first rendered editor frame`() {
        val theme = androidx.compose.ui.graphics.Color(0xffd29e60)
        val state = RichTextState().apply { config.linkColor = theme }.setHtml(MarkdownEditing.importHtml("[guide](guide.md)"))
        assertTrue(state.annotatedString.spanStyles.any { it.item.color == theme })
        assertEquals("[guide](guide.md)",state.toMarkdown().trim())
    }
    private fun replaceFromIme(state: RichTextState, replacement: String) {
        val range = state.selection
        val next = state.annotatedString.text.replaceRange(range.min, range.max, replacement)
        // Invoke the real callback BasicRichTextEditor gives BasicTextField; the public helper
        // intentionally performs separate delete+insert operations and isn't an IME edit.
        val callback = RichTextState::class.java.methods.single { it.name.startsWith("onTextFieldValueChange") }
        callback.invoke(state, TextFieldValue(next, TextRange(range.min + replacement.length)))
    }
    @Test fun `replacing full rendered bold selection keeps balanced formatting and following link`() {
        val state = RichTextState().setHtml(MarkdownEditing.importHtml("A **bold** B [link](https://example.com)"))
        val start = state.annotatedString.text.indexOf("bold")
        state.selection = TextRange(start,start + 4)
        replaceFromIme(state,"new")
        val html = MarkdownEditing.importHtml(state.toMarkdown())
        assertTrue(html,html.contains("<strong>new</strong>"))
        assertTrue(html,html.contains("href=\"https://example.com\""))
        assertEquals("A new B link",state.annotatedString.text.trim())
    }
    @Test fun `replacing link label keeps its hidden destination intact`() {
        val state = RichTextState().setHtml(MarkdownEditing.importHtml("See [linked words](relative.md#L12) and **bold**."))
        val start = state.annotatedString.text.indexOf("linked words")
        state.selection = TextRange(start,start + "linked words".length)
        replaceFromIme(state,"changed")
        val html = MarkdownEditing.importHtml(state.toMarkdown())
        assertTrue(html,html.contains("href=\"relative.md#L12\""))
        assertTrue(html,html.contains(">changed</a>"))
        assertTrue(html,html.contains("<strong>bold</strong>"))
    }
    @Test fun `same length replacement preserves nested inline formatting`() {
        val state = RichTextState().setHtml(MarkdownEditing.importHtml("A **bold *word*** end"))
        val start = state.annotatedString.text.indexOf("word")
        state.selection = TextRange(start,start + 4)
        replaceFromIme(state,"edit")
        val html = MarkdownEditing.importHtml(state.toMarkdown())
        assertTrue(html,html.contains("<em>edit</em>"))
        assertTrue(html,html.contains("<strong>"))
    }
    @Test fun `editing table text with escaped pipe keeps it in one cell`() {
        val source = " a\\|b "
        val state = RichTextState().setHtml(MarkdownEditing.importHtml(source))
        state.selection = TextRange(state.annotatedString.text.length)
        replaceFromIme(state,"!")
        val output = MarkdownEditing.tableCell(source,state.toMarkdown())
        val rows = MarkdownEditing.tableRows("| A | B |\n| - | - |\n|$output| c |")
        assertEquals(2,rows.last().size)
        assertEquals(" a\\|b! ",rows.last().first().text)
    }
}



