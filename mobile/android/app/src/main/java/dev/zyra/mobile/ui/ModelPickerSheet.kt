package dev.zyra.mobile.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R

@Composable fun ModelPickerSheet(state: ModelPickerState, model: String, effort: String, close: () -> Unit,
    select: (String) -> Unit, thinking: (String, String) -> Unit, retry: () -> Unit) {
    ZyraSheet("Model", close) { ModelPickerContent(state, model, effort, select, thinking, retry) }
}

@Composable fun ColumnScope.ModelPickerContent(state: ModelPickerState, model: String, effort: String,
    select: (String) -> Unit, thinking: (String, String) -> Unit, retry: () -> Unit) {
    if (state.loading) Row(Modifier.padding(24.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
        Text("Loading models…", style = MaterialTheme.typography.bodyMedium)
    }
    state.error?.let { message ->
        Text(message, Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        if (state.models.isEmpty()) TextButton(onClick = retry, modifier = Modifier.padding(horizontal = 12.dp)) { Text("Try again") }
    }
    if (!state.loading && state.error == null && state.models.isEmpty()) Text("No models available. Check provider setup on your PC.", Modifier.padding(20.dp), style = MaterialTheme.typography.bodyMedium)
    state.models.forEach { item ->
        ZyraSettingRow(title = item.label, leading = { ThinkingGaugeIcon(if (item.id == model || item.id.substringAfter('/' ) == model) effort else "", label = item.label) }, click = if (state.applying == null) ({ select(item.id) }) else null,
            trailing = {
                if (state.applying == item.id) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else if (item.id == model || item.id.substringAfter('/') == model) AppIcon(R.drawable.ic_check, "Selected", Modifier.size(18.dp))
            })
    }
    val selected = state.models.find { it.id == model || it.id.substringAfter('/') == model }
    if (!selected?.efforts.isNullOrEmpty()) {
        HorizontalDivider(Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
        ThinkingSlider(selected!!.id, selected.efforts, effort, state.applying == null, thinking)
    }
}

