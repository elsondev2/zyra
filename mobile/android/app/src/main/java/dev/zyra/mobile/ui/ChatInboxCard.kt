package dev.zyra.mobile.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.*
import java.time.Instant

/** Desktop AgentInboxCard hierarchy: project and activity, title, model and machine. */
@Composable fun ChatInboxCard(chat: Chat, machineName: String?, artwork: ProjectMark?, selected: Boolean, open: () -> Unit, rename: () -> Unit, archive: () -> Unit) {
    var menu by remember(chat.key) { mutableStateOf(false) }
    Surface(onClick = open, shape = RoundedCornerShape(12.dp), color = if (selected) MaterialTheme.colorScheme.surfaceContainer else Color.Transparent,
        modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
        Column(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp, top = 8.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                if (isPersonalChat(chat.project)) AppIcon(R.drawable.ic_message_square, modifier = Modifier.size(18.dp)) else ProjectArtwork(artwork)
                Text(if (isPersonalChat(chat.project)) "Chat" else projectLabel(chat.project, artwork), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                ChatInboxStatus(chat)
                Box {
                    IconButton({ menu = true }, Modifier.size(40.dp)) { AppIcon(R.drawable.ic_ellipsis, "Options for ${chat.title}", Modifier.size(17.dp)) }
                    DropdownMenu(menu, { menu = false }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer, tonalElevation = 0.dp) {
                        DropdownMenuItem(text = { Text("Rename") }, leadingIcon = { AppIcon(R.drawable.ic_pencil) }, onClick = { menu = false; rename() })
                        DropdownMenuItem(text = { Text(if (chat.archived) "Restore" else "Archive") }, leadingIcon = { AppIcon(R.drawable.ic_archive) }, onClick = { menu = false; archive() })
                    }
                }
            }
            Text(chat.title, Modifier.padding(end = 12.dp), style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(Modifier.fillMaxWidth().padding(top = 4.dp, end = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(listOfNotNull(chat.modelLabel, machineName?.takeIf { it.isNotBlank() }).joinToString(" · "), Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (chat.tuiOpen) AppIcon(R.drawable.ic_terminal, "Open in terminal", Modifier.size(14.dp))
            }
        }
    }
}

@Composable private fun ChatInboxStatus(chat: Chat) {
    val label = when {
        chat.attention == "approval" -> "Review"
        chat.attention != null -> "Input needed"
        chat.working -> if (chat.state == "background") "Background" else "Working"
        chat.lastTurnState == "failed" -> "Failed"
        chat.lastTurnState == "completed" -> "Done"
        else -> relativeChatTime(chat.modifiedAt)
    }
    if (label.isEmpty()) return
    val color = when { chat.attention != null -> MaterialTheme.colorScheme.primary; chat.lastTurnState == "failed" && !chat.working -> MaterialTheme.colorScheme.error; else -> MaterialTheme.colorScheme.onSurfaceVariant }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        if (chat.working && chat.attention == null && !LocalReduceMotion.current) CircularProgressIndicator(Modifier.size(9.dp), strokeWidth = 1.dp, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = color, maxLines = 1)
    }
}
fun relativeChatTime(timestamp: String, now: Long = System.currentTimeMillis()): String {
    val time = runCatching { Instant.parse(timestamp).toEpochMilli() }.getOrNull() ?: return ""
    val minutes = ((now - time).coerceAtLeast(0) / 60000)
    return when { minutes < 1 -> "Now"; minutes < 60 -> "${minutes}m"; minutes < 1440 -> "${minutes / 60}h"; minutes < 10080 -> "${minutes / 1440}d"; else -> "${minutes / 10080}w" }
}
