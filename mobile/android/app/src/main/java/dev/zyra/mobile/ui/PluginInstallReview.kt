package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.data.PluginInstallReview
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable fun PluginInstallReviewContent(review: PluginInstallReview) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Ready for your review", style = MaterialTheme.typography.titleMedium)
            Text("${review.version} · ${review.fileCount} files · ${pluginBytes(review.bytes)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${review.skillCount} ${if (review.skillCount == 1) "skill" else "skills"}", style = MaterialTheme.typography.labelLarge)
            review.skills.forEach { (name, description) -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(name, style = MaterialTheme.typography.titleSmall)
                if (description.isNotBlank()) Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } }
            if (review.skillCount > review.skills.size) Text("And ${review.skillCount - review.skills.size} more skills", style = MaterialTheme.typography.bodySmall)
            if (review.capabilities.isNotEmpty()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Text("Declared capabilities", style = MaterialTheme.typography.labelLarge)
                Text(review.capabilities.joinToString("\n"), style = MaterialTheme.typography.bodySmall)
            }
            val unavailable = review.contributions.filter { it.second != "supported" }
            if (unavailable.isNotEmpty()) Text("Not active in chats yet: ${unavailable.joinToString { it.first }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (review.executableFiles) Text("This package includes executable files.", style = MaterialTheme.typography.bodySmall)
            review.notes.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
            if (review.diagnosticCount > review.notes.size) Text("The PC inspection has ${review.diagnosticCount - review.notes.size} more package notes. Review the remaining notes on the desktop.", style = MaterialTheme.typography.bodySmall)
            val expires = runCatching { DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(review.expiresAt)) }.getOrNull()
            expires?.let { Text("This review expires at $it.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}
private fun pluginBytes(bytes: Long) = when { bytes >= 1048576 -> "%.1f MB".format(bytes / 1048576.0); bytes >= 1024 -> "%.0f KB".format(bytes / 1024.0); else -> "$bytes bytes" }
