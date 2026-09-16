package dev.zyra.mobile.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.text.DateFormat
import java.text.NumberFormat
import java.util.Date

private fun limitWindowLabel(minutes: Int): String = when {
    minutes <= 0 -> "Usage window"
    minutes == 10080 -> "Weekly"
    minutes == 1440 -> "1 day"
    minutes == 60 -> "1 hour"
    minutes == 1 -> "1 minute"
    minutes % 1440 == 0 -> "${minutes / 1440} days"
    minutes % 60 == 0 -> "${minutes / 60} hours"
    else -> "$minutes minutes"
}

/** A current quota snapshot, never a simulated history or forecast. */
@Composable internal fun LimitQuotaChart(window: JSONObject) {
    val remaining = dev.zyra.mobile.data.AccountLimitPresentation.remaining(window)
    val label = limitWindowLabel(window.optInt("durationMinutes"))
    val percentage = remaining?.let { NumberFormat.getNumberInstance().apply { maximumFractionDigits = 1 }.format(it) + "%" }
    val reset = window.optLong("resetsAt").takeIf { it in 1..(Long.MAX_VALUE / 1000) }
    val resetLabel = reset?.let { "Resets ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it * 1000))}" }
    val fill by animateFloatAsState(((remaining ?: 0.0) / 100).toFloat(), tween(if (LocalReduceMotion.current) 0 else 320), label = "Remaining quota")
    val accent = if (remaining != null && remaining <= 10) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    Column(Modifier.fillMaxWidth().clearAndSetSemantics {
        contentDescription = listOfNotNull(label, percentage?.let { "$it remaining" } ?: "Unavailable", resetLabel).joinToString(". ")
        remaining?.let { progressBarRangeInfo = ProgressBarRangeInfo((it / 100).toFloat(), 0f..1f) }
    }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(percentage?.let { "$it left" } ?: "Unavailable", style = MaterialTheme.typography.titleMedium)
        }
        if (remaining != null) LinearProgressIndicator(progress = { fill }, modifier = Modifier.fillMaxWidth().height(6.dp), color = accent,
            trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f), gapSize = 0.dp, drawStopIndicator = {})
        resetLabel?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
