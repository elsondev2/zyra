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
            val cached by produceState<File?>(null, state.machine?.id, ref.optString("sha256"), revision) { value = state.machine?.id?.let { vm.media.cached(it, ref) } }
            MessageImageTile(cached, index + 1, ref.optLong("bytes")) { vm.openImage(ref) }
        }
        else image.optString("unavailable").takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
    }
}
/** Shared by live chat and native fixtures: always the same 4:3 tile. */
@Composable fun MessageImageTile(file: File?, position: Int = 1, bytes: Long = 0, onClick: () -> Unit = {}) {
    Surface(onClick = onClick, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = Modifier.size(width = 120.dp, height = 90.dp)) {
        if (file != null) LocalImage(file, "Open image $position", 256, Modifier.fillMaxSize(), androidx.compose.ui.layout.ContentScale.Crop)
        else Column(Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            AppIcon(R.drawable.ic_camera, "Load image $position")
            if (bytes > 0) Text("${bytes / 1024} KB", Modifier.padding(top = 6.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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

