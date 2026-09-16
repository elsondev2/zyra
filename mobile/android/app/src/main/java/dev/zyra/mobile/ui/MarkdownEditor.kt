package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.OffsetMapping
import dev.zyra.mobile.R
import androidx.compose.ui.text.font.*
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.mohamedrejeb.richeditor.model.RichTextState
import com.mohamedrejeb.richeditor.ui.BasicRichTextEditor
import dev.zyra.mobile.data.*
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.node.*
import kotlinx.coroutines.flow.collect

private val LocalEditorLinkSelection = staticCompositionLocalOf<(Any, String?, Boolean) -> Unit> { { _, _, _ -> } }

/** Stable native fields retain IME composition; untouched document sections are never serialized. */
@Composable fun MarkdownEditor(text: String, edit: (String) -> Unit, enabled: Boolean, modifier: Modifier = Modifier, selectedLink: (String?) -> Unit = {}) {
    var buffer by remember { mutableStateOf(MarkdownEditing.buffer(text)) }
    LaunchedEffect(text) { if (text != buffer.text) buffer = MarkdownEditing.buffer(text) }
    var selectedField by remember { mutableStateOf<Any?>(null) }
    val currentSelectedLink by rememberUpdatedState(selectedLink)
    DisposableEffect(Unit) { onDispose { currentSelectedLink(null) } }
    CompositionLocalProvider(LocalEditorLinkSelection provides { field, link, focused ->
        if (focused) { selectedField = field; currentSelectedLink(link) }
        else if (selectedField === field) { selectedField = null; currentSelectedLink(null) }
    }) {
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(top = 16.dp, bottom = 80.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        itemsIndexed(buffer.sections, key = { index, _ -> index }) { index, section ->
            val update: (String) -> Unit = { value -> buffer = MarkdownEditing.update(buffer, index, value); edit(buffer.text) }
            when (section.node) {
                is TableBlock -> EditableMarkdownTable(section.source, update, enabled)
                is FencedCodeBlock -> {
                    if (section.node.info.substringBefore(' ').equals("mermaid", true)) MermaidBlock(section.node.literal)
                    else EditableCodeBlock(section.source, section.node.info, update, enabled, fenced = true)
                }
                is IndentedCodeBlock -> EditableCodeBlock(section.source, "", update, enabled, fenced = false)
                is BlockQuote -> Row {
                    Box(Modifier.width(3.dp).heightIn(min = 32.dp).background(MaterialTheme.colorScheme.outlineVariant))
                    Box(Modifier.weight(1f).padding(start = 14.dp)) {
                        // Retain quote nesting/prefixes exactly; rich-editor rc13 cannot round-trip block quotes.
                        NativeMarkdownField(MarkdownEditing.quotedBody(section.source), { update(MarkdownEditing.replaceQuotedBody(section.source, it)) }, enabled)
                    }
                }
                is ListBlock -> EditableTaskList(section.source, update, enabled)
                is ThematicBreak -> HorizontalDivider()
                is HtmlBlock -> Markdown(section.source)
                else -> if (MarkdownDocument.images(section.node, Int.MAX_VALUE).isNotEmpty() || section.source.contains("![")) {
                    EditableImageParagraph(section.source, update, enabled)
                } else RichMarkdownField(section.source, update, enabled, initialHtml = MarkdownEditing.importHtml(section.node), headingLevel = (section.node as? Heading)?.level)
            }
        }
    }
}

}

