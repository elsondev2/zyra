package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.material3.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.MarkdownDocument
import dev.zyra.mobile.data.MarkdownHtmlGroup
import dev.zyra.mobile.data.MarkdownHtmlDetails
import dev.zyra.mobile.data.MarkdownHtmlListItem
import org.commonmark.ext.footnotes.FootnoteDefinition
import org.commonmark.ext.gfm.tables.*
import org.commonmark.ext.task.list.items.TaskListItemMarker
import org.commonmark.node.*

@Composable internal fun RenderMarkdownNodes(first: Node?, compact: Boolean = false) {
    var node = first
    var previous: Node? = null
    while (node != null) {
        val block = node
        if (block !is FootnoteDefinition && block !is TaskListItemMarker && block !is LinkReferenceDefinition) {
            val gap = MarkdownDocument.gapBefore(previous, block, compact)
            if (gap > 0) Spacer(Modifier.height(gap.dp))
            when (block) {
                is Heading -> {
                    val target = LocalMarkdownHeadings.current[block]?.let { LocalMarkdownTargets.current[it] }
                    Column(if (target != null) Modifier.bringIntoViewRequester(target) else Modifier) {
                        Text(markdownInline(block), style = when (block.level) {
                            1 -> MaterialTheme.typography.headlineSmall
                            2 -> MaterialTheme.typography.titleLarge
                            3 -> MaterialTheme.typography.titleMedium
                            4 -> MaterialTheme.typography.bodyLarge
                            else -> MaterialTheme.typography.bodyMedium
                        }, fontWeight = if (block.level == 1) FontWeight.Bold else FontWeight.SemiBold,
                            color = if (block.level == 6) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                        if (block.level <= 2) { Spacer(Modifier.height(8.dp)); HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .6f)) }
                    }
                }
                is MarkdownHtmlDetails -> MarkdownDetails(block)
                is MarkdownHtmlGroup -> {
                    val target = LocalMarkdownTargets.current[block.anchor]
                    Column(if (target == null) Modifier else Modifier.bringIntoViewRequester(target)) { RenderMarkdownNodes(block.firstChild, compact) }
                }
                is Paragraph -> MarkdownParagraph(block)
                is TableBlock -> MarkdownTable(block)
                is FencedCodeBlock -> if (block.info.substringBefore(' ').equals("mermaid", true)) MermaidBlock(block.literal) else MarkdownCodeBlock(block.literal, block.info)
                is IndentedCodeBlock -> MarkdownCodeBlock(block.literal, "")
                is BulletList, is OrderedList -> MarkdownList(block)
                is BlockQuote -> MarkdownQuote(block)
                is ThematicBreak -> HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                is HtmlBlock -> Text(block.literal, style = MaterialTheme.typography.bodyMedium)
                else -> Text(markdownInline(block), style = MaterialTheme.typography.bodyLarge)
            }
            previous = block
        }
        node = node.next
    }
}

@Composable private fun MarkdownList(block: Node) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        var child = block.firstChild
        var index = if (block is OrderedList) block.markerStartNumber else 1
        while (child != null) {
            val item = child
            val task = item.firstChild as? TaskListItemMarker
            val anchor = (item as? MarkdownHtmlListItem)?.anchor?.let { LocalMarkdownTargets.current[it] }
            Row(if (anchor == null) Modifier else Modifier.bringIntoViewRequester(anchor), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (task != null) Checkbox(checked = task.isChecked, onCheckedChange = null, modifier = Modifier.size(20.dp).padding(top = 3.dp))
                else Text(if (block is OrderedList) "${index++}." else "•", Modifier.widthIn(min = 18.dp), style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.End)
                Column(Modifier.weight(1f)) { RenderMarkdownNodes(item.firstChild, compact = (block as? ListBlock)?.isTight == true) }
            }
            child = child.next
        }
    }
}

