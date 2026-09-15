package dev.zyra.mobile.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import org.json.JSONArray
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** A bounded, native chart of recorded daily totals. No transcript data or chart runtime. */
@Composable internal fun UsageChart(daily: JSONArray, partial: Boolean) {
    val days = remember(daily) { (0 until daily.length()).map { daily.getJSONObject(it) } }
    if (days.isEmpty()) return
    var metric by remember { mutableStateOf("tokens") }
    var choosingMetric by remember { mutableStateOf(false) }
    var selectedDate by remember { mutableStateOf<String?>(null) }
    val selectedIndex = days.indexOfFirst { it.optString("date") == selectedDate }.takeIf { it >= 0 }
        ?: days.indexOfLast { it.optLong("responses") > 0 }.coerceAtLeast(0)
    val selected = days[selectedIndex]
    val values = days.map { day -> if (metric == "tokens") day.optDouble("totalTokens", 0.0)
        else day.optDouble("reportedCostUsd", 0.0) + day.optDouble("estimatedCostUsd", 0.0) }
    val maximum = (values.maxOrNull() ?: 0.0).coerceAtLeast(0.0)
    val selectedValue = if (metric == "tokens") "${usageCompact(selected.optLong("totalTokens"))} tokens" else
        if (selected.optInt("responses") == 0) usageMoney(0.0) else usageCost(selected)
    val accent = MaterialTheme.colorScheme.primary
    val muted = MaterialTheme.colorScheme.outlineVariant
    val description = "${usageDate(selected.optString("date"))} UTC, $selectedValue. ${selected.optInt("responses")} recorded responses."
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Daily usage", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
            Box {
                TextButton({ choosingMetric = true }, contentPadding = PaddingValues(horizontal = 8.dp)) {
                    Text(if (metric == "tokens") "Tokens" else "Cost")
                    Spacer(Modifier.width(4.dp)); AppIcon(R.drawable.ic_chevron_down, modifier = Modifier.size(14.dp))
                }
                DropdownMenu(choosingMetric, { choosingMetric = false }) {
                    listOf("tokens" to "Tokens", "cost" to "Cost").forEach { (id, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { metric = id; choosingMetric = false },
                            trailingIcon = { if (metric == id) AppIcon(R.drawable.ic_check, modifier = Modifier.size(16.dp)) })
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(usageDate(selected.optString("date")), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(selectedValue, style = MaterialTheme.typography.labelLarge)
        }
        Text(if (metric == "tokens") usageCompact(maximum.toLong()) else usageMoney(maximum),
            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Canvas(Modifier.fillMaxWidth().height(132.dp)
            .semantics {
                contentDescription = description
                customActions = listOf(
                    CustomAccessibilityAction("Previous day") { if (selectedIndex > 0) { selectedDate = days[selectedIndex - 1].optString("date"); true } else false },
                    CustomAccessibilityAction("Next day") { if (selectedIndex < days.lastIndex) { selectedDate = days[selectedIndex + 1].optString("date"); true } else false }
                )
            }
            .pointerInput(days) { detectTapGestures { point ->
                selectedDate = days[(point.x / size.width * days.size).toInt().coerceIn(days.indices)].optString("date")
            } }) {
            val step = size.width / days.size
            val width = step * .62f
            val baseline = size.height - 5.dp.toPx()
            val plotHeight = baseline - 3.dp.toPx()
            for (fraction in listOf(0f, .5f, 1f)) drawLine(muted.copy(alpha = .45f), Offset(0f, baseline - plotHeight * fraction), Offset(size.width, baseline - plotHeight * fraction), 1.dp.toPx())
            values.forEachIndexed { index, value ->
                val x = step * (index + .5f)
                val height = if (maximum > 0) (value / maximum * plotHeight).toFloat() else 0f
                val color = if (index == selectedIndex) accent else accent.copy(alpha = .32f)
                if (height > 0) drawRoundRect(color, Offset(x - width / 2, baseline - height), Size(width, height), CornerRadius(2.dp.toPx()))
                if (metric == "cost" && days[index].optInt("unpricedResponses") > 0)
                    drawCircle(muted, 1.5.dp.toPx(), Offset(x, baseline + 4.dp.toPx()))
                if (index == selectedIndex) drawLine(accent.copy(alpha = .5f), Offset(x, 0f), Offset(x, baseline), 1.dp.toPx())
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(usageDate(days.first().optString("date")), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("UTC · ${usageDate(days.last().optString("date"))}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (partial || (metric == "cost" && days.any { it.optInt("unpricedResponses") > 0 })) {
            Text(if (partial) "Recorded history so far" else "Dots mark days with unpriced responses", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun usageDate(date: String): String = runCatching { LocalDate.parse(date).format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())) }.getOrDefault(date)
