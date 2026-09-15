package dev.zyra.mobile.ui

import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import dev.zyra.mobile.R
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

private data class ImageDecode(val bitmap: ImageBitmap? = null, val loading: Boolean = false)
private fun decodeLocalImage(file: File, size: Int): ImageBitmap? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    file.inputStream().use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@runCatching null
    var sample = 1; while (maxOf(bounds.outWidth / sample, bounds.outHeight / sample) > size.coerceAtLeast(1)) sample *= 2
    val bitmap = file.inputStream().use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return@runCatching null
    val orientation = runCatching { android.media.ExifInterface(file.path).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1) }.getOrDefault(1)
    val matrix = android.graphics.Matrix().apply {
        when (orientation) {
            2 -> setScale(-1f, 1f); 3 -> setRotate(180f); 4 -> setScale(1f, -1f)
            5 -> { setRotate(90f); postScale(-1f, 1f) }; 6 -> setRotate(90f)
            7 -> { setRotate(270f); postScale(-1f, 1f) }; 8 -> setRotate(270f)
        }
    }
    val oriented = if (orientation in 2..8) android.graphics.Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true) else bitmap
    if (oriented !== bitmap) bitmap.recycle()
    oriented.asImageBitmap()
}.getOrNull()

@Composable fun LocalImage(file: File, description: String, size: Int, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Fit) {
    // Layoutlib captures a static frame without waiting for the IO dispatcher.
    // Native app decoding remains off the UI thread; previews use the same decoder.
    val decoded = if (androidx.compose.ui.platform.LocalInspectionMode.current) {
        remember(file.path, size) { ImageDecode(decodeLocalImage(file, size)) }
    } else {
        val loaded by produceState(ImageDecode(loading = true), file.path, size) {
            value = ImageDecode(withContext(Dispatchers.IO) { decodeLocalImage(file, size) })
        }
        loaded
    }
    if (decoded.bitmap != null) Image(decoded.bitmap, description, modifier, contentScale = contentScale)
    else Box(modifier, contentAlignment = Alignment.Center) {
        if (decoded.loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 1.5.dp)
        else Text("Image unavailable", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable fun AttachmentStrip(controller: AttachmentController, controls: Boolean = true) {
    val state by controller.state.collectAsStateWithLifecycle()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { controller.add(it) }
    var preview by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(state.items) { if (preview != null && state.items.none { it.attachment.id == preview }) preview = null }
    Column(Modifier.fillMaxWidth()) {
        if (controls) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { picker.launch(arrayOf("image/*")) }, enabled = !state.preparing && state.items.size < 12) { Text("Add photos") }
        }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        if (state.items.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
            items(state.items, key = { it.attachment.id }) { item ->
                Column(Modifier.width(120.dp)) {
                    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                    Box(Modifier.size(width = 120.dp, height = 90.dp)) {
                        if (item.attachment.mimeType.startsWith("image/")) LocalImage(controller.store.file(item.attachment.id), item.attachment.name, 256, Modifier.fillMaxSize().clickable { preview = item.attachment.id }, ContentScale.Crop)
                        else Column(Modifier.fillMaxSize().clickable { preview = item.attachment.id }.padding(10.dp), verticalArrangement = Arrangement.Center) {
                            DesktopFileIcon(item.attachment.name, modifier = Modifier.size(24.dp))
                            Text(item.attachment.name, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall)
                        }
                        FilledIconButton(onClick = { controller.remove(item.attachment.id) }, modifier = Modifier.align(Alignment.TopEnd).size(32.dp),
                            colors = IconButtonDefaults.filledIconButtonColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
                            AppIcon(R.drawable.ic_x, "Remove " + item.attachment.name, Modifier.size(16.dp))
                        }
                        if (!item.ready && item.error == null) LinearProgressIndicator(progress = { item.offset.toFloat() / item.attachment.size.coerceAtLeast(1) }, modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth())
                    }
                    }
                    if (item.error != null) {
                        Text(item.error, color = MaterialTheme.colorScheme.error, maxLines = 2, style = MaterialTheme.typography.labelSmall)
                        TextButton(onClick = controller::resume, contentPadding = PaddingValues(4.dp)) { Text("Resume") }
                    }
                }
            }
        }
    }
    preview?.let { id ->
        val item = state.items.firstOrNull { it.attachment.id == id }?.attachment
        if (item != null) {
            if (item.mimeType.startsWith("image/")) Dialog(onDismissRequest = { preview = null }) { Surface(shape = MaterialTheme.shapes.large) {
                Column(Modifier.padding(12.dp)) { LocalImage(controller.store.file(id), "Attachment preview", 1536, Modifier.fillMaxWidth().heightIn(min = 200.dp, max = 500.dp)); TextButton(onClick = { preview = null }) { Text("Close") } }
            } }
            else {
                val content by produceState<String?>(null, id) { value = withContext(Dispatchers.IO) { runCatching { controller.store.file(id).readText() }.getOrNull() } }
                ZyraSheet(item.name, close = { preview = null }) {
                    Column(Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(16.dp)) {
                        content?.let { AttachmentTextContent(item.name, it) } ?: CircularProgressIndicator(Modifier.size(20.dp))
                    }
                }
            }
        }
    }
}
