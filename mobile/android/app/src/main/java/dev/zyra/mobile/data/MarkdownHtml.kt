package dev.zyra.mobile.data

import org.commonmark.ext.gfm.strikethrough.Strikethrough
import org.commonmark.ext.gfm.tables.*
import org.commonmark.ext.task.list.items.TaskListItemMarker
import org.commonmark.node.*
import org.commonmark.renderer.html.AttributeProvider
import org.commonmark.renderer.html.HtmlRenderer
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.TextNode

class MarkdownHtmlGroup(val anchor: String? = null) : CustomBlock()
class MarkdownHtmlDetails(val summary: Node, val open: Boolean) : CustomBlock()
class MarkdownHtmlScript(val superscript: Boolean) : CustomNode()
class MarkdownHtmlListItem(val anchor: String?) : ListItem()

/**
 * HTML is interpreted into native, inert nodes. No WebView, URL fetch or script engine is involved.
 * The source AST remains untouched so editing offsets and the bounded source cache stay exact.
 */
object MarkdownHtml {
    private const val MAX_SOURCE = 160_000
    private const val MAX_HTML = 640_000
    private const val MAX_NODES = 20_000
    private const val MAX_DEPTH = 96
    private data class Cached(val root: Node, val characters: Int)
    private val cache = LinkedHashMap<Node, Cached>(8, .75f, true)
    private var characters = 0
    private val html = HtmlRenderer.builder().extensions(MarkdownDocument.extensions)
        .attributeProviderFactory { AttributeProvider { node, tag, attrs ->
            if (node is FencedCodeBlock && tag == "code") attrs["data-zyra-code-info"] = node.info
        } }.build()
    private val forbidden = setOf("script", "style", "iframe", "object", "embed", "applet", "form", "button", "select", "textarea", "template", "noscript", "svg", "math", "video", "audio")

    @Synchronized fun render(source: Node, sourceLength: Int): Node {
        if (sourceLength > MAX_SOURCE || !containsHtml(source)) return source
        cache[source]?.let { return it.root }
        val serialized = html.render(source)
        if (serialized.length > MAX_HTML) return source
        val root = runCatching { Converter().document(Jsoup.parseBodyFragment(serialized).body()) }.getOrElse { return source }
        cache[source] = Cached(root, serialized.length); characters += serialized.length
        while (cache.size > 8 || characters > MAX_HTML) {
            val oldest = cache.entries.iterator(); characters -= oldest.next().value.characters; oldest.remove()
        }
        return root
    }

    private fun containsHtml(node: Node): Boolean = node is HtmlBlock || node is HtmlInline || MarkdownDocument.children(node).any(::containsHtml)
    fun anchors(root: Node): Map<Node, String> {
        val anchors = linkedMapOf<Node, String>()
        fun visit(node: Node) {
            if (node is MarkdownHtmlGroup && !node.anchor.isNullOrBlank()) anchors[node] = node.anchor
            if (node is MarkdownHtmlListItem && !node.anchor.isNullOrBlank()) anchors[node] = node.anchor
            MarkdownDocument.children(node).forEach(::visit)
        }
        visit(root)
        return anchors
    }

