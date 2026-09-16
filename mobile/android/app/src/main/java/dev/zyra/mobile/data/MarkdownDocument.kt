package dev.zyra.mobile.data

import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension
import org.commonmark.node.Node
import org.commonmark.node.Heading
import org.commonmark.node.Text
import org.commonmark.node.Code
import org.commonmark.ext.autolink.AutolinkExtension
import org.commonmark.ext.footnotes.FootnotesExtension
import org.commonmark.ext.footnotes.FootnoteDefinition
import org.commonmark.ext.footnotes.FootnoteReference
import org.commonmark.ext.task.list.items.TaskListItemsExtension
import org.commonmark.parser.Parser
import org.commonmark.parser.IncludeSourceSpans
import org.commonmark.renderer.markdown.MarkdownRenderer

object MarkdownDocument {
    internal val extensions = listOf(TablesExtension.create(), StrikethroughExtension.create(),
        AutolinkExtension.create(), TaskListItemsExtension.create(), FootnotesExtension.create())
    private val parser = Parser.builder().extensions(extensions).includeSourceSpans(IncludeSourceSpans.BLOCKS_AND_INLINES).build()
    private val writer = MarkdownRenderer.builder().extensions(extensions).build()
    private val cache = LinkedHashMap<String, Node>(24, .75f, true)
    private var cachedCharacters = 0
    // Documents are read-only after parsing. Never keep a single huge transcript in this UI cache.
    @Synchronized fun parse(text: String): Node {
        cache[text]?.let { return it }
        val root = parser.parse(text)
        if (text.length <= 160_000) {
            cache[text] = root; cachedCharacters += text.length
            while (cache.size > 24 || cachedCharacters > 1_000_000) {
                val oldest = cache.entries.iterator(); cachedCharacters -= oldest.next().key.length; oldest.remove()
            }
        }
        return root
    }
    fun source(node: Node): String = writer.render(node)
    fun children(node: Node): List<Node> = buildList { var child = node.firstChild; while (child != null) { add(child); child = child.next } }
    fun images(node: Node, limit: Int = 12): Set<org.commonmark.node.Image> = buildSet {
        fun visit(part: Node) {
            if (size >= limit) return
            if (part is org.commonmark.node.Image) add(part) else children(part).forEach { visit(it) }
        }
        visit(node)
    }
    fun imageAlt(node: org.commonmark.node.Image): String {
        fun text(part: Node): String = when (part) {
            is org.commonmark.node.Text -> part.literal
            is org.commonmark.node.Code -> part.literal
            is org.commonmark.node.SoftLineBreak, is org.commonmark.node.HardLineBreak -> " "
            else -> children(part).joinToString("") { text(it) }
        }
        return text(node).trim().ifBlank { node.title.orEmpty().trim() }.ifBlank { "Image" }.take(200)
    }

    fun plainText(node: Node): String = when (node) {
        is Text -> node.literal
        is Code -> node.literal
        is org.commonmark.node.SoftLineBreak, is org.commonmark.node.HardLineBreak -> "\n"
        else -> children(node).joinToString("") { plainText(it) }
    }

    /** Same first-use numbering and repeated-reference behavior as Desktop's GFM renderer. */
    fun footnotes(root: Node): List<FootnoteDefinition> {
        val definitions = linkedMapOf<String, FootnoteDefinition>()
        val references = linkedSetOf<String>()
        fun collectDefinitions(node: Node) {
            if (node is FootnoteDefinition) definitions.putIfAbsent(node.label.lowercase(), node)
            children(node).forEach(::collectDefinitions)
        }
        fun collectReferences(node: Node) {
            if (node is FootnoteDefinition) return
            if (node is FootnoteReference) references.add(node.label.lowercase())
            children(node).forEach(::collectReferences)
        }
        collectDefinitions(root)
        collectReferences(root)
        // References inside an unused definition cannot create visible footnotes.
        var index = 0
        while (index < references.size) {
            definitions[references.elementAt(index++)]?.let { note -> children(note).forEach(::collectReferences) }
        }
        return references.mapNotNull { definitions[it] }
    }

    fun headings(root: Node): Map<Heading, String> {
        val used = mutableSetOf<String>()
        val result = linkedMapOf<Heading, String>()
        fun visit(node: Node) {
            if (node is Heading) {
                val base = plainText(node).lowercase().trim()
                    .replace(Regex("[^\\p{L}\\p{N}_\\-\\s]"), "").replace(Regex("\\s+"), "-")
                var id = base; var suffix = 2
                while (!used.add(id)) id = "$base-${suffix++}"
                result[node] = id
            }
            children(node).forEach(::visit)
        }
        visit(root)
        return result
    }

    /** Section rhythm follows Desktop's heading/paragraph margins, including inside nested blocks. */
    fun gapBefore(previous: Node?, node: Node, compact: Boolean = false): Int = when {
        previous == null -> 0
        node is Heading -> when (node.level) { 1, 2 -> 28; 3 -> 22; else -> 16 }
        previous is Heading -> if (previous.level <= 3) 12 else 8
        node is org.commonmark.node.ThematicBreak || previous is org.commonmark.node.ThematicBreak -> 22
        compact -> 6
        else -> 16
    }

    fun fenceTitle(info: String): String {
        val meta = info.trim().substringAfter(' ', "")
        val attribute = Regex("(?:^|\\s)(?:title|file(?:name)?)=(?:\"([^\"]+)\"|'([^']+)'|(\\S+))", RegexOption.IGNORE_CASE).find(meta)
        return attribute?.groupValues?.drop(1)?.firstOrNull { it.isNotEmpty() }
            ?: meta.split(Regex("\\s+")).firstOrNull { Regex("^[\\w@][\\w@./-]*\\.[A-Za-z0-9]+$").matches(it) }
            ?: info.substringBefore(' ').ifBlank { "Code" }
    }
}


