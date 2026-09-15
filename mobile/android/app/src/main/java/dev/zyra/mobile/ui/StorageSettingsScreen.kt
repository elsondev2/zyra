package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.ImageCacheStorage
import dev.zyra.mobile.data.ImageCacheUsage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable fun StorageSettingsScreen(measureHistory: suspend () -> dev.zyra.mobile.data.LocalStorageUsage, clearHistory: suspend () -> dev.zyra.mobile.data.LocalStorageUsage) {
    val app = LocalContext.current.applicationContext
    val storage = remember(app) { ImageCacheStorage(app.cacheDir) }
    val scope = rememberCoroutineScope()
    var history by remember { mutableStateOf(dev.zyra.mobile.data.LocalStorageUsage()) }
    var clearHistoryDialog by remember { mutableStateOf(false) }
    var usage by remember { mutableStateOf(ImageCacheUsage()) }
    var busy by remember { mutableStateOf(true) }; var confirm by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }; var cleared by remember { mutableStateOf(false) }
    LaunchedEffect(storage) { try { usage = withContext(Dispatchers.IO) { storage.usage() }; history = measureHistory() } catch (failure: Exception) { if (failure is kotlinx.coroutines.CancellationException) throw failure; error = "Could not measure the image cache." } finally { busy = false } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("On this phone", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ZyraSettingRow(R.drawable.ic_message_square, "Saved chat history", storageBytes(history.historyBytes), trailing = {
            IconButton({ clearHistoryDialog = true }, enabled = !busy && history.historyBytes > 0) { AppIcon(R.drawable.ic_x, "Clear cached chat history", Modifier.size(18.dp)) }
        })
        ZyraSettingRow(R.drawable.ic_square_pen, "Drafts & queued messages", storageBytes(history.draftBytes + history.queuedBytes), trailing = { AppIcon(R.drawable.ic_shield_check, "Preserved", Modifier.size(18.dp)) })
        Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainer) {
            Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Downloaded files", style = MaterialTheme.typography.titleSmall)
                    Text(storageBytes(usage.downloadableBytes), style = MaterialTheme.typography.headlineMedium)
                    Text("${usage.files} downloaded files", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                AppIcon(R.drawable.ic_folder, modifier = Modifier.size(30.dp))
            }
        }
        Text("Files download again when needed. Your chats, drafts, queued messages and paired computers stay on this phone.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (usage.inProgressBytes > 0) Text("${storageBytes(usage.inProgressBytes)} of resumable downloads will be kept.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ZyraOutlinedButton(onClick = { confirm = true }, enabled = !busy && usage.files > 0, modifier = Modifier.fillMaxWidth()) {
            if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else AppIcon(R.drawable.ic_x, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp)); Text("Clear downloaded files")
        }
        if (cleared) Text("Downloads cleared.", style = MaterialTheme.typography.bodySmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
    if (clearHistoryDialog) ZyraSheet("Clear saved history?", { clearHistoryDialog = false }) {
        Text("Remove downloaded chat history from this phone. Chats remain on your computers and download again when opened. Drafts and queued messages stay here. An active chat can cache new messages again.", Modifier.padding(20.dp), style = MaterialTheme.typography.bodyMedium)
        ZyraButton(onClick = {
            clearHistoryDialog = false; busy = true
            scope.launch {
                try { history = clearHistory() }
                catch (failure: Exception) { if (failure is kotlinx.coroutines.CancellationException) throw failure; error = "Could not clear cached history." }
                finally { busy = false }
            }
        }, modifier = Modifier.fillMaxWidth().padding(20.dp)) { Text("Clear saved history") }
    }
    if (confirm) ZyraSheet("Clear downloads?", { confirm = false }) {
        Text("Remove ${storageBytes(usage.downloadableBytes)} of downloaded files from this phone. Original files and unsent work are preserved.", Modifier.padding(16.dp))
        ZyraButton(onClick = {
            confirm = false; busy = true; error = null
            scope.launch {
                try { usage = withContext(Dispatchers.IO) { storage.clearCompleted() }; cleared = true }
                catch (failure: Exception) { if (failure is kotlinx.coroutines.CancellationException) throw failure; error = failure.message }
                finally { busy = false }
            }
        }, modifier = Modifier.fillMaxWidth().padding(16.dp)) { Text("Clear downloads") }
    }
}
private fun storageBytes(value: Long): String = if (value < 1024 * 1024) "${value / 1024} KB" else String.format(java.util.Locale.getDefault(), "%.1f MB", value / (1024.0 * 1024.0))
