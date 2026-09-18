package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.data.*

@Composable fun WorkspaceFileContent(state: WorkspaceState, connected: Boolean, edit: (String) -> Unit, startEditing: () -> Unit, preview: () -> Unit, save: () -> Unit, modifier: Modifier = Modifier, folder: (() -> Unit)? = null, selectedLink: (String?) -> Unit = {}, controller: WorkspaceController? = null) {
    val file = state.file ?: return
    val kind = fileRender(file.path)
    when {
        controller != null && workspaceRasterImage(file.path) -> WorkspaceImagePreview(state, controller, modifier)
        file.binary || file.large -> Column(modifier.padding(top = 24.dp)) {
            Text(if (file.binary) "No text preview" else "This file is too large to preview", style = MaterialTheme.typography.titleMedium)
            Text("Open this file on your PC.", Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        kind == FileRender.MARKDOWN && !state.fileSource && file.readOnly -> Markdown(file.text, modifier.verticalScroll(rememberScrollState()).padding(top = 16.dp, bottom = 80.dp))
        kind == FileRender.MARKDOWN && !state.fileSource -> MarkdownEditor(file.text, edit, !file.readOnly && !state.saving, modifier, selectedLink)
        kind != null && kind != FileRender.MARKDOWN && !state.fileSource -> RenderedFile(file.text, kind, modifier)
        file.readOnly -> FileCodePreview(file.text, file.path, modifier, state.fileWrap, file.line)
        else -> FileSourceEditor(file, !state.saving, state.fileWrap, edit, modifier)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable private fun FileSourceEditor(file: WorkspaceFile, enabled: Boolean, wrap: Boolean, edit: (String) -> Unit, modifier: Modifier) {
    val code = highlightedCode(file.text, file.path)
    val transformation = remember(code) { VisualTransformation { value -> TransformedText(if (code.text == value.text) code else value, OffsetMapping.Identity) } }
    val horizontal = rememberScrollState()
    val sourceStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurface)
    val anchorOffset = remember(file.path, file.line, file.original) {
        if (file.line <= 1) 0 else file.original.indices.filter { file.original[it] == '\n' }.let { breaks ->
            breaks.getOrNull(file.line - 2)?.plus(1) ?: (breaks.lastOrNull()?.plus(1) ?: 0)
        }
    }
    val maximumSourceWidth = with(LocalDensity.current) { 60000.toDp() }
    val sourceWidth = if (wrap) Modifier.fillMaxWidth() else Modifier.widthIn(min = 48.dp, max = maximumSourceWidth).width(IntrinsicSize.Max)
    BoxWithConstraints(modifier.fillMaxSize()) {
        // Linked files start at the measured line on the first frame. This avoids a
        // hidden editor waiting for an animation frame or a visible jump from line 1.
        // Ordinary file opens do not perform this additional text measurement.
        val initialScroll = if (anchorOffset == 0) 0 else {
            val measurer = androidx.compose.ui.text.rememberTextMeasurer(cacheSize = 1)
            val lineWidth = if (wrap) constraints.maxWidth else 60000
            remember(file.path, file.line, file.original, sourceStyle, lineWidth, measurer) {
                val layout = measurer.measure(file.original, style = sourceStyle, softWrap = wrap,
                    constraints = androidx.compose.ui.unit.Constraints(maxWidth = lineWidth))
                layout.getLineTop(layout.getLineForOffset(anchorOffset)).toInt().coerceAtLeast(0)
            }
        }
        val vertical = key(file.path, file.line) { rememberScrollState(initial = initialScroll) }
        Box(Modifier.fillMaxSize().verticalScroll(vertical).then(if (wrap) Modifier else Modifier.horizontalScroll(horizontal)).padding(vertical = 16.dp)) {
            BasicTextField(file.text, edit, sourceWidth.padding(bottom = 80.dp),
                readOnly = !enabled, textStyle = sourceStyle,
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary), visualTransformation = transformation)
        }
    }
}