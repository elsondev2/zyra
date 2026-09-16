@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import dev.zyra.mobile.R
import dev.zyra.mobile.data.PendingSend
import dev.zyra.mobile.data.PendingAttachments
import dev.zyra.mobile.data.PendingAttachmentContent
import dev.zyra.mobile.data.TimelineItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** The outbox keeps ownership and reconciliation; this only presents its local content. */
@Composable fun PendingSendContent(send: PendingSend, machine: String, session: String, connected: Boolean, vm: MobileSession) {
    val content by produceState(PendingAttachmentContent(), send.id, machine, session, send.images) {
        value = withContext(Dispatchers.IO) { runCatching { PendingAttachments.load(vm.attachments.store, send, machine, session) }.getOrDefault(PendingAttachmentContent()) }
    }
    var preview by remember(send.id) { mutableStateOf<File?>(null) }
    val sending = send.state == "sending" && connected
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        TimelineMessage(TimelineItem("pending:" + send.id, "user", send.text), copyable = false, media = {
            if (content.images.isNotEmpty()) FlowRow(Modifier.widthIn(max = 248.dp).padding(bottom = if (send.text.isBlank() && content.files.isEmpty()) 0.dp else 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                content.images.forEachIndexed { index, (attachment, file) ->
                    MessageImageTile(file, index + 1, attachment.size) { preview = file }
                }
            }
            if (content.files.isNotEmpty()) { MessageFiles(content.files); if (send.text.isNotBlank()) Spacer(Modifier.height(8.dp)) }
        }, inspect = {})
        if (sending) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 1.5.dp)
            Text("Sending…", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Check delivery", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick = { vm.reviewPending(send) }) { Text("Review") }
            IconButton(onClick = { vm.dismissPending(send) }) { AppIcon(R.drawable.ic_check, "Mark reviewed", Modifier.size(18.dp)) }
        }
    }
    preview?.let { file -> Dialog(onDismissRequest = { preview = null }) {
        Surface(shape = MaterialTheme.shapes.large) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Image", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                    IconButton(onClick = { preview = null }) { AppIcon(R.drawable.ic_x, "Close image") }
                }
                LocalImage(file, "Sent attachment", 2048, Modifier.fillMaxWidth().heightIn(min = 200.dp, max = 500.dp))
            }
        }
    } }
}
