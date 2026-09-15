package dev.zyra.mobile.ui

import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import kotlinx.coroutines.CancellationException
import java.io.File

fun workspaceRasterImage(path: String): Boolean = path.substringAfterLast('.', "").lowercase() in setOf("png", "jpg", "jpeg", "webp", "gif", "bmp")
@Composable fun WorkspaceImagePreview(state: WorkspaceState, controller: WorkspaceController, modifier: Modifier = Modifier) {
    val source = state.file ?: return
    val context = LocalContext.current
    var file by remember(state.root, source.path, source.etag) { mutableStateOf<File?>(null) }
    var error by remember(state.root, source.path, source.etag) { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    var progress by remember { mutableFloatStateOf(0f) }
    var scale by remember(state.root, source.path, source.etag) { mutableFloatStateOf(1f) }; var x by remember(state.root, source.path, source.etag) { mutableFloatStateOf(0f) }; var y by remember(state.root, source.path, source.etag) { mutableFloatStateOf(0f) }
    LaunchedEffect(state.root, source.path, source.etag, retry) {
        error = null
        try {
            check(source.size <= 20L * 1024 * 1024) { "Use Save to phone or Share file for images over 20 MB." }
            file = controller.downloadFile(state.root, source, File(context.cacheDir, "workspace-downloads")) { offset, total, _ -> progress = offset.toFloat() / total.coerceAtLeast(1) }
        } catch (failure: Exception) { if (failure is CancellationException) throw failure; error = failure.message ?: "Could not load image." }
    }
    Box(modifier.fillMaxSize().clipToBounds().pointerInput(state.root, source.path, source.etag) {
        detectTransformGestures { _, pan, zoom, _ -> scale = (scale * zoom).coerceIn(1f, 5f); x = (x + pan.x).coerceIn(-size.width * (scale - 1), size.width * (scale - 1)); y = (y + pan.y).coerceIn(-size.height * (scale - 1), size.height * (scale - 1)) }
    }, contentAlignment = Alignment.Center) {
        if (file != null) LocalImage(file!!, source.path.substringAfterLast('/'), 2048, Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale; translationX = x; translationY = y })
        else if (error == null) CircularProgressIndicator(progress = { progress }, modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
        else Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(error!!, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton({ retry++ }) { AppIcon(R.drawable.ic_refresh_cw, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Retry") }
        }
    }
}
