package dev.zyra.mobile.ui

import android.graphics.BitmapFactory
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.zyra.mobile.R
import dev.zyra.mobile.data.RemoteImageDownloads
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.File

val LocalRemoteImageOwner = staticCompositionLocalOf { "standalone" }

/** No remote request occurs until the user taps this image. Leaving its owner cancels the transfer. */
@Composable fun RemoteMarkdownImage(destination: String, description: String, owner: String) {
    key(owner, destination) { RemoteMarkdownImageContent(destination, description, owner) }
}
@Composable private fun RemoteMarkdownImageContent(destination: String, description: String, owner: String) {
    val app = LocalContext.current.applicationContext
    val uri = LocalUriHandler.current
    val downloader = remember(app) { RemoteImageDownloads(File(app.cacheDir, "remote-markdown-images"), validateImage = { file ->
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        file.inputStream().use { BitmapFactory.decodeStream(it, null, bounds) }
        RemoteImageDownloads.checkDimensions(bounds.outWidth, bounds.outHeight)
    }) }
    val host = remember(destination) { runCatching { RemoteImageDownloads.checkedUrl(destination).host }.getOrDefault("Image") }
    val previewAllowed = remember(destination) { runCatching { RemoteImageDownloads.checkedUrl(destination).isHttps }.getOrDefault(false) }
    val scope = rememberCoroutineScope()
    var job by remember { mutableStateOf<Job?>(null) }
    var file by remember { mutableStateOf<File?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var preview by remember { mutableStateOf(false) }
    DisposableEffect(owner, destination) { onDispose { job?.cancel() } }
    val load: () -> Unit = {
        if (!loading) {
            loading = true; error = null
            job = scope.launch {
                try {
                    check(RemoteImageDownloads.checkedUrl(destination).isHttps) { "Open this HTTP image in your browser." }
                    file = downloader.load(destination, owner)
                }
                catch (failure: Exception) { if (failure is CancellationException) throw failure; error = failure.message ?: "Could not load image." }
                finally { loading = false }
            }
        }
    }
    val open: () -> Unit = { if (previewAllowed) load() else runCatching { uri.openUri(destination) }.let { } }
    if (file != null || loading) MarkdownImageCard(description, file, loading, null, file?.length()) {
        if (file?.isFile == true) preview = true else { file = null; load() }
    }
    else if (LocalMarkdownCompactImages.current) Surface(onClick = open, shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxSize()) {
        Box(contentAlignment = Alignment.Center) { AppIcon(if (!previewAllowed) R.drawable.ic_external_link else if (error == null) R.drawable.ic_arrow_down else R.drawable.ic_refresh_cw,
            "${if (previewAllowed) "Load" else "Open"} image: $description from $host", Modifier.size(22.dp)) }
    } else Surface(onClick = open, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainer,
        modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = 14.dp, top = 10.dp, bottom = 10.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AppIcon(if (!previewAllowed) R.drawable.ic_external_link else if (error == null) R.drawable.ic_arrow_down else R.drawable.ic_refresh_cw, modifier = Modifier.size(21.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(description, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelLarge)
                Text(error ?: "Load image · $host", maxLines = 2, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton({ runCatching { uri.openUri(destination) } }) { AppIcon(R.drawable.ic_external_link, "Open image in browser", Modifier.size(18.dp)) }
        }
    }
    if (preview && file != null) RemoteImageDialog(file!!, description, { preview = false }) { runCatching { uri.openUri(destination) } }
}
@Composable private fun RemoteImageDialog(file: File, description: String, close: () -> Unit, browser: () -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }; var x by remember { mutableFloatStateOf(0f) }; var y by remember { mutableFloatStateOf(0f) }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().fillMaxHeight(.94f).padding(8.dp), shape = MaterialTheme.shapes.large) {
            Column(Modifier.navigationBarsPadding().padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(description, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
                    IconButton(browser) { AppIcon(R.drawable.ic_external_link, "Open image in browser") }
                    IconButton(close) { AppIcon(R.drawable.ic_x, "Close image") }
                }
                Box(Modifier.fillMaxWidth().weight(1f).clipToBounds().pointerInput(file.path) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        scale = (scale * zoom).coerceIn(1f, 5f)
                        x = (x + pan.x).coerceIn(-size.width * (scale - 1), size.width * (scale - 1))
                        y = (y + pan.y).coerceIn(-size.height * (scale - 1), size.height * (scale - 1))
                    }
                }) { LocalImage(file, description, 2048, Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale; translationX = x; translationY = y }) }
            }
        }
    }
}