    private class Converter {
        private var visited = 0
        fun document(body: Element): Node = Document().also { appendChildren(it, body, false, 0) }
        private fun appendChildren(target: Node, parent: Element, inline: Boolean, depth: Int) {
            check(depth <= MAX_DEPTH) { "HTML nesting limit" }
            var paragraph: Paragraph? = null
            parent.childNodes().forEach { source ->
                convert(source, depth + 1).forEach { child ->
                    if (inline || child is Block) { paragraph = null; target.appendChild(child) }
                    else if (!(child is Text && child.literal.isBlank() && paragraph == null)) {
                        if (paragraph == null) { paragraph = Paragraph(); target.appendChild(paragraph) }
                        paragraph!!.appendChild(child)
                    }
                }
            }
        }
        private fun convert(source: org.jsoup.nodes.Node, depth: Int): List<Node> {
            check(++visited <= MAX_NODES && depth <= MAX_DEPTH) { "HTML document limit" }
            if (source is TextNode) return listOf(Text(source.wholeText))
            if (source !is Element) return emptyList()
            val tag = source.normalName()
            if (tag in forbidden) return emptyList()
            fun withChildren(node: Node, inline: Boolean = false): Node = node.also { appendChildren(it, source, inline, depth) }
            val node: Node = when (tag) {
                "p" -> withChildren(Paragraph(), true)
                "h1", "h2", "h3", "h4", "h5", "h6" -> withChildren(Heading().also { it.level = tag.last().digitToInt() }, true)
                "strong", "b" -> withChildren(StrongEmphasis(), true)
                "em", "i" -> withChildren(Emphasis(), true)
                "del", "s", "strike" -> withChildren(Strikethrough("~~"), true)
                "sup", "sub" -> withChildren(MarkdownHtmlScript(tag == "sup"), true)
                "code", "kbd", "samp" -> Code(source.wholeText())
                "pre" -> {
                    val code = source.children().firstOrNull { it.normalName() == "code" }
                    FencedCodeBlock().also {
                        it.literal = (code ?: source).wholeText()
                        it.info = code?.attr("data-zyra-code-info")?.ifBlank {
                            code.classNames().firstOrNull { value -> value.startsWith("language-") }?.removePrefix("language-").orEmpty()
                        }.orEmpty()
                    }
                }
                "ul" -> withChildren(BulletList().also { it.isTight = false })
                "ol" -> withChildren(OrderedList().also { it.markerStartNumber = source.attr("start").toIntOrNull()?.coerceAtLeast(1) ?: 1; it.isTight = false })
                "li" -> withChildren(MarkdownHtmlListItem(source.id().takeIf { it.isNotBlank() && it.length <= 256 })).also { item ->
                    // The GFM HTML serializer puts a checkbox at the beginning of a paragraph.
                    val paragraph = item.firstChild as? Paragraph
                    val marker = paragraph?.firstChild as? TaskListItemMarker
                    if (marker != null) { marker.unlink(); item.prependChild(marker) }
                }
                "input" -> if (source.attr("type").equals("checkbox", true)) TaskListItemMarker(source.hasAttr("checked")) else return emptyList()
                "blockquote" -> withChildren(BlockQuote())
                "br" -> HardLineBreak()
                "hr" -> ThematicBreak()
                "a" -> {
                    val href = source.attr("href")
                    if (href.startsWith('#') || MarkdownLinks.external(href) != null || MarkdownLinks.isProjectFile(href)) withChildren(Link(href, ""), true)
                    else return source.childNodes().flatMap { convert(it, depth + 1) }
                }
                "img" -> {
                    val destination = source.attr("src")
                    if (MarkdownLinks.external(destination)?.startsWith("http", true) != true && !MarkdownLinks.isProjectFile(destination)) return listOf(Text(source.attr("alt")))
                    Image(destination, "").also { it.appendChild(Text(source.attr("alt"))) }
                }
                "details" -> {
                    val summary = source.children().firstOrNull { it.normalName() == "summary" }
                    val label = Paragraph().also { if (summary != null) appendChildren(it, summary, true, depth + 1); if (MarkdownDocument.plainText(it).isBlank()) it.appendChild(Text("Details")) }
                    MarkdownHtmlDetails(label, source.hasAttr("open")).also { details ->
                        val contents = source.clone(); contents.children().firstOrNull { it.normalName() == "summary" }?.remove()
                        appendChildren(details, contents, false, depth + 1)
                    }
                }
                "table" -> withChildren(TableBlock(), true)
                "thead" -> withChildren(TableHead(), true)
                "tbody", "tfoot" -> withChildren(TableBody(), true)
                "tr" -> withChildren(TableRow(), true)
                "th", "td" -> withChildren(TableCell().also {
                    it.isHeader = tag == "th"
                    it.alignment = when (source.attr("align").lowercase()) { "center" -> TableCell.Alignment.CENTER; "right" -> TableCell.Alignment.RIGHT; else -> TableCell.Alignment.LEFT }
                }, true)
                // Containers are structural; styles, classes, event handlers and other attributes never cross into native UI.
                "div", "section", "article", "main", "header", "footer", "figure", "figcaption", "dl", "dt", "dd" -> withChildren(MarkdownHtmlGroup())
                else -> {
                    val children = source.childNodes().flatMap { convert(it, depth + 1) }
                    return children
                }
            }
            val id = source.id().takeIf { it.isNotBlank() && it.length <= 256 }
            if (id != null && node is Block && node !is Heading && node !is MarkdownHtmlListItem && !(node is MarkdownHtmlGroup && node.anchor == id)) {
                return listOf(MarkdownHtmlGroup(id).also { it.appendChild(node) })
            }
            return listOf(node)
        }
    }
}



