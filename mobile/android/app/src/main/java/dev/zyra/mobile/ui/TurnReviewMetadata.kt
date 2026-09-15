package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R

/** Status has its own semantic treatment; ordinal and file counts stay neutral. */
@OptIn(ExperimentalLayoutApi::class)
@Composable fun TurnReviewMetadata(state: String, files: Int, number: Int? = null) {
    val status = when (state) {
        "completed" -> Triple("Completed", R.drawable.ic_check, if (MaterialTheme.colorScheme.background.luminance() < .5f) Color(0xFF73D99A) else Color(0xFF177344))
        "running", "inProgress", "in_progress" -> Triple("Working", R.drawable.ic_circle, MaterialTheme.colorScheme.primary)
        "failed" -> Triple("Failed", R.drawable.ic_circle_alert, MaterialTheme.colorScheme.error)
        "cancelled", "interrupted" -> Triple("Stopped", R.drawable.ic_x, MaterialTheme.colorScheme.onSurfaceVariant)
        else -> Triple("Ready", R.drawable.ic_circle, MaterialTheme.colorScheme.onSurfaceVariant)
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
        number?.let { Text("Turn $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Surface(shape = CircleShape, color = status.third.copy(alpha = .12f), contentColor = status.third) {
            Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                AppIcon(status.second, modifier = Modifier.size(12.dp))
                Text(status.first, style = MaterialTheme.typography.labelSmall)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            AppIcon(R.drawable.ic_file, modifier = Modifier.size(13.dp))
            Text("$files ${if (files == 1) "file" else "files"}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}


