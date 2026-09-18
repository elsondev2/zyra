@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package dev.zyra.mobile.ui
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
import dev.zyra.mobile.R
import java.io.File
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import kotlinx.coroutines.CancellationException
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.json.JSONObject

@Composable fun MediaImages(raw: String, vm: MobileSession) {
    val state by vm.state.collectAsStateWithLifecycle()
    val revision by vm.media.cacheRevision.collectAsStateWithLifecycle()
    val images = remember(raw) { MediaController.images(raw) }
    if (images.isEmpty()) return
    FlowRow(Modifier.widthIn(max = (120 * minOf(images.size, 2) + 8 * (minOf(images.size, 2) - 1)).dp).padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    images.take(12).forEachIndexed { index, image ->
        val ref = image.optJSONObject("mediaRef")
        if (ref != null) {
            key(state.machine?.id, state.session.id, ref.optString("sha256")) {
                val view = LocalView.current
                val margin = with(LocalDensity.current) { 180.dp.toPx() }
                var nearby by remember { mutableStateOf(false) }
                var retry by remember { mutableIntStateOf(0) }
                val preview by produceState(InlineImagePreview(), nearby, state.connection, revision, retry) {
                    if (!nearby) return@produceState
                    try {
                        val machine = state.machine?.id ?: error("Connect to load this image.")
                        val cached = vm.media.cached(machine, ref)
                        if (cached != null) {
                            value = InlineImagePreview(file = cached)
                            return@produceState
                        }
                        value = InlineImagePreview(loading = true)
                        value = InlineImagePreview(file = vm.inlineImage(machine, state.session.id, ref))
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        value = InlineImagePreview(failed = true)
                    }
                }
                Box(Modifier.onGloballyPositioned { coordinates ->
                    val origin = IntArray(2).also(view::getLocationInWindow)
                    val position = coordinates.positionInWindow()
                    // Use unclipped geometry: a work block may compose images far offscreen.
                    nearby = imageNearViewport(position.x, position.y, coordinates.size.width.toFloat(), coordinates.size.height.toFloat(), origin[0].toFloat(), origin[1].toFloat(), view.width.toFloat(), view.height.toFloat(), margin)
                }) {
                    MessageImageTile(preview.file, index + 1, ref.optLong("bytes"), preview.loading, preview.failed, { retry++ }) { vm.openImage(ref) }
                }
            }
        }
        else image.optString("unavailable").takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
    }
}
private data class InlineImagePreview(val file: File? = null, val loading: Boolean = false, val failed: Boolean = false)
/** Shared by live chat and native fixtures: always the same 4:3 tile. */
@Composable fun MessageImageTile(file: File?, position: Int = 1, bytes: Long = 0, onClick: () -> Unit = {}) {
    MessageImageTile(file, position, bytes, loading = false, failed = false, onRetry = {}, onClick = onClick)
}
@Composable fun MessageImageTile(file: File?, position: Int, bytes: Long, loading: Boolean, failed: Boolean, onRetry: () -> Unit, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = Modifier.size(width = 120.dp, height = 90.dp)) {
        if (file != null) LocalImage(file, "Open image $position", 256, Modifier.fillMaxSize(), androidx.compose.ui.layout.ContentScale.Crop)
        else Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            when {
                loading -> CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                failed -> IconButton(onClick = onRetry) { AppIcon(R.drawable.ic_refresh_cw, "Retry image $position") }
                else -> AppIcon(R.drawable.ic_image, "Image $position")
            }
        }
    }
}
@Composable fun MediaDialog(vm: MobileSession) {
    val state by vm.media.state.collectAsStateWithLifecycle()
    val selected = state ?: return
    val ref = remember(selected.ref) { JSONObject(selected.ref) }
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(ref.optString("mimeType", "image/png"))) { it?.let(vm.media::save) }
    var scale by remember(selected.ref) { mutableFloatStateOf(1f) }
    var x by remember(selected.ref) { mutableFloatStateOf(0f) }; var y by remember(selected.ref) { mutableFloatStateOf(0f) }
    Dialog(onDismissRequest = vm.media::close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().fillMaxHeight(0.94f).padding(horizontal = 8.dp)) {
            Column(Modifier.padding(16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text("Image", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f)); IconButton(onClick = vm.media::close) { AppIcon(R.drawable.ic_x, "Close image") } }
                if (selected.loading) { LinearProgressIndicator(progress = { selected.progress / 100f }, modifier = Modifier.fillMaxWidth()); Text("${selected.progress}% downloaded") }
                selected.file?.let { file ->
                    Box(Modifier.fillMaxWidth().weight(1f).clipToBounds().pointerInput(selected.ref) { detectTransformGestures { _, pan, zoom, _ -> scale = (scale * zoom).coerceIn(1f, 5f); x = (x + pan.x).coerceIn(-size.width * (scale - 1), size.width * (scale - 1)); y = (y + pan.y).coerceIn(-size.height * (scale - 1), size.height * (scale - 1)) } }) {
                        LocalImage(file, "Session image", 2048, Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale; translationX = x; translationY = y })
                    }
                    Text("Pinch to zoom · drag to move", style = MaterialTheme.typography.labelSmall)
                }
                selected.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (selected.saved) Text("Saved to your selected location.", style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (selected.error != null && selected.file == null) TextButton(onClick = { vm.openImage(ref) }) { Text("Resume") }
                    if (selected.error != null && selected.file == null) TextButton(onClick = { vm.media.close(); vm.refreshSession() }) { Text("Refresh chat") }
                    if (selected.file != null) TextButton(onClick = { val extension = when (ref.optString("mimeType")) { "image/jpeg" -> "jpg"; "image/webp" -> "webp"; "image/gif" -> "gif"; else -> "png" }; save.launch("zyra-image.$extension") }) { Text("Save image") }
                    TextButton(onClick = vm.media::close) { Text("Close") }
                }
            }
        }
    }
}

