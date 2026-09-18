package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextOverflow
import dev.zyra.mobile.R
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable fun FleetScreen(controller: FleetController, connected: Boolean) {
    val state by controller.state.collectAsStateWithLifecycle()
    Box(Modifier.fillMaxSize()) {
        if (state.selected != null) FleetRunDetail(state, connected, controller)
        else FleetDirectory(state, connected, controller::select, controller::more)
        state.error?.let { error ->
            Snackbar(Modifier.align(Alignment.BottomCenter).padding(16.dp)) { Text(error) }
        }
    }
    FleetStartSheet(state, connected, controller)
}

@Composable fun FleetDirectory(state: FleetState, connected: Boolean, select: (FleetRun) -> Unit, more: () -> Unit) {
    if (state.runs.isEmpty()) {
        Box(Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
            if (state.busy) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
            else Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AppIcon(if (state.kind == "agents") R.drawable.ic_bot else R.drawable.ic_workflow, modifier = Modifier.size(28.dp))
                Text(if (state.kind == "agents") "No agent runs yet" else "No workflow runs yet", style = MaterialTheme.typography.titleMedium)
                Text(if (state.definitions.isNotEmpty()) "Use + to start work on this computer." else "Runs from this chat will appear here.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(state.runs, key = { it.id }) { run ->
            Surface(onClick = { select(run) }, enabled = connected && !state.busy, modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainer,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        AppIcon(if (state.kind == "agents") R.drawable.ic_bot else R.drawable.ic_workflow, modifier = Modifier.size(24.dp))
                        Text(run.name, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        FleetStatus(run.status)
                    }
                    if (run.goal.isNotBlank()) Text(run.goal, style = MaterialTheme.typography.bodyMedium, maxLines = 3,
                        overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(fleetRunMetadata(run), Modifier.weight(1f), style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        AppIcon(R.drawable.ic_chevron_right, "Open run", Modifier.size(16.dp))
                    }
                }
            }
        }
        if (state.nextOffset != null) item { TextButton(onClick = more, enabled = connected && !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Earlier runs") } }
    }
}

@Composable internal fun FleetStatus(status: String) {
    val color = when (status) {
        "failed", "error" -> MaterialTheme.colorScheme.error
        "running", "queued", "waiting", "paused", "awaiting-approval" -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Text(status.replace('-', ' ').replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall, color = color)
}

