package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.task.list.items.TaskListItemMarker
import org.commonmark.node.*
import org.junit.Assert.*
import org.junit.Test

class MarkdownHtmlTest {
    private fun nodes(root: Node): List<Node> = listOf(root) + MarkdownDocument.children(root).flatMap(::nodes)
    private fun render(text: String) = MarkdownHtml.render(MarkdownDocument.parse(text), text.length)

    @Test fun htmlDetailsRetainTheirMarkdownContentAndLeaveTheSourceTreeUntouched() {
        val text = "<details open>\n<summary><strong>Build details</strong></summary>\n\n## Result\n\nFirst paragraph.\n\n- [x] **Checked**\n- [ ] Review\n\n</details>"
        val source = MarkdownDocument.parse(text)
        val before = MarkdownDocument.children(source).map { it.javaClass to it.sourceSpans.toList() }
        val rendered = MarkdownHtml.render(source, text.length)
        val detail = nodes(rendered).filterIsInstance<MarkdownHtmlDetails>().single()
        assertTrue(detail.open)
        assertEquals("Build details", MarkdownDocument.plainText(detail.summary))
        assertTrue(nodes(detail.summary).any { it is StrongEmphasis })
        assertEquals("Result", MarkdownDocument.plainText(nodes(detail).filterIsInstance<Heading>().single()))
        assertEquals(listOf(true, false), nodes(detail).filterIsInstance<TaskListItemMarker>().map { it.isChecked })
        assertEquals(before, MarkdownDocument.children(source).map { it.javaClass to it.sourceSpans.toList() })
        assertSame(source, MarkdownDocument.parse(text))
        assertSame(rendered, MarkdownHtml.render(source, text.length))
    }
    @Test fun unsafeHtmlHasNoExecutableOrExternalEmbeddingSurface() {
        val rendered = render("<div onclick=\"steal()\"><strong>Visible</strong><script>secret()</script><iframe src=\"https://example.com\">frame</iframe><style>secret style</style><img src=\"javascript:steal()\" alt=\"Fallback\"><a href=\"javascript:steal()\">Inert</a></div>")
        val all = nodes(rendered)
        assertTrue(all.any { it is StrongEmphasis })
        assertFalse(all.any { it is HtmlBlock || it is HtmlInline })
        assertFalse(all.filterIsInstance<Link>().any { it.destination.startsWith("javascript:") })
        assertFalse(all.filterIsInstance<Image>().any { it.destination.startsWith("javascript:") })
        val text = MarkdownDocument.plainText(rendered)
        assertTrue(text.contains("Visible")); assertTrue(text.contains("Fallback")); assertTrue(text.contains("Inert"))
        assertFalse(text.contains("secret")); assertFalse(text.contains("frame"))
    }
    @Test fun inlineHtmlFormattingPreservesOrdinaryMarkdownLinksAndFencedMetadata() {
        val rendered = render("A <strong>bold</strong> **Markdown** word.<br>Next <em>emphasis</em> and <sup>2</sup>.\n\n[local](src/main.kt:8) and [web](https://example.com).\n\n```kotlin title=\"Main.kt\"\nval ready = true\n```")
        val all = nodes(rendered)
        assertEquals(2, all.filterIsInstance<StrongEmphasis>().size)
        assertEquals(listOf("src/main.kt:8", "https://example.com"), all.filterIsInstance<Link>().map { it.destination })
        assertTrue(all.any { it is HardLineBreak })
        assertTrue(all.filterIsInstance<MarkdownHtmlScript>().single().superscript)
        val code = all.filterIsInstance<FencedCodeBlock>().single()
        assertEquals("kotlin title=\"Main.kt\"", code.info)
        assertEquals("val ready = true\n", code.literal)
    }
    @Test fun tablesAndFootnoteTargetsSurviveHtmlConversion() {
        val rendered = render("<span>Table</span>\n\n| Name | State |\n|:---|---:|\n| **Zyra** | Ready |\n\nNote[^one].\n\n[^one]: Footnote content.")
        val all = nodes(rendered)
        assertEquals(1, all.filterIsInstance<TableBlock>().size)
        val cells = all.filterIsInstance<TableCell>()
        assertEquals(4, cells.size)
        assertTrue(cells.first().isHeader)
        assertEquals(TableCell.Alignment.RIGHT, cells[1].alignment)
        assertTrue(MarkdownHtml.anchors(rendered).values.any { it.startsWith("fn-") })
        assertTrue(all.filterIsInstance<Link>().any { it.destination.startsWith("#fn-") })
        assertTrue(MarkdownDocument.plainText(rendered).contains("Footnote content."))
    }
    @Test fun imagesRemainReferencesAndCollapsedDetailsRemainClosed() {
        val rendered = render("<details><summary>Images</summary><p><img src=\"./local.png\" alt=\"Local\"><img src=\"https://example.com/remote.png\" alt=\"Remote\"></p></details>")
        val detail = nodes(rendered).filterIsInstance<MarkdownHtmlDetails>().single()
        assertFalse(detail.open)
        assertEquals(listOf("./local.png", "https://example.com/remote.png"), nodes(detail).filterIsInstance<Image>().map { it.destination })
        assertEquals(listOf("Local", "Remote"), nodes(detail).filterIsInstance<Image>().map(MarkdownDocument::imageAlt))
    }
    @Test fun ordinaryMarkdownAvoidsConversionAndOversizedOrDeepHtmlFallsBackSafely() {
        val normal = MarkdownDocument.parse("# Heading\n\nOrdinary **text**.")
        assertSame(normal, MarkdownHtml.render(normal, 30))
        val huge = MarkdownDocument.parse("<div>Large</div>")
        assertSame(huge, MarkdownHtml.render(huge, 160_001))
        val deepText = "<div>".repeat(110) + "Deep" + "</div>".repeat(110)
        val deep = MarkdownDocument.parse(deepText)
        assertSame(deep, MarkdownHtml.render(deep, deepText.length))
    }
}
