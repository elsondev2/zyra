package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.combinedClickable
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R

@Composable fun TerminalScreen(controller: TerminalWorkspaceController) {
    val state by controller.state.collectAsStateWithLifecycle()
    var picking by remember { mutableStateOf(false) }
    var options by remember { mutableStateOf<String?>(null) }
    var ending by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize()) {
        if (state.panes.isEmpty()) Box(Modifier.weight(1f)) { TerminalListContent(state, controller::refresh, controller::create, controller::select, { options = it }) }
        else {
            Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { controller.back() }) { AppIcon(R.drawable.ic_arrow_left, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("All terminals") }
                Spacer(Modifier.weight(1f))
                if (state.supportsSplit && state.panes.size < 2) TextButton(onClick = { picking = true }, enabled = state.connected && !state.busy) { AppIcon(R.drawable.ic_plus, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(5.dp)); Text("Split") }
            }
            state.panes.forEach { id ->
                controller.pane(id)?.let { pane ->
                    key(id) { TerminalPaneView(pane, state.terminals.find { it.id == id }?.title ?: "Terminal", { controller.remove(id) }, { controller.end(id) }, Modifier.weight(1f)) }
                    if (id != state.panes.last()) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
        state.error?.let { Text(it, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
    options?.let { id -> state.terminals.find { it.id == id }?.let { terminal ->
        ZyraSheet(terminal.title, { options = null }) {
            ZyraSettingRow(R.drawable.ic_terminal, "Open terminal", click = { options = null; controller.select(id) })
            ZyraSettingRow(R.drawable.ic_x, if (terminal.status == "exited") "Remove session" else "End session", click = { options = null; ending = id })
        }
    } }
    ending?.let { id -> AlertDialog(onDismissRequest = { ending = null }, title = { Text("End terminal session?") },
        text = { Text("This closes the shell on your PC. Any work running in it will stop.") },
        confirmButton = { TextButton(onClick = { ending = null; controller.end(id) }, enabled = state.connected && !state.busy) { Text("End session") } },
        dismissButton = { TextButton(onClick = { ending = null }) { Text("Cancel") } }) }
    if (picking) ZyraSheet("Add a terminal below", { picking = false }) {
        ZyraSettingRow(R.drawable.ic_plus, "New terminal", click = { picking = false; controller.create() })
        state.terminals.filterNot { it.id in state.panes }.forEach { terminal ->
            ZyraSettingRow(R.drawable.ic_terminal, terminal.title, if (terminal.status == "exited") "Finished" else "Running", click = { picking = false; controller.select(terminal.id) })
        }
    }
}

@Composable fun TerminalListContent(state: TerminalWorkspaceState, refresh: () -> Unit, create: () -> Unit, select: (String) -> Unit, options: (String) -> Unit = {}) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Sessions", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            IconButton(refresh, enabled = state.connected && !state.busy) { if (state.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else AppIcon(R.drawable.ic_refresh_cw, "Refresh terminal sessions", Modifier.size(18.dp)) }
        }
        if (!state.connected) Text("Reconnect to your PC to open a terminal. Your shells keep running.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall)
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (state.terminals.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 40.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppIcon(R.drawable.ic_terminal, modifier = Modifier.size(28.dp))
                    Text("A shell, within reach", style = MaterialTheme.typography.titleLarge)
                    Text("Open a terminal on your PC. It stays running when you leave this page.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            items(state.terminals, key = { it.id }) { terminal ->
                Surface(Modifier.clip(MaterialTheme.shapes.large).combinedClickable(enabled = state.connected && !state.busy,
                    onClick = { select(terminal.id) }, onLongClick = { options(terminal.id) }, onLongClickLabel = "Terminal options"), shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainer) {
                    ZyraSettingRow(R.drawable.ic_terminal, terminal.title, if (terminal.status == "exited") "Finished" else "Running", trailing = { AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(16.dp)) })
                }
            }
        }
        ZyraButton(create, Modifier.fillMaxWidth().padding(20.dp), enabled = state.connected && !state.busy) {
            AppIcon(R.drawable.ic_plus, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("New terminal")
        }
    }
}