@Composable private fun RichMarkdownField(source: String, edit: (String) -> Unit, enabled: Boolean,
    initialHtml: String? = null, header: Boolean = false, tableCell: Boolean = false, headingLevel: Int? = null) {
    val linkSelection = LocalEditorLinkSelection.current
    val currentLinkSelection by rememberUpdatedState(linkSelection)
    val fieldToken = remember { Any() }
    var focused by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    val state = remember { RichTextState().apply {
        config.linkColor = colors.primary
        config.codeSpanColor = colors.onSurface
        config.codeSpanBackgroundColor = colors.surfaceContainer
        config.codeSpanStrokeColor = colors.outlineVariant
    }.setHtml(initialHtml ?: MarkdownEditing.importHtml(source)) }
    LaunchedEffect(focused, state.selection, state.annotatedString) {
        currentLinkSelection(fieldToken, state.selectedLinkUrl, focused)
    }
    DisposableEffect(fieldToken) { onDispose { currentLinkSelection(fieldToken, null, false) } }
    var importedSource by remember { mutableStateOf(source) }
    var lastSerialized by remember { mutableStateOf(state.toMarkdown()) }
    val currentEdit by rememberUpdatedState(edit)
    val currentSource by rememberUpdatedState(source)
    val focus = LocalFocusManager.current
    SideEffect {
        if (state.config.linkColor != colors.primary) state.config.linkColor = colors.primary
        if (state.config.codeSpanColor != colors.onSurface) state.config.codeSpanColor = colors.onSurface
        if (state.config.codeSpanBackgroundColor != colors.surfaceContainer) state.config.codeSpanBackgroundColor = colors.surfaceContainer
        if (state.config.codeSpanStrokeColor != colors.outlineVariant) state.config.codeSpanStrokeColor = colors.outlineVariant
    }
    LaunchedEffect(source) {
        if (source != importedSource) {
            importedSource = source
            state.setHtml(initialHtml ?: MarkdownEditing.importHtml(source))
            lastSerialized = state.toMarkdown()
        }
    }
    LaunchedEffect(state) {
        snapshotFlow { state.annotatedString }.collect {
            val value = state.toMarkdown()
            if (value != lastSerialized) {
                lastSerialized = value
                val authored = if (tableCell) MarkdownEditing.tableCell(currentSource, value) else MarkdownEditing.editedBlock(currentSource, value)
                importedSource = authored
                currentEdit(authored)
            }
        }
    }
    val type = MaterialTheme.typography
    val headingStyle = when (headingLevel) {
        1 -> type.headlineSmall; 2 -> type.titleLarge; 3 -> type.titleMedium
        4 -> type.bodyLarge; else -> type.bodyMedium
    }
    // RichEditor keeps semantic heading spans for serialization. Scale their em size to
    // the shared renderer's typography instead of exposing the library's default 32sp H1.
    val headingScale = if (headingLevel != null) state.annotatedString.spanStyles.firstOrNull { it.item.fontSize.isEm }?.item?.fontSize?.value ?: 1f else 1f
    BasicRichTextEditor(state, Modifier.onFocusChanged { focused = it.isFocused }.fillMaxWidth().heightIn(min = 28.dp), readOnly = !enabled,
        textStyle = headingStyle.copy(fontSize = headingStyle.fontSize / headingScale, color = if (headingLevel == 6) colors.onSurfaceVariant else colors.onSurface, fontWeight = if (header) FontWeight.SemiBold else FontWeight.Normal),
        singleLine = tableCell, cursorBrush = SolidColor(colors.primary),
        keyboardOptions = KeyboardOptions(imeAction = if (tableCell) ImeAction.Next else ImeAction.Default),
        keyboardActions = KeyboardActions(onNext = { focus.moveFocus(FocusDirection.Next) }),
        decorationBox = { inner -> Box(Modifier.heightIn(min = 28.dp)) {
            if (state.annotatedString.text.isEmpty()) Text("Write…", color = colors.onSurfaceVariant)
            inner()
        } })
    if (headingLevel == 1 || headingLevel == 2) { Spacer(Modifier.height(8.dp)); HorizontalDivider(color = colors.outlineVariant.copy(alpha = .6f)) }
}

@Composable private fun NativeMarkdownField(value: String, edit: (String) -> Unit, enabled: Boolean, code: Boolean = false, modifier: Modifier = Modifier, language: String = "") {
    val linkSelection = LocalEditorLinkSelection.current
    val currentLinkSelection by rememberUpdatedState(linkSelection)
    val fieldToken = remember { Any() }
    DisposableEffect(fieldToken) { onDispose { currentLinkSelection(fieldToken, null, false) } }
    val highlight = if (code) highlightedCode(value, language) else AnnotatedString(value)
    val transformation = remember(highlight) { VisualTransformation { input -> TransformedText(if (input.text == highlight.text) highlight else input, OffsetMapping.Identity) } }
    BasicTextField(value, edit, modifier.onFocusChanged { currentLinkSelection(fieldToken, null, it.isFocused) }.fillMaxWidth().heightIn(min = 28.dp), readOnly = !enabled,
        textStyle = (if (code) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium).copy(color = MaterialTheme.colorScheme.onSurface,
            fontFamily = if (code) FontFamily.Monospace else FontFamily.Default),
        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary), visualTransformation = transformation)
}