@Composable private fun MarkdownQuote(block: BlockQuote) {
    val firstParagraph = block.firstChild as? Paragraph
    val firstText = firstParagraph?.firstChild as? org.commonmark.node.Text
    val alert = firstText?.literal?.let { Regex("^\\[!(TIP|NOTE|IMPORTANT|WARNING|CAUTION)]\\s*", RegexOption.IGNORE_CASE).find(it) }
    if (alert != null) {
        val kind = alert.groupValues[1].lowercase()
        val accent = when (kind) {
            "warning", "caution" -> MaterialTheme.colorScheme.error
            "tip" -> MaterialTheme.colorScheme.tertiary
            else -> MaterialTheme.colorScheme.primary
        }
        Surface(color = accent.copy(alpha = .07f), shape = MaterialTheme.shapes.medium, border = BorderStroke(1.dp, accent.copy(alpha = .25f))) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CompositionLocalProvider(LocalContentColor provides accent) { AppIcon(if (kind == "warning" || kind == "caution") R.drawable.ic_circle_alert else R.drawable.ic_info, modifier = Modifier.size(17.dp)) }
                    Text(kind.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelLarge, color = accent)
                }
                val prefix = alert.value.length + if (firstText.next is SoftLineBreak || firstText.next is HardLineBreak) 1 else 0
                if (MarkdownDocument.plainText(firstParagraph).drop(prefix).isNotBlank()) MarkdownParagraph(firstParagraph, prefix)
                firstParagraph.next?.let { RenderMarkdownNodes(it, compact = true) }
            }
        }
    } else {
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.width(3.dp).fillMaxHeight().background(MaterialTheme.colorScheme.primary.copy(alpha = .4f)))
            Column(Modifier.weight(1f).padding(vertical = 3.dp)) { RenderMarkdownNodes(block.firstChild) }
        }
    }
}

@Composable private fun MarkdownCodeBlock(code: String, info: String) {
    val clipboard = LocalClipboardManager.current
    var copied by remember(code) { mutableStateOf(false) }
    var wrapped by remember(info) { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { kotlinx.coroutines.delay(1600); copied = false } }
    Surface(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surfaceContainer, shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(MarkdownDocument.fenceTitle(info), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                IconToggleButton(checked = wrapped, onCheckedChange = { wrapped = it }, modifier = Modifier.size(40.dp)) {
                    AppIcon(R.drawable.ic_wrap_text, if (wrapped) "Disable line wrap" else "Wrap code lines", Modifier.size(17.dp))
                }
                IconButton(onClick = { clipboard.setText(AnnotatedString(code)); copied = true }, modifier = Modifier.size(40.dp)) {
                    AppIcon(if (copied) R.drawable.ic_check else R.drawable.ic_copy, if (copied) "Copied code" else "Copy code", Modifier.size(16.dp))
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Box(Modifier.fillMaxWidth().then(if (wrapped) Modifier else Modifier.horizontalScroll(rememberScrollState())).padding(12.dp)) {
                Text(highlightedCode(code.trimEnd('\n', '\r'), info.substringBefore(' ')), fontFamily = FontFamily.Monospace,
                    softWrap = wrapped, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable private fun MarkdownTable(table: TableBlock) {
    val rows = remember(table) { MarkdownDocument.children(table).flatMap { section -> MarkdownDocument.children(section) }
        .map { row -> MarkdownDocument.children(row).filterIsInstance<TableCell>() } }
    val columns = rows.maxOfOrNull { it.size } ?: 0
    if (columns == 0) return
    val clipboard = LocalClipboardManager.current
    var copied by remember(table) { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { kotlinx.coroutines.delay(1600); copied = false } }
    Column {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val cellWidth = (maxWidth / columns).coerceIn(136.dp, 240.dp)
            Column(Modifier.horizontalScroll(rememberScrollState()).clip(MaterialTheme.shapes.small)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.small)) {
                rows.forEachIndexed { rowIndex, cells ->
                    Row(Modifier.height(IntrinsicSize.Min)) {
                        cells.forEach { cell ->
                            Text(markdownInline(cell), modifier = Modifier.width(cellWidth).fillMaxHeight()
                                .background(if (cell.isHeader) MaterialTheme.colorScheme.surfaceContainer else MaterialTheme.colorScheme.surface)
                                .padding(horizontal = 12.dp, vertical = 10.dp), style = MaterialTheme.typography.bodyMedium,
                                fontWeight = if (cell.isHeader) FontWeight.SemiBold else FontWeight.Normal,
                                textAlign = when (cell.alignment) { TableCell.Alignment.CENTER -> TextAlign.Center; TableCell.Alignment.RIGHT -> TextAlign.End; else -> TextAlign.Start })
                        }
                    }
                    if (rowIndex < rows.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            IconButton(onClick = { clipboard.setText(AnnotatedString(MarkdownDocument.source(table))); copied = true }, modifier = Modifier.size(36.dp)) {
                AppIcon(if (copied) R.drawable.ic_check else R.drawable.ic_copy, if (copied) "Copied table" else "Copy table as Markdown", Modifier.size(15.dp))
            }
        }
    }
}




