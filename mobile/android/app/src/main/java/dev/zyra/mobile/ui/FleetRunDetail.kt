package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R

@Composable fun FleetRunDetail(state: FleetState, connected: Boolean, controller: FleetController) {
    val selected = state.selected ?: return
    var message by rememberSaveable(selected.id) { mutableStateOf("") }
    val enabled = connected && !state.busy
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(fleetRunMetadata(selected), Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FleetStatus(selected.status)
            }
        }
        if (selected.goal.isNotBlank()) item { Text(selected.goal, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (state.runError.isNotBlank()) item { Text(state.runError, color = MaterialTheme.colorScheme.error) }
        if (state.output.isNotBlank()) item { SelectionContainer { Markdown(state.output) } }
        else if (!state.busy && state.runError.isBlank()) item { Text("No result yet.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium) }
        if (state.kind == "agents") item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ZyraTextField(value = message, onValueChange = { message = it.take(30000) }, placeholder = { Text("Follow up…") }, modifier = Modifier.weight(1f), maxLines = 4)
                IconButton(onClick = {
                    val submitted = message
                    controller.action(if (selected.status in listOf("cancelled", "failed")) "resume" else "send", submitted) {
                        if (message == submitted) message = ""
                    }
                }, enabled = message.isNotBlank() && enabled) { AppIcon(R.drawable.ic_arrow_up, "Send follow-up") }
            }
        }
    }
}

