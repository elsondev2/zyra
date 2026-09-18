package dev.zyra.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.data.MarkdownDocument
import dev.zyra.mobile.data.MarkdownHtml
import dev.zyra.mobile.data.MarkdownHtmlScript
import dev.zyra.mobile.data.MarkdownHtmlDetails
import dev.zyra.mobile.data.MarkdownLinks
import kotlinx.coroutines.launch
import org.commonmark.ext.footnotes.FootnoteDefinition
import org.commonmark.ext.footnotes.FootnoteReference
import org.commonmark.ext.gfm.strikethrough.Strikethrough
import org.commonmark.node.*

private val LocalDocumentImages = staticCompositionLocalOf<Set<Image>> { emptySet() }
private val LocalMarkdownLineBreaks = staticCompositionLocalOf { false }
internal val LocalMarkdownHeadings = staticCompositionLocalOf<Map<Heading, String>> { emptyMap() }
internal val LocalMarkdownTargets = staticCompositionLocalOf<Map<String, BringIntoViewRequester>> { emptyMap() }
internal val LocalMarkdownFootnotes = staticCompositionLocalOf<List<FootnoteDefinition>> { emptyList() }
val LocalMarkdownOpenFile = staticCompositionLocalOf<((String) -> Unit)?> { null }
val LocalMarkdownBeforeNavigate = staticCompositionLocalOf<(() -> Unit)?> { null }
val LocalMarkdownCompactImages = staticCompositionLocalOf { false }
internal val LocalMarkdownDisclosureState = staticCompositionLocalOf { mutableStateMapOf<MarkdownHtmlDetails, Boolean>() }
private val LocalMarkdownNavigateFragment = staticCompositionLocalOf<((String) -> Unit)?> { null }

@Composable fun Markdown(text: String, modifier: Modifier = Modifier, preserveLineBreaks: Boolean = false, selectable: Boolean = true) {
    val root = remember(text) { MarkdownHtml.render(MarkdownDocument.parse(text), text.length) }
    val images = remember(root) { MarkdownDocument.images(root) }
    val headings = remember(root) { MarkdownDocument.headings(root) }
    val footnotes = remember(root) { MarkdownDocument.footnotes(root) }
    val htmlAnchors = remember(root) { MarkdownHtml.anchors(root) }
    val targets = remember(root) { (headings.values + htmlAnchors.values + footnotes.map { "fn-${it.label.lowercase()}" })
        .associateWith { BringIntoViewRequester() } }
    val disclosures = remember(root) { mutableStateMapOf<MarkdownHtmlDetails, Boolean>() }
    val ancestors = remember(root) { (headings + htmlAnchors).entries.associate { (node, id) ->
        id to generateSequence(node.parent) { it.parent }.filterIsInstance<MarkdownHtmlDetails>().toList()
    } }
    val scope = rememberCoroutineScope()
    val beforeNavigate = LocalMarkdownBeforeNavigate.current
    val navigate: (String) -> Unit = { id ->
        beforeNavigate?.invoke()
        scope.launch {
        ancestors[id].orEmpty().forEach { disclosures[it] = true }
        // Allow a newly opened disclosure to enter layout before requesting its descendant.
        if (!ancestors[id].isNullOrEmpty()) { withFrameNanos { }; withFrameNanos { } }
        targets[id]?.bringIntoView()
        }
    }
    val content: @Composable () -> Unit = {
        Column(modifier) {
            RenderMarkdownNodes(root.firstChild)
            if (footnotes.isNotEmpty()) {
                Spacer(Modifier.height(24.dp)); HorizontalDivider(); Spacer(Modifier.height(12.dp))
                footnotes.forEachIndexed { index, note ->
                    Row(Modifier.bringIntoViewRequester(targets.getValue("fn-${note.label.lowercase()}")), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${index + 1}.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Column(Modifier.weight(1f)) { RenderMarkdownNodes(note.firstChild, compact = true) }
                    }
                    if (index < footnotes.lastIndex) Spacer(Modifier.height(10.dp))
                }
            }
        }
    }
    CompositionLocalProvider(LocalDocumentImages provides images, LocalMarkdownLineBreaks provides preserveLineBreaks,
        LocalMarkdownHeadings provides headings, LocalMarkdownTargets provides targets, LocalMarkdownFootnotes provides footnotes,
        LocalMarkdownDisclosureState provides disclosures, LocalMarkdownNavigateFragment provides navigate) {
        if (selectable) SelectionContainer { content() } else content()
    }
}

