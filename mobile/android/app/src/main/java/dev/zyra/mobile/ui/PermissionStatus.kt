package dev.zyra.mobile.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.permissionLabel

/** Always reflects the canonical chat configuration, never a local default. */
@Composable internal fun PermissionStatus(mode: String, open: () -> Unit) {
    val label = when (mode) { "approval-required" -> "Ask"; "auto-review" -> "Auto"; "edits-only" -> "Edits"; "full-access" -> "Full"; else -> "…" }
    val color = when (mode) { "full-access" -> MaterialTheme.colorScheme.error; "auto-review", "edits-only" -> MaterialTheme.colorScheme.primary; else -> MaterialTheme.colorScheme.onSurfaceVariant }
    Row(Modifier.clip(MaterialTheme.shapes.small).clickable(role = Role.Button, onClick = open)
        .semantics(mergeDescendants = true) { contentDescription = "Permissions: ${permissionLabel(mode)}" }
        .padding(horizontal = 5.dp).heightIn(min = 28.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        CompositionLocalProvider(LocalContentColor provides color) {
            AppIcon(R.drawable.ic_shield_check, modifier = Modifier.size(12.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
        }
    }
}
