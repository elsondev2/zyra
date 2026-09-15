package dev.zyra.mobile

import dev.zyra.mobile.data.MarkdownEditing
import org.junit.Assert.*
import org.junit.Test

class MarkdownEditingTest {
    @Test fun `task checkboxes preserve list markers spacing and CRLF`() {
        val source = "- [X] **Done**\r\n- [ ] Pending\r\n- Plain item"
        val entries = MarkdownEditing.taskListEntries(source)!!
        assertEquals(3, entries.size)
        assertTrue(entries[0].checked)
        assertEquals("**Done**", entries[0].body.text)
        assertEquals(source.replace("[ ]", "[x]"), MarkdownEditing.toggleTask(source, entries[1], true))
        assertEquals(source.replace("Pending", "Updated"), MarkdownEditing.replace(source, entries[1].body.start, entries[1].body.end, "Updated"))
        assertNull(entries[2].checkedOffset)
    }
    @Test fun `task continuation source stays intact when only checkbox changes`() {
        val source = "* [ ] First\n  continuation\n* [x] Other"
        val item = MarkdownEditing.taskListEntries(source)!!.first()
        assertTrue(item.body.text.contains("\n  continuation"))
        assertEquals(source.replaceFirst("[ ]", "[x]"), MarkdownEditing.toggleTask(source, item, true))
    }
    @Test fun `section edits preserve CRLF whitespace tables and reference definitions`() {
        val source = "# Heading\r\n\r\nA paragraph.\r\n\r\n| A | B |\r\n| - | - |\r\n| x | y |\r\n\r\n[ref]: relative.md\r\n"
        val before = MarkdownEditing.buffer(source)
        val after = MarkdownEditing.update(before, 1, "Changed **here**.")
        assertEquals(source.replace("A paragraph.", "Changed **here**."), after.text)
        assertEquals(before.sections.size, after.sections.size)
        after.sections.forEach { assertEquals(it.source, after.text.substring(it.start,it.end)) }
    }
    @Test fun `empty file first edit keeps the same editor slot and later edits`() {
        var buffer = MarkdownEditing.buffer("")
        buffer = MarkdownEditing.update(buffer, 0, "h")
        buffer = MarkdownEditing.update(buffer, 0, "hello")
        assertEquals("hello", buffer.text)
        assertEquals(1, buffer.sections.size)
    }
    @Test fun `document containing only definitions gets an appended field without rewriting definitions`() {
        val source = "[ref]: https://example.com\n"
        val buffer = MarkdownEditing.update(MarkdownEditing.buffer(source),0,"Hello")
        assertEquals(source + "\nHello", buffer.text)
    }
    @Test fun `append after table preserves source and adds exactly one paragraph gap`() {
        val source = "| A | B |\n| - | - |\n| x | y |"
        var buffer = MarkdownEditing.buffer(source)
        buffer = MarkdownEditing.update(buffer,buffer.sections.lastIndex,"h")
        buffer = MarkdownEditing.update(buffer,buffer.sections.lastIndex,"hello")
        assertEquals(source + "\n\nhello",buffer.text)
        assertEquals("hello",buffer.sections.last().source)
    }
    @Test fun `table pipes are escaped idempotently including existing escapes and empty cells`() {
        assertEquals(" a\\|b ",MarkdownEditing.tableCell(" a\\|b ", "a\\|b"))
        assertEquals(" a\\|b ",MarkdownEditing.tableCell(" old ", "a|b"))
        assertEquals("a\\\\\\|b",MarkdownEditing.tableCell("old", "a\\\\|b"))
        val rows = MarkdownEditing.tableRows("| A | B |\r\n| - | - |\r\n|| a\\|b |")
        assertEquals(2,rows.size)
        assertEquals(2,rows.last().size)
        assertEquals("",rows.last().first().text)
        assertEquals(" a\\|b ",rows.last().last().text)
    }
    @Test fun `fenced code retains marker info and CRLF including empty body`() {
        val source = "~~~~kotlin\r\nval n = 1\r\n~~~~"
        assertEquals("val n = 1",MarkdownEditing.codeBody(source).text)
        assertEquals("~~~~kotlin\r\nval n = 2\r\n~~~~",MarkdownEditing.replaceCodeBody(source,"val n = 2"))
        assertEquals("```kt\nhello\n```",MarkdownEditing.replaceCodeBody("```kt\n```","hello"))
    }
    @Test fun `quotes keep authored prefixes and nested syntax`() {
        assertEquals("> new\r\n>> nested",MarkdownEditing.replaceQuotedBody("> old\r\n>> nested","new\n> nested"))
    }
    @Test fun `inline image ranges preserve adjacent source and fragment spacing`() {
        val source = "Before ![cat](cat.png) after."
        val image = MarkdownEditing.inlineImages(source)!!.single()
        assertEquals("![cat](cat.png)",image.text)
        assertEquals("Changed ",MarkdownEditing.fragment("Before ","Changed"))
        assertEquals("Changed ![cat](cat.png) after.",MarkdownEditing.replace(source,0,image.start,MarkdownEditing.fragment("Before ","Changed")))
    }
}