@Composable internal fun MarkdownParagraph(node: Node, skipPrefix: Int = 0) {
    val images = mutableListOf<Pair<Int, Image>>()
    val original = markdownInline(node, images)
    val skipped = skipPrefix.coerceAtMost(original.length)
    val text = original.subSequence(skipped, original.length)
    for (index in images.indices) images[index] = (images[index].first - skipped) to images[index].second
    if (images.isEmpty()) { Text(text, style = MaterialTheme.typography.bodyLarge); return }
    val renderImage = LocalMarkdownImage.current
    val compact = LocalMarkdownCompactImages.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        var start = 0
        var index = 0
        while (index < images.size) {
            val (offset, image) = images[index]
            if (text.subSequence(start, offset).isNotBlank()) Text(text.subSequence(start, offset), style = MaterialTheme.typography.bodyLarge)
            if (compact) {
                val group = mutableListOf(image)
                var end = offset + 1
                while (index + 1 < images.size && text.subSequence(end, images[index + 1].first).isBlank()) {
                    index++; group.add(images[index].second); end = images[index].first + 1
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    group.forEach { part -> Box(Modifier.size(104.dp)) { renderImage(part) } }
                }
                start = end
            } else { renderImage(image); start = offset + 1 }
            index++
        }
        if (text.subSequence(start, text.length).isNotBlank()) Text(text.subSequence(start, text.length), style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable internal fun markdownInline(node: Node, images: MutableList<Pair<Int, Image>>? = null): AnnotatedString {
    val colors = MaterialTheme.colorScheme
    val allowedImages = LocalDocumentImages.current
    val openFile = LocalMarkdownOpenFile.current
    val preserveLineBreaks = LocalMarkdownLineBreaks.current
    val targets = LocalMarkdownTargets.current
    val footnotes = LocalMarkdownFootnotes.current
    val navigate = LocalMarkdownNavigateFragment.current
    return buildAnnotatedString {
        fun add(current: Node?) {
            var child = current
            while (child != null) {
                when (val value = child) {
                    is org.commonmark.node.Text -> append(value.literal)
                    is Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = colors.surfaceContainerHighest)) { append(value.literal) }
                    is MarkdownHtmlScript -> { pushStyle(SpanStyle(baselineShift = if (value.superscript) BaselineShift.Superscript else BaselineShift.Subscript)); add(value.firstChild); pop() }
                    is Strikethrough -> { pushStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)); add(value.firstChild); pop() }
                    is HtmlInline -> if (value.literal.matches(Regex("(?i)<br\\s*/?>"))) append("\n") else append(value.literal)
                    is StrongEmphasis -> { pushStyle(SpanStyle(fontWeight = FontWeight.Bold)); add(value.firstChild); pop() }
                    is Emphasis -> { pushStyle(SpanStyle(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic)); add(value.firstChild); pop() }
                    is SoftLineBreak -> append(if (preserveLineBreaks) "\n" else " ")
                    is HardLineBreak -> append("\n")
                    is FootnoteReference -> {
                        val number = footnotes.indexOfFirst { it.label.equals(value.label, true) } + 1
                        val target = targets["fn-${value.label.lowercase()}"]
                        if (number > 0 && target != null) withLink(LinkAnnotation.Clickable("footnote:${value.label}", TextLinkStyles(style = SpanStyle(color = colors.primary, baselineShift = BaselineShift.Superscript)),
                            linkInteractionListener = { navigate?.invoke("fn-${value.label.lowercase()}") })) { append("$number") }
                    }
                    is Link -> {
                        val external = MarkdownLinks.external(value.destination)
                        val fragment = value.destination.takeIf { it.startsWith('#') }?.drop(1)?.let { raw ->
                            runCatching { java.net.URLDecoder.decode(raw.replace("+", "%2B"), "UTF-8") }.getOrDefault(raw) }
                        val target = targets[fragment]
                        val style = TextLinkStyles(style = SpanStyle(color = colors.primary, textDecoration = TextDecoration.Underline))
                        when {
                            external != null -> withLink(LinkAnnotation.Url(external, style)) { add(value.firstChild) }
                            target != null -> withLink(LinkAnnotation.Clickable(value.destination, style, linkInteractionListener = { fragment?.let { navigate?.invoke(it) } })) { add(value.firstChild) }
                            openFile != null && MarkdownLinks.isProjectFile(value.destination) -> withLink(LinkAnnotation.Clickable(value.destination,
                                TextLinkStyles(style = SpanStyle(color = colors.primary, background = colors.primary.copy(alpha = .08f), textDecoration = TextDecoration.Underline)),
                                linkInteractionListener = { openFile(value.destination) })) { add(value.firstChild) }
                            else -> add(value.firstChild)
                        }
                    }
                    is Image -> if (images != null && value in allowedImages) { images.add(length to value); append('\uFFFC') } else append(MarkdownDocument.imageAlt(value))
                    else -> add(value.firstChild)
                }
                child = child.next
            }
        }
        add(node.firstChild)
    }
}




