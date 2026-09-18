package dev.zyra.mobile.ui

import android.content.ClipData
import android.content.Intent
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import dev.zyra.mobile.R
import dev.zyra.mobile.data.WorkspaceFileDownloads
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import java.io.File

@Composable fun rememberWorkspaceTransferMenu(state: WorkspaceState, controller: WorkspaceController, connected: Boolean, closeMenu: () -> Unit): @Composable () -> Unit {
    val selected = state.file ?: return {}
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember(state.root, selected.path) { mutableStateOf(false) }
    var job by remember(state.root, selected.path) { mutableStateOf<Job?>(null) }
    var downloaded by remember { mutableLongStateOf(0) }; var total by remember { mutableLongStateOf(0) }; var speed by remember { mutableLongStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    var saveTarget by remember { mutableStateOf<Pair<String, WorkspaceFile>?>(null) }
    DisposableEffect(state.root, selected.path) { onDispose { job?.cancel() } }
    val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(selected.path.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream"
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(mime)) { uri ->
        val target = saveTarget; saveTarget = null
        if (uri != null && target != null) {
            busy = true; error = null
            job = scope.launch {
                try {
                    val file = controller.downloadFile(target.first, target.second, File(context.cacheDir, "workspace-downloads")) { a, b, rate -> downloaded = a; total = b; speed = rate }
                    withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { output -> file.inputStream().use { input ->
                        val buffer = ByteArray(48 * 1024)
                        while (true) { currentCoroutineContext().ensureActive(); val count = input.read(buffer); if (count < 0) break; output.write(buffer, 0, count) }
                    } } ?: throw IllegalStateException("Could not open the selected destination.") }
                } catch (failure: Exception) { if (failure is CancellationException) throw failure; error = failure.message ?: "Could not save file." }
                finally { busy = false }
            }
        }
    }
    val allowed = connected && !state.busy && !busy && selected.text == selected.original && selected.size <= WorkspaceFileDownloads.MAX_BYTES
    if (busy) IconButton({ job?.cancel(); busy = false }) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) }
    return {
    DropdownMenuItem(text = { Text("Save to phone") }, leadingIcon = { AppIcon(R.drawable.ic_arrow_down) }, enabled = allowed, onClick = {
        saveTarget = state.root to selected; save.launch(selected.path.substringAfterLast('/'))
    })
    DropdownMenuItem(text = { Text("Share file") }, leadingIcon = { AppIcon(R.drawable.ic_external_link) }, enabled = allowed, onClick = {
        busy = true; error = null
        job = scope.launch {
            try {
                val file = controller.downloadFile(state.root, selected, File(context.cacheDir, "workspace-downloads")) { a, b, rate -> downloaded = a; total = b; speed = rate }
                val uri = FileProvider.getUriForFile(context, context.packageName + ".sharedfiles", file)
                val share = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply { clipData = ClipData.newRawUri("File", uri) }
                context.startActivity(Intent.createChooser(share, "Share file")); closeMenu()
            } catch (failure: Exception) { if (failure is CancellationException) throw failure; error = failure.message ?: "Could not share file." }
            finally { busy = false }
        }
    })
    if (busy) DropdownMenuItem(text = { Column { Text("Downloading ${(downloaded * 100 / total.coerceAtLeast(1))}%"); if (speed > 0) Text("${speed / 1024} KB/s", style = MaterialTheme.typography.labelSmall) } },
        leadingIcon = { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) }, trailingIcon = { AppIcon(R.drawable.ic_x, "Cancel download") }, onClick = { job?.cancel(); busy = false })
    error?.let { DropdownMenuItem(text = { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }, onClick = { error = null }) }
}
}
