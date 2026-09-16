package dev.zyra.mobile

import dev.zyra.mobile.data.MarkdownDocument
import dev.zyra.mobile.data.MarkdownLinks
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.strikethrough.Strikethrough
import org.commonmark.ext.footnotes.FootnoteReference
import org.commonmark.ext.task.list.items.TaskListItemMarker
import org.commonmark.node.*
import org.junit.Assert.*
import org.junit.Test

class MarkdownTest {
    @Test fun imageLabelsComeFromAuthoredAltTextAndOnlyTwelveImagesCanLoadPerMessage() {
        val document = MarkdownDocument.parse("![**Mobile** preview](<C:/project/hello world.png> \"not the alt\")\n\n```md\n![code](secret.png)\n```\n\n" + (1..20).joinToString("\n\n") { "![](image$it.png)" })
        val images = MarkdownDocument.images(document)
        assertEquals(12, images.size)
        assertEquals("Mobile preview", MarkdownDocument.imageAlt(images.first()))
        assertEquals("C:/project/hello world.png", images.first().destination)
        assertFalse(images.any { it.destination == "secret.png" })
        assertEquals("Image", MarkdownDocument.imageAlt(images.last()))
    }
    @Test fun tablesRetainHeadersAlignmentAndFormattedCells() {
        val document = MarkdownDocument.parse("| Project | Status |\n|:---|---:|\n| **Zyra** | Ready |")
        assertTrue(document.firstChild is TableBlock)
        val rows = MarkdownDocument.children(document.firstChild).flatMap { MarkdownDocument.children(it) }
        assertEquals(2, rows.size)
        assertTrue((rows.first().firstChild as TableCell).isHeader)
        assertEquals(TableCell.Alignment.RIGHT, (rows.first().lastChild as TableCell).alignment)
        val roundTrip = MarkdownDocument.parse(MarkdownDocument.source(document.firstChild))
        assertTrue(roundTrip.firstChild is TableBlock)
        assertTrue(MarkdownDocument.source(document.firstChild).contains("**Zyra**"))
    }
    @Test fun codeAndStrikethroughSurviveTheRenderingDocument() {
        val code = MarkdownDocument.parse("~~~kotlin\nval hello = 1\n~~~").firstChild as FencedCodeBlock
        assertEquals("kotlin", code.info)
        assertEquals("val hello = 1\n", code.literal)
        assertTrue(MarkdownDocument.parse("~~completed~~").firstChild.firstChild is Strikethrough)
    }
    @Test fun taskMarkersAreSemanticAndNeverConsumeNestedContent() {
        val root = MarkdownDocument.parse("- [x] **Ready**\n  - [ ] Nested\n- [ ] Pending")
        val list = root.firstChild
        val first = list.firstChild
        assertTrue((first.firstChild as TaskListItemMarker).isChecked)
        assertEquals("Ready", MarkdownDocument.plainText(first.firstChild.next))
        val nested = first.lastChild as BulletList
        assertFalse((nested.firstChild.firstChild as TaskListItemMarker).isChecked)
        assertEquals("Nested", MarkdownDocument.plainText(nested.firstChild))
        assertFalse((list.lastChild.firstChild as TaskListItemMarker).isChecked)
        assertEquals("[x] ordinary text", MarkdownDocument.plainText(MarkdownDocument.parse("[x] ordinary text")))
    }
    @Test fun bareWebLinksAndEmailDoNotAlterCodeOrExistingLinks() {
        val root = MarkdownDocument.parse("Visit https://example.com/docs, email dev@example.com. `https://code.example.com` [docs](https://example.org).")
        val nodes = MarkdownDocument.children(root.firstChild)
        val links = nodes.filterIsInstance<Link>()
        assertEquals(listOf("https://example.com/docs", "mailto:dev@example.com", "https://example.org"), links.map { it.destination })
        assertEquals("https://code.example.com", nodes.filterIsInstance<Code>().single().literal)
        assertEquals("https://github.com/openai/codex", MarkdownLinks.external("github.com/openai/codex"))
        assertFalse(MarkdownLinks.isProjectFile("github.com/openai/codex"))
        assertNull(MarkdownLinks.external("javascript:alert(1)"))
        assertNull(MarkdownLinks.external("https://"))
        assertNull(MarkdownLinks.external("https://example.com/\nspoof"))
        assertTrue(MarkdownLinks.isProjectFile("src/main.kt:8"))
    }
    @Test fun footnotesFollowUseOrderAndReuseOneDefinition() {
        val root = MarkdownDocument.parse("One[^later]. Two[^first]. Again[^later].\n\n[^first]: First **definition**.\n[^later]: Later definition.\n[^unused]: Hidden.")
        val notes = MarkdownDocument.footnotes(root)
        assertEquals(listOf("later", "first"), notes.map { it.label })
        assertEquals(3, MarkdownDocument.children(root.firstChild).filterIsInstance<FootnoteReference>().size)
        assertEquals("First definition.", MarkdownDocument.plainText(notes[1]))
    }
    @Test fun referencesInsideUnusedDefinitionsDoNotLeakIntoTheDocument() {
        val root = MarkdownDocument.parse("Read[^one].\n\n[^unused]: Should not show[^hidden].\n[^hidden]: Hidden.\n[^one]: Visible and nested[^two].\n[^two]: More.")
        assertEquals(listOf("one", "two"), MarkdownDocument.footnotes(root).map { it.label })
    }
    @Test fun headingsUseDesktopDuplicateSuffixAndSourcesRetainExactOffsets() {
        val source = "# Guide\n\n## Setup\n\nText.\n\n## Setup\n\n### Setup-2\n\n## Café"
        val root = MarkdownDocument.parse(source)
        assertEquals(listOf("guide", "setup", "setup-2", "setup-2-2", "café"), MarkdownDocument.headings(root).values.toList())
        val heading = root.firstChild.next
        val span = heading.sourceSpans.single()
        assertEquals("## Setup", source.substring(span.inputIndex, span.inputIndex + span.length))
        assertSame(root, MarkdownDocument.parse(source))
    }
    @Test fun sectionGapsPreserveHierarchyAndNestedParagraphSeparation() {
        val root = MarkdownDocument.parse("Paragraph.\n\n## Section\n\nAnother.\n\nFinal.")
        val paragraph = root.firstChild
        val heading = paragraph.next
        assertEquals(0, MarkdownDocument.gapBefore(null, paragraph))
        assertEquals(28, MarkdownDocument.gapBefore(paragraph, heading))
        assertEquals(12, MarkdownDocument.gapBefore(heading, heading.next))
        assertEquals(16, MarkdownDocument.gapBefore(heading.next, heading.next.next))
        assertEquals(6, MarkdownDocument.gapBefore(heading.next, heading.next.next, compact = true))
    }
    @Test fun codeFenceLabelsUseTheSameFilenameMetadataAsDesktop() {
        assertEquals("App.kt", MarkdownDocument.fenceTitle("kotlin title=\"App.kt\""))
        assertEquals("src/long name.kt", MarkdownDocument.fenceTitle("kotlin filename='src/long name.kt'"))
        assertEquals("src/App.tsx", MarkdownDocument.fenceTitle("tsx src/App.tsx"))
        assertEquals("kotlin", MarkdownDocument.fenceTitle("kotlin"))
        assertEquals("Code", MarkdownDocument.fenceTitle(""))
    }
}

