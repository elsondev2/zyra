package dev.zyra.mobile.ui

import android.graphics.Picture
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.caverock.androidsvg.SVG
import dev.zyra.mobile.R
import dev.zyra.mobile.markdown.MermaidRenderer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

private data class DiagramState(val picture: Picture? = null, val error: String? = null, val loading: Boolean = true)

@Composable internal fun MermaidBlock(source: String) {
    val context = LocalContext.current
    val colors = MaterialTheme.colorScheme
    fun hex(color: androidx.compose.ui.graphics.Color) = "#%06x".format(color.toArgb() and 0xffffff)
    val theme = remember(colors) { JSONObject().apply {
        put("darkMode", colors.background.luminance() < .5f)
        put("primaryColor", hex(colors.surfaceContainer)); put("primaryTextColor", hex(colors.onSurface))
        put("primaryBorderColor", hex(colors.primary)); put("lineColor", hex(colors.onSurfaceVariant))
        put("secondaryColor", hex(colors.secondaryContainer)); put("tertiaryColor", hex(colors.background))
        put("background", hex(colors.background)); put("mainBkg", hex(colors.surfaceContainer)); put("secondBkg", hex(colors.background))
        put("textColor", hex(colors.onSurface)); put("noteBkgColor", hex(colors.surfaceContainer)); put("noteTextColor", hex(colors.onSurface))
        put("noteBorderColor", hex(colors.outlineVariant)); put("fontSize", "14px"); put("fontFamily", "sans-serif")
    } }
    var sourceOpen by remember(source) { mutableStateOf(false) }
    var expanded by remember(source) { mutableStateOf(false) }
    var retry by remember(source) { mutableIntStateOf(0) }
    val preview = LocalInspectionMode.current
    val state by produceState(DiagramState(), source, theme, retry, sourceOpen) {
        if (sourceOpen) return@produceState
        value = DiagramState()
        try {
            if (preview) { value = DiagramState(error = "Diagram preview", loading = false); return@produceState }
            val svg = MermaidRenderer.render(context, source, theme)
            value = DiagramState(picture = withContext(Dispatchers.Default) { diagramPicture(svg) }, loading = false)
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            value = DiagramState(error = "Couldn't render this diagram", loading = false)
        }
    }
    val clipboard = LocalClipboardManager.current
    Surface(shape = MaterialTheme.shapes.medium, color = colors.surfaceContainer, border = androidx.compose.foundation.BorderStroke(1.dp, colors.outlineVariant)) {
        Column {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                AppIcon(R.drawable.ic_workflow, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(8.dp))
                Text(if (sourceOpen) "Diagram source" else "Diagram", Modifier.weight(1f), style = MaterialTheme.typography.labelMedium)
                IconToggleButton(checked = sourceOpen, onCheckedChange = { sourceOpen = it }, modifier = Modifier.size(40.dp)) {
                    AppIcon(if (sourceOpen) R.drawable.ic_workflow else R.drawable.ic_file, if (sourceOpen) "Show diagram" else "View diagram source", Modifier.size(17.dp))
                }
                IconButton(onClick = { clipboard.setText(AnnotatedString(source)) }, modifier = Modifier.size(40.dp)) { AppIcon(R.drawable.ic_copy, "Copy diagram source", Modifier.size(16.dp)) }
            }
            HorizontalDivider(color = colors.outlineVariant)
            Box(Modifier.fillMaxWidth().height(220.dp), contentAlignment = Alignment.Center) {
                when {
                    sourceOpen -> Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState()).padding(12.dp)) {
                        Text(source, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall, softWrap = false)
                    }
                    state.picture != null -> DiagramPicture(state.picture!!, Modifier.fillMaxSize().clickable(onClickLabel = "Enlarge diagram") { expanded = true }.padding(12.dp))
                    state.loading -> CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(state.error.orEmpty(), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                        Row { TextButton(onClick = { sourceOpen = true }) { Text("View source") }; IconButton(onClick = { retry++ }) { AppIcon(R.drawable.ic_refresh_cw, "Retry diagram", Modifier.size(18.dp)) } }
                    }
                }
            }
        }
    }
    if (expanded && state.picture != null) Dialog(onDismissRequest = { expanded = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                Row(Modifier.fillMaxWidth().padding(start = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Diagram", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { expanded = false }) { AppIcon(R.drawable.ic_x, "Close diagram", Modifier.size(20.dp)) }
                }
                var zoom by remember { mutableFloatStateOf(1f) }; var offset by remember { mutableStateOf(Offset.Zero) }
                var viewport by remember { mutableStateOf(IntSize.Zero) }
                val transform = rememberTransformableState { scale, pan, _ ->
                    zoom = (zoom * scale).coerceIn(1f, 6f)
                    val next = offset + pan; val limitX = viewport.width * (zoom - 1f) / 2; val limitY = viewport.height * (zoom - 1f) / 2
                    offset = Offset(next.x.coerceIn(-limitX, limitX), next.y.coerceIn(-limitY, limitY))
                }
                Box(Modifier.weight(1f).fillMaxWidth().clipToBounds().onSizeChanged { viewport = it }.transformable(transform)) {
                    DiagramPicture(state.picture!!, Modifier.fillMaxSize().padding(16.dp).graphicsLayer(scaleX = zoom, scaleY = zoom, translationX = offset.x, translationY = offset.y))
                }
            }
        }
    }
}

internal fun diagramPicture(source: String): Picture {
    SVG.setInternalEntitiesEnabled(false)
    val svg = SVG.getFromString(source)
    val bounds = svg.documentViewBox ?: error("Diagram has no dimensions")
    val scale = minOf(1400f / bounds.width(), 1400f / bounds.height(), 1f)
    return svg.renderToPicture((bounds.width() * scale).toInt().coerceAtLeast(1), (bounds.height() * scale).toInt().coerceAtLeast(1))
}

@Composable internal fun DiagramPicture(picture: Picture, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val scale = minOf(size.width / picture.width, size.height / picture.height)
        val width = picture.width * scale; val height = picture.height * scale
        drawIntoCanvas { canvas -> canvas.nativeCanvas.drawPicture(picture, android.graphics.RectF((size.width - width) / 2, (size.height - height) / 2, (size.width + width) / 2, (size.height + height) / 2)) }
    }
}