@Composable private fun EditableMarkdownTable(source: String, edit: (String) -> Unit, enabled: Boolean) {
    val rows = remember(source) { MarkdownEditing.tableRows(source) }
    Column(Modifier.horizontalScroll(rememberScrollState())) {
        rows.forEachIndexed { rowIndex, cells ->
            Row {
                cells.forEach { cell ->
                    Box(Modifier.width(180.dp).padding(horizontal = 10.dp, vertical = 12.dp)) {
                        RichMarkdownField(cell.text, { value -> edit(MarkdownEditing.replace(source, cell.start, cell.end, value)) }, enabled,
                            header = rowIndex == 0, tableCell = true)
                    }
                }
            }
            HorizontalDivider()
        }
    }
}

@Composable private fun EditableImageParagraph(source: String, edit: (String) -> Unit, enabled: Boolean) {
    val images = remember(source) { MarkdownEditing.inlineImages(source) }
    if (images == null || images.isEmpty()) {
        // Nested image/link markup is editable as exact source instead of importing or losing media.
        NativeMarkdownField(source, edit, enabled)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        var offset = 0
        images.forEach { image ->
            if (image.start > offset) {
                val start = offset
                val fragment = source.substring(start, image.start)
                if (fragment.isNotBlank()) RichMarkdownField(fragment, { value -> edit(MarkdownEditing.replace(source, start, image.start, MarkdownEditing.fragment(fragment, value))) }, enabled)
            }
            Markdown(image.text)
            offset = image.end
        }
        if (offset < source.length) {
            val start = offset
            val fragment = source.substring(start)
            if (fragment.isNotBlank()) RichMarkdownField(fragment, { value -> edit(MarkdownEditing.replace(source, start, source.length, MarkdownEditing.fragment(fragment, value))) }, enabled)
        }
    }
}





@Composable private fun EditableCodeBlock(source: String, info: String, edit: (String) -> Unit, enabled: Boolean, fenced: Boolean) {
    val body = if (fenced) MarkdownEditing.codeBody(source).text else source
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    var wrapped by remember { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { kotlinx.coroutines.delay(1600); copied = false } }
    Surface(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surfaceContainer, shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(MarkdownDocument.fenceTitle(info), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium)
                IconToggleButton(wrapped, { wrapped = it }, Modifier.size(40.dp)) {
                    AppIcon(R.drawable.ic_wrap_text, if (wrapped) "Disable line wrap" else "Wrap code lines", Modifier.size(17.dp))
                }
                IconButton({ clipboard.setText(AnnotatedString(body)); copied = true }, Modifier.size(40.dp)) {
                    AppIcon(if (copied) R.drawable.ic_check else R.drawable.ic_copy, if (copied) "Copied code" else "Copy code", Modifier.size(16.dp))
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            val maxWidth = with(LocalDensity.current) { 60000.toDp() }
            Box(Modifier.fillMaxWidth().then(if (wrapped) Modifier else Modifier.horizontalScroll(rememberScrollState())).padding(12.dp)) {
                NativeMarkdownField(body, { edit(if (fenced) MarkdownEditing.replaceCodeBody(source, it) else it) }, enabled, code = true,
                    modifier = if (wrapped) Modifier else Modifier.widthIn(min = 48.dp, max = maxWidth).width(IntrinsicSize.Max), language = info.substringBefore(' '))
            }
        }
    }
}

@Composable private fun EditableTaskList(source: String, edit: (String) -> Unit, enabled: Boolean) {
    val entries = remember(source) { MarkdownEditing.taskListEntries(source) }
    if (entries == null) { RichMarkdownField(source, edit, enabled); return }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        entries.forEach { entry ->
            Row(Modifier.heightIn(min = 44.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                if (entry.checkedOffset != null) Checkbox(entry.checked, { edit(MarkdownEditing.toggleTask(source, entry, it)) }, enabled = enabled,
                    modifier = Modifier.size(28.dp))
                else Text(if (entry.marker.lastOrNull()?.isDigit() == false && entry.marker.length == 1) "•" else entry.marker,
                    Modifier.widthIn(min = 28.dp), style = MaterialTheme.typography.bodyMedium)
                Column(Modifier.weight(1f)) {
                    val update: (String) -> Unit = { edit(MarkdownEditing.replace(source, entry.body.start, entry.body.end, it)) }
                    if (entry.body.text.contains('\n')) NativeMarkdownField(entry.body.text, update, enabled)
                    else RichMarkdownField(entry.body.text, update, enabled)
                }
            }
        }
    }
}

