package dev.zyra.mobile.data

import org.commonmark.node.*
import org.commonmark.parser.IncludeSourceSpans
import org.commonmark.parser.Parser
import org.commonmark.renderer.html.HtmlRenderer
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension

data class MarkdownSection(val start: Int, val end: Int, val source: String, val node: Node, val append: Boolean = false)
data class MarkdownEditRegion(val start: Int, val end: Int, val text: String)
data class MarkdownListEntry(val body: MarkdownEditRegion, val marker: String, val checkedOffset: Int? = null, val checked: Boolean = false)
data class MarkdownEditBuffer(val text: String, val sections: List<MarkdownSection>)

/** Only the edited block/cell is serialized; all surrounding source stays byte-for-byte intact. */
object MarkdownEditing {
    private val extensions = listOf(TablesExtension.create(), StrikethroughExtension.create())
    private val parser = Parser.builder().includeSourceSpans(IncludeSourceSpans.BLOCKS_AND_INLINES).extensions(extensions).build()
    private val html = HtmlRenderer.builder().extensions(extensions).build()
    fun taskListEntries(source: String): List<MarkdownListEntry>? {
        val list = parser.parse(source).firstChild as? ListBlock ?: return null
        val entries = MarkdownDocument.children(list).mapNotNull { item ->
            val span = range(item) ?: return@mapNotNull null
            val text = source.substring(span.first, span.last + 1)
            val marker = Regex("^( {0,3}(?:[-+*]|[0-9]+[.)])[ \\t]+)(?:\\[([ xX])]([ \\t]+))?").find(text) ?: return@mapNotNull null
            val checked = marker.groups[2]
            val start = span.first + marker.value.length
            MarkdownListEntry(MarkdownEditRegion(start, span.last + 1, source.substring(start, span.last + 1)),
                marker.groupValues[1].trim(), checked?.let { span.first + it.range.first }, checked?.value?.equals("x", true) == true)
        }
        return entries.takeIf { it.any { entry -> entry.checkedOffset != null } }
    }
    fun toggleTask(source: String, entry: MarkdownListEntry, checked: Boolean): String =
        entry.checkedOffset?.let { replace(source, it, it + 1, if (checked) "x" else " ") } ?: source
    fun range(node: Node): IntRange? {
        val spans = node.sourceSpans
        if (spans.isEmpty()) return null
        return spans.first().inputIndex until (spans.last().inputIndex + spans.last().length)
    }
    fun sections(text: String): List<MarkdownSection> = MarkdownDocument.children(parser.parse(text)).mapNotNull { node ->
        if (node is LinkReferenceDefinition) null else range(node)?.let { MarkdownSection(it.first, it.last + 1, text.substring(it.first, it.last + 1), node) }
    }.ifEmpty { listOf(MarkdownSection(text.length, text.length, "", Paragraph(), append = text.isNotEmpty())) }
    fun buffer(text: String): MarkdownEditBuffer {
        val sections = sections(text)
        val last = sections.last().node
        val trailing = last is org.commonmark.ext.gfm.tables.TableBlock || last is HtmlBlock || last is ThematicBreak || MarkdownDocument.images(last).isNotEmpty()
        return MarkdownEditBuffer(text, if (trailing) sections + MarkdownSection(text.length, text.length, "", Paragraph(), append = true) else sections)
    }
    fun update(buffer: MarkdownEditBuffer, index: Int, replacement: String): MarkdownEditBuffer {
        val current = buffer.sections[index]
        val newline = if (buffer.text.contains("\r\n")) "\r\n" else "\n"
        val gap = if (!current.append || replacement.isEmpty() || buffer.text.isEmpty() || buffer.text.endsWith(newline + newline)) ""
            else if (buffer.text.endsWith(newline)) newline else newline + newline
        val value = gap + replacement
        val delta = value.length - current.source.length
        val text = replace(buffer.text, current.start, current.end, value)
        val sections = buffer.sections.mapIndexed { i, entry -> when {
            i < index -> entry
            i == index -> entry.copy(start = entry.start + gap.length, end = entry.end + delta, source = replacement, append = current.append && replacement.isEmpty())
            else -> entry.copy(start = entry.start + delta, end = entry.end + delta)
        } }
        return MarkdownEditBuffer(text, sections)
    }
    fun replace(text: String, start: Int, end: Int, replacement: String): String {
        require(start in 0..text.length && end in start..text.length)
        return text.substring(0, start) + replacement + text.substring(end)
    }
    fun importHtml(source: String): String = html.render(parser.parse(source))
    fun importHtml(node: Node): String = html.render(node)
    fun editedBlock(source: String, edited: String): String {
        val normalized = edited.replace("\r\n", "\n").replace('\r', '\n')
        return if (source.contains("\r\n")) normalized.replace("\n", "\r\n") else normalized
    }
    fun fragment(source: String, edited: String): String = source.takeWhile(Char::isWhitespace) +
        editedBlock(source, edited).trim() + source.takeLastWhile(Char::isWhitespace)
    fun tableCell(source: String, edited: String): String {
        val value = edited.replace("\r\n", " ").replace('\n', ' ').replace('\r', ' ')
        val escaped = buildString {
            var slashes = 0
            value.forEach { c ->
                if (c == '|' && slashes % 2 == 0) append('\\')
                append(c)
                slashes = if (c == '\\') slashes + 1 else 0
            }
        }
        val prefix = source.takeWhile { it == ' ' || it == '\t' }
        val suffix = source.takeLastWhile { it == ' ' || it == '\t' }
        return prefix + escaped.trim(' ', '\t') + if (source.isBlank()) "" else suffix
    }
    fun codeBody(source: String): MarkdownEditRegion {
        val opening = Regex("^ {0,3}(`{3,}|~{3,})[^\\r\\n]*(?:\\r?\\n|$)").find(source)
            ?: return MarkdownEditRegion(0, source.length, source)
        val start = opening.range.last + 1
        val marker = opening.groupValues[1]
        val closing = Regex("(?m)^ {0,3}" + Regex.escape(marker.first().toString()) + "{" + marker.length + ",}[ \\t]*\\r?$").findAll(source).lastOrNull()?.takeIf { it.range.first >= start }
        var end = closing?.range?.first ?: source.length
        if (closing != null && end > start && source[end - 1] == '\n') { end--; if (end > start && source[end - 1] == '\r') end-- }
        return MarkdownEditRegion(start, end, source.substring(start, end))
    }
    fun replaceCodeBody(source: String, edited: String): String {
        val body = codeBody(source)
        val closingImmediatelyAfter = source.substring(body.end).matches(Regex(" {0,3}(`{3,}|~{3,})[ \\t]*"))
        val value = editedBlock(source, edited) + if (closingImmediatelyAfter && edited.isNotEmpty() && !edited.endsWith('\n')) {
            if (source.contains("\r\n")) "\r\n" else "\n"
        } else ""
        return replace(source, body.start, body.end, value)
    }
    /** Parse authored pipe boundaries too, so a completely empty cell is still editable. */
    fun tableRows(source: String): List<List<MarkdownEditRegion>> {
        val result = mutableListOf<List<MarkdownEditRegion>>()
        var offset = 0
        source.split('\n').forEachIndexed { lineIndex, raw ->
            val line = raw.removeSuffix("\r")
            if (lineIndex != 1 && line.isNotBlank()) {
                val pipes = mutableListOf<Int>(); var slashes = 0
                line.forEachIndexed { i, c ->
                    if (c == '|' && slashes % 2 == 0) pipes += i
                    slashes = if (c == '\\') slashes + 1 else 0
                }
                val begin = if (pipes.firstOrNull()?.let { line.substring(0, it).isBlank() } == true) pipes.removeAt(0) + 1 else 0
                val end = if (pipes.lastOrNull()?.let { line.substring(it + 1).isBlank() } == true) pipes.removeAt(pipes.lastIndex) else line.length
                var start = begin
                result += (pipes + end).map { stop -> MarkdownEditRegion(offset + start, offset + stop, line.substring(start, stop)).also { start = stop + 1 } }
            }
            offset += raw.length + 1
        }
        return result
    }
    fun quotedBody(source: String): String = source.lineSequence().joinToString("\n") { it.replaceFirst(Regex("^ {0,3}>[ \\t]?"), "") }
    fun replaceQuotedBody(source: String, edited: String): String {
        val prefixes = source.lineSequence().map { Regex("^ {0,3}>[ \\t]?").find(it)?.value.orEmpty() }.toList()
        val fallback = prefixes.firstOrNull { it.isNotEmpty() } ?: "> "
        val value = edited.lineSequence().mapIndexed { index, line -> (prefixes.getOrNull(index) ?: fallback) + line }.joinToString("\n")
        return editedBlock(source, value)
    }
    /** Exact inline images split from editable text; complex nesting uses the native source field. */
    fun inlineImages(source: String): List<MarkdownEditRegion>? {
        val node = parser.parse(source).firstChild ?: return emptyList()
        val images = MarkdownDocument.images(node, Int.MAX_VALUE)
        if (images.any { it.parent !== node }) return null
        return images.mapNotNull { image -> range(image)?.let { MarkdownEditRegion(it.first, it.last + 1, source.substring(it.first, it.last + 1)) } }
    }
}

