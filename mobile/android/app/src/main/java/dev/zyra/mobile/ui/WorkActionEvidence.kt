package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.*

/** Captured evidence stays local until a person chooses to open a source link. */
@Composable fun WorkActionEvidence(action: WorkAction, full: Boolean = false) {
    val uri = LocalUriHandler.current
    var linkError by remember(action.item.id) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (action.target.isNotBlank()) SelectionContainer { Text(action.target, style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = if (full) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis) }
        action.run?.let { run ->
            if (run.status.isNotBlank()) Text(run.status.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelMedium)
            if (run.goal.isNotBlank()) Text(run.goal, style = MaterialTheme.typography.bodySmall, maxLines = if (full) Int.MAX_VALUE else 4, overflow = TextOverflow.Ellipsis)
        }
        if (action.web.isNotEmpty()) {
            action.web.forEach { source -> Surface(onClick = { if (WorkActions.safeWebUrl(source.url)) runCatching { uri.openUri(source.url) }.onFailure { linkError = true } },
                color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.medium,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .6f))) {
                Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(source.site, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        AppIcon(R.drawable.ic_external_link, "Open source", Modifier.size(13.dp))
                    }
                    Text(source.title, style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (source.snippet.isNotBlank()) Text(source.snippet, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = if (full) 8 else 3, overflow = TextOverflow.Ellipsis)
                }
            } }
            if (linkError) Text("No browser could open this source.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        if (action.command.isNotBlank()) SelectionContainer { Text(highlightedCode(action.command, "command.sh"),
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)) }
        val output = if (full) action.output else action.output.take(2000)
        if (output.isNotBlank() && action.web.isEmpty()) {
            if (action.family == "skill") {
                val snapshot = remember(output) { skillSnapshot(output) }
                if (snapshot.first.isNotBlank()) Text(snapshot.first, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Markdown(snapshot.second)
            } else SelectionContainer { Text(highlightedCode(output, action.paths.firstOrNull() ?: if (action.family in setOf("agent", "workflow")) "run.json" else "output.txt"),
                maxLines = if (full) Int.MAX_VALUE else 18, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

// Desktop's skill cards separate a short frontmatter description from the captured instructions.
private fun skillSnapshot(value: String): Pair<String, String> {
    val text = value.replace("\r\n", "\n")
    if (!text.startsWith("---\n")) return "" to text
    val end = text.indexOf("\n---\n", 4)
    if (end < 0 || end > 16000) return "" to text
    val description = text.substring(4, end).lines().firstOrNull { it.startsWith("description:") }
        ?.substringAfter(':')?.trim()?.trim('"', '\'').orEmpty()
    // Complex YAML remains available through the full captured source in the inspector.
    return description.takeUnless { it in setOf("|", ">", "|-", ">-") }.orEmpty() to text.substring(end + 5)
}

fun workElapsed(start: Long?, end: Long?): String? {
    if (start == null || end == null || end < start) return null
    val seconds = (end - start) / 1000
    return when { seconds < 60 -> seconds.toString() + "s"; seconds < 3600 -> (seconds / 60).toString() + "m " + (seconds % 60) + "s"; else -> (seconds / 3600).toString() + "h " + (seconds % 3600 / 60) + "m" }
}
