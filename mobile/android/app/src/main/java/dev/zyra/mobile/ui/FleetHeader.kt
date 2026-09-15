package dev.zyra.mobile.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R

@Composable fun FleetHeaderTitle(controller: FleetController, connected: Boolean, changeKind: (String) -> Unit) {
    val state by controller.state.collectAsStateWithLifecycle()
    var menu by remember { mutableStateOf(false) }
    if (state.selected != null) {
        Text(state.selected!!.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleLarge)
        return
    }
    Box {
        Row(Modifier.clip(RoundedCornerShape(10.dp)).clickable { menu = true }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (state.kind == "agents") "Agents" else "Workflows", maxLines = 1, style = MaterialTheme.typography.titleLarge)
            AppIcon(R.drawable.ic_chevron_down, "Choose agents or workflows", Modifier.size(18.dp))
        }
        DropdownMenu(menu, { menu = false }, shape = RoundedCornerShape(18.dp)) {
            listOf("agents" to "Agents", "workflows" to "Workflows").forEach { (kind, name) ->
                DropdownMenuItem(text = { Text(name) }, leadingIcon = { AppIcon(if (kind == "agents") R.drawable.ic_bot else R.drawable.ic_workflow) },
                    trailingIcon = { if (state.kind == kind) AppIcon(R.drawable.ic_check, modifier = Modifier.size(16.dp)) }, enabled = connected,
                    onClick = { menu = false; if (state.kind != kind) changeKind(kind) })
            }
        }
    }
}

@Composable fun FleetHeaderActions(controller: FleetController, connected: Boolean) {
    val state by controller.state.collectAsStateWithLifecycle()
    val selected = state.selected
    val enabled = connected && !state.busy
    var menu by remember(selected?.id, state.kind) { mutableStateOf(false) }
    var start by remember(state.kind) { mutableStateOf(false) }
    var detail by remember(selected?.id, state.kind) { mutableStateOf<String?>(null) }
    var stop by remember(selected?.id, state.kind) { mutableStateOf(false) }
    IconButton(onClick = controller::refresh, enabled = enabled) {
        if (state.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        else AppIcon(R.drawable.ic_refresh_cw, "Refresh runs", Modifier.size(20.dp))
    }
    if (selected == null) {
        IconButton(onClick = { start = true }, enabled = enabled && state.definitions.isNotEmpty()) {
            AppIcon(R.drawable.ic_plus, if (state.kind == "agents") "Start an agent" else "Start a workflow", Modifier.size(20.dp))
        }
    } else Box {
        IconButton(onClick = { menu = true }) { AppIcon(R.drawable.ic_ellipsis, "Run options", Modifier.size(20.dp)) }
        DropdownMenu(menu, { menu = false }, shape = RoundedCornerShape(18.dp)) {
            if (selected.status in listOf("running", "queued", "waiting", "paused", "awaiting-approval"))
                DropdownMenuItem(text = { Text("Stop run") }, leadingIcon = { AppIcon(R.drawable.ic_square) }, enabled = enabled, onClick = { menu = false; stop = true })
            if (state.kind == "workflows" && selected.status == "running")
                DropdownMenuItem(text = { Text("Pause") }, leadingIcon = { FleetPauseIcon() }, enabled = enabled, onClick = { menu = false; controller.action("pause") })
            if (selected.status == "paused")
                DropdownMenuItem(text = { Text("Resume") }, leadingIcon = { AppIcon(R.drawable.ic_play) }, enabled = enabled, onClick = { menu = false; controller.action("resume") })
            if (state.kind == "agents" && selected.status in listOf("failed", "cancelled", "completed"))
                DropdownMenuItem(text = { Text("Retry") }, leadingIcon = { AppIcon(R.drawable.ic_refresh_cw) }, enabled = enabled, onClick = { menu = false; controller.action("retry") })
            if (state.kind == "agents") DropdownMenuItem(text = { Text("Transcript") }, leadingIcon = { AppIcon(R.drawable.ic_message_square) }, enabled = !state.busy && (connected || state.transcript != null),
                onClick = { menu = false; detail = "Transcript"; if (state.transcript == null) controller.transcript() })
            DropdownMenuItem(text = { Text("Run details") }, leadingIcon = { AppIcon(R.drawable.ic_info) }, onClick = { menu = false; detail = "Run details" })
        }
    }
    if (start && selected == null && state.definition == null) ZyraSheet(if (state.kind == "agents") "Start an agent" else "Start a workflow", { start = false }) {
        state.definitions.forEach { definition ->
            ZyraSettingRow(if (state.kind == "agents") R.drawable.ic_bot else R.drawable.ic_workflow, definition.name,
                definition.description.takeIf { it.isNotBlank() }, click = if (enabled) ({ start = false; controller.definition(definition) }) else null)
        }
    }
    if (selected != null && detail != null) ZyraSheet(detail!!, { detail = null }) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (detail == "Transcript" && state.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            SelectionContainer {
                if (detail == "Transcript") Markdown(state.transcript.orEmpty())
                else Text(state.detail, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
    if (stop) AlertDialog(onDismissRequest = { stop = false }, title = { Text("Stop this run?") }, text = { Text("This cancels its active work on the PC.") },
        confirmButton = { TextButton(onClick = { stop = false; controller.action("stop") }) { Text("Stop run") } },
        dismissButton = { TextButton(onClick = { stop = false }) { Text("Keep running") } })
}

@Composable private fun FleetPauseIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(20.dp)) {
        for (x in listOf(.35f, .65f)) drawLine(color, Offset(size.width * x, size.height * .2f),
            Offset(size.width * x, size.height * .8f), strokeWidth = 2.dp.toPx(), cap = StrokeCap.Round)
    }
}

